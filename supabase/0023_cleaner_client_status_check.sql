-- 0023_cleaner_client_status_check.sql
-- Onboarding flow build, Stage 1. The original 0001_init_phase1.sql migration
-- text shows `status text not null default 'pending' check (status in
-- ('pending','active','disabled'))` on both cleaners and clients, but a live
-- check against pg_constraint confirmed no CHECK constraint actually exists
-- on either table today -- status is currently unconstrained text with a
-- default of 'active'. Same drift already documented for jobs.status
-- (dropped in 0005_schema_catchup.sql); this one was never recorded anywhere
-- until now.
--
-- The onboarding flow (docs/ONBOARDING-FLOW-SCOPING.md) needs a third
-- intermediate state -- pending_profile_complete -- between an invited
-- user setting their password and an admin activating the account. Rather
-- than just documenting the missing constraint, this re-adds real
-- enforcement at the database layer covering all four states the app
-- actually uses, so a bad value can't be written by any path (RPC, direct
-- table write, or a future bug) regardless of what application code checks.
--
-- Confirmed live before applying: exactly one row in each table, both
-- already 'active', so this is a pure enforcement addition with zero data
-- impact. Verified after applying: an invalid value is correctly rejected
-- (23514 check constraint violation), 'pending_profile_complete' is
-- correctly accepted (tested in a rolled-back transaction, no real data
-- changed), and both real rows are unchanged at 'active'.
alter table public.cleaners
  add constraint cleaners_status_check
  check (status in ('pending','pending_profile_complete','active','disabled'));

alter table public.clients
  add constraint clients_status_check
  check (status in ('pending','pending_profile_complete','active','disabled'));
