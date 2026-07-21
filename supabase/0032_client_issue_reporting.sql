-- CLIENT-ISSUES-001: extend the issues subsystem (0019) to support clients.
-- Mirrors the existing cleaner implementation exactly (same RLS shape, same
-- SECURITY DEFINER re-verification pattern, same activity_log best-effort
-- write, same trust model: clients get read-only RLS + write-only via a
-- re-verifying RPC, never a direct INSERT/UPDATE policy). Does not touch
-- jobs, attendance, checklists, payroll_events, job_billing, the Stripe
-- webhook, the invitation/onboarding system, or the issue status machine
-- (open/resolved/reopened remains admin-only, unchanged).
--
-- Constraint names verified live against staging (jwdfzgibrijcyypibhjw)
-- before writing this file: issues_reported_by_role_check,
-- issue_comments_author_role_check. clients.name/user_id/id/status
-- verified live to exist with those exact names.
-- Applied live to staging and structurally verified 2026-07-21 before this
-- file was committed (constraints widened, both RLS policies present, both
-- RPCs created with correct authenticated/anon grants, trigger body updated).

alter table public.issues drop constraint issues_reported_by_role_check;
alter table public.issues add constraint issues_reported_by_role_check
  check (reported_by_role in ('cleaner','admin','client'));

alter table public.issue_comments drop constraint issue_comments_author_role_check;
alter table public.issue_comments add constraint issue_comments_author_role_check
  check (author_role in ('cleaner','admin','client'));

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'issues' and policyname = 'Clients read own job issues'
  ) then
    create policy "Clients read own job issues" on public.issues
      for select to authenticated
      using (
        exists (
          select 1 from public.jobs j
          join public.clients cl on cl.id = j.client_id
          join public.user_roles ur on ur.user_id = cl.user_id
          where j.id = issues.job_id and ur.user_id = auth.uid() and ur.role = 'client'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'issue_comments' and policyname = 'Clients read own job issue comments'
  ) then
    create policy "Clients read own job issue comments" on public.issue_comments
      for select to authenticated
      using (
        exists (
          select 1 from public.issues i
          join public.jobs j on j.id = i.job_id
          join public.clients cl on cl.id = j.client_id
          join public.user_roles ur on ur.user_id = cl.user_id
          where i.id = issue_comments.issue_id and ur.user_id = auth.uid() and ur.role = 'client'
        )
      );
  end if;
end $$;

create or replace function public.client_report_issue(p_job_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_issue_id uuid;
  v_description text;
begin
  if p_job_id is null then
    raise exception 'Job id is required';
  end if;

  v_description := btrim(coalesce(p_description, ''));
  if v_description = '' then
    raise exception 'Description cannot be blank';
  end if;
  if char_length(v_description) > 2000 then
    raise exception 'Description is too long (maximum 2000 characters)';
  end if;

  if not exists (
    select 1
    from public.jobs j
    join public.clients cl on cl.id = j.client_id
    join public.user_roles ur on ur.user_id = cl.user_id
    where j.id = p_job_id
      and ur.user_id = auth.uid()
      and ur.role = 'client'
  ) then
    raise exception 'Not authorized to report an issue on this job';
  end if;

  insert into public.issues (job_id, reported_by, reported_by_role, description)
  values (p_job_id, auth.uid(), 'client', v_description)
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

revoke all on function public.client_report_issue(uuid, text) from public;
revoke execute on function public.client_report_issue(uuid, text) from anon;
grant execute on function public.client_report_issue(uuid, text) to authenticated;

create or replace function public.client_add_issue_comment(p_issue_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_job_id uuid;
  v_body text;
begin
  if p_issue_id is null then
    raise exception 'Issue id is required';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Reply cannot be blank';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Reply is too long (maximum 2000 characters)';
  end if;

  if not exists (
    select 1
    from public.issues i
    join public.jobs j on j.id = i.job_id
    join public.clients cl on cl.id = j.client_id
    join public.user_roles ur on ur.user_id = cl.user_id
    where i.id = p_issue_id
      and ur.user_id = auth.uid()
      and ur.role = 'client'
  ) then
    raise exception 'Not authorized to comment on this issue';
  end if;

  insert into public.issue_comments (issue_id, author, author_role, body)
  values (p_issue_id, auth.uid(), 'client', v_body);

  select job_id into v_job_id from public.issues where id = p_issue_id;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'issue.comment_added', 'job', v_job_id);
  exception when others then
    raise warning 'Failed to write activity_log for issue % comment: %', p_issue_id, sqlerrm;
  end;
end;
$func$;

revoke all on function public.client_add_issue_comment(uuid, text) from public;
revoke execute on function public.client_add_issue_comment(uuid, text) from anon;
grant execute on function public.client_add_issue_comment(uuid, text) to authenticated;

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

  if new.author_role in ('cleaner', 'client') then
    insert into public.notifications (user_id, entity_type, entity_id, message)
    select ur.user_id, 'issue', new.issue_id, format('New reply on issue for %s', coalesce(v_address, 'a job'))
    from public.user_roles ur
    where ur.role = 'admin';
  elsif new.author_role = 'admin' then
    insert into public.notifications (user_id, entity_type, entity_id, message)
    values (v_reported_by, 'issue', new.issue_id, format('Admin replied to your issue on %s', coalesce(v_address, 'a job')));
  else
    raise warning 'notify_on_new_issue_comment: unrecognised author_role % for issue_comment on issue %', new.author_role, new.issue_id;
  end if;

  return new;
end;
$func$;

-- Trigger definition itself is unchanged (same AFTER INSERT on
-- issue_comments); only the function body above changed. No DROP/CREATE
-- TRIGGER needed since CREATE OR REPLACE FUNCTION updates the body in
-- place for the trigger that already points at it.
