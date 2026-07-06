-- Phase 2 follow-up: the cleaner-facing "Attendance" column in the cleaner
-- inbox needs to know whether the calling cleaner already has an open
-- attendance row for a given job (to show Check In vs Check Out). 0016 only
-- gave admins a SELECT policy on public.attendance; cleaner writes go
-- through cleaner_check_in/cleaner_check_out (security definer, bypass
-- RLS), but those functions don't hand back queryable state. This adds a
-- read-only SELECT policy scoped to the calling cleaner's own rows, same
-- jobs/cleaners/user_roles join shape used everywhere else in this schema.
-- Purely additive: no existing policy, function, or table is touched.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attendance' and policyname = 'Cleaners read own attendance'
  ) then
    create policy "Cleaners read own attendance" on public.attendance
      for select
      to authenticated
      using (
        exists (
          select 1 from public.cleaners c
          join public.user_roles ur on ur.user_id = c.user_id
          where c.id = attendance.cleaner_id
            and ur.user_id = auth.uid()
            and ur.role = 'cleaner'
        )
      );
  end if;
end $$;
