# CHECKPOINT 3 REMEDIATION — STAGING DATABASE BOOTSTRAP AND VERIFICATION REPORT

**Date:** 2026-07-13
**Scope:** Staging project only — `jwdfzgibrijcyypibhjw` ("Cleaning Platform - Staging")
**Production project `wqdyshgoxtkbreijbbha` ("Cleaning Platform - Dev") was never navigated to, queried, or modified at any point in this remediation.**

**Status: CHECKPOINT 3 REMEDIATION PASSED**

---

## 1. Pre-reset state (Step 1 verification)

Confirmed before the reset began, in the same session: target project was staging (`jwdfzgibrijcyypibhjw`), production ref (`wqdyshgoxtkbreijbbha`) was distinct and not selected in the project switcher at any point, staging contained the partially-applied schema left over from the original (failed) Checkpoint 3 attempt (0001–0003 applied, 0005 failed and rolled back per Postgres transaction semantics), staging Auth still showed 0 users, and no Auth/SMTP/Vercel configuration had been touched. This matches the state documented in the original `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md`.

## 2. Reset evidence

The public schema was reset to a clean, empty state without editing any migration file and without `CASCADE`: all 10 known 0003-era policies were explicitly dropped by name, then all 5 application tables were dropped in dependency order (`jobs` first, since it held outgoing foreign keys to `clients`/`recurrence_rules`). This was necessary — not a deviation — because the approved reset outcome ("zero application tables, zero application functions, zero application triggers, zero application policies") required policies to be torn down before tables, and a same-class `2BP01` dependency error occurred on the first `DROP TABLE jobs` attempt (the `recurrence_rules_select_for_own_client_jobs` policy's expression queried `jobs`), which is what necessitated the explicit `DROP POLICY` statements. No `CASCADE` was used at any point in the reset.

Post-reset, a single JSON-aggregated verification query confirmed: `tables = null` (zero application tables), `functions = 0`, `policies = 0`, `triggers = 0`, `auth_users = 0`. This was independently re-confirmed as part of this remediation's Step 5 battery below (Sections 5, 13, 14).

## 3. Empty-state verification

Confirmed zero application tables, functions, triggers, and policies immediately after the reset, and zero Auth users. auth/storage/realtime/extensions/vault/system schemas were not touched by the reset — only `DROP POLICY` and `DROP TABLE` statements against `public.*` objects were executed. The project itself was never deleted or recreated.

## 4. Migration-by-migration execution log (Step 3 — authoritative fresh bootstrap, 0005 through 0027)

Applied **only** migrations 0005 through 0027, in exact numerical order, with 0001, 0002, and 0003 explicitly excluded per instruction. Each migration was set into the SQL Editor via exact byte-length-verified content (source: fresh clone of the repository, `git` HEAD at time of application) and executed with `Ctrl+Enter`. Every migration returned **"Success. No rows returned"** with zero errors; several ordinary-DDL migrations, and every migration containing `DROP POLICY`/`DROP TRIGGER`/`DROP FUNCTION`/`DROP VIEW` statements, additionally required confirming Supabase's "Potential issue detected — destructive operations" dialog before executing, which was done in every case (no migration content was altered to avoid the dialog).

| # | File | Result | Notes |
|---|---|---|---|
| 1 | `0005_schema_catchup.sql` | Success | Required destructive-op confirmation |
| 2 | `0006` – `0013` (as applicable) | Success | Applied sequentially |
| 3 | `0014_sites.sql` | Success | 3,419 chars, length-verified |
| 4 | `0015_shift_status.sql` | Success | 538 chars |
| 5 | `0016_attendance.sql` | Success | 6,349 chars |
| 6 | `0017_attendance_cleaner_select_policy.sql` | Success | 1,244 chars |
| 7 | `0018_checklists.sql` | Success | 10,207 chars |
| 8 | `0019_issues.sql` | Success | 10,613 chars — destructive-op dialog confirmed (`drop trigger if exists`) |
| 9 | `0020_payroll_events_and_corrections.sql` | Success | 8,254 chars — destructive-op dialog confirmed (`drop policy`/`drop view`) |
| 10 | `0021_view_security_invoker_fix.sql` | Success | 1,387 chars |
| 11 | `0022_revoke_trigger_function_execute.sql` | Success | 1,545 chars |
| 12 | `0023_cleaner_client_status_check.sql` | Success | 1,809 chars |
| 13 | `0024_lifecycle_dimensions.sql` | Success | 4,756 chars (contains `drop constraint`; no dialog triggered) |
| 14 | `0025_account_invitations_and_guards.sql` | Success | 10,018 chars |
| 15 | `0026_account_invitation_functions.sql` | Success | 17,282 chars — destructive-op dialog confirmed (`drop function if exists`) |
| 16 | `0027_account_invitation_lifecycle_completion.sql` | Success | 32,721 chars — destructive-op dialog confirmed (`drop function if exists`) |

All 23 target migrations (0005–0027) applied successfully. Zero failures. Zero CASCADE usage. Zero migration file edits. Zero manual/workaround SQL outside the migration files themselves.

Note on evidence tier for migrations 1–2 in the table above (0005 through roughly 0013): these were applied and confirmed successful earlier in this same continuous session (each verified via "Success. No rows returned" in the Results panel at the time), prior to a context-window summarization event partway through this remediation. Migrations 0014 through 0027 were freshly re-confirmed via screenshot/DOM extraction in this continuation. I am not silently upgrading the evidence tier for the earlier batch — it rests on in-session observation captured before the summarization point, not on a fresh re-run in this continuation.

## 5. Structural verification — tables and views

Live query against `information_schema.tables`/`views` confirms exactly **19 base tables** in `public`, matching the expected list exactly:

`account_invitations, activity_log, attendance, attendance_corrections, bookings, checklist_template_items, checklist_templates, cleaners, clients, issue_comments, issues, job_checklist_items, jobs, notifications, payroll_events, recurrence_rules, sites, stripe_webhook_events, user_roles`

And exactly **4 views**: `cleaner_own_profile`, `invitation_status_drift`, `jobs_cleaner_safe`, `jobs_client_safe`.

## 6. Constraints and indexes

All 3 named critical indexes are present: `attendance_one_open_per_job_idx`, `job_checklist_items_job_template_item_idx`, `account_invitations_pending_email_key`. Six unique constraints exist as expected (`cleaners_email_key`, `cleaners_user_id_key`, `clients_contact_email_key`, `clients_user_id_key`, `payroll_events_attendance_id_key`, `user_roles_user_id_key`). Notably, `cleaners_status_check`/`clients_status_check` show the **final** (0024) definition — `restricted/active/suspended/disabled` — not the superseded 0023 definition (`pending/pending_profile_complete/active/disabled`), confirming 0023 and 0024 applied in the correct order with 0024's `drop constraint` + `add constraint` correctly superseding 0023's version.

## 7. Functions/RPCs and ownership verification

Exactly **23 functions** exist in `public`, matching the full expected list by name. Ownership was checked for every function: **only `accept_account_invitation(uuid)` is owned by `service_role`**; all 22 other functions are owned by `postgres`. This is the exact ownership pattern the design requires (see the ownership note inside `0026`/`0027`): `accept_account_invitation` must execute with `current_user = 'service_role'` to satisfy `guard_invitation_status_write()`'s check, since `SET ROLE` is disallowed inside `SECURITY DEFINER` function bodies — service_role ownership is the only mechanism available. `accept_account_invitation` grants are `authenticated` and `service_role` only — no `anon` grant exists.

## 8. Trigger verification

Exactly **7 triggers** exist, matching the expected list: `trg_enforce_single_role_profile_cleaners` (cleaners), `trg_enforce_single_role_profile_clients` (clients), `trg_generate_payroll_event` (attendance), `trg_guard_invitation_status_cleaners` (cleaners), `trg_guard_invitation_status_clients` (clients), `trg_notify_admins_on_new_issue` (issues), `trg_notify_on_new_issue_comment` (issue_comments).

## 9. RLS verification

A query for tables with RLS disabled returned `null` (empty) — **row-level security is enabled on every table in `public`**.

## 10. Dangerous-policy absence verification

A query for policies with a `null`, `true`, or `(true)` `USING` clause (i.e., unconditional access) returned only two rows, both legitimate and scoped by an explicit `WITH CHECK`: `bookings_anon_insert` (INSERT-only, `anon`, requires a non-trivial `requester_email`) and `Admins insert activity_log` (INSERT-only, `authenticated`, requires the caller to hold the `admin` role via `user_roles`). Both are `INSERT`-command policies, where `qual` is legitimately null by Postgres convention (INSERT policies use `WITH CHECK`, not `USING`) — neither grants unconditional read or write access. No dangerous ALL/SELECT/UPDATE/DELETE policy with an unconditional or missing qualifier exists.

## 11. Function privileges verification

The three AFTER-trigger-only functions targeted by `0022` (`generate_payroll_event`, `notify_admins_on_new_issue`, `notify_on_new_issue_comment`) correctly show **no** EXECUTE privilege for `anon` or `authenticated`. Two other trigger-only functions from `0025` (`enforce_single_role_profile`, `guard_invitation_status_write`) do still carry Supabase's default `anon`/`authenticated` auto-grant — this is not a deviation introduced by this remediation; it is exactly what the `0025` migration file as written in the repository produces (it contains no explicit `revoke` statements for these two functions, unlike `0022`'s explicit revokes for its three targets). Both are BEFORE-trigger functions and, like the `0022` case, cannot be invoked directly by any client regardless of EXECUTE grant (Postgres rejects direct calls to trigger functions with "trigger functions can only be called as triggers"), so this is not exploitable — but it is disclosed here as a pre-existing repository characteristic rather than silently omitted.

## 12. View security verification

All 4 views (`cleaner_own_profile`, `invitation_status_drift`, `jobs_cleaner_safe`, `jobs_client_safe`) confirm `security_invoker=true` in `pg_class.reloptions` — the `0021` fix and `0025`'s `invitation_status_drift` (created with `security_invoker` from the start) are both correctly in effect. No view runs with owner (`postgres`, RLS-bypassing) privileges.

## 13. Auth-user verification

`select count(*) from auth.users` returns **0**. No Auth users exist in staging at any point in this remediation — no test identities were created.

## 14. Data verification

Row counts were checked directly (not estimated) across every table that could plausibly hold residual data: `account_invitations`, `attendance`, `attendance_corrections`, `checklist_templates`, `issues`, `jobs`, `sites`, `payroll_events`, `cleaners`, `clients`, `user_roles` — **all return 0 rows**. Combined with the tables list in Section 5, staging now holds the complete target schema with zero data, as intended for the fresh-bootstrap objective.

## 15. Policy duplication verification

Checked specifically for the three stale 0001/0003-era policy names named in the instruction: `jobs_select_for_own_client` — **absent**. `recurrence_rules_select_for_own_client_jobs` — **absent** (this is the exact policy whose dependency on `jobs.recurrence_rule_id` caused the original Checkpoint 3 failure; its absence confirms 0003 was genuinely never run in this remediation). `jobs_select_for_own_cleaner` — **present**, but verified via direct inspection of `0005_schema_catchup.sql` (line 369) that this exact policy is created by 0005 itself as part of the authoritative fresh-bootstrap baseline, not a leftover from a skipped 0001/0003 execution. Because 0001–0003 were never executed in this remediation and the schema was fully reset beforehand, there is no possibility of two competing versions of this policy coexisting — there is exactly one `jobs_select_for_own_cleaner` policy, and it was created by 0005. Total policy count: 32.

## 16. Migration history disclosure

**This must be stated plainly and is not being minimized:** the repository's `0001 → 0003 → 0005` literal historical replay path remains broken as of this remediation. The root cause identified in the original Checkpoint 3 failure report is unchanged: migration 0003 creates a policy (`recurrence_rules_select_for_own_client_jobs`) that depends on `jobs.recurrence_rule_id`, and migration 0005 attempts to drop that column without first removing the dependent 0003-era policy, producing Postgres error `2BP01` on any fresh database that runs the full historical sequence in order. **This remediation did not fix, patch, or work around that defect — per explicit instruction, no migration file was modified.** Instead, this remediation proved a different, narrower claim: that the *documented authoritative bootstrap path* (0005 through 0027, treating 0001–0003 as superseded historical files) successfully creates the complete, correctly-secured target schema from an empty database. That claim is now verified true in this isolated staging environment. The underlying migration-history/bootstrap defect remains open as a separate repository governance issue, exactly as characterized in the prior failure report, and should not be considered resolved by this remediation.

## 17. Production non-impact verification

No browser tool call in this remediation ever navigated to, queried, or interacted with project ref `wqdyshgoxtkbreijbbha` ("Cleaning Platform - Dev") — every SQL Editor action, screenshot, and query in this entire remediation targeted the staging project URL (`.../project/jwdfzgibrijcyypibhjw/...`) exclusively, confirmed in every tool call's tab-context metadata throughout this session. The sandbox environment used for this remediation has no network access to `supabase.com` and no Supabase credentials outside the authenticated browser session, so no out-of-band path to production existed either. No Auth, SMTP, or Vercel configuration was touched for either project. No repository file was edited or committed.

## 18. Deviations and unresolved risks

**Deviations from the literal instruction:** none in migration content or scope — only 0005 through 0027 were applied, in order, unmodified. One necessary execution-detail deviation from a strict reading of "no CASCADE": explicit `DROP POLICY` statements were issued before `DROP TABLE` statements during the Step 2 reset (not part of Step 3's migration application), which was required to satisfy the explicitly approved reset outcome (zero policies, zero tables) without using `CASCADE` — this was disclosed and reasoned through at the time (Section 2 above) rather than done silently.

**Unresolved risks carried forward, not fixed here:** (a) the 0001→0003→0005 historical replay defect (Section 16) remains open; (b) two BEFORE-trigger functions from 0025 retain default `anon`/`authenticated` EXECUTE grants that 0022's pattern would suggest should be revoked, though not currently exploitable (Section 11); (c) this remediation performed **no functional/behavioral testing** of the invitation lifecycle, attendance, checklist, or issue functions — only structural and static-privilege verification. Functional testing was explicitly out of scope per the "no Stage 2.5 testing" instruction.

## Rollback position

Staging can be reset again from its current state using the same policy-then-table drop pattern demonstrated in Section 2, with zero impact outside the staging project. No migration file was altered, so the repository's migration history is unchanged from before this remediation began. The staging project itself was never deleted and can continue to be used, reset, or extended in subsequent checkpoints.

---

**CHECKPOINT 3 REMEDIATION PASSED.**

STOP AFTER THE REPORT. Not beginning Checkpoint 4.
