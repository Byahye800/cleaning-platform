-- 0005_schema_catchup.sql
--
-- Reconciles migration history with the LIVE production schema, which has
-- drifted from 0001-0003. Source of truth for every column/type/default
-- below is a live information_schema.columns pull taken 2026-07-02
-- (see docs/SESSION-LOG.md), NOT the earlier migration files.
--
-- Idempotent by design: every statement is guarded (IF NOT EXISTS / DO
-- blocks checking catalogs) so this is safe to run against:
--   (a) a fresh database — creates the full live schema from scratch, or
--   (b) the already-migrated live database — every guard should evaluate
--       to "already exists," so this is a zero-effect no-op there.
--
-- id column defaults: gen_random_uuid() confirmed live for all six tables
-- via information_schema.columns.column_default (2026-07-02).
--
-- recurrence_rules note: live reality is recurrence_rules.job_id -> jobs.id
-- (the reverse of the original 0003 design, which had a jobs.recurrence_rule_id
-- column). This file documents live reality only; it does not recreate the
-- old direction.

create extension if not exists pgcrypto;

-- ============================================================
-- clients
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz default now(),
  address text not null default '',
  contact_email text not null default '',
  contact_phone text,
  agreed_rate numeric,
  notes text,
  status text not null default 'active',
  name text not null default ''
);

alter table public.clients add column if not exists user_id uuid;
alter table public.clients add column if not exists created_at timestamptz default now();
alter table public.clients add column if not exists address text not null default '';
alter table public.clients add column if not exists contact_email text not null default '';
alter table public.clients add column if not exists contact_phone text;
alter table public.clients add column if not exists agreed_rate numeric;
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists status text not null default 'active';
alter table public.clients add column if not exists name text not null default '';

-- ============================================================
-- cleaners
-- ============================================================
create table if not exists public.cleaners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz default now(),
  email text,
  phone text,
  hourly_rate numeric not null default 0,
  status text not null default 'active',
  notes text,
  skills text[],
  emergency_contact text,
  dbs_check_date date,
  dbs_status text,
  name text not null default ''
);

alter table public.cleaners add column if not exists user_id uuid;
alter table public.cleaners add column if not exists created_at timestamptz default now();
alter table public.cleaners add column if not exists email text;
alter table public.cleaners add column if not exists phone text;
alter table public.cleaners add column if not exists hourly_rate numeric not null default 0;
alter table public.cleaners add column if not exists status text not null default 'active';
alter table public.cleaners add column if not exists notes text;
alter table public.cleaners add column if not exists skills text[];
alter table public.cleaners add column if not exists emergency_contact text;
alter table public.cleaners add column if not exists dbs_check_date date;
alter table public.cleaners add column if not exists dbs_status text;
alter table public.cleaners add column if not exists name text not null default '';

-- ============================================================
-- jobs
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  cleaner_id uuid,
  status text default 'pending',
  created_at timestamptz default now(),
  scheduled_date date,
  scheduled_time time,
  duration_hours numeric,
  address text,
  notes text,
  price numeric,
  service_type text,
  completion_photo_url text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text
);

alter table public.jobs add column if not exists client_id uuid;
alter table public.jobs add column if not exists cleaner_id uuid;
alter table public.jobs add column if not exists status text default 'pending';
alter table public.jobs add column if not exists created_at timestamptz default now();
alter table public.jobs add column if not exists scheduled_date date;
alter table public.jobs add column if not exists scheduled_time time;
alter table public.jobs add column if not exists duration_hours numeric;
alter table public.jobs add column if not exists address text;
alter table public.jobs add column if not exists notes text;
alter table public.jobs add column if not exists price numeric;
alter table public.jobs add column if not exists service_type text;
alter table public.jobs add column if not exists completion_photo_url text;
alter table public.jobs add column if not exists completed_at timestamptz;
alter table public.jobs add column if not exists cancelled_at timestamptz;
alter table public.jobs add column if not exists cancellation_reason text;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'jobs' and constraint_name = 'jobs_client_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_client_id_fkey foreign key (client_id) references public.clients(id);
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'jobs' and constraint_name = 'jobs_cleaner_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_cleaner_id_fkey foreign key (cleaner_id) references public.cleaners(id);
  end if;
end $$;

-- ============================================================
-- bookings
-- ============================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  job_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  location text,
  notes text,
  status text not null default 'pending',
  service_type text,
  requester_name text,
  requester_email text,
  requester_phone text,
  created_at timestamptz not null default now()
);

alter table public.bookings add column if not exists client_id uuid;
alter table public.bookings add column if not exists job_id uuid;
alter table public.bookings add column if not exists start_time timestamptz;
alter table public.bookings add column if not exists end_time timestamptz;
alter table public.bookings add column if not exists location text;
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists status text not null default 'pending';
alter table public.bookings add column if not exists service_type text;
alter table public.bookings add column if not exists requester_name text;
alter table public.bookings add column if not exists requester_email text;
alter table public.bookings add column if not exists requester_phone text;
alter table public.bookings add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'bookings' and constraint_name = 'bookings_client_id_fkey'
  ) then
    alter table public.bookings
      add constraint bookings_client_id_fkey foreign key (client_id) references public.clients(id);
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'bookings' and constraint_name = 'bookings_job_id_fkey'
  ) then
    alter table public.bookings
      add constraint bookings_job_id_fkey foreign key (job_id) references public.jobs(id);
  end if;
end $$;

-- ============================================================
-- recurrence_rules
-- ============================================================
create table if not exists public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  rule text not null,
  created_at timestamptz default now()
);

alter table public.recurrence_rules add column if not exists job_id uuid;
alter table public.recurrence_rules add column if not exists rule text not null;
alter table public.recurrence_rules add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'recurrence_rules' and constraint_name = 'recurrence_rules_job_id_fkey'
  ) then
    alter table public.recurrence_rules
      add constraint recurrence_rules_job_id_fkey foreign key (job_id) references public.jobs(id);
  end if;
end $$;

-- ============================================================
-- user_roles
-- Confirmed live: no is_active column (present in some earlier draft design).
-- ============================================================
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  role text not null,
  created_at timestamptz default now()
);

alter table public.user_roles add column if not exists user_id uuid;
alter table public.user_roles add column if not exists role text not null;
alter table public.user_roles add column if not exists created_at timestamptz default now();

-- ============================================================
-- Row Level Security — enable + policies.
--
-- ENABLE ROW LEVEL SECURITY is naturally idempotent (no error if already
-- enabled), so these are safe as plain statements.
--
-- CREATE POLICY has no IF NOT EXISTS form in Postgres, so each policy is
-- guarded with a DO block that checks pg_policies first. Names, commands,
-- roles, and USING/WITH CHECK clauses below are copied verbatim from a
-- live pg_policies pull taken 2026-07-02 (see docs/SESSION-LOG.md) — not
-- reconstructed from the original 0003 design.
-- ============================================================

alter table public.clients enable row level security;
alter table public.cleaners enable row level security;
alter table public.jobs enable row level security;
alter table public.bookings enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.user_roles enable row level security;

-- clients
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'Admins full access - clients'
  ) then
    create policy "Admins full access - clients" on public.clients
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'Clients read own row'
  ) then
    create policy "Clients read own row" on public.clients
      for select
      to public
      using (user_id = auth.uid());
  end if;
end $$;

-- cleaners
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cleaners' and policyname = 'Admins full access - cleaners'
  ) then
    create policy "Admins full access - cleaners" on public.cleaners
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cleaners' and policyname = 'Cleaners read own row'
  ) then
    create policy "Cleaners read own row" on public.cleaners
      for select
      to public
      using (user_id = auth.uid());
  end if;
end $$;

-- jobs
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'Admins full access - jobs'
  ) then
    create policy "Admins full access - jobs" on public.jobs
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'Clients read own jobs'
  ) then
    create policy "Clients read own jobs" on public.jobs
      for select
      to public
      using (
        client_id in (
          select clients.id from public.clients where clients.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_select_for_own_cleaner'
  ) then
    create policy "jobs_select_for_own_cleaner" on public.jobs
      for select
      to authenticated
      using (
        exists (
          select 1 from public.cleaners c
          join public.user_roles ur on ur.user_id = c.user_id
          where c.id = jobs.cleaner_id and ur.user_id = auth.uid() and ur.role = 'cleaner'
        )
      );
  end if;
end $$;

-- bookings
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bookings' and policyname = 'Admins full access - bookings'
  ) then
    create policy "Admins full access - bookings" on public.bookings
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bookings' and policyname = 'bookings_anon_insert'
  ) then
    create policy "bookings_anon_insert" on public.bookings
      for insert
      to anon
      with check (
        (requester_email is not null) and (char_length(requester_email) > 3)
      );
  end if;
end $$;

-- recurrence_rules
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recurrence_rules' and policyname = 'Admins full access - recurrence_rules'
  ) then
    create policy "Admins full access - recurrence_rules" on public.recurrence_rules
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recurrence_rules' and policyname = 'Clients read own recurrence_rules'
  ) then
    create policy "Clients read own recurrence_rules" on public.recurrence_rules
      for select
      to public
      using (
        job_id in (
          select j.id from public.jobs j
          join public.clients c on c.id = j.client_id
          where c.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- user_roles
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles' and policyname = 'users_read_own_role'
  ) then
    create policy "users_read_own_role" on public.user_roles
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;
