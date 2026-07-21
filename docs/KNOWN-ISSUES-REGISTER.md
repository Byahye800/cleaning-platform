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

**Status:** Code fix RESOLVED (2026-07-20) — deployed to `main`/staging. **End-to-end verification PENDING.** Do not treat this issue, or the cleaner onboarding flow, as certified, locked, or fully resolved until Checkpoint 1 (live browser onboarding walkthrough + post-Finish database/lifecycle state + cleaner portal access-isolation checks) passes in full — see `docs/SESSION-LOG.md`, 2026-07-20 entry, for live status.

**Priority:** High while open — this blocked the entire onboarding flow end-to-end for every cleaner and client account; no workaround existed short of a code fix. Remains High/open in spirit until Checkpoint 1's live verification passes — the code fix alone does not close this out.

**Resolution:** `src/app/api/onboarding/profile/route.ts` now builds a `currentRowSelect` string based on `role` (mirroring `/api/auth/invitation/status`'s existing pattern) before querying — single file, 12 insertions/2 deletions, no schema/RPC/auth/invitation-lifecycle change. Verified via a full Production Engineering Confirmation Cycle (compile/lint/build, a direct live query against the preserved failed record proving the corrected query succeeds, security/regression review) before delivery. Delivered as commit `85e51fa` on `main` via GitHub's web editor after a sandbox git-push-credential failure (see `docs/SESSION-LOG.md`, 2026-07-20 entry, for the full delivery story and the known local/remote whitespace-only divergence between local commit `4e6d906` and `85e51fa`).

**Production:** not touched. This fix was committed to `main` (the single branch used for both production and staging deployments in this repository) but has not been separately deployed/verified against the production Supabase project or production traffic as part of this fix.

**STAGING-001:** unaffected, remains Open (see above).


**Production:** not touched. This migration was applied to staging only.

**STAGING-001:** unaffected, remains Open (see above).


---

## ADMIN-CLEANERS-001

**Title:** Admin create/edit-cleaner write path removed and never rebuilt behind the Route Handler architecture

**Description:** The admin Cleaners page (`/admin/cleaners`) had lost its ability to create or edit cleaner records. The prior direct-`supabase.from('cleaners')` write path had been removed as part of an earlier security hardening pass but was never replaced with an equivalent path through server-side Route Handlers, leaving admins unable to onboard or update cleaner records through the UI at all.

**Root Cause:** An incomplete migration away from direct browser-side Supabase writes: the read path (`select()`) and the RLS/column-split security model were updated, but the corresponding write RPCs and their Route Handler wrappers were never built, so the UI's Save action had nothing to call.

**Affected Area:** `/admin/cleaners` (create + edit), `src/app/api/admin/cleaners/route.ts`, `src/app/api/admin/cleaners/[id]/route.ts`, `admin_create_cleaner`/`admin_update_cleaner` RPCs.

**Production Impact:** Not assessed as part of this fix — this defect exists identically in production's codebase; production has not been re-tested as part of this remediation.

**Staging Impact:** Confirmed present and now confirmed fixed, live on `https://cleaning-platform-staging.vercel.app`.

**Status:** RESOLVED — **LOCKED (2026-07-21)**, per `docs/ENGINEERING-PROTOCOL.md`.

**Priority:** High while open — blocked all cleaner onboarding/record-maintenance through the admin UI, no workaround short of direct DB access.

**Resolution:** New `admin_create_cleaner`/`admin_update_cleaner` Postgres functions (re-check `auth.uid()` + admin role internally, validate required fields/hourly_rate/dbs_status, write `activity_log` rows, documented in `supabase/0031_admin_cleaner_write_rpcs.sql`, commit `3d67841`) called exclusively from two new Route Handlers — `src/app/api/admin/cleaners/route.ts` (POST, commit `ddcc813`) and `src/app/api/admin/cleaners/[id]/route.ts` (PATCH, commit `89c1571`). `src/app/admin/cleaners/page.tsx` refactored to call these routes instead of any direct Supabase write, with client-side pre-validation and per-field error banners (commit `c3ed0bd`). Delete functionality was intentionally not restored — out of scope for this fix, deferred by explicit decision.

**Verification:** Full live E2E cycle performed against deployed staging (not static/code-only): Create and Edit both confirmed via the actual UI, HTTP status codes captured via the browser network log (201 create, 200 edit, 401 unauthenticated create/edit, 409 duplicate email), and database state independently confirmed via direct SQL against `cleaners`/`cleaner_pay_rates` on staging (`jwdfzgibrijcyypibhjw`). Confirmed zero direct browser-side Supabase writes remain (`page.tsx`'s only Supabase call is a read-only `select()` in `load()`). Regression-checked via commit diff (only the 3 files above touched) plus live spot-checks of the cleaner activation page, the invitation-lifecycle activity log, and `/admin/payroll` (`PAYROLL-TRIGGER-001` untouched). One disclosed, accepted limitation: the non-admin-authenticated-session denial case rests on a code read of `requireAdmin()` plus a live DB role query, not a full live session test, since no non-admin test credentials were available and generating one would have required sending a real email — declined without explicit authorization.

**Production:** not touched. This fix was committed to `main` (used for both production and staging deploys in this repository) but has not been separately verified against production traffic.

**Closure update (2026-07-21):** Per explicit engineering instruction, ADMIN-CLEANERS-001 is now recorded as **CLOSED** (in addition to RESOLVED/LOCKED above). This module is the production baseline for admin cleaner create/edit. No further work is to be performed within this module unless (1) a verified production defect is identified, or (2) an approved enhancement requires a separate engineering cycle — in either case, work must begin as a new engineering task and follow the full Production Engineering Confirmation Cycle (DESIGN through LOCK) rather than reopening this checkpoint.

---

## ADMIN-CLEANERS-002

**Title:** Admin Cleaner edit form incorrectly required `hourly_rate` for every save, including field-scoped updates to cleaners with no payroll record

**Description:** The admin Cleaners page (`/admin/cleaners`) unconditionally required `hourly_rate` before allowing *any* save — create or edit alike. This silently blocked correcting any other field (e.g. `name`) on a self-service-onboarded cleaner who has no `cleaner_pay_rates` row yet, since such a cleaner has no hourly rate to leave populated and admins had no way to know one was expected. The failure was silent: a client-side validation `throw` set an error banner rendered at the very top of the page, above the "Invite a cleaner" section, easy to miss while scrolled down to the edit form — no network request was ever sent, no server-side error.

**Root Cause:** discovered while attempting a routine one-time data correction (backfilling a blank `name` on a legacy record via ADMIN-CLEANERS-001's approved Admin Edit workflow, itself a follow-up to the blank-Name data-integrity investigation below). Investigation found the requirement was purely a client-side artifact in `save()` — the PATCH Route Handler (`src/app/api/admin/cleaners/[id]/route.ts`) and the `admin_update_cleaner` RPC (migration `0031`) already supported field-scoped partial updates via a `p_fields text[]` parameter, and already treated `hourly_rate` as entirely optional unless the caller supplied it. The client never took advantage of that flexibility — it always sent `hourly_rate` and always validated it as required, regardless of create vs. edit mode.

**Affected Area:** `src/app/admin/cleaners/page.tsx`'s `save()` function only. No server, RPC, or schema change was needed or made.

**Production Impact:** Not assessed as part of this fix — same client-side code path exists in production; production was not re-tested as part of this remediation.

**Staging Impact:** Confirmed present, now confirmed fixed, live on `https://cleaning-platform-staging.vercel.app`.

**Status:** RESOLVED — **LOCKED (2026-07-21)**, per `docs/ENGINEERING-PROTOCOL.md`. This is a defect found and fixed against the LOCKED ADMIN-CLEANERS-001 baseline, opened and closed as its own engineering cycle (ADMIN-CLEANERS-002) per that module's closure terms — it did not reopen ADMIN-CLEANERS-001.

**Priority:** Medium — blocked non-payroll corrections (e.g. Name) on any cleaner without an existing `cleaner_pay_rates` row; no data-integrity or security exposure, and a workaround existed in principle (inventing a placeholder rate) that was explicitly rejected as unacceptable rather than used.

**Resolution:** `src/app/admin/cleaners/page.tsx`'s `save()` (commit `4c66bb0`) — `hourly_rate` remains required (numeric, >0) only when creating a new cleaner. In edit mode it is optional: if left blank, the field is omitted from the PATCH payload entirely (never sent as `null`/`0`/a placeholder), so the Route Handler/RPC never touch `hourly_rate` or `cleaner_pay_rates` for that save. If a value *is* supplied, in either mode, it is still validated as a positive number before submission. No placeholder pay rate was ever used at any point, live or otherwise; no direct SQL was used to correct data — the fix is a legitimate application-workflow change, not a bypass. Diff-confirmed as the only change in the 476-line file.

**Verification:** Full live E2E cycle against deployed staging — (1) edited the legacy cleaner (`b7b43176-eae0-424e-b44d-3e5f4ce7df77`, `bakar.yahye+cleanerv2a@gmail.com`) Name with `hourly_rate` left blank: PATCH succeeded, Name confirmed updated in the database via direct SQL, `cleaner_pay_rates` row count for that cleaner confirmed 0 both before and after (no row created), Admin list and detail page both confirmed showing the corrected Name; (2) Create Cleaner with `hourly_rate` blank still correctly rejected client-side ("hourly_rate is required."); (3) Edit mode with an invalid supplied `hourly_rate` (`-5`) still correctly rejected ("hourly_rate must be a number greater than 0."), re-queried the database afterward and confirmed nothing was written. `tsc --noEmit` clean; ESLint shows only the single pre-existing, unrelated baseline error (line 122, `useEffect`/`setState`), confirmed identical on the unmodified file. No direct browser database writes were introduced anywhere in this change — all paths remain the existing `fetch()` calls to the Route Handlers.

**Production:** not touched. Committed to `main` (used for both staging and production deploys in this repository) but not separately verified against production traffic.

**Related:** the blank-Name value on the legacy record this fix was originally in service of correcting was itself investigated separately and determined to be residual bad data from a since-superseded function version, not a defect in the currently-deployed onboarding code — see the "blank Name" investigation referenced in `docs/memory/SESSION-LOG.md` (2026-07-21). Onboarding never collecting a real Name at all (the field is always populated from the invitee's email at finalize-time) is a separate, legitimate enhancement gap, not a defect — tracked below as `NEEDS-ATTENTION-001` alongside the related dashboard gap.

---

## NEEDS-ATTENTION-001

**Title:** "Needs your attention" admin dashboard panel has no category for cleaner/client records with missing mandatory profile information

**Description:** `src/app/admin/_dashboard/ActionItems.tsx` (the admin dashboard's "Needs your attention" panel) renders exactly four hardcoded categories — failed invoices, completed-but-uninvoiced jobs, unassigned-today jobs, and open issues — sourced from `src/app/admin/page.tsx`'s data-loading code, which only queries invoices/unassigned-jobs/issues. There is no category, anywhere in this panel or its data source, for a cleaner or client record with missing mandatory profile information (e.g. a blank `name`), nor more broadly for any pending-cleaner-review condition. Such a record is invisible to the admin dashboard entirely — it can only be found by manually browsing the full Cleaners/Clients list.

**Root Cause:** the panel was designed and built (site redesign step 5, see `docs/SESSION-LOG.md` 2026-07-05) around invoice/job-pipeline exceptions only; profile-completeness/data-integrity gaps on cleaner/client records were never in its original scope and have not been added since.

**Affected Area:** `src/app/admin/_dashboard/ActionItems.tsx`, `src/app/admin/page.tsx`'s dashboard data-loading code.

**Discovered:** 2026-07-21, during the ADMIN-CLEANERS-001/002 blank-Name investigation and data correction — confirmed by direct code inspection that no such category exists (not merely that it wasn't firing for this specific record).

**Status:** Open — **verified enhancement gap, not yet approved for implementation.** Per explicit instruction, this module is not to be modified until the enhancement is formally approved and opened as its own engineering cycle, following the same DESIGN → BUILD → COMPILE → FUNCTION TEST → SECURITY → REGRESSION → LIVE E2E VERIFY → EVIDENCE → LOCK cycle used for ADMIN-CLEANERS-001/002. This entry exists so the gap is not lost, not as authorization to build it. Now programme child cycle 8 of `FMPRO-OPERATIONS-HARDENING-001`, built last by design.

**Priority:** Low-Medium — no security or data-integrity exposure (the underlying data is intact and reachable by manually browsing the list), but it means a genuine admin-action-needed condition (e.g. a newly onboarded cleaner missing a real name) can persist indefinitely without surfacing anywhere an admin is likely to look.

**Suggested scope for a future approved cycle (not yet designed in detail):** a fifth "Needs your attention" category covering cleaner/client records with missing mandatory profile fields (starting with `name`, since that is the concretely observed case), sourced by a new or extended query in `admin/page.tsx`'s dashboard data-loading code, rendered the same way as the four existing categories in `ActionItems.tsx`. Whether this should also cover other categories floated during the original review (failed invitations, checklist failures, attendance corrections, payroll exceptions, outstanding client issues) is an open design question for that future cycle, not decided here.

**Related:** `ADMIN-CLEANERS-002` above (the specific record whose blank Name prompted this finding).

---

## ADMIN-CLIENTS-001

**Title:** Admin Clients create/edit form exposed an unsupported client status value, and allowed arbitrary status changes outside the intended lifecycle-activation flow

**Description:** The Admin Clients page (`/admin/clients`) create/edit form included an editable `status` dropdown with options `['pending', 'active', 'disabled']`. The live `clients_status_check` constraint (migration `0024`) permits only `restricted`, `active`, `suspended`, `disabled` — `pending` was never a valid value, so selecting it in the form would have produced a silent constraint-violation failure on save. Separately, the dropdown allowed any admin to set a client's status directly through the general create/edit workflow, bypassing the dedicated activation flow that governs lifecycle transitions elsewhere in the platform.

**Root Cause:** the Clients form's status control was never updated after the account-lifecycle model was redefined (Stage 2.1, migration `0024`) to its final `restricted/active/suspended/disabled` set, and was never brought in line with the equivalent control on the Cleaners form, which had already been fixed to exclude status entirely (see `admin_create_cleaner`/`admin_update_cleaner`, migration `0031`).

**Affected Area:** `src/app/admin/clients/page.tsx` only.

**Discovered:** 2026-07-21, during the `NEEDS-ATTENTION-001` Operations Attention Map review (`FMPRO-OPERATIONS-HARDENING-001` programme, child cycle 1).

**Status:** RESOLVED — **LOCKED (2026-07-21)**, per `docs/ENGINEERING-PROTOCOL.md`.

**Priority:** Medium — no data was ever actually corrupted (the invalid value would have been rejected by the DB constraint, not silently written), but the control was live and reachable, and the arbitrary-status-change gap was a real lifecycle-governance bypass.

**Resolution (Option B, approved):** the editable status control was removed entirely, rather than just correcting its value list — chosen specifically to maintain a single, consistent account-lifecycle philosophy across all user types (cleaners and clients alike), matching the already-established cleaner pattern. `emptyForm` no longer has a `status` field. `createClient()` now always submits `status: 'restricted'` on insert (documented in-line, mirrors `admin_create_cleaner`). `updateClient()` no longer sends `status` at all (mirrors `admin_update_cleaner`'s allow-listed-fields exclusion). `pickRow()` no longer copies `status` into form state. The `SelectField` helper component, now unused, was removed as dead code rather than left orphaned. A read-only explanatory line replaced the dropdown in the JSX. No schema, migration, RPC, or route-handler change — single file, +17/-35 lines, commit `f045a6b`.

**Verification:** `tsc` clean, ESLint net -1 errors (removed one incidental `any` usage inside the deleted `SelectField`, zero new issues), full `next build` succeeded across all 32 routes. Live E2E against `https://cleaning-platform-staging.vercel.app` after deployment reached Ready: created a client through the live UI and confirmed via direct SQL (not just the UI) that it inserted with `status = 'restricted'`; edited the same client's notes through the live UI and confirmed via direct SQL that `notes` updated while `status` remained `restricted`, unchanged; confirmed no status control exists anywhere in the UI, so submitting an unsupported value is now structurally impossible; deleted the test client via the UI and confirmed via direct SQL that the row was removed. Regression: commit diff confirmed exactly one file changed; `ADMIN-CLEANERS-001`/`ADMIN-CLEANERS-002` files were not part of this commit. The `/admin/clients/[id]` activation-flow page (untouched by this change) was confirmed to render correctly for the test client -- **this was page/render verification only; the restricted->active transition action itself was not executed as part of this verification pass.**

**Production:** not touched. Committed to `main` (used for both staging and production deploys in this repository) but not separately verified against production traffic.

**Related:** first child cycle of the `FMPRO-OPERATIONS-HARDENING-001` programme (Production Remediation and Capability Completion Programme), opened to remediate verified defects found during the `NEEDS-ATTENTION-001` design review before that attention engine is built. Next child cycle: `ADMIN-INVITATIONS-001`.

---

## ADMIN-INVITATIONS-001

**Title:** No admin UI existed to list, resend, or cancel account invitations, despite the full lifecycle RPC set and four POST routes already being live

**Description:** `/admin/invitations` did not exist. All nine invitation lifecycle RPCs (migrations `0026`/`0027`/`0030` — `reserve_account_invitation`, `accept_account_invitation`, `finalize_account_invitation`, `reconcile_account_invitation`, `mark_account_invitation_failed`, `resend_account_invitation`, `cancel_account_invitation`, `expire_stale_account_invitation`, `sweep_expired_account_invitations`) and four admin POST routes (`invite`/`resend`/`cancel`/`reconcile`) were live and had been previously verified, but there was no page to list outstanding invitations, see their status, or drive Resend/Cancel through the UI — an admin could only act on an invitation by knowing its UUID and calling a route directly.

**Root Cause:** capability gap, not a defect — the invitation lifecycle backend was built in an earlier stage (Stage 2.2b/2.2c) without a corresponding admin-facing list UI, which was never subsequently added.

**Affected Area:** new files only — `src/app/api/admin/invitations/route.ts`, `src/app/admin/invitations/page.tsx`, and a two-line nav addition in `src/app/admin/layout.tsx`. No existing route, RPC, migration, schema, error taxonomy, or rate-limiting code was touched.

**Discovered:** 2026-07-21, during the `FMPRO-OPERATIONS-HARDENING-001` programme, child cycle 2 (following `ADMIN-CLIENTS-001`).

**Status:** RESOLVED — **LOCKED (2026-07-21)**, per `docs/ENGINEERING-PROTOCOL.md`.

**Priority:** Medium — no security or data-integrity exposure (the backend was already correct and reachable via direct route calls), but a genuine operational gap: admins had no practical way to monitor or manage outstanding invitations at all.

**Resolution:** `src/app/api/admin/invitations/route.ts` (new, commit `5357cde`) — `GET` only, gated by the same `requireAdmin()` used by every other route in the directory, with optional `status`/`role` query-param filters validated against the live CHECK-constraint value sets. Deliberately built as a hand-curated API contract rather than a raw table projection: selects exactly 8 named columns (`id, canonical_email, intended_role, status, invited_at, expires_at, resend_count, cancelled_at`) and explicitly re-maps each onto the response object — never `select('*')`, never a raw spread — so `invited_by`, `auth_user_id`, `superseded_by`, `retry_of`, `cancelled_by`, `last_resent_at`, `created_at`, and `updated_at` are never exposed, per the owner's binding DESIGN-approval refinement. `src/app/admin/invitations/page.tsx` (new, commit `f775964`) — status/role filter controls, a table matching `admin/clients/page.tsx`'s existing raw-inline-style conventions exactly, and Resend/Cancel buttons wired to the pre-existing, unmodified `/resend`/`/cancel` routes, both disabled whenever a row's `status !== 'pending'` (grounded directly in `cancel_account_invitation`'s own idempotency/error rule, read from its SQL body in migration `0027`). `src/app/admin/layout.tsx` (commit `e332c14`) — added a `Mail` icon and one nav entry under "Team & Clients", two-line diff. No lifecycle RPC, state machine, onboarding flow, migration, schema, error taxonomy, rate limit, or existing route behavior was modified. Built extensibly (status/role filters, a `ROW_LIMIT` constant, a query shape that composes cleanly) so a future page/cursor parameter could be added without changing this contract — but pagination/search were explicitly not built this cycle, per approved scope.

**Verification:** `tsc` clean on all three files; ESLint required one follow-up fix in the new page (3× `@typescript-eslint/no-explicit-any` from `catch (e: any)` blocks replaced with a typed `getErrorMessage(e: unknown)` helper, plus one inline-disabled `react-hooks/set-state-in-effect` on the filter-triggered `load()` call, matching this codebase's existing inline-disable convention) — after the fix, full-project ESLint matched the clean-HEAD baseline exactly (65 errors/1 warning), net zero new, despite four other pre-existing, unaddressed instances of that same rule elsewhere in the codebase which were correctly left untouched as out of scope. `next build` succeeded; all three files confirmed byte-identical on a fresh independent clone. Live E2E against `https://cleaning-platform-staging.vercel.app/admin/invitations` (Vercel Ready at commit `e332c14`): the page's 7-row list matched a direct SQL query against staging's `account_invitations` table exactly, same order, same values. The GET response payload was inspected directly via `fetch()` in the browser for multiple filter combinations (`status=pending`, `role=cleaner`, `role=client`, invalid `status` → `400 INVALID_REQUEST`) — confirmed only the 8 contracted fields are ever present, no internal-field leakage. Resend/Cancel `disabled` state was confirmed via direct DOM inspection (`button.disabled`), not just visual appearance: `true` for every non-pending row, `false` for both pending rows. **Cancel was executed for real** against a genuinely pending invitation (`8bd99ff3-…`, `bakar.yahye+cleaner2@gmail.com`) through the live UI — success banner shown, row updated in place, and independently confirmed via direct SQL that `status`/`cancelled_at` were actually written by the underlying `cancel_account_invitation` RPC (`cancelled_at` `2026-07-21 17:30:23+00`), not merely an optimistic UI update. Resend was not executed live this cycle (it sends a real email; the gating and route architecture are identical to the just-proven Cancel path). Unauthenticated `GET /api/admin/invitations` confirmed rejected with `401 NOT_AUTHENTICATED`. **Disclosed limitation, accepted at LOCK:** non-admin-authenticated rejection was not separately re-tested live this cycle — no non-admin test credentials were available — so it rests on `requireAdmin()` being the exact same shared function already relied on (and previously verified) by the four pre-existing POST routes in this directory, not a fresh live non-admin session test. The owner reviewed this limitation explicitly at LOCK and accepted it as a non-blocker, since no authentication code was changed. Regression: `/admin/cleaners` confirmed rendering correctly with its Invite/manual-create forms intact and the new Invitations nav entry correctly placed; commit diffs confirmed only the 3 intended files changed across all 3 commits.

**Production:** not touched. Committed to `main` (used for both staging and production deploys in this repository) but not separately verified against production traffic.

**Related:** second child cycle of the `FMPRO-OPERATIONS-HARDENING-001` programme. Next child cycle: `CLIENT-ISSUES-001`.
