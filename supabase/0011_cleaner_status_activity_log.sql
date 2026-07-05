-- Step 4 of the redesign: wires activity_log into the cleaner status-update
-- path. Per 0010's design note, this insert lives inside the function itself
-- (not a new RLS policy) since cleaners have no INSERT grant on activity_log
-- (admin-only) and this function already bypasses RLS on jobs the same way.
-- auth.uid() inside a SECURITY DEFINER function still reflects the calling
-- user's JWT (security definer only elevates table privileges, not the
-- session), so this correctly attributes the cleaner, not the function owner.
--
-- The activity_log insert is wrapped in its own exception handler: a plpgsql
-- function body is one transaction, so an unhandled error there would roll
-- back the status update too. Every other write path in this feature treats
-- the log write as non-blocking, so this one does the same via an implicit
-- savepoint (catch, raise warning, continue) rather than failing the whole
-- status change over a logging problem.
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

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'job.status_changed', 'job', p_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for job % status change: %', p_job_id, sqlerrm;
  end;
end;
$$;
