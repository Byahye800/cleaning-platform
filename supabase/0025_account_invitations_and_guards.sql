-- Stage 2.2a: account_invitations (authoritative invitation source), cross-role
-- profile enforcement, and invitation_status cache-write guard.
--
-- Scope: schema + trigger functions + drift-detection view only.
-- No API routes are introduced by this migration. The transactional
-- primitives that will use the service-role-authenticated path
-- (reserve_invitation, finalize_invitation, etc.) are Stage 2.2b and are
-- NOT part of this file.

-- ============================================================
-- 1. account_invitations: authoritative invitation source
-- ============================================================

create table public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  canonical_email text not null check (canonical_email = lower(trim(canonical_email))),
  intended_role text not null check (intended_role in ('cleaner','client')),
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','cancelled','superseded','failed')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  auth_user_id uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz,
  resend_count int not null default 0,
  last_resent_at timestamptz,
  superseded_by uuid references public.account_invitations(id),
  retry_of uuid references public.account_invitations(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one 'pending' invitation may exist per canonical email at a time.
-- This is a safety net against concurrent double-pending, not full
-- business-rule enforcement. It does NOT prevent issuing a new 'pending'
-- row for an email that already has an 'accepted' row -- that lookup is
-- the responsibility of Stage 2.2b's reserve_invitation function, which
-- must check authoritative state (auth.users / account_invitations)
-- before deciding to reserve. Confirmed live via rolled-back test (see
-- Stage 2.2a evidence package, test E1).
create unique index account_invitations_pending_email_key
  on public.account_invitations (canonical_email) where status = 'pending';

-- RLS enabled, deliberately zero policies: this table is reachable only
-- via the service-role key or SECURITY DEFINER functions (Stage 2.2b).
-- Confirmed live: anon/authenticated SELECT return 0 rows, anon/authenticated
-- INSERT are rejected with "new row violates row-level security policy".
alter table public.account_invitations enable row level security;


-- ============================================================
-- 2. enforce_single_role_profile: cross-role / role-profile mismatch guard
-- ============================================================

create or replace function public.enforce_single_role_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_other_exists boolean;
begin
  select role into v_role from public.user_roles where user_id = new.user_id;

  if v_role is null then
    raise exception 'no user_roles entry for user_id %, cannot create profile', new.user_id;
  end if;

  if tg_table_name = 'cleaners' and v_role <> 'cleaner' then
    raise exception 'user_id % has role % in user_roles, cannot create cleaners profile', new.user_id, v_role;
  end if;

  if tg_table_name = 'clients' and v_role <> 'client' then
    raise exception 'user_id % has role % in user_roles, cannot create clients profile', new.user_id, v_role;
  end if;

  if tg_table_name = 'cleaners' then
    select exists(select 1 from public.clients where user_id = new.user_id) into v_other_exists;
  else
    select exists(select 1 from public.cleaners where user_id = new.user_id) into v_other_exists;
  end if;

  if v_other_exists then
    raise exception 'user_id % already has a profile in the other role table', new.user_id;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_single_role_profile_cleaners
  before insert or update of user_id on public.cleaners
  for each row when (new.user_id is not null)
  execute function public.enforce_single_role_profile();

create trigger trg_enforce_single_role_profile_clients
  before insert or update of user_id on public.clients
  for each row when (new.user_id is not null)
  execute function public.enforce_single_role_profile();

-- Known, deliberately-accepted consequence: this trigger requires a
-- user_roles row to exist BEFORE a cleaners/clients profile row is
-- created. The legacy manual admin-UI "create cleaner/client" forms do
-- not create user_roles, so those forms can no longer create NEW rows
-- from this point forward (editing existing rows is unaffected). This
-- is intentional: it closes the unsafe parallel creation path early,
-- ahead of its formal retirement in Stage 2.2e.


-- ============================================================
-- 3. guard_invitation_status_write: cache-write guard on
--    cleaners.invitation_status / clients.invitation_status
-- ============================================================
--
-- Design note (supersedes an earlier, abandoned flag-based approach):
-- the guard does NOT rely on any settable session/transaction flag.
-- A settable-flag design was prototyped and then rejected after live
-- testing showed that both `anon` and `authenticated` can execute
-- pg_catalog.set_config by default, and that REVOKE EXECUTE on that
-- built-in function is ineffective in this managed project (the
-- `postgres` role here has rolsuper = false and cannot alter ACLs on
-- system catalog functions it does not fully own).
--
-- Instead, the guard checks current_user directly. The function is
-- SECURITY INVOKER (no `security definer` clause) so that current_user
-- inside the trigger body reflects the actual role that issued the
-- UPDATE, not the function owner. `service_role` is never a role a
-- client can log in as or switch into via any callable primitive --
-- PostgREST sets it via SET ROLE only after independently verifying the
-- service-role API key. This makes the check structural rather than
-- dependent on a revocable/settable primitive.

create or replace function public.guard_invitation_status_write() returns trigger
language plpgsql as $$
begin
  if new.invitation_status is distinct from old.invitation_status
     and current_user <> 'service_role' then
    raise exception 'invitation_status may only be changed via the service-role-authenticated lifecycle path (current_user=%)', current_user;
  end if;
  return new;
end;
$$;

create trigger trg_guard_invitation_status_cleaners
  before update of invitation_status on public.cleaners
  for each row execute function public.guard_invitation_status_write();

create trigger trg_guard_invitation_status_clients
  before update of invitation_status on public.clients
  for each row execute function public.guard_invitation_status_write();

-- Note: Supabase's default schema exposure grants blanket table-level
-- UPDATE to anon/authenticated, and a column-specific REVOKE cannot
-- override that table-level grant (confirmed live: has_column_privilege
-- for invitation_status remains true for both roles even after REVOKE).
-- This is immaterial to actual protection: for cleaners/clients, RLS
-- restricts which rows anon/authenticated can reach at all (no own-row
-- UPDATE policy exists; only an "admin full access" ALL-cmd policy
-- exists), and this trigger independently blocks any invitation_status
-- change whose current_user is not exactly 'service_role' -- including
-- an ordinary authenticated admin session that RLS would otherwise
-- admit. Both layers were exercised live; see the Stage 2.2a evidence
-- package for the full test matrix.


-- ============================================================
-- 4. invitation_status_drift: deterministic drift-detection view
-- ============================================================
--
-- Compares the authoritative account_invitations.status against the
-- cached cleaners/clients.invitation_status for accounts that have a
-- matching account_invitations row (joined on auth_user_id = user_id).
-- Legacy accounts with no account_invitations row at all are excluded
-- by the inner join, not treated as drift.

create or replace view public.invitation_status_drift
with (security_invoker = true) as
select
  'cleaner'::text as role,
  c.user_id,
  c.invitation_status as cached_status,
  ai.status as authoritative_status,
  ai.id as invitation_id
from public.cleaners c
join public.account_invitations ai on ai.auth_user_id = c.user_id
where
  (ai.status = 'accepted' and c.invitation_status is distinct from 'invite_accepted')
  or (ai.status = 'pending' and c.invitation_status is distinct from 'invite_pending')
  or (ai.status = 'expired' and c.invitation_status is distinct from 'invite_expired')
  or (ai.status = 'cancelled' and c.invitation_status is distinct from 'invite_cancelled')
  or (ai.status in ('superseded','failed')
      and c.invitation_status not in ('invite_pending','invite_accepted','invite_expired','invite_cancelled'))
union all
select
  'client'::text as role,
  cl.user_id,
  cl.invitation_status as cached_status,
  ai.status as authoritative_status,
  ai.id as invitation_id
from public.clients cl
join public.account_invitations ai on ai.auth_user_id = cl.user_id
where
  (ai.status = 'accepted' and cl.invitation_status is distinct from 'invite_accepted')
  or (ai.status = 'pending' and cl.invitation_status is distinct from 'invite_pending')
  or (ai.status = 'expired' and cl.invitation_status is distinct from 'invite_expired')
  or (ai.status = 'cancelled' and cl.invitation_status is distinct from 'invite_cancelled')
  or (ai.status in ('superseded','failed')
      and cl.invitation_status not in ('invite_pending','invite_accepted','invite_expired','invite_cancelled'));

revoke all on public.invitation_status_drift from public, anon, authenticated;
