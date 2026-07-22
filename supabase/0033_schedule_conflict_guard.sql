-- SCHEDULE-INTEGRITY-001: single validated scheduling write path.
--
-- Problem (per approved DESIGN): jobs.cleaner_id / scheduled_date /
-- scheduled_time / duration_hours were writable directly from two
-- independent client-side call sites (admin/jobs/page.tsx and
-- admin/rota/page.tsx), each issuing a raw `supabase.from('jobs').update(...)`
-- with zero conflict detection. A cleaner could be assigned two overlapping
-- jobs with no warning. jobs.status has no CHECK constraint (dropped in 0005)
-- -- that gap is a separate, out-of-scope finding from DESIGN and is
-- deliberately NOT touched here.
--
-- This migration adds exactly one thing: a SECURITY DEFINER RPC,
-- admin_assign_job_schedule, that becomes the *only* code path (after the
-- accompanying application changes) permitted to write those four columns.
-- No table, column, or other function is altered. No other RPC, portal, or
-- workflow (attendance, payroll, checklists, issues, billing, cleaner/client
-- read paths) is touched.
--
-- Overlap detection algorithm:
--   Given the incoming (p_cleaner_id, p_scheduled_date, p_scheduled_time,
--   p_duration_hours), a candidate new interval [v_start, v_end) is computed
--   as (p_scheduled_date + p_scheduled_time) .. (that + duration_hours).
--   Every other non-cancelled job already assigned to the same cleaner on
--   the same scheduled_date is compared: a conflict exists if the two
--   intervals overlap using standard half-open-interval overlap
--   (existing_start < v_end AND existing_end > v_start), OR if the two jobs
--   share the exact same start instant regardless of duration (see below).
--   Half-open semantics mean back-to-back jobs (one ending exactly when the
--   next begins) are NOT flagged as a conflict -- this matches how the
--   existing Rota grid already displays adjacent time slots.
--
-- NULL / zero duration_hours handling:
--   duration_hours is optional everywhere else in this codebase (nullable
--   column, unused by the Rota grid's display today) and admin data
--   observed live in staging confirms real rows carry it, but it cannot be
--   assumed present. A NULL or non-positive duration is normalised to a
--   zero-length interval (v_end = v_start) via
--   greatest(coalesce(duration_hours, 0), 0) applied to *both* the
--   incoming and existing job's duration -- this treats an unknown-length
--   job as an instant, not as "no duration information, skip the check".
--   A zero-length interval still correctly participates in the standard
--   overlap test (e.g. a zero-duration job scheduled inside another job's
--   known time range is still caught, because the general formula reduces
--   correctly when one side has zero width). The one case zero-width
--   arithmetic cannot catch by itself is two jobs for the same cleaner that
--   both start at the *exact same instant* and both have unknown/zero
--   duration -- two coincident zero-width intervals never satisfy a strict
--   "<" / ">" overlap test against each other. That case is therefore
--   handled by an explicit separate equality check (existing_start =
--   v_start) so an exact-instant collision is always caught regardless of
--   duration on either side.
--
-- Concurrent admin update behaviour:
--   The conflict check is a SELECT followed by an UPDATE inside one
--   function body -- by itself that is a classic check-then-act race: two
--   simultaneous admin submissions assigning the same cleaner to
--   overlapping times could both read "no conflict" before either commits.
--   This is the same class of problem 0016_attendance.sql solved for
--   duplicate check-ins with a partial unique index -- but a unique index
--   cannot express a time-*range* overlap constraint declaratively without
--   adding the btree_gist extension and a full EXCLUDE constraint, which is
--   a larger schema footprint than this approved scope calls for. Instead,
--   this function takes a session-scoped Postgres advisory transaction lock
--   keyed on the target cleaner_id (pg_advisory_xact_lock) before running
--   the conflict check. This serialises every concurrent
--   admin_assign_job_schedule call that targets the same cleaner: the
--   second caller blocks until the first caller's transaction commits or
--   rolls back, so it always sees the first caller's write before running
--   its own conflict check. Calls targeting *different* cleaners are not
--   serialised against each other and proceed concurrently as normal. The
--   lock is released automatically at transaction end; no cleanup code is
--   required and a crashed connection cannot leave it held.
--
-- Why this preserves scheduling integrity:
--   - The authorization check (admin role via user_roles, identical
--     pattern to cleaner_update_job_status and the 0031 admin cleaner-write
--     RPCs) means only an authenticated admin can call this at all.
--   - The advisory lock closes the concurrency race a plain SELECT/UPDATE
--     would leave open, so the guarantee is real, not just a UI-level
--     fast-path check.
--   - The check only ever runs when a cleaner AND a full date+time are
--     being set; assigning a cleaner to a still-unscheduled job (no
--     date/time yet) or clearing an assignment (cleaner_id -> NULL) skips
--     the check entirely, because there is nothing to compare -- this
--     preserves the existing, legitimate "unscheduled job" state the Rota
--     page already displays as a distinct section.
--   - The UPDATE at the end writes exactly the four scheduling columns and
--     nothing else -- status, price, notes, and every other jobs column are
--     untouched by this function, so it cannot be used to change anything
--     outside its stated purpose even if called directly.
--   - Existing live data was confirmed (read-only, prior to this migration)
--     to have zero rows with a non-null cleaner_id, so introducing this
--     check has no pre-existing conflicts to reconcile.

create or replace function public.admin_assign_job_schedule(
  p_job_id uuid,
  p_cleaner_id uuid,
  p_scheduled_date date,
  p_scheduled_time time,
  p_duration_hours numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_start timestamp;
  v_end timestamp;
  v_duration numeric;
  v_conflict_id uuid;
begin
  if not exists (
    select 1 from public.user_roles
    where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
  ) then
    raise exception 'Not authorized to assign job schedules';
  end if;

  if not exists (select 1 from public.jobs where id = p_job_id) then
    raise exception 'Job not found: %', p_job_id;
  end if;

  if p_cleaner_id is not null and p_scheduled_date is not null and p_scheduled_time is not null then
    -- Serialise concurrent assignment attempts for the same cleaner (see
    -- header comment: "Concurrent admin update behaviour"). Released
    -- automatically at transaction end.
    perform pg_advisory_xact_lock(hashtextextended(p_cleaner_id::text, 0));

    v_duration := greatest(coalesce(p_duration_hours, 0), 0);
    v_start := p_scheduled_date + p_scheduled_time;
    v_end := v_start + (v_duration * interval '1 hour');

    select j.id into v_conflict_id
    from public.jobs j
    where j.cleaner_id = p_cleaner_id
      and j.id <> p_job_id
      and j.scheduled_date = p_scheduled_date
      and j.scheduled_time is not null
      and coalesce(j.status, '') <> 'cancelled'
      and (
        (j.scheduled_date + j.scheduled_time) = v_start
        or (
          (j.scheduled_date + j.scheduled_time) < v_end
          and (j.scheduled_date + j.scheduled_time
               + (greatest(coalesce(j.duration_hours, 0), 0) * interval '1 hour')) > v_start
        )
      )
    limit 1;

    if v_conflict_id is not null then
      raise exception 'Schedule conflict: this cleaner is already assigned to job % at an overlapping time on %', v_conflict_id, p_scheduled_date;
    end if;
  end if;

  update public.jobs
  set cleaner_id = p_cleaner_id,
      scheduled_date = p_scheduled_date,
      scheduled_time = p_scheduled_time,
      duration_hours = p_duration_hours
  where id = p_job_id;
end;
$func$;

-- Supabase auto-grants EXECUTE on new public-schema functions to
-- anon/authenticated/service_role separately from PUBLIC (same behaviour
-- documented in 0016) -- explicitly revoke from public and anon, grant only
-- to authenticated. The function's own role check inside the body is the
-- real authorization boundary; this grant just narrows who can attempt the
-- call at all.
revoke all on function public.admin_assign_job_schedule(uuid, uuid, date, time, numeric) from public;
revoke all on function public.admin_assign_job_schedule(uuid, uuid, date, time, numeric) from anon;
grant execute on function public.admin_assign_job_schedule(uuid, uuid, date, time, numeric) to authenticated;
