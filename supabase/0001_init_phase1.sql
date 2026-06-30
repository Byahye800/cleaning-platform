-- Yahye Corp (Facilty at cleaning maintenance) — Phase 1 schema seed (admin-only)
-- Temporary note:
--   Phase 1 admin portal will use Supabase Service Role for privileged reads/writes.
--   RLS is enabled but we do NOT add permissive policies yet.
--   Only Service Role bypasses RLS for Phase 1.
--   Per project tracking: we must add proper RLS policies before Phase 2.

-- 1) Extensions
create extension if not exists pgcrypto;

-- 2) Roles table (maps auth.users -> app roles)
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','client','cleaner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  address text not null,
  contact_email text not null,
  contact_phone text,
  agreed_rate numeric,
  notes text,
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now()
);

-- 4) Cleaners
create table if not exists public.cleaners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  hourly_rate numeric not null,
  utr_number text,
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now()
);

-- 5) Recurrence rules
create table if not exists public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  frequency text not null check (frequency in ('weekly','monthly','custom')),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

-- 6) Jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  recurrence_rule_id uuid references public.recurrence_rules(id) on delete set null,
  location text not null,
  location_lat double precision not null,
  location_lng double precision not null,
  geofence_radius_m integer not null default 100,
  access_instructions text,
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now()
);

-- Optional: indices for common access
create index if not exists jobs_client_id_idx on public.jobs(client_id);
create index if not exists jobs_recurrence_rule_id_idx on public.jobs(recurrence_rule_id);

-- 7) Enable RLS (deny-by-default until proper policies are added)
alter table public.user_roles enable row level security;
alter table public.clients enable row level security;
alter table public.cleaners enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.jobs enable row level security;

-- No policies are created here intentionally.
-- With RLS enabled and no policies, all non-superuser/non-bypass operations are denied.
-- Service Role bypasses RLS.

-- 8) Admin bootstrap helper (run separately)
--
-- After you create your admin auth user (or if you already have one), run:
--
--   insert into public.user_roles(user_id, role, is_active)
--   values ('<auth_user_uuid_here>', 'admin', true)
--   on conflict (user_id) do update set role = excluded.role, is_active = excluded.is_active;
--
-- To find <auth_user_uuid_here> for a given email:
--
--   select id from auth.users where email = '<admin_email>';
