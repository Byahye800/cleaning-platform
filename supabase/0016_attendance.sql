-- Phase 2 (Attendance): new, purely additive table + two cleaner-facing
-- functions. Does not touch jobs, jobs.status, cleaner_update_job_status,
-- canInvoice, the Stripe webhook, or the Rota filter -- all untouched and
-- unread by anything below.
--
-- Follows the exact pattern already proven in 0008/0009/0011 for
-- cleaner_update_job_status: a table-level RLS policy can't stop a crafted
-- request from touching columns it shouldn't, so cleaner writes go through
-- a security definer function that does its own authorization check and
-- only ever touches the columns it's supposed to. Cleaners get EXECUTE on
-- the functions, not UPDATE/INSERT on the table itself. Also follows 0009's
-- follow-up fix, not just 0008's original: Supabase auto-grants EXECUTE on
-- new public-schema functions to anon/authenticated/service_role separately
-- from the PUBLIC role, so `revoke all ... from public` alone doesn't strip
-- anon's grant -- both functions below explicitly revoke from anon too.
--
-- Duplicate-checkin guard: cleaner_check_in's own exists-check is a friendly
-- fast-path message, not the real guarantee -- two concurrent calls (double
-- click, two tabs) could both pass it before either commits. The actual
-- atomic guarantee is attendance_one_open_per_job_idx below (a partial
-- unique index on job_id where check_out_at is null), same division of
-- labor this codebase already uses for send-invoice's double-invoice race:
-- an app-level check for UX, a DB-level constraint for correctness. A
-- concurrent duplicate check-in now fails with 23505 instead of silently
-- creating two open rows. cleaner_check_out finds the most recent open row
-- for that job and closes it; if none exists it raises rather than silently
-- doing nothing.
--
-- user_agent is captured from the browser (trivial, accurate) and passed in
-- as a plain argument. Real client IP capture would need a server-side API
-- route reading request headers (a Postgres function on a pooled connection
-- can't see the browser's real IP) -- deliberately out of scope for this
-- additive schema pass; can be added later without changing this shape.

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  cleaner_id uuid not null references public.cleaners(id),
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_user_agent text,
  check_out_user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists attendance_job_id_idx on public.attendance(job_id);
create index if not exists attendance_cleaner_id_idx on public.attendance(cleaner_id);

-- Atomic guarantee behind cleaner_check_in's exists-check (see header
-- comment) -- at most one open (not yet checked out) attendance row per job.
create unique index if not exists attendance_one_open_per_job_idx
  on public.attendance(job_id) where check_out_at is null;

alter table public.attendance enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attendance' and policyname = 'Admins full access - attendance'
  ) then
    create policy "Admins full access - attendance" on public.attendance
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;
end $$;

create or replace function public.cleaner_check_in(p_job_id uuid, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $func$
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
    raise exception 'Not authorized to check in on this job';
  end if;

  if exists (
    select 1 from public.attendance
    where job_id = p_job_id and check_out_at is null
  ) then
    raise exception 'Already checked in on this job';
  end if;

  insert into public.attendance (job_id, cleaner_id, check_in_at, check_in_user_agent)
  select p_job_id, j.cleaner_id, now(), p_user_agent
  from public.jobs j
  where j.id = p_job_id;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'attendance.checked_in', 'job', p_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for job % check-in: %', p_job_id, sqlerrm;
  end;
end;
$func$;

revoke all on function public.cleaner_check_in(uuid, text) from public;
revoke execute on function public.cleaner_check_in(uuid, text) from anon;
grant execute on function public.cleaner_check_in(uuid, text) to authenticated;

create or replace function public.cleaner_check_out(p_job_id uuid, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_attendance_id uuid;
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
    raise exception 'Not authorized to check out on this job';
  end if;

  select id into v_attendance_id
  from public.attendance
  where job_id = p_job_id and check_out_at is null
  order by check_in_at desc
  limit 1;

  if v_attendance_id is null then
    raise exception 'No open check-in found for this job';
  end if;

  update public.attendance
  set check_out_at = now(), check_out_user_agent = p_user_agent
  where id = v_attendance_id;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'attendance.checked_out', 'job', p_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for job % check-out: %', p_job_id, sqlerrm;
  end;
end;
$func$;

revoke all on function public.cleaner_check_out(uuid, text) from public;
revoke execute on function public.cleaner_check_out(uuid, text) from anon;
grant execute on function public.cleaner_check_out(uuid, text) to authenticated;
