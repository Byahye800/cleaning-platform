-- ============================================================
-- SUPERSEDED — kept for historical record only, do not run in isolation.
-- supabase/0005_schema_catchup.sql's RLS section is the authoritative baseline
-- (policy bodies copied verbatim from a live pg_policies pull, see its header).
-- In particular, the recurrence_rules policy below keys off jobs.recurrence_rule_id,
-- which is the reverse of the live FK direction (recurrence_rules.job_id -> jobs.id)
-- -- see the 0005 cleanup note and its own recurrence_rules section.
-- ============================================================

-- Yahye Corp — Phase 2 (pre-RLS) policies
-- Purpose:
--  - Replace temporary service-role MVP access with deny-by-default RLS policies.
--  - Admins: full access to clients/cleaners/recurrence_rules/jobs.
--  - Clients: can read their own client row and related jobs.
--  - Cleaners: can read their own cleaner row.
-- Notes:
--  - This project only seeds Phase 1 tables. Shift/check-in/out tables come in later phases.

-- Helper condition (inline everywhere):
--   exists (select 1 from public.user_roles ur
--           where ur.user_id = auth.uid()
--             and ur.role = 'admin'
--             and ur.is_active = true)

-- 1) user_roles

-- Admins can manage roles
create policy "user_roles_admin_all"
on public.user_roles
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- Users can read their own role row
create policy "user_roles_select_own"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- 2) clients

create policy "clients_admin_all"
on public.clients
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- Clients can read their own client profile
create policy "clients_select_own"
on public.clients
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.clients.user_id
      and ur.user_id = auth.uid()
      and ur.role = 'client'
      and ur.is_active = true
  )
  or
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- 3) cleaners

create policy "cleaners_admin_all"
on public.cleaners
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- Cleaners can read their own cleaner profile
create policy "cleaners_select_own"
on public.cleaners
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.cleaners.user_id
      and ur.user_id = auth.uid()
      and ur.role = 'cleaner'
      and ur.is_active = true
  )
  or
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- 4) jobs

create policy "jobs_admin_all"
on public.jobs
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- Clients can read jobs they own (by client_id)
create policy "jobs_select_for_own_client"
on public.jobs
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    join public.user_roles ur_client
      on ur_client.user_id = c.user_id
    where c.id = public.jobs.client_id
      and ur_client.user_id = auth.uid()
      and ur_client.role = 'client'
      and ur_client.is_active = true
  )
  or
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- 5) recurrence_rules

create policy "recurrence_rules_admin_all"
on public.recurrence_rules
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);

-- Clients can read recurrence rules that back their jobs
create policy "recurrence_rules_select_for_own_client_jobs"
on public.recurrence_rules
for select
to authenticated
using (
  exists (
    select 1
    from public.jobs j
    join public.clients c
      on c.id = j.client_id
    join public.user_roles ur_client
      on ur_client.user_id = c.user_id
    where j.recurrence_rule_id = public.recurrence_rules.id
      and ur_client.user_id = auth.uid()
      and ur_client.role = 'client'
      and ur_client.is_active = true
  )
  or
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and ur.is_active = true
  )
);
