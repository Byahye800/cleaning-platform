-- 0024_lifecycle_dimensions.sql
-- Stage 2 (Onboarding & Account Lifecycle), migration 1 of N: schema foundation.
--
-- Context: Stage 1 (0023) added a CHECK constraint on cleaners/clients.status
-- covering ('pending','pending_profile_complete','active','disabled'). That
-- was scoped before the full onboarding/invitation/lifecycle spec existed,
-- and it conflates three genuinely independent concepts into one column --
-- exactly the "don't overload a single status field" anti-pattern the spec
-- rules out (see docs/STAGE-2-ONBOARDING-LIFECYCLE-ASSESSMENT.md, Section 2).
-- This migration supersedes it, not extends it.
--
-- Introduces three independent lifecycle dimensions on cleaners/clients:
--   status            -- Access State only: restricted, active, suspended, disabled
--   invitation_status -- invite_pending, invite_accepted, invite_expired, invite_cancelled
--   onboarding_status -- not_started, in_progress, submitted, approved
--
-- Live state confirmed before writing this: both tables have exactly 1 row
-- each, both status='active' today (created out-of-band, manually, before
-- any invite flow existed). Since 'active' is a valid value in both the old
-- and new CHECK, no data changes for status itself. But invitation_status
-- and onboarding_status need a real backfill for these two pre-existing
-- rows -- defaulting them to invite_pending/not_started (as any brand new
-- row would get) would be factually wrong, since these two people are
-- already fully active. Backfilled to invite_accepted/approved instead,
-- matching the end state the real lifecycle flow would have left them in.
--
-- Also closes the "no duplicate identities" gap flagged in the Stage 2
-- assessment: confirmed live that cleaners.user_id, clients.user_id,
-- user_roles.user_id, cleaners.email, and clients.contact_email had zero
-- unique constraints -- nothing stopped two rows pointing at the same
-- person, or two people sharing an email. Added here. Nullable-safe:
-- Postgres unique constraints permit multiple NULLs, so this doesn't block
-- any row that doesn't have a user_id yet.
--
-- Applied and verified live before this file was committed: both rows show
-- status=active / invitation_status=invite_accepted / onboarding_status=
-- approved; both CHECK constraints confirmed via pg_get_constraintdef; all
-- 5 unique constraints confirmed present via pg_constraint.

-- 1. Supersede Stage 1's status CHECK with the Access-State-only version.
alter table public.cleaners drop constraint cleaners_status_check;
alter table public.cleaners
  add constraint cleaners_status_check
  check (status in ('restricted','active','suspended','disabled'));

alter table public.clients drop constraint clients_status_check;
alter table public.clients
  add constraint clients_status_check
  check (status in ('restricted','active','suspended','disabled'));

-- 2. Add invitation_status (independent dimension).
alter table public.cleaners
  add column invitation_status text not null default 'invite_pending'
  check (invitation_status in ('invite_pending','invite_accepted','invite_expired','invite_cancelled'));

alter table public.clients
  add column invitation_status text not null default 'invite_pending'
  check (invitation_status in ('invite_pending','invite_accepted','invite_expired','invite_cancelled'));

-- 3. Add onboarding_status (independent dimension).
alter table public.cleaners
  add column onboarding_status text not null default 'not_started'
  check (onboarding_status in ('not_started','in_progress','submitted','approved'));

alter table public.clients
  add column onboarding_status text not null default 'not_started'
  check (onboarding_status in ('not_started','in_progress','submitted','approved'));

-- 4. Backfill the two pre-existing, already-active rows to a consistent
--    end state (see comment above). Scoped tightly to status='active' so
--    this can never touch a future row created by the real invite flow.
update public.cleaners set invitation_status = 'invite_accepted', onboarding_status = 'approved' where status = 'active';
update public.clients set invitation_status = 'invite_accepted', onboarding_status = 'approved' where status = 'active';

-- 5. Identity-integrity guardrails: prevent duplicate accounts at the
--    database layer, not just in application code.
alter table public.cleaners add constraint cleaners_user_id_key unique (user_id);
alter table public.clients add constraint clients_user_id_key unique (user_id);
alter table public.user_roles add constraint user_roles_user_id_key unique (user_id);
alter table public.cleaners add constraint cleaners_email_key unique (email);
alter table public.clients add constraint clients_contact_email_key unique (contact_email);
