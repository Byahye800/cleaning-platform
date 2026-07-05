-- Replaces the generic 'job.status_changed' activity_log action written by
-- cleaner_update_job_status with 'job.started' / 'job.completed', matching
-- the same split made on the admin side (admin/jobs/page.tsx's updateJob).
-- Safe to special-case on p_new_status alone: the function's own guard above
-- already restricts p_new_status to exactly 'in_progress' or 'completed', so
-- this is an exhaustive case, not a partial one needing a fallback.
--
-- This removes the ambiguity flagged when 0011 was written: activity_log has
-- no old/new value column, so a generic 'job.status_changed' row could only
-- ever be described using the job's *current* status, which would be wrong
-- for a row whose job changed status again since. Naming the action after
-- the transition itself avoids that entirely for this path.
--
-- Keeps 0011's non-blocking exception handler around the activity_log insert
-- unchanged -- a log-write failure still can't roll back the status update.
create or replace function public.cleaner_update_job_status(p_job_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
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

  v_action := case p_new_status
    when 'in_progress' then 'job.started'
    when 'completed' then 'job.completed'
  end;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), v_action, 'job', p_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for job % status change: %', p_job_id, sqlerrm;
  end;
end;
$$;
