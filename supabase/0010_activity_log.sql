-- Append-only activity log, written at existing action points (job created,
-- job status changed, invoice sent, invoice paid/failed) -- feeds the
-- planned admin dashboard's "recent activity" feed. entity_id is a plain
-- uuid with no FK: entity_type varies by row (currently always 'job', since
-- there's no separate invoices table -- Stripe invoices are tracked via
-- jobs.stripe_invoice_id), so a single hard FK to one table isn't a fit.
--
-- Write-path access:
--   - Admin-triggered inserts (job created/edited via /admin/jobs, invoice
--     sent via send-invoice route) go through the admin's own RLS-respecting
--     session -> need the INSERT-capable policy below.
--   - Cleaner-triggered inserts (job status change) will go inside the
--     existing cleaner_update_job_status SECURITY DEFINER function, which
--     already bypasses RLS on jobs today (proven in 0008/0009) -- no policy
--     needed for that path.
--   - Webhook-triggered inserts (invoice paid/failed) use the service-role
--     client, which bypasses RLS regardless of policy.
--
-- Genuinely immutable, not just described that way: only SELECT and INSERT
-- policies exist below for admins, `to authenticated` (not `to public` --
-- same lesson as the anon auto-grant found on the cleaner RPC). No UPDATE
-- or DELETE policy is defined for any role, so RLS denies both by default
-- regardless of role -- a row can never be changed or removed through the
-- API once written.
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_entity_idx on public.activity_log(entity_type, entity_id);
create index if not exists activity_log_created_at_idx on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activity_log' and policyname = 'Admins read activity_log'
  ) then
    create policy "Admins read activity_log" on public.activity_log
      for select
      to authenticated
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activity_log' and policyname = 'Admins insert activity_log'
  ) then
    create policy "Admins insert activity_log" on public.activity_log
      for insert
      to authenticated
      with check (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;
end $$;
