-- 0022_revoke_trigger_function_execute.sql
-- Found during the Item 3 (RPC security) pass of the post-audit hardening
-- work: generate_payroll_event, notify_admins_on_new_issue, and
-- notify_on_new_issue_comment are all AFTER-trigger-only functions (fired
-- automatically by trg_generate_payroll_event / trg_notify_admins_on_new_issue
-- / trg_notify_on_new_issue_comment), never meant to be called directly by
-- any client. Unlike every user-facing RPC in this codebase (which always
-- explicitly revokes anon per the 0009 fix), these three still carried
-- Supabase's default auto-grant of EXECUTE to anon and authenticated,
-- confirmed live via has_function_privilege.
-- Not currently exploitable -- Postgres refuses to run a trigger function
-- outside real trigger context ("trigger functions can only be called as
-- triggers") -- but it's an unnecessary, inconsistent grant. Revoking it has
-- zero functional impact: trigger firing does not depend on the invoking
-- role's EXECUTE privilege on the trigger function, only on the function
-- owner's rights (SECURITY DEFINER). Re-verified live after this change by
-- inserting a real test issue and confirming trg_notify_admins_on_new_issue
-- still fired and wrote a notification row, then cleaned up.
revoke all on function public.generate_payroll_event() from public, anon, authenticated;
revoke all on function public.notify_admins_on_new_issue() from public, anon, authenticated;
revoke all on function public.notify_on_new_issue_comment() from public, anon, authenticated;
