-- Cleaners currently have SELECT-only access to their own assigned jobs
-- (jobs_select_for_own_cleaner in 0005). This adds a way for a cleaner to
-- mark a job in_progress/completed from /cleaner/inbox, without going
-- through admin (admin marking a job completed was previously the only path
-- to invoicing).
--
-- Deliberately NOT a table-level RLS UPDATE policy: RLS scopes rows, not
-- columns, so a WITH CHECK on status alone would not stop a crafted request
-- from also changing payment_status/price/etc. in the same UPDATE -- a real
-- problem given this table drives Stripe invoicing. Instead, a SECURITY
-- DEFINER function does its own authorization check and only ever touches
-- the status column; cleaners get EXECUTE on the function, not UPDATE on
-- the table.
create or replace function public.cleaner_update_job_status(p_job_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_status not in ('in_progress', 'completed') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  if not exists (
    select 1
    from public.jobs j
    join public.cleaners c on c.id = j.cleaner_id
    join public.user_roles ur on ur.user_id = c.user_id
    where j.id = p_job_id
      and ur.user_id = auth.uid()
      and ur.role = 'cleaner'
  ) then
    raise exception 'Not authorized to update this job';
  end if;

  update public.jobs set status = p_new_status where id = p_job_id;
end;
$$;

-- create or replace + revoke/grant are naturally idempotent (no error on
-- rerun), consistent with the guard style used in the other migrations.
revoke all on function public.cleaner_update_job_status(uuid, text) from public;
grant execute on function public.cleaner_update_job_status(uuid, text) to authenticated;
