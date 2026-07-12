-- Stage 2.2b: account invitation lifecycle functions
-- Corrected per Stage 2.2b Final Review Decision (10 numbered issues).
-- Depends on: 0025_account_invitations_and_guards.sql (Stage 2.2a)
--
-- This migration creates the five lifecycle RPC functions for the
-- account_invitations saga (reserve / finalize / reconcile / mark_failed /
-- accept), plus the activity_log.detail column used by mark_failed.
--
-- IMPORTANT — SECURITY DEFINER ownership design (see "Ownership note" below):
-- accept_account_invitation is owned by service_role. All other functions
-- are owned by postgres. This is not arbitrary; it is required by two
-- constraints that both apply to this schema and cannot be worked around:
--
--   1. Stage 2.2a's guard_invitation_status_write() trigger enforces that
--      writes to cleaners.invitation_status / clients.invitation_status are
--      only permitted when current_user = 'service_role'.
--   2. PostgreSQL unconditionally disallows SET ROLE / SET LOCAL ROLE
--      inside any SECURITY DEFINER function body (error 42501: "cannot set
--      parameter role within security-definer function"). This is a hard
--      Postgres restriction with no override, not a bug or misconfiguration.
--
-- Consequently, the only correct way for a SECURITY DEFINER function to
-- execute as current_user = 'service_role' is for the function's OWNER to
-- literally be service_role, since SECURITY DEFINER functions execute with
-- current_user set to their owner for the duration of the call. Ownership
-- is applied narrowly: only accept_account_invitation writes
-- invitation_status, so only it needs service_role ownership. The other
-- four functions read auth.users (SELECT grant only exists for postgres,
-- not service_role, in this project) and must remain owned by postgres.
--
-- Changing a function's owner to service_role requires service_role to
-- have CREATE on schema public at the moment of the ALTER (Postgres checks
-- this for non-superuser grantors). That privilege is granted immediately
-- before the ALTER and revoked immediately after — it is not a standing
-- grant and confers no lasting elevated privilege to service_role.

-- ============================================================
-- 0. Schema prerequisite: activity_log.detail (used by mark_account_invitation_failed)
-- ============================================================
alter table public.activity_log add column if not exists detail text;

-- ============================================================
-- 1. reserve_account_invitation
--    p_invited_by is required and must be an existing, admin-role auth user.
-- ============================================================
drop function if exists public.reserve_account_invitation(text, text, uuid);

create or replace function public.reserve_account_invitation(
  p_email text,
  p_intended_role text,
  p_invited_by uuid
)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(trim(p_email));
  v_auth_user_id uuid;
  v_last_failed_id uuid;
  v_new public.account_invitations;
  v_existing public.account_invitations;
begin
  if p_intended_role not in ('cleaner','client') then
    raise exception 'invalid intended_role: %', p_intended_role;
  end if;

  if p_invited_by is null then
    raise exception 'p_invited_by is required and must reference an admin user';
  end if;

  if not exists (select 1 from auth.users where id = p_invited_by) then
    raise exception 'p_invited_by % does not reference an existing auth user', p_invited_by;
  end if;

  if not exists (select 1 from public.user_roles where user_id = p_invited_by and role = 'admin') then
    raise exception 'p_invited_by % is not an admin user, cannot reserve invitation', p_invited_by;
  end if;

  select id into v_auth_user_id from auth.users where lower(email) = v_email limit 1;
  if v_auth_user_id is not null then
    if exists (select 1 from public.user_roles where user_id = v_auth_user_id)
       or exists (select 1 from public.account_invitations where auth_user_id = v_auth_user_id and status = 'accepted') then
      raise exception 'identity already exists for email %, cannot reserve a new invitation', v_email;
    end if;
  end if;

  select id into v_last_failed_id
  from public.account_invitations
  where canonical_email = v_email and status = 'failed'
  order by invited_at desc limit 1;

  insert into public.account_invitations (canonical_email, intended_role, invited_by, status, retry_of)
  values (v_email, p_intended_role, p_invited_by, 'pending', v_last_failed_id)
  on conflict (canonical_email) where status = 'pending' do nothing
  returning * into v_new;

  if v_new.id is not null then
    return v_new;
  end if;

  select * into v_existing
  from public.account_invitations
  where canonical_email = v_email and status = 'pending'
  order by invited_at desc limit 1;

  if v_existing.intended_role <> p_intended_role then
    raise exception 'a pending invitation for % already exists for role %, cannot reserve for role %',
      v_email, v_existing.intended_role, p_intended_role;
  end if;

  return v_existing;
end;
$$;

revoke all on function public.reserve_account_invitation(text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_account_invitation(text, text, uuid) to service_role;

-- ============================================================
-- 2. finalize_account_invitation
--    Idempotently binds auth_user_id, and verifies/repairs user_roles +
--    profile table regardless of whether auth_user_id was already linked.
--    Re-verifies the row after every ON CONFLICT DO NOTHING.
-- ============================================================
create or replace function public.finalize_account_invitation(
  p_invitation_id uuid,
  p_auth_user_id uuid
)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.account_invitations;
  v_existing_role text;
begin
  if p_auth_user_id is null then
    raise exception 'p_auth_user_id is required';
  end if;

  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.status <> 'pending' then
    if v_inv.auth_user_id is not null and v_inv.auth_user_id = p_auth_user_id then
      null; -- allow idempotent repair even if already finalized to this same user
    else
      raise exception 'invitation % is not pending (status=%), cannot finalize', p_invitation_id, v_inv.status;
    end if;
  end if;

  if v_inv.auth_user_id is not null and v_inv.auth_user_id <> p_auth_user_id then
    raise exception 'invitation % already finalized to a different auth user', p_invitation_id;
  end if;

  if v_inv.auth_user_id is null then
    update public.account_invitations
    set auth_user_id = p_auth_user_id, updated_at = now()
    where id = p_invitation_id;
  end if;

  insert into public.user_roles (user_id, role)
  values (p_auth_user_id, v_inv.intended_role)
  on conflict (user_id) do nothing;

  select role into v_existing_role from public.user_roles where user_id = p_auth_user_id;
  if v_existing_role is distinct from v_inv.intended_role then
    raise exception 'auth user % has conflicting role % in user_roles, expected %',
      p_auth_user_id, v_existing_role, v_inv.intended_role;
  end if;

  if v_inv.intended_role = 'cleaner' then
    insert into public.cleaners (user_id, name, email, status, invitation_status, onboarding_status)
    values (p_auth_user_id, v_inv.canonical_email, v_inv.canonical_email, 'restricted', 'invite_pending', 'not_started')
    on conflict (user_id) do nothing;

    if not exists (select 1 from public.cleaners where user_id = p_auth_user_id) then
      raise exception 'cleaners profile missing for % after insert attempt', p_auth_user_id;
    end if;
    if exists (select 1 from public.clients where user_id = p_auth_user_id) then
      raise exception 'auth user % has a conflicting clients profile, cannot finalize cleaner invitation', p_auth_user_id;
    end if;
  else
    insert into public.clients (user_id, name, address, contact_email, status, invitation_status, onboarding_status)
    values (p_auth_user_id, v_inv.canonical_email, '', v_inv.canonical_email, 'restricted', 'invite_pending', 'not_started')
    on conflict (user_id) do nothing;

    if not exists (select 1 from public.clients where user_id = p_auth_user_id) then
      raise exception 'clients profile missing for % after insert attempt', p_auth_user_id;
    end if;
    if exists (select 1 from public.cleaners where user_id = p_auth_user_id) then
      raise exception 'auth user % has a conflicting cleaners profile, cannot finalize client invitation', p_auth_user_id;
    end if;
  end if;

  select * into v_inv from public.account_invitations where id = p_invitation_id;
  return v_inv;
end;
$$;

revoke all on function public.finalize_account_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_invitation(uuid, uuid) to service_role;

-- ============================================================
-- 3. reconcile_account_invitation
--    Repairs linked-but-incomplete invitations by re-invoking finalize.
-- ============================================================
create or replace function public.reconcile_account_invitation(p_invitation_id uuid)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.account_invitations;
  v_auth_user_id uuid;
  v_needs_repair boolean;
begin
  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.status <> 'pending' then
    return v_inv;
  end if;

  if v_inv.auth_user_id is not null then
    if v_inv.intended_role = 'cleaner' then
      v_needs_repair := (not exists (select 1 from public.cleaners where user_id = v_inv.auth_user_id))
        or (not exists (select 1 from public.user_roles where user_id = v_inv.auth_user_id and role = 'cleaner'));
    else
      v_needs_repair := (not exists (select 1 from public.clients where user_id = v_inv.auth_user_id))
        or (not exists (select 1 from public.user_roles where user_id = v_inv.auth_user_id and role = 'client'));
    end if;

    if v_needs_repair then
      return public.finalize_account_invitation(p_invitation_id, v_inv.auth_user_id);
    end if;
    return v_inv;
  end if;

  select id into v_auth_user_id from auth.users where lower(email) = v_inv.canonical_email limit 1;
  if v_auth_user_id is null then
    return v_inv;
  end if;

  return public.finalize_account_invitation(p_invitation_id, v_auth_user_id);
end;
$$;

revoke all on function public.reconcile_account_invitation(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_account_invitation(uuid) to service_role;

-- ============================================================
-- 4. mark_account_invitation_failed
--    p_reason is persisted to activity_log.detail (not discarded).
--    p_actor_id records the responsible admin/system actor in activity_log.actor_id.
-- ============================================================
drop function if exists public.mark_account_invitation_failed(uuid, text);

create or replace function public.mark_account_invitation_failed(
  p_invitation_id uuid,
  p_reason text default null,
  p_actor_id uuid default null
)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.account_invitations;
begin
  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.status = 'failed' then
    return v_inv; -- idempotent
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation % is not pending (status=%), cannot mark failed', p_invitation_id, v_inv.status;
  end if;

  update public.account_invitations
  set status = 'failed', updated_at = now()
  where id = p_invitation_id;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail)
  values (p_actor_id, 'account_invitation_failed', 'account_invitation', p_invitation_id, p_reason);

  select * into v_inv from public.account_invitations where id = p_invitation_id;
  return v_inv;
end;
$$;

revoke all on function public.mark_account_invitation_failed(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_account_invitation_failed(uuid, text, uuid) to service_role;

-- ============================================================
-- 5. accept_account_invitation
--    Requires exactly one matching, non-disabled profile row before
--    accepting. Verifies/repairs the profile cache unconditionally via
--    GET DIAGNOSTICS row_count, so drifted or already-accepted calls are
--    still validated and repaired idempotently rather than trusted blindly.
-- ============================================================
create or replace function public.accept_account_invitation(p_invitation_id uuid)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_caller uuid := auth.uid();
  v_inv public.account_invitations;
  v_profile_count int;
  v_profile_status text;
  v_rows int;
begin
  if v_caller is null then
    raise exception 'accept_account_invitation requires an authenticated caller';
  end if;

  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.auth_user_id is null or v_inv.auth_user_id <> v_caller then
    raise exception 'invitation % does not belong to the calling user', p_invitation_id;
  end if;

  if v_inv.status not in ('pending','accepted') then
    raise exception 'invitation % is not pending (status=%), cannot accept', p_invitation_id, v_inv.status;
  end if;

  if v_inv.status = 'pending' and v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'invitation % has expired', p_invitation_id;
  end if;

  if not exists (select 1 from public.user_roles where user_id = v_caller and role = v_inv.intended_role) then
    raise exception 'role mismatch for invitation %', p_invitation_id;
  end if;

  if v_inv.intended_role = 'cleaner' then
    select count(*), max(status) into v_profile_count, v_profile_status from public.cleaners where user_id = v_caller;
  else
    select count(*), max(status) into v_profile_count, v_profile_status from public.clients where user_id = v_caller;
  end if;

  if v_profile_count = 0 then
    raise exception 'no matching % profile exists for invitation %, cannot accept', v_inv.intended_role, p_invitation_id;
  end if;
  if v_profile_count > 1 then
    raise exception 'multiple % profiles found for user %, cannot accept invitation % safely', v_inv.intended_role, v_caller, p_invitation_id;
  end if;
  if v_profile_status = 'disabled' then
    raise exception 'account for invitation % is disabled, cannot accept', p_invitation_id;
  end if;

  if v_inv.status = 'pending' then
    update public.account_invitations
    set status = 'accepted', accepted_at = now(), updated_at = now()
    where id = p_invitation_id;
  end if;

  -- Unconditional cache write + row-count verification. This function is
  -- owned by service_role (see ownership note at top of file), which is
  -- what satisfies guard_invitation_status_write()'s current_user check —
  -- no SET ROLE is used or possible here.
  if v_inv.intended_role = 'cleaner' then
    update public.cleaners set invitation_status = 'invite_accepted' where user_id = v_caller;
  else
    update public.clients set invitation_status = 'invite_accepted' where user_id = v_caller;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'expected exactly 1 % profile row to update for invitation %, got %', v_inv.intended_role, p_invitation_id, v_rows;
  end if;

  select * into v_inv from public.account_invitations where id = p_invitation_id;
  return v_inv;
end;
$$;

revoke all on function public.accept_account_invitation(uuid) from public, anon;
grant execute on function public.accept_account_invitation(uuid) to authenticated;
grant execute on function public.accept_account_invitation(uuid) to service_role;

-- Ownership fix (see note at top of file): accept_account_invitation must
-- execute as current_user = 'service_role' to satisfy
-- guard_invitation_status_write(), which SET ROLE cannot do inside a
-- SECURITY DEFINER function. Granting CREATE on schema public to
-- service_role only for the duration of the ALTER OWNER statement.
grant create on schema public to service_role;
alter function public.accept_account_invitation(uuid) owner to service_role;
revoke create on schema public from service_role;
