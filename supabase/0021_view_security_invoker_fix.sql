-- 0021_view_security_invoker_fix.sql
-- CRITICAL SECURITY FIX -- verified live 2026-07-09 as part of the Phase 0-7
-- platform audit. cleaner_own_profile, jobs_cleaner_safe, and jobs_client_safe
-- (added in 0020) were created without security_invoker, so Postgres ran
-- their permission checks as the view OWNER (postgres, which has
-- rolbypassrls = true) instead of the querying user. This meant the
-- underlying cleaners/jobs RLS policies were bypassed entirely for anyone
-- querying these views directly -- confirmed live: a simulated authenticated
-- session for the real cleaner returned another cleaner's job through
-- jobs_cleaner_safe, and every cleaner's profile through cleaner_own_profile.
-- The app's own UI never showed this because it always adds its own .eq()
-- filter client-side, but that filter is not a security boundary.
-- Fix: security_invoker = true makes each view run permission checks (and
-- therefore RLS) as the calling user, so the base tables' existing, correct
-- RLS policies are actually applied. Re-verified live after this change:
-- the same simulated session no longer sees the other cleaner's/client's
-- rows in any of the three views.
alter view public.cleaner_own_profile set (security_invoker = true);
alter view public.jobs_cleaner_safe set (security_invoker = true);
alter view public.jobs_client_safe set (security_invoker = true);
