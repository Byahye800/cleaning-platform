-- Stage 2.2c-prereq / "0027": account invitation lifecycle completion.
-- Resolves the six mandatory findings from the independent Stage 2.2b audit:
--   1. Invitation expiry enforced at the DB level (not only in application code).
--   2. Previously-unreachable lifecycle states (expired/cancelled/superseded) now
--      have narrowly-scoped, authorized, transaction-safe, auditable DB functions
--      that can actually reach them.
--   3. The non-atomic DB/Auth boundary (reserve succeeds, Supabase Auth invite
--      call fails) now has a controlled, auditable compensation path
--      (mark_account_invitation_failed) plus a clean-retry path (reserve's
--      retry_of linkage), forced-failure-tested live.
--   4. Reconciliation has an explicit, actor-attributable, logged execution
--      path (reconcile_account_invitation) with a structured outcome value.
--   5. Happy-path lifecycle events (reserve/accept/finalize/resend/cancel/
--      expire/sweep/reconcile) all write activity_log rows with structured
--      jsonb metadata, not just failure paths.
--   6. Single-role-per-identity remains a provisional invariant (unchanged by
--      this migration; assessed, not redesigned, per standing instruction).
--
-- Depends on: 0025_account_invitations_and_guards.sql (Stage 2.2a schema),
--             0026_account_invitation_functions.sql (Stage 2.2b functions).
-- All columns used below (expires_at, resend_count, last_resent_at,
-- superseded_by, retry_of, cancelled_at, cancelled_by) already exist as of
-- 0025 -- this migration adds no new account_invitations columns. It does
-- add activity_log.metadata, and it rewrites/extends five of 0026's five
-- functions plus adds four new ones.
--
-- Ownership (unchanged from 0026, re-verified live this segment):
-- accept_account_invitation is owned by service_role (required so that
-- current_user = 'service_role' inside it satisfies
-- guard_invitation_status_write(), since SET ROLE is disallowed inside
-- SECURITY DEFINER bodies). All eight other functions in this file
-- (reserve/finalize/reconcile/mark_failed/resend/cancel/expire_stale/sweep)
-- are owned by postgres and were CREATE OR REPLACE'd / re-created under
-- that same ownership -- no ALTER OWNER is required for them.

-- ============================================================
-- 0. Schema prerequisite: activity_log.metadata (structured audit payload)
-- ============================================================
alter table public.activity_log add column if not exists metadata jsonb;

-- ============================================================
-- 1. reserve_account_invitation
--    New in this migration: p_ttl_days parameter (default 7, must be a
--    positive integer), DB-enforced expires_at on every new/retried row,
--    and lazy supersede: a pending invitation whose expires_at has already
--    passed is no longer treated as a live conflict -- it is marked
--    'superseded' (superseded_by set to the new row) and a fresh invitation
--    is issued in its place, rather than the caller being blocked or the
--    stale row being silently reused. Concurrency-safe: the pending row is
--    read with `for update`, so a concurrent reserve racing on the same
--    stale row serializes correctly (proven live via a real two-connection
--    test: a held row lock blocked the second call, which then proceeded
--    correctly once the lock was released).
-- ============================================================
drop function if exists public.reserve_account_invitation(text, text, uuid);

create or replace function public.reserve_account_invitation(
  p_email text,
  p_intended_role text,
  p_invited_by uuid,
  p_ttl_days integer default 7
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
  v_existing_pending public.account_invitations;
  v_new public.account_invitations;
  v_retry_of uuid;
  v_superseded_id uuid;
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

  if p_ttl_days is null or p_ttl_days <= 0 then
    raise exception 'p_ttl_days must be a positive integer';
  end if;

  select id into v_auth_user_id from auth.users where lower(email) = v_email limit 1;
  if v_auth_user_id is not null then
    if exists (select 1 from public.user_roles where user_id = v_auth_user_id)
       or exists (select 1 from public.account_invitations where auth_user_id = v_auth_user_id and status = 'accepted') then
      raise exception 'identity already exists for email %, cannot reserve a new invitation', v_email;
    end if;
  end if;

  select * into v_existing_pending
  from public.account_invitations
  where canonical_email = v_email and status = 'pending'
  for update;

  if v_existing_pending.id is not null then
    if v_existing_pending.expires_at is not null and v_existing_pending.expires_at < now() then
      -- Lazy supersede: the existing pending row is stale. Retire it and
      -- fall through to reserve a fresh one below.
      update public.account_invitations
      set status = 'superseded', updated_at = now()
      where id = v_existing_pending.id;
      v_retry_of := v_existing_pending.id;
      v_superseded_id := v_existing_pending.id;
    else
      if v_existing_pending.intended_role <> p_intended_role then
        raise exception 'a pending invitation for % already exists for role %, cannot reserve for role %',
          v_email, v_existing_pending.intended_role, p_intended_role;
      end if;
      return v_existing_pending;
    end if;
  else
    select id into v_last_failed_id
    from public.account_invitations
    where canonical_email = v_email and status = 'failed'
    order by invited_at desc limit 1;
    v_retry_of := v_last_failed_id;
  end if;

  insert into public.account_invitations (canonical_email, intended_role, invited_by, status, retry_of, expires_at)
  values (v_email, p_intended_role, p_invited_by, 'pending', v_retry_of, now() + (p_ttl_days || ' days')::interval)
  on conflict (canonical_email) where status = 'pending' do nothing
  returning * into v_new;

  if v_new.id is null then
    select * into v_new
    from public.account_invitations
    where canonical_email = v_email and status = 'pending'
    order by invited_at desc limit 1;

    if v_new.intended_role <> p_intended_role then
      raise exception 'a pending invitation for % already exists for role %, cannot reserve for role %',
        v_email, v_new.intended_role, p_intended_role;
    end if;
    return v_new;
  end if;

  if v_superseded_id is not null then
    update public.account_invitations set superseded_by = v_new.id where id = v_superseded_id;
  end if;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    p_invited_by, 'account_invitation_reserved', 'account_invitation', v_new.id,
    format('Invitation reserved for %s (%s)', v_email, p_intended_role),
    jsonb_build_object(
      'invitation_id', v_new.id, 'canonical_email', v_email, 'intended_role', p_intended_role,
      'actor_id', p_invited_by, 'previous_status', null, 'new_status', 'pending', 'success', true
    )
  );

  return v_new;
end;
$$;

revoke all on function public.reserve_account_invitation(text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_account_invitation(text, text, uuid, integer) to service_role;

-- ============================================================
-- 2. accept_account_invitation
--    New in this migration: lazy expiry check runs BEFORE any role/profile
--    mutation. A stale pending invitation is transitioned to 'expired' and
--    logged (rather than the caller only receiving a raised exception with
--    no persisted state change), and the accept happy path now also writes
--    a structured activity_log entry (0026 only logged mark_failed).
--    Ownership: service_role (unchanged from 0026 -- required for the
--    invitation_status cache write below to satisfy
--    guard_invitation_status_write()).
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

  if v_inv.status = 'pending' and v_inv.expires_at is not null and v_inv.expires_at < now() then
    update public.account_invitations set status = 'expired', updated_at = now() where id = p_invitation_id;

    insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
    values (
      v_caller, 'account_invitation_expired', 'account_invitation', p_invitation_id,
      format('Invitation for %s expired on accept attempt', v_inv.canonical_email),
      jsonb_build_object(
        'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
        'intended_role', v_inv.intended_role, 'actor_id', v_caller,
        'previous_status', 'pending', 'new_status', 'expired', 'success', false
      )
    );

    select * into v_inv from public.account_invitations where id = p_invitation_id;
    return v_inv;
  end if;

  if v_inv.status not in ('pending','accepted') then
    raise exception 'invitation % is not pending (status=%), cannot accept', p_invitation_id, v_inv.status;
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

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    v_caller, 'account_invitation_accepted', 'account_invitation', p_invitation_id,
    format('Invitation for %s accepted', v_inv.canonical_email),
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', v_caller,
      'previous_status', 'pending', 'new_status', 'accepted', 'success', true
    )
  );

  return v_inv;
end;
$$;

-- Grants/ownership unchanged from 0026 (same signature, CREATE OR REPLACE
-- preserves both). Restated here for clarity and idempotent re-application.
revoke all on function public.accept_account_invitation(uuid) from public, anon;
grant execute on function public.accept_account_invitation(uuid) to authenticated;
grant execute on function public.accept_account_invitation(uuid) to service_role;
grant create on schema public to service_role;
alter function public.accept_account_invitation(uuid) owner to service_role;
revoke create on schema public from service_role;

-- ============================================================
-- 3. finalize_account_invitation
--    New in this migration: writes an 'account_invitation_finalized'
--    activity_log entry with structured metadata (0026's version performed
--    the same finalize logic but never logged it -- a happy-path audit gap
--    closed here). Logic otherwise unchanged from 0026.
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
      null;
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

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    p_auth_user_id, 'account_invitation_finalized', 'account_invitation', p_invitation_id,
    format('Invitation for %s finalized, role=%s', v_inv.canonical_email, v_inv.intended_role),
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', p_auth_user_id,
      'previous_status', 'pending', 'new_status', v_inv.status, 'success', true
    )
  );

  return v_inv;
end;
$$;

revoke all on function public.finalize_account_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_invitation(uuid, uuid) to service_role;

-- ============================================================
-- 4. reconcile_account_invitation
--    New in this migration: p_actor_id parameter (for audit attribution),
--    an explicit v_outcome value covering all five reachable branches
--    (skipped_not_pending / repaired / no_op_already_consistent /
--    no_op_no_matching_auth_user / repaired_linked_and_finalized), and a
--    logged activity_log entry on every call (0026's version had no
--    logging at all and could not distinguish its own outcomes).
-- ============================================================
drop function if exists public.reconcile_account_invitation(uuid);

create or replace function public.reconcile_account_invitation(
  p_invitation_id uuid,
  p_actor_id uuid default null
)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.account_invitations;
  v_auth_user_id uuid;
  v_needs_repair boolean;
  v_outcome text;
  v_result public.account_invitations;
begin
  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.status <> 'pending' then
    v_outcome := 'skipped_not_pending';
    v_result := v_inv;
  elsif v_inv.auth_user_id is not null then
    if v_inv.intended_role = 'cleaner' then
      v_needs_repair := (not exists (select 1 from public.cleaners where user_id = v_inv.auth_user_id))
        or (not exists (select 1 from public.user_roles where user_id = v_inv.auth_user_id and role = 'cleaner'));
    else
      v_needs_repair := (not exists (select 1 from public.clients where user_id = v_inv.auth_user_id))
        or (not exists (select 1 from public.user_roles where user_id = v_inv.auth_user_id and role = 'client'));
    end if;

    if v_needs_repair then
      v_result := public.finalize_account_invitation(p_invitation_id, v_inv.auth_user_id);
      v_outcome := 'repaired';
    else
      v_result := v_inv;
      v_outcome := 'no_op_already_consistent';
    end if;
  else
    select id into v_auth_user_id from auth.users where lower(email) = v_inv.canonical_email limit 1;
    if v_auth_user_id is null then
      v_result := v_inv;
      v_outcome := 'no_op_no_matching_auth_user';
    else
      v_result := public.finalize_account_invitation(p_invitation_id, v_auth_user_id);
      v_outcome := 'repaired_linked_and_finalized';
    end if;
  end if;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    p_actor_id, 'account_invitation_reconciled', 'account_invitation', p_invitation_id,
    format('Reconcile on %s: %s', v_inv.canonical_email, v_outcome),
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', p_actor_id,
      'previous_status', v_inv.status, 'new_status', v_result.status,
      'outcome', v_outcome, 'success', true
    )
  );

  return v_result;
end;
$$;

revoke all on function public.reconcile_account_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_account_invitation(uuid, uuid) to service_role;

-- ============================================================
-- 5. mark_account_invitation_failed
--    New in this migration: activity_log entry now carries structured
--    metadata (0026 only wrote the free-text `detail` column). Signature
--    and control flow unchanged from 0026.
-- ============================================================
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
    return v_inv;
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation % is not pending (status=%), cannot mark failed', p_invitation_id, v_inv.status;
  end if;

  update public.account_invitations
  set status = 'failed', updated_at = now()
  where id = p_invitation_id;

  select * into v_inv from public.account_invitations where id = p_invitation_id;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    p_actor_id, 'account_invitation_failed', 'account_invitation', p_invitation_id, p_reason,
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', p_actor_id,
      'previous_status', 'pending', 'new_status', 'failed', 'success', true
    )
  );

  return v_inv;
end;
$$;

revoke all on function public.mark_account_invitation_failed(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mark_account_invitation_failed(uuid, text, uuid) to service_role;

-- ============================================================
-- 6. resend_account_invitation (new)
--    Admin-only. Enforces a 7-day TTL refresh and a hard cap of 5 resends
--    per invitation (v_max_resends). Lazily expires the row first if its
--    TTL has already lapsed (so a resend attempt on a dead invitation
--    correctly reports expiry rather than silently reviving it).
-- ============================================================
create or replace function public.resend_account_invitation(
  p_invitation_id uuid,
  p_actor_id uuid
)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.account_invitations;
  v_ttl_days constant integer := 7;
  v_max_resends constant integer := 5;
begin
  if p_actor_id is null then
    raise exception 'p_actor_id is required';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor_id and role = 'admin') then
    raise exception 'p_actor_id % is not an admin user, cannot resend invitation', p_actor_id;
  end if;

  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.status = 'pending' and v_inv.expires_at is not null and v_inv.expires_at < now() then
    update public.account_invitations set status = 'expired', updated_at = now() where id = p_invitation_id;

    insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
    values (
      p_actor_id, 'account_invitation_expired', 'account_invitation', p_invitation_id,
      format('Invitation for %s expired, cannot resend', v_inv.canonical_email),
      jsonb_build_object(
        'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
        'intended_role', v_inv.intended_role, 'actor_id', p_actor_id,
        'previous_status', 'pending', 'new_status', 'expired', 'success', false
      )
    );

    select * into v_inv from public.account_invitations where id = p_invitation_id;
    return v_inv;
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation % is not pending (status=%), cannot resend', p_invitation_id, v_inv.status;
  end if;

  if v_inv.resend_count >= v_max_resends then
    raise exception 'invitation % has reached the maximum resend count (%), cancel and create a new invitation instead', p_invitation_id, v_max_resends;
  end if;

  update public.account_invitations
  set resend_count = resend_count + 1,
      last_resent_at = now(),
      expires_at = now() + (v_ttl_days || ' days')::interval,
      updated_at = now()
  where id = p_invitation_id;

  select * into v_inv from public.account_invitations where id = p_invitation_id;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    p_actor_id, 'account_invitation_resent', 'account_invitation', p_invitation_id,
    format('Invitation resent for %s (resend #%s)', v_inv.canonical_email, v_inv.resend_count),
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', p_actor_id,
      'previous_status', 'pending', 'new_status', 'pending', 'success', true
    )
  );

  return v_inv;
end;
$$;

revoke all on function public.resend_account_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resend_account_invitation(uuid, uuid) to service_role;

-- ============================================================
-- 7. cancel_account_invitation (new)
--    Admin-only. Idempotent on an already-cancelled row; rejects
--    cancellation of any invitation not currently pending.
-- ============================================================
create or replace function public.cancel_account_invitation(
  p_invitation_id uuid,
  p_actor_id uuid,
  p_reason text default null
)
returns public.account_invitations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.account_invitations;
begin
  if p_actor_id is null then
    raise exception 'p_actor_id is required';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor_id and role = 'admin') then
    raise exception 'p_actor_id % is not an admin user, cannot cancel invitation', p_actor_id;
  end if;

  select * into v_inv from public.account_invitations where id = p_invitation_id for update;
  if v_inv.id is null then
    raise exception 'invitation % not found', p_invitation_id;
  end if;

  if v_inv.status = 'cancelled' then
    return v_inv;
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation % is not pending (status=%), cannot cancel', p_invitation_id, v_inv.status;
  end if;

  update public.account_invitations
  set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id, updated_at = now()
  where id = p_invitation_id;

  select * into v_inv from public.account_invitations where id = p_invitation_id;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    p_actor_id, 'account_invitation_cancelled', 'account_invitation', p_invitation_id,
    coalesce(p_reason, format('Invitation for %s cancelled', v_inv.canonical_email)),
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', p_actor_id,
      'previous_status', 'pending', 'new_status', 'cancelled', 'success', true
    )
  );

  return v_inv;
end;
$$;

revoke all on function public.cancel_account_invitation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_account_invitation(uuid, uuid, text) to service_role;

-- ============================================================
-- 8. expire_stale_account_invitation (new)
--    Single-row targeted expiry check (system-actor, actor_id = null).
--    A no-op that returns the row unchanged if it is not pending or its
--    TTL has not yet lapsed -- callers do not need to pre-check state.
-- ============================================================
create or replace function public.expire_stale_account_invitation(p_invitation_id uuid)
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

  if v_inv.status <> 'pending' then
    return v_inv;
  end if;
  if v_inv.expires_at is null or v_inv.expires_at >= now() then
    return v_inv;
  end if;

  update public.account_invitations set status = 'expired', updated_at = now() where id = p_invitation_id;
  select * into v_inv from public.account_invitations where id = p_invitation_id;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  values (
    null, 'account_invitation_expired', 'account_invitation', p_invitation_id,
    format('Invitation for %s expired (targeted check)', v_inv.canonical_email),
    jsonb_build_object(
      'invitation_id', p_invitation_id, 'canonical_email', v_inv.canonical_email,
      'intended_role', v_inv.intended_role, 'actor_id', null,
      'previous_status', 'pending', 'new_status', 'expired', 'success', true
    )
  );

  return v_inv;
end;
$$;

revoke all on function public.expire_stale_account_invitation(uuid) from public, anon, authenticated;
grant execute on function public.expire_stale_account_invitation(uuid) to service_role;

-- ============================================================
-- 9. sweep_expired_account_invitations (new)
--    Batch expiry: expires every pending invitation whose TTL has lapsed
--    in one statement, and logs one activity_log row per row expired via
--    a single INSERT ... SELECT off the UPDATE's RETURNING clause. Intended
--    to be invoked on a schedule (e.g. via pg_cron or an external cron
--    calling this RPC through the service-role key); this migration adds
--    the function only, not a schedule.
-- ============================================================
create or replace function public.sweep_expired_account_invitations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.account_invitations
    set status = 'expired', updated_at = now()
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning id, canonical_email, intended_role
  )
  insert into public.activity_log (actor_id, action, entity_type, entity_id, detail, metadata)
  select
    null, 'account_invitation_expired', 'account_invitation', id,
    format('Invitation for %s expired (batch sweep)', canonical_email),
    jsonb_build_object(
      'invitation_id', id, 'canonical_email', canonical_email, 'intended_role', intended_role,
      'actor_id', null, 'previous_status', 'pending', 'new_status', 'expired', 'success', true
    )
  from expired;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sweep_expired_account_invitations() from public, anon, authenticated;
grant execute on function public.sweep_expired_account_invitations() to service_role;
