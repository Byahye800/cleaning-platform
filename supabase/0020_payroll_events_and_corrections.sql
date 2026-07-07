-- ============================================================
-- 0020_payroll_events_and_corrections.sql
-- Phase 5: payroll_events (admin-only) + attendance_corrections
-- (cleaner-request, admin-review) + safe cleaner/client views.
-- ============================================================

create table if not exists public.payroll_events (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null unique references public.attendance(id),
  cleaner_id uuid not null references public.cleaners(id),
  job_id uuid not null references public.jobs(id),
  hours_worked numeric not null,
  hourly_rate numeric,
  amount numeric,
  status text not null default 'pending' check (status in ('pending','approved','paid')),
  created_at timestamptz not null default now()
);

alter table public.payroll_events enable row level security;

drop policy if exists "Admins full access - payroll_events" on public.payroll_events;
create policy "Admins full access - payroll_events"
  on public.payroll_events
  for all
  to public
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

create or replace function public.generate_payroll_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rate numeric;
  v_hours numeric;
begin
  if new.check_out_at is not null
     and (old.check_out_at is distinct from new.check_out_at
          or old.check_in_at is distinct from new.check_in_at) then
    select hourly_rate into v_rate from public.cleaners where id = new.cleaner_id;
    v_hours := round(extract(epoch from (new.check_out_at - new.check_in_at)) / 3600.0, 2);
    insert into public.payroll_events (attendance_id, cleaner_id, job_id, hours_worked, hourly_rate, amount, status)
    values (
      new.id, new.cleaner_id, new.job_id, v_hours, v_rate,
      case when v_rate is null then null else round(v_hours * v_rate, 2) end,
      'pending'
    )
    on conflict (attendance_id) do update set
      hours_worked = excluded.hours_worked,
      hourly_rate = excluded.hourly_rate,
      amount = excluded.amount,
      status = 'pending';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_generate_payroll_event on public.attendance;
create trigger trg_generate_payroll_event
  after update on public.attendance
  for each row
  execute function public.generate_payroll_event();

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id),
  cleaner_id uuid not null references public.cleaners(id),
  requested_check_in_at timestamptz,
  requested_check_out_at timestamptz,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

alter table public.attendance_corrections enable row level security;

drop policy if exists "Admins full access - attendance_corrections" on public.attendance_corrections;
create policy "Admins full access - attendance_corrections"
  on public.attendance_corrections
  for all
  to public
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));

drop policy if exists "Cleaners read own correction requests" on public.attendance_corrections;
create policy "Cleaners read own correction requests"
  on public.attendance_corrections
  for select
  to public
  using (
    exists (
      select 1 from public.cleaners c
      join public.user_roles ur on ur.user_id = c.user_id
      where c.id = attendance_corrections.cleaner_id
        and ur.user_id = auth.uid()
        and ur.role = 'cleaner'
    )
  );

create or replace function public.cleaner_request_attendance_correction(
  p_attendance_id uuid,
  p_requested_check_in_at timestamptz,
  p_requested_check_out_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cleaner_id uuid;
  v_correction_id uuid;
begin
  select a.cleaner_id into v_cleaner_id
  from public.attendance a
  join public.cleaners c on c.id = a.cleaner_id
  join public.user_roles ur on ur.user_id = c.user_id
  where a.id = p_attendance_id
    and ur.user_id = auth.uid()
    and ur.role = 'cleaner';

  if v_cleaner_id is null then
    raise exception 'Not authorized for this attendance record';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Reason is required';
  end if;

  insert into public.attendance_corrections (attendance_id, cleaner_id, requested_check_in_at, requested_check_out_at, reason)
  values (p_attendance_id, v_cleaner_id, p_requested_check_in_at, p_requested_check_out_at, p_reason)
  returning id into v_correction_id;

  insert into public.activity_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'attendance_correction.requested', 'attendance', p_attendance_id);

  return v_correction_id;
end;
$fn$;

revoke all on function public.cleaner_request_attendance_correction(uuid, timestamptz, timestamptz, text) from public;
revoke execute on function public.cleaner_request_attendance_correction(uuid, timestamptz, timestamptz, text) from anon;
grant execute on function public.cleaner_request_attendance_correction(uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.admin_review_attendance_correction(
  p_correction_id uuid,
  p_decision text,
  p_resolution_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_is_admin boolean;
  v_attendance_id uuid;
  v_check_in timestamptz;
  v_check_out timestamptz;
begin
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') into v_is_admin;
  if not v_is_admin then
    raise exception 'Not authorized';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  select attendance_id, requested_check_in_at, requested_check_out_at
  into v_attendance_id, v_check_in, v_check_out
  from public.attendance_corrections
  where id = p_correction_id and status = 'pending';

  if v_attendance_id is null then
    raise exception 'Correction request not found or already reviewed';
  end if;

  update public.attendance_corrections
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), resolution_notes = p_resolution_notes
  where id = p_correction_id;

  if p_decision = 'approved' then
    update public.attendance
    set check_in_at = coalesce(v_check_in, check_in_at),
        check_out_at = coalesce(v_check_out, check_out_at)
    where id = v_attendance_id;
  end if;

  insert into public.activity_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'attendance_correction.' || p_decision, 'attendance', v_attendance_id);
end;
$fn$;

revoke all on function public.admin_review_attendance_correction(uuid, text, text) from public;
revoke execute on function public.admin_review_attendance_correction(uuid, text, text) from anon;
grant execute on function public.admin_review_attendance_correction(uuid, text, text) to authenticated;

create or replace view public.cleaner_own_profile as
select id, user_id, name, email, phone, status, skills, created_at
from public.cleaners;
grant select on public.cleaner_own_profile to authenticated;

create or replace view public.jobs_cleaner_safe as
select id, status, address, service_type, scheduled_date, scheduled_time, notes, cleaner_id, created_at
from public.jobs;
grant select on public.jobs_cleaner_safe to authenticated;

drop view if exists public.jobs_client_safe;
create view public.jobs_client_safe as
select id, status, address, service_type, scheduled_date, scheduled_time, cleaner_id, client_id, created_at
from public.jobs;
grant select on public.jobs_client_safe to authenticated;
