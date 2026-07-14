# Checkpoint 1 — Pre-Creation Readiness Report

Status: **Read-only. Nothing created. No Supabase project provisioned. No production resource touched.** All evidence below is drawn from a fresh, independent clone of `origin/main` inspected this pass, not from memory.

---

## 1. Current repository HEAD and origin/main

```
HEAD:        5634a442b5c38215b590aa42eb66d155f88a3d5f
origin/main: 5634a442b5c38215b590aa42eb66d155f88a3d5f
```
Identical — confirmed via `git fetch` + `git rev-parse` on a fresh clone.

## 2. Working tree clean

Confirmed: `git status --porcelain` returns zero lines.

## 3. Exact migration-file list

```
0001_init_phase1.sql
0002_admin_role_seed.sql
0003_rls_phase2_policies.sql
0005_schema_catchup.sql
0006_stripe_invoicing.sql
0007_stripe_webhook_dedup.sql
0008_cleaner_job_status_update.sql
0009_revoke_anon_cleaner_rpc.sql
0010_activity_log.sql
0011_cleaner_status_activity_log.sql
0012_cleaner_status_action_names.sql
0013_invoiced_at.sql
0014_sites.sql
0015_shift_status.sql
0016_attendance.sql
0017_attendance_cleaner_select_policy.sql
0018_checklists.sql
0019_issues.sql
0020_payroll_events_and_corrections.sql
0021_view_security_invoker_fix.sql
0022_revoke_trigger_function_execute.sql
0023_cleaner_client_status_check.sql
0024_lifecycle_dimensions.sql
0025_account_invitations_and_guards.sql
0026_account_invitation_functions.sql
0027_account_invitation_lifecycle_completion.sql
```
26 files total.

## 4. Exact migration application order

Strictly numerical, exactly as listed above (`0001` → `0027`, skipping the nonexistent `0004`). No file requires out-of-order application; each is written to apply cleanly against the cumulative state left by everything before it — this is explicitly `0005`'s own stated design ("idempotent migration documenting the live production schema... as ground truth, superseding the stale 0001-0003 files").

## 5. Confirmation that migration 0004 does not exist by design

Confirmed two ways: `ls supabase/0004*` finds nothing, and `git log --all --full-history -- "supabase/0004*"` returns **zero commits, ever** — meaning a `0004` file was never created and later deleted; the number was simply never allocated in this repository's history. The likely explanation (not independently provable from git alone, but consistent with `docs/PROJECT-STATUS.md`'s note that "`0001`/`0003`" were later "marked superseded" and "`0005`... actively cleans up") is that early numbering left a gap during solo development before the migration-history discipline this project now follows was established. Staging must replicate this gap exactly — do not renumber or backfill a `0004` file.

## 6. Expected table list

19 tables, confirmed via `CREATE TABLE` statements across all 26 files (deduplicated — several tables' canonical definition was superseded/restated across multiple migrations, most notably by `0005`):

`account_invitations`, `activity_log`, `attendance`, `attendance_corrections`, `bookings`, `checklist_template_items`, `checklist_templates`, `cleaners`, `clients`, `issue_comments`, `issues`, `job_checklist_items`, `jobs`, `notifications`, `payroll_events`, `recurrence_rules`, `sites`, `stripe_webhook_events`, `user_roles`.

## 7. Expected function list

23 functions, confirmed via `create or replace function` across all migrations (deduplicated — several were redefined in later files, e.g. `accept_account_invitation` across `0026`→`0027`, `cleaner_update_job_status` across three files):

`accept_account_invitation`, `admin_review_attendance_correction`, `cancel_account_invitation`, `cleaner_add_issue_comment`, `cleaner_check_in`, `cleaner_check_out`, `cleaner_report_issue`, `cleaner_request_attendance_correction`, `cleaner_seed_job_checklist`, `cleaner_toggle_checklist_item`, `cleaner_update_job_status`, `enforce_single_role_profile`, `expire_stale_account_invitation`, `finalize_account_invitation`, `generate_payroll_event`, `guard_invitation_status_write`, `mark_account_invitation_failed`, `notify_admins_on_new_issue`, `notify_on_new_issue_comment`, `reconcile_account_invitation`, `reserve_account_invitation`, `resend_account_invitation`, `sweep_expired_account_invitations`.

## 8. Expected function ownership requirements

Every function above defaults to ownership by the role that runs the migrations (`postgres`, when applied via the Supabase SQL editor/dashboard) — **with exactly one documented exception**: `accept_account_invitation(uuid)` must be explicitly reassigned via `alter function public.accept_account_invitation(uuid) owner to service_role;` (present in both `0026` and restated in `0027`). This is not cosmetic — this project's own history (ADR-006) documents a real defect where `SET ROLE`/`SET LOCAL ROLE` is unconditionally forbidden inside any `SECURITY DEFINER` function body in Postgres, which surfaced specifically because of this function's ownership needing to be `service_role`, not `postgres`. Staging must reproduce this exact ownership override, not just the function body — getting this wrong would silently reintroduce a previously-fixed bug in a fresh environment.

## 9. Expected trigger list

7 triggers, confirmed via `create trigger`:

`trg_notify_admins_on_new_issue`, `trg_notify_on_new_issue_comment`, `trg_generate_payroll_event`, `trg_enforce_single_role_profile_cleaners`, `trg_enforce_single_role_profile_clients`, `trg_guard_invitation_status_cleaners`, `trg_guard_invitation_status_clients`.

## 10. Expected RLS-enabled table list

19 tables — every table in the schema (item 6's list) has an explicit `enable row level security` statement; confirmed no table in this schema is left without RLS enabled.

## 11. Expected RLS policy list

**42 policy-creation statements** (43 lines matched a `create policy` grep; one is a comment, not a real statement — confirmed by inspection). 3 `drop policy` statements also exist, meaning 3 early policies (the stale `0003`-era `cleaners_select_own`/`clients_select_own`, which referenced a `user_roles.is_active` column that was later confirmed to never exist live) are explicitly dropped and replaced by `0005`'s corrected versions (`"Cleaners read own row"` / `"Clients read own row"`). Full policy name list, by table:

- `user_roles`: `user_roles_admin_all`, `user_roles_select_own`, `users_read_own_role`
- `clients`: `clients_admin_all`, `clients_select_own`, `Admins full access - clients`, `Clients read own row`
- `cleaners`: `cleaners_admin_all`, `cleaners_select_own`, `Admins full access - cleaners`, `Cleaners read own row`
- `jobs`: `jobs_admin_all`, `Admins full access - jobs`, `Clients read own jobs`, `jobs_select_for_own_client`, `jobs_select_for_own_cleaner`
- `bookings`: `Admins full access - bookings`, `bookings_anon_insert`
- `recurrence_rules`: `recurrence_rules_admin_all`, `recurrence_rules_select_for_own_client_jobs`, `Admins full access - recurrence_rules`, `Clients read own recurrence_rules`
- `activity_log`: `Admins read activity_log`, `Admins insert activity_log`
- `sites`: `Admins full access - sites`, `Clients read own sites`, `Cleaners read sites of their own jobs`
- `attendance`: `Admins full access - attendance`, `Cleaners read own attendance`
- `checklist_templates` / `checklist_template_items`: `Admins full access - checklist_templates`, `Admins full access - checklist_template_items`
- `job_checklist_items`: `Admins full access - job_checklist_items`, `Cleaners read own job checklist items`
- `issues` / `issue_comments`: `Admins full access - issues`, `Cleaners read own job issues`, `Admins full access - issue_comments`, `Cleaners read own job issue comments`
- `notifications`: `Users read own notifications`, `Users update own notifications`
- `payroll_events` / `attendance_corrections`: `Admins full access - payroll_events`, `Admins full access - attendance_corrections`, `Cleaners read own correction requests`

**Critical, security-relevant absence to verify in staging, not just presence:** no `cleaners`/`clients` policy anywhere in this list grants a non-admin UPDATE or INSERT — only SELECT ("read own row"). This absence is itself a load-bearing security property (Stage 2.4's server-side routes depend on the fact that a direct browser write from a non-admin session is blocked outright by RLS, not merely discouraged). Staging verification must confirm this absence is reproduced, not just that the present policies match.

## 12. Expected constraint and index inventory

- **5 confirmed unique constraints** (per `0025`'s own comment, cross-checked against the actual statements): `cleaners_user_id_key`, `clients_user_id_key`, `user_roles_user_id_key`, `cleaners_email_key`, `clients_contact_email_key` — plus `user_id` columns declared `unique` inline in `0025`'s `account_invitations`-adjacent tables, and `attendance_id` unique in the corrections table.
- **17 named indexes** (`create index`/`create unique index` statements), including two functionally-significant unique indexes: `attendance_one_open_per_job_idx` (enforces "at most one open check-in per job") and `job_checklist_items_job_template_item_idx` (prevents duplicate seeded checklist items), plus `account_invitations_pending_email_key`.
- **CHECK constraints**: `jobs_payment_status_check`, `cleaners_status_check` and `clients_status_check` (each redefined once, from the original 2-value vocabulary to the current 4-value `restricted`/`active`/`suspended`/`disabled` set in `0023`).
- **24 foreign-key references** (`references public.*` occurrences) tying the schema together (`jobs.client_id`→`clients`, `jobs.cleaner_id`→`cleaners`, etc.).

## 13. Confirmation that no storage buckets currently require reproduction

Confirmed: zero references to `storage.buckets`, `supabase.storage`, or any bucket-creation SQL anywhere in the 26 migrations or the application source tree. Nothing to reproduce in this category.

## 14. Proposed staging project name

`Cleaning Platform - Staging` — matches your approved architecture message exactly, and is deliberately unambiguous relative to the existing project's misleading `Cleaning Platform - Dev` name.

## 15. Proposed region

**Confirmed directly on the dashboard (Settings → General): the existing production project's region is `eu-central-1` (Central EU, Frankfurt).** Proposed: create the staging project in the same region, so latency characteristics match production's and any timing-sensitive test (TTL/expiry behavior in particular — test-plan item 12) isn't confounded by cross-region latency differences. This is a recommendation, not yet an irreversible choice — flag now if you'd prefer a different region.

## 16. Proposed staging APP_URL strategy

Given the approved architecture names Vercel as the staging host: the APP_URL will be whatever URL Vercel assigns the new project (typically `https://<project-name>-<hash>.vercel.app` by default, or a custom subdomain if you later want one, e.g. `staging.<future-domain>`, once a real domain exists — not applicable yet since production itself has no domain today). This value won't be known precisely until Checkpoint 6 actually creates the Vercel project; Checkpoint 4 (staging Auth config) will need to either wait for that URL or use a placeholder updated once the real one is known. I'll sequence this explicitly at the relevant checkpoint rather than guess a URL now.

## 17. Proposed test-account naming convention

Proposed: every synthetic identity created for Stage 2.5 uses a clearly-labeled pattern such as `stage25-cleaner-01@<your-chosen-test-domain-or-alias>` / `stage25-client-01@...`, with a sequential number per role so multiple concurrent-tab/duplicate-submission tests (test-plan items 15–16) don't collide. **Needs your confirmation of the actual domain/alias** to use — I have not chosen one for you, since it depends on what inbox you're able to monitor for real email-delivery tests (item 12 from the original preflight report, still open).

## 18. Proposed secret-storage locations

- **Staging Supabase credentials** (anon key, service-role key, DB password): stored only in Vercel's project environment-variable settings (Checkpoint 6) — never committed to git, never pasted into chat, never written to any file in this repo or the outputs folder.
- **Staging SMTP/Resend credentials** (Checkpoint 5): stored only in Supabase's own SMTP settings for the staging project — same non-exposure rule.
- **This session's own record-keeping**: checkpoint reports will reference *that* a credential was configured and *where*, never the credential value itself — matching the redaction requirement you've stated explicitly for Checkpoints 5 and 6.

## 19. Proposed rollback procedure

At this stage (nothing yet created), "rollback" is trivial — there is nothing to undo. Once Checkpoint 2 creates the staging project, rollback at any subsequent checkpoint is simply: delete the staging Supabase project and/or the staging Vercel project. Neither action has any path back to production — they're structurally independent resources by design (Section 2 of the approved plan). No production rollback procedure is needed at any point in this staging-setup work, because production is never touched.

## 20. Confirmation that no production resource will be touched

Confirmed as a standing commitment for every checkpoint in this sequence: the existing Supabase project (`wqdyshgoxtkbreijbbha`) will not be renamed, reconfigured, have its Auth/redirect/SMTP settings changed, or receive any new data as part of this staging-setup work. Nothing in Checkpoints 2–7 requires touching it, and I will not do so.

---

## Actions that require you to complete manually in the Supabase or Vercel interface

Being upfront about the limits of what I can do directly, even with browser access to your already-authenticated dashboard session:

- **Project creation billing/ownership confirmation** — if Supabase or Vercel ever prompts for a payment method, plan selection requiring your explicit choice, or any step resembling account-level configuration rather than project-level configuration, I'll stop and hand that specific click to you rather than proceeding on your behalf.
- **Domain configuration**, if you later want a custom staging subdomain rather than the default Vercel-assigned URL — DNS changes are explicitly on your permanent safety-boundary "do not" list for this work anyway.
- **Resend account setup** (Checkpoint 5), if you don't already have a Resend account — creating a new third-party account is the kind of action I'd flag for your direct involvement rather than doing silently on your behalf, consistent with how account creation is handled throughout this engagement.
- **Any password/credential entry** — I will never type a password into any login form on your behalf, for Supabase, Vercel, Resend, or anywhere else. Where dashboard actions require an already-authenticated session (as the current Supabase session already is in this connected browser), I can proceed; where they require fresh authentication, that's yours to do.

Everything else described in Checkpoints 2–8 — project creation clicks, migration application via the SQL editor, configuration toggles, Vercel project setup, environment variable entry (values supplied by you or generated fresh, never displayed in chat) — I can perform directly once each checkpoint is individually approved.

---

**No staging project has been created. Awaiting your approval to proceed to Checkpoint 2.**
