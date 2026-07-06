-- Phase 3 (Checklists): two new definition tables (admin-managed templates)
-- plus one instance table (per-job, per-cleaner checklist items), following
-- the exact template/instance split and security-definer-only-write pattern
-- proven in Phase 2 (attendance). Does not touch jobs, jobs.status (except
-- one read-only equality check inside cleaner_toggle_checklist_item -- see
-- below), cleaner_update_job_status, attendance, cleaner_check_in/out,
-- canInvoice, the Stripe webhook, or the Rota filter.
--
-- Instance rows snapshot their label/sort_order at seed time rather than
-- live-joining the template, so editing a template later never rewrites
-- history for jobs already seeded from it -- matches how attendance/
-- activity_log already treat history as immutable.
--
-- Matching a job to a template: exact service_type match first, falling
-- back to a template with service_type is null (a universal template) if
-- no exact match exists. If neither is found, cleaner_seed_job_checklist
-- fails loudly ('No checklist template found for this job') rather than
-- silently seeding an empty checklist.
--
-- Completed-job guard: per explicit instruction, checklists are never
-- hidden after a job is completed -- they stay fully visible (cleaner and
-- admin can always view), but become read-only. This is enforced at the
-- database layer, not just the UI: cleaner_toggle_checklist_item reads
-- jobs.status (read-only, single equality check, never written) and
-- rejects the write with 'Cannot modify checklist for a completed job' if
-- the job is already completed.
--
-- Cleaner writes go through cleaner_seed_job_checklist /
-- cleaner_toggle_checklist_item (security definer, own authorization
-- check -- cleaner_seed_job_checklist joins jobs/cleaners/user_roles like
-- cleaner_check_in, cleaner_toggle_checklist_item joins
-- job_checklist_items/cleaners/user_roles since the item already carries
-- cleaner_id directly), never a direct table grant. Both explicitly revoke
-- from anon in addition to the blanket revoke from public, per the 0009 fix
-- this codebase always applies to new public-schema functions.
--
-- Duplicate-seed guard: cleaner_seed_job_checklist's own exists-check is a
-- friendly fast-path (avoids reseeding on a normal repeat call), not the
-- real guarantee -- two concurrent calls (double click, two tabs) could
-- both pass it before either commits, each inserting a full duplicate set
-- of checklist items for the same job. The actual atomic guarantee is
-- job_checklist_items_job_template_item_idx below (a unique index on
-- (job_id, template_item_id)), same division of labor already used for
-- attendance_one_open_per_job_idx: a concurrent duplicate seed now fails
-- with 23505 on the losing call's INSERT instead of silently duplicating
-- every row.

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checklist_template_items_template_id_idx on public.checklist_template_items(template_id);

create table if not exists public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  cleaner_id uuid not null references public.cleaners(id),
  template_item_id uuid references public.checklist_template_items(id),
  label text not null,
  sort_order integer not null default 0,
  is_checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_checklist_items_job_id_idx on public.job_checklist_items(job_id);
create index if not exists job_checklist_items_cleaner_id_idx on public.job_checklist_items(cleaner_id);

-- Atomic guarantee behind cleaner_seed_job_checklist's exists-check (see
-- header comment) -- a job can't end up with two seeded copies of the same
-- template item, which in practice means "seeded at most once."
create unique index if not exists job_checklist_items_job_template_item_idx
  on public.job_checklist_items(job_id, template_item_id);

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.job_checklist_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_templates' and policyname = 'Admins full access - checklist_templates'
  ) then
    create policy "Admins full access - checklist_templates" on public.checklist_templates
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'checklist_template_items' and policyname = 'Admins full access - checklist_template_items'
  ) then
    create policy "Admins full access - checklist_template_items" on public.checklist_template_items
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_checklist_items' and policyname = 'Admins full access - job_checklist_items'
  ) then
    create policy "Admins full access - job_checklist_items" on public.job_checklist_items
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'job_checklist_items' and policyname = 'Cleaners read own job checklist items'
  ) then
    create policy "Cleaners read own job checklist items" on public.job_checklist_items
      for select
      to authenticated
      using (
        exists (
          select 1 from public.cleaners c
          join public.user_roles ur on ur.user_id = c.user_id
          where c.id = job_checklist_items.cleaner_id
            and ur.user_id = auth.uid()
            and ur.role = 'cleaner'
        )
      );
  end if;
end $$;

create or replace function public.cleaner_seed_job_checklist(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_job record;
  v_template_id uuid;
begin
  if not exists (
    select 1
    from public.jobs j
    join public.cleaners c on c.id = j.cleaner_id
    join public.user_roles ur on ur.user_id = c.user_id
    where j.id = p_job_id
      and ur.user_id = auth.uid()
      and ur.role = 'cleaner'
  ) then
    raise exception 'Not authorized to seed a checklist for this job';
  end if;

  if exists (select 1 from public.job_checklist_items where job_id = p_job_id) then
    return;
  end if;

  select id, cleaner_id, service_type into v_job from public.jobs where id = p_job_id;

  select id into v_template_id
  from public.checklist_templates
  where is_active = true and service_type = v_job.service_type
  limit 1;

  if v_template_id is null then
    select id into v_template_id
    from public.checklist_templates
    where is_active = true and service_type is null
    limit 1;
  end if;

  if v_template_id is null then
    raise exception 'No checklist template found for this job';
  end if;

  insert into public.job_checklist_items (job_id, cleaner_id, template_item_id, label, sort_order)
  select p_job_id, v_job.cleaner_id, cti.id, cti.label, cti.sort_order
  from public.checklist_template_items cti
  where cti.template_id = v_template_id
  order by cti.sort_order;
end;
$func$;

revoke all on function public.cleaner_seed_job_checklist(uuid) from public;
revoke execute on function public.cleaner_seed_job_checklist(uuid) from anon;
grant execute on function public.cleaner_seed_job_checklist(uuid) to authenticated;

create or replace function public.cleaner_toggle_checklist_item(p_item_id uuid, p_checked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_job_id uuid;
  v_job_status text;
begin
  if not exists (
    select 1
    from public.job_checklist_items jci
    join public.cleaners c on c.id = jci.cleaner_id
    join public.user_roles ur on ur.user_id = c.user_id
    where jci.id = p_item_id
      and ur.user_id = auth.uid()
      and ur.role = 'cleaner'
  ) then
    raise exception 'Not authorized to modify this checklist item';
  end if;

  select job_id into v_job_id from public.job_checklist_items where id = p_item_id;
  select status into v_job_status from public.jobs where id = v_job_id;

  if v_job_status = 'completed' then
    raise exception 'Cannot modify checklist for a completed job';
  end if;

  update public.job_checklist_items
  set is_checked = p_checked,
      checked_at = case when p_checked then now() else null end
  where id = p_item_id;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), case when p_checked then 'checklist.item_checked' else 'checklist.item_unchecked' end, 'job', v_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for checklist item % toggle: %', p_item_id, sqlerrm;
  end;
end;
$func$;

revoke all on function public.cleaner_toggle_checklist_item(uuid, boolean) from public;
revoke execute on function public.cleaner_toggle_checklist_item(uuid, boolean) from anon;
grant execute on function public.cleaner_toggle_checklist_item(uuid, boolean) to authenticated;
