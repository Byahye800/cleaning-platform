# KNOWN-ISSUES-REGISTER.md

> **Governance:** All engineering work, checkpoints, approvals, and completion criteria on this project are governed by [`docs/ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md). Read it before beginning any work on this project.

**Purpose:** track known defects and open risks across the project that are not yet fixed, with enough detail that anyone picking this up cold can understand the issue without re-deriving it. Do not delete resolved issues — mark them Resolved with a date and pointer to the fix, keep them in this file for history.

---

## STAGING-001

**Title:** Historical Migration Replay Defect

**Description:** Running the repository's migration files in their full literal historical order — `0001`, `0002`, `0003`, then `0005` (there is no `0004`; confirmed via full git history) — against a clean, empty database fails partway through `0005`. The failure is deterministic and reproducible.

**Root Cause:** Migration `0003` (marked "SUPERSEDED — kept for historical record only, do not run in isolation" in its own header, but not excluded from a literal full-history replay) creates a policy, `recurrence_rules_select_for_own_client_jobs`, on `public.recurrence_rules`, whose `USING` expression references `jobs.recurrence_rule_id`. Migration `0005_schema_catchup.sql` — despite documenting itself as safe to run on a fresh database — attempts `alter table public.jobs drop column if exists recurrence_rule_id;` without first dropping that dependent 0003-era policy. Postgres correctly refuses with error `2BP01` ("cannot drop column ... because other objects depend on it").

**Affected Area:** Recovery / historical replay / disaster-recovery bootstrap of any fresh environment (new staging project, new production project in the event of full loss, any from-scratch database recreation).

**Production Impact:** None observed. Production was never bootstrapped via this literal replay path — it accumulated its current schema through incremental live application of migrations over time, not a fresh replay. This defect was only ever discovered because a fresh staging project's bootstrap attempt hit it directly.

**Staging Impact:** None after remediation. Staging was reset and successfully re-bootstrapped using the documented authoritative fresh-bootstrap path (`0005` through `0027`, explicitly skipping `0001`–`0003`), which is unaffected by this defect since it never runs `0003` at all. See `STAGING-CHECKPOINT-HISTORY.md`, "CHECKPOINT 3 REMEDIATION."

**Status:** Open

**Priority:** Medium — not currently blocking any approved work (the fresh-bootstrap path around it is proven and in active use for staging), but it means **the repository cannot currently be used to recreate an environment from a truly clean database via its full literal migration history**. This is a real disaster-recovery gap: if production were ever lost entirely and someone reached for "just replay all the migrations in order," it would fail at the same point staging did.

**Resolution:** Not yet approved. Two candidate directions were identified during the original Checkpoint 3 failure analysis (documented in `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md`) but neither has been decided on or executed:
1. Edit `0005` to drop the dependent `0003`-era policy before dropping `jobs.recurrence_rule_id` (repairs the literal replay path itself).
2. Formally document `0005` as the actual bootstrap starting point for any fresh environment (i.e., codify what the Checkpoint 3 Remediation already did in practice) and mark `0001`–`0003` as excluded-from-replay rather than merely "superseded," e.g. by moving them to an `archive/` subfolder or renaming them out of the numeric sequence.

No migration file was edited as part of the Checkpoint 3 Remediation — per explicit instruction, that remediation intentionally worked around this defect rather than fixing it, to keep the fix decision separate and deliberate.

---

## STAGING-002

**Title:** Inconsistent EXECUTE grants on BEFORE-trigger-only functions

**Description:** Two BEFORE-trigger functions introduced in migration `0025` — `enforce_single_role_profile` and `guard_invitation_status_write` — retain Supabase's default `anon`/`authenticated` EXECUTE auto-grant. This is inconsistent with the pattern migration `0022` established for three *other* (AFTER-)trigger-only functions (`generate_payroll_event`, `notify_admins_on_new_issue`, `notify_on_new_issue_comment`), which explicitly revoke those same default grants.

**Root Cause:** `0025`'s migration file, as written, contains no explicit `revoke` statements for these two functions — this is not something introduced by any session's execution, it is exactly what the committed migration file produces when applied as-is.

**Affected Area:** Function privilege hygiene / least-privilege consistency across the schema.

**Production Impact:** None observed — production has not had this specific gap assessed directly, but the same migration file (`0025`) is presumably applied there too if account-invitation functionality is live in production.

**Staging Impact:** Confirmed present in staging as of the Checkpoint 3 Remediation verification (Section 11 of `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md`). Not currently exploitable: Postgres unconditionally refuses to invoke any trigger function outside real trigger-firing context ("trigger functions can only be called as triggers"), regardless of the calling role's EXECUTE privilege — so this is a hygiene gap, not a live vulnerability.

**Status:** RESOLVED (2026-07-14)

**Priority:** Low — cosmetic/consistency issue, was never exploitable given Postgres's own protection (trigger functions cannot be invoked directly regardless of EXECUTE grant).

**Resolution:** Resolved via migration `0028_resolve_staging_002_trigger_function_execute_grants.sql`, applied to staging only (`jwdfzgibrijcyypibhjw`) on 2026-07-14. The migration revokes EXECUTE on both functions from `public`, `anon`, and `authenticated`, matching `0022`'s exact pattern — `service_role` and the function owner (`postgres`) retain EXECUTE, unchanged.

**Pre-change evidence (live staging, 2026-07-14):** both functions confirmed to exist, both `returns trigger`, both `language plpgsql`, owner `postgres` for both, `enforce_single_role_profile` is `SECURITY DEFINER` / `guard_invitation_status_write` is not, both bound to 4 BEFORE triggers total across `cleaners`/`clients` (`trg_enforce_single_role_profile_cleaners`, `trg_enforce_single_role_profile_clients`, `trg_guard_invitation_status_cleaners`, `trg_guard_invitation_status_clients`), all enabled. Pre-change ACL showed explicit (not just PUBLIC-inherited) grants to `anon`, `authenticated`, `service_role`, and the owner. A full repository search confirmed neither function is ever called directly by application code or as an RPC — trigger-only, confirmed.

**Post-change evidence (live staging, 2026-07-14):** `EXECUTE` confirmed revoked from `public`/`anon`/`authenticated` (`has_function_privilege` false for all three); `service_role` and `postgres` retain `EXECUTE`, unchanged. Function definition `md5` hashes confirmed byte-identical pre- and post-change (`enforce_single_role_profile`: `008ecfcc8d6f0c35a0dd32f5652994c8`; `guard_invitation_status_write`: `5934231883415cfff39b4fdeefb49680`) — function bodies untouched. Owners, return types, language, security mode, and all 4 trigger bindings/enabled-states confirmed unchanged. A spot-check of two unrelated functions (`accept_account_invitation`, `generate_payroll_event`) confirmed no unrelated privilege changed. `information_schema.tables` count for `public` schema unchanged at 23 (19 tables + 4 views) — no schema/table/policy/RLS drift. `jobs.recurrence_rule_id` confirmed still absent — STAGING-001 area unaffected.

**Functional/trigger-path verification:** a transaction-wrapped test (`BEGIN` ... `ROLLBACK`) proved both triggers still fire correctly post-change: (1) inserting a `cleaners` row with no matching `user_roles` entry still raised `enforce_single_role_profile`'s expected exception ("no user_roles entry for user_id ..., cannot create profile"); (2) inserting a valid `user_roles` + `cleaners` pair still succeeded (happy path intact); (3) directly updating `invitation_status` as the `postgres` role (not `service_role`) still raised `guard_invitation_status_write`'s expected exception. All three assertions passed; the transaction was rolled back afterward — zero rows added to `cleaners`/`user_roles`, confirmed by direct count (0/0) after rollback. Direct invocation of either function via `select public.enforce_single_role_profile();` was independently confirmed to fail with Postgres error `0A000` ("trigger functions can only be called as triggers"), as expected regardless of grant state.

**Production:** not touched. This migration was applied to staging (`jwdfzgibrijcyypibhjw`) only.

**STAGING-001:** unaffected, remains Open (see above) — this resolution did not touch it.

---

## STAGING-003

**Title:** `job_billing`/`cleaner_pay_rates` schema drift — tables existed live but were never captured in a migration file

**Description:** `public.job_billing`, `public.cleaner_pay_rates`, and their shared trigger function `public.set_updated_at()` existed live in production (created during the earlier Stage 5 "deep fix" column-split hardening) but no migration file in this repository ever created them. Because staging is bootstrapped purely from committed migration files, staging never had these tables — surfacing as a "Could not find the table 'public.job_billing' in the schema cache" error on the admin dashboard.

**Root Cause:** the original column-split migration was applied directly against production during Stage 5 and was never subsequently written back into a repository migration file — a documentation/capture gap, not a schema design defect.

**Affected Area:** repository/migration completeness; any fresh environment bootstrap (staging, or a hypothetical fresh production rebuild) that relies solely on committed migration files.

**Production Impact:** None — production already has these objects; this only affected environments bootstrapped from the repository's migrations.

**Staging Impact:** Confirmed present — first observed as a "schema cache" error during the 2026-07-15 staging admin bootstrap login test (see `STAGING-CHECKPOINT-HISTORY.md`).

**Status:** RESOLVED (2026-07-18)

**Priority:** Medium — not a security issue, but a real repository-completeness gap affecting disaster-recovery/fresh-bootstrap confidence, same category as `STAGING-001`.

**Resolution:** Resolved via migration `0029_job_billing_and_cleaner_pay_rates_schema.sql`, applied to staging (`jwdfzgibrijcyypibhjw`) on 2026-07-18. The migration captures `set_updated_at()`, `job_billing`, and `cleaner_pay_rates` using `create table if not exists`/`create or replace function`, with a fail-fast structural validation that aborts the transaction if an existing table's structure doesn't match expectations, run before any policy or trigger is touched. It also revokes the default `PUBLIC`/`anon`/`authenticated` EXECUTE grant on `set_updated_at()`, matching the `0022`/`0028` precedent. Verified via a five-pass review (original verification, supplementary verification, migration design review, adversarial review, final pre-write hardening review) plus a live structural, security, functional, and idempotency test battery on staging (60 individual checks across schema, RLS, triggers, and app/build verification). Not applied to production as part of this change — production already has these objects; applying there would require separate explicit approval.


---

## ONBOARDING-001

**Title:** Onboarding profile-save route selected role-mismatched columns

**Description:** The onboarding "Finish" step (`POST /api/onboarding/profile`) unconditionally selected `status, invitation_status, onboarding_status, phone, emergency_contact, address, contact_phone` from whichever table (`cleaners` or `clients`) matched the authenticated user's role, regardless of which columns that table actually has. `cleaners` only has `phone`/`emergency_contact`; `clients` only has `address`/`contact_phone` — this split has held since `0005_schema_catchup.sql` and was never violated by any later migration. PostgREST correctly rejected the query with `42703 undefined_column`, surfacing to the user as "Something went wrong saving your details. Please try again."
**Root Cause:** an isolated inconsistency against the file's own sibling route — `/api/auth/invitation/status` already used a role-scoped `currentRowSelect` ternary; `/api/onboarding/profile` did not.

**Affected Area:** cleaner and client account onboarding, specifically the final "Finish" (`complete_onboarding`) step, reached only after password-set and profile-details entry.

**Production Impact:** Not assessed as part of this fix — this route exists identically in production's codebase (same repository, same file), so the same defect would reproduce there if a real onboarding flow were exercised; production has not had this specific path re-tested as part of this fix.

**Staging Impact:** Confirmed present — first (and only) real end-to-end onboarding attempt on staging, using the preserved invitation `1d279bf1-aa8f-4c2f-b0c9-661255d8b5a0`, failed at this exact point on 2026-07-20.

**Status:** RESOLVED (2026-07-20)

**Priority:** High while open — this blocked the entire onboarding flow end-to-end for every cleaner and client account; no workaround existed short of a code fix.

**Resolution:** `src/app/api/onboarding/profile/route.ts` now builds a `currentRowSelect` string based on `role` (mirroring `/api/auth/invitation/status`'s existing pattern) before querying — single file, 12 insertions/2 deletions, no schema/RPC/auth/invitation-lifecycle change. Verified via a full Production Engineering Confirmation Cycle (compile/lint/build, a direct live query against the preserved failed record proving the corrected query succeeds, security/regression review) before delivery. Delivered as commit `85e51fa` on `main` via GitHub's web editor after a sandbox git-push-credential failure (see `docs/SESSION-LOG.md`, 2026-07-20 entry, for the full delivery story and the known local/remote whitespace-only divergence between local commit `4e6d906` and `85e51fa`).

**Production:** not touched. This fix was committed to `main` (the single branch used for both production and staging deployments in this repository) but has not been separately deployed/verified against the production Supabase project or production traffic as part of this fix.

**STAGING-001:** unaffected, remains Open (see above).


**Production:** not touched. This migration was applied to staging only.

**STAGING-001:** unaffected, remains Open (see above).
