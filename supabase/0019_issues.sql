-- Phase 4 (Issues): a per-shift reported-problem record with an attached
-- conversation thread and lightweight notifications. Does not touch jobs,
-- jobs.status, cleaner_update_job_status, attendance, checklists,
-- canInvoice, the Stripe webhook, or the Rota filter.
--
-- Three-state status (open/resolved/reopened, not just two) so the audit
-- trail distinguishes "never touched" from "resolved once, needed
-- reopening." Replies never change status automatically in either
-- direction -- only admin transitions status, via a direct RLS update
-- (same trust level already given to admin on every other table), never a
-- security definer function.
--
-- notifications is deliberately generic/entity-agnostic (entity_type,
-- entity_id) -- same design principle already proven by activity_log --
-- but scoped narrowly in this phase: only 'issue' rows, only an in-app
-- unread flag, no email/SMS/push (those are separate, already-tracked
-- backlog items). Fan-out happens via AFTER INSERT triggers, not client
-- code, so the three notify flows (report->admin, admin reply->cleaner,
-- cleaner reply->admin) always fire regardless of which client wrote the
-- row -- same reliability principle as the security definer functions.
--
-- Cleaner writes (report an issue, add a comment) go through security
-- definer functions with their own authorization check, same
-- jobs/cleaners/user_roles join shape as cleaner_check_in and
-- cleaner_seed_job_checklist. Admin writes (comment, resolve, reopen) are
-- direct RLS-gated table access, matching how admin already manages
-- checklist_templates and jobs directly. Both new functions explicitly
-- revoke from anon in addition to the blanket revoke from public, per the
-- 0009 fix this codebase always applies to new public-schema functions.

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  reported_by uuid not null,
  reported_by_role text not null check (reported_by_role in ('cleaner','admin')),
  description text not null,
  photo_url text,
  status text not null default 'open' check (status in ('open','resolved','reopened')),
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists issues_job_id_idx on public.issues(job_id);

create table if not exists public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  author uuid not null,
  author_role text not null check (author_role in ('cleaner','admin')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists issue_comments_issue_id_idx on public.issue_comments(issue_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id, is_read);

alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'issues' and policyname = 'Admins full access - issues'
  ) then
    create policy "Admins full access - issues" on public.issues
      for all to public
      using (exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'issues' and policyname = 'Cleaners read own job issues'
  ) then
    create policy "Cleaners read own job issues" on public.issues
      for select to authenticated
      using (
        exists (
          select 1 from public.jobs j
          join public.cleaners c on c.id = j.cleaner_id
          join public.user_roles ur on ur.user_id = c.user_id
          where j.id = issues.job_id and ur.user_id = auth.uid() and ur.role = 'cleaner'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'issue_comments' and policyname = 'Admins full access - issue_comments'
  ) then
    create policy "Admins full access - issue_comments" on public.issue_comments
      for all to public
      using (exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'issue_comments' and policyname = 'Cleaners read own job issue comments'
  ) then
    create policy "Cleaners read own job issue comments" on public.issue_comments
      for select to authenticated
      using (
        exists (
          select 1 from public.issues i
          join public.jobs j on j.id = i.job_id
          join public.cleaners c on c.id = j.cleaner_id
          join public.user_roles ur on ur.user_id = c.user_id
          where i.id = issue_comments.issue_id and ur.user_id = auth.uid() and ur.role = 'cleaner'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'Users read own notifications'
  ) then
    create policy "Users read own notifications" on public.notifications
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'Users update own notifications'
  ) then
    create policy "Users update own notifications" on public.notifications
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create or replace function public.cleaner_report_issue(p_job_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_issue_id uuid;
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
    raise exception 'Not authorized to report an issue on this job';
  end if;

  insert into public.issues (job_id, reported_by, reported_by_role, description)
  values (p_job_id, auth.uid(), 'cleaner', p_description)
  returning id into v_issue_id;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'issue.reported', 'job', p_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for issue % report: %', v_issue_id, sqlerrm;
  end;

  return v_issue_id;
end;
$func$;

revoke all on function public.cleaner_report_issue(uuid, text) from public;
revoke execute on function public.cleaner_report_issue(uuid, text) from anon;
grant execute on function public.cleaner_report_issue(uuid, text) to authenticated;

create or replace function public.cleaner_add_issue_comment(p_issue_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_job_id uuid;
begin
  if not exists (
    select 1
    from public.issues i
    join public.jobs j on j.id = i.job_id
    join public.cleaners c on c.id = j.cleaner_id
    join public.user_roles ur on ur.user_id = c.user_id
    where i.id = p_issue_id
      and ur.user_id = auth.uid()
      and ur.role = 'cleaner'
  ) then
    raise exception 'Not authorized to comment on this issue';
  end if;

  insert into public.issue_comments (issue_id, author, author_role, body)
  values (p_issue_id, auth.uid(), 'cleaner', p_body);

  select job_id into v_job_id from public.issues where id = p_issue_id;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'issue.comment_added', 'job', v_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for issue % comment: %', p_issue_id, sqlerrm;
  end;
end;
$func$;

revoke all on function public.cleaner_add_issue_comment(uuid, text) from public;
revoke execute on function public.cleaner_add_issue_comment(uuid, text) from anon;
grant execute on function public.cleaner_add_issue_comment(uuid, text) to authenticated;

create or replace function public.notify_admins_on_new_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_address text;
begin
  select address into v_address from public.jobs where id = new.job_id;

  insert into public.notifications (user_id, entity_type, entity_id, message)
  select ur.user_id, 'issue', new.id, format('New issue reported on %s', coalesce(v_address, 'a job'))
  from public.user_roles ur
  where ur.role = 'admin';

  return new;
end;
$func$;

drop trigger if exists trg_notify_admins_on_new_issue on public.issues;
create trigger trg_notify_admins_on_new_issue
  after insert on public.issues
  for each row execute function public.notify_admins_on_new_issue();

create or replace function public.notify_on_new_issue_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_address text;
  v_reported_by uuid;
begin
  select j.address, i.reported_by into v_address, v_reported_by
  from public.issues i
  join public.jobs j on j.id = i.job_id
  where i.id = new.issue_id;

  if new.author_role = 'cleaner' then
    insert into public.notifications (user_id, entity_type, entity_id, message)
    select ur.user_id, 'issue', new.issue_id, format('New reply on issue for %s', coalesce(v_address, 'a job'))
    from public.user_roles ur
    where ur.role = 'admin';
  else
    insert into public.notifications (user_id, entity_type, entity_id, message)
    values (v_reported_by, 'issue', new.issue_id, format('Admin replied to your issue on %s', coalesce(v_address, 'a job')));
  end if;

  return new;
end;
$func$;

drop trigger if exists trg_notify_on_new_issue_comment on public.issue_comments;
create trigger trg_notify_on_new_issue_comment
  after insert on public.issue_comments
  for each row execute function public.notify_on_new_issue_comment();
