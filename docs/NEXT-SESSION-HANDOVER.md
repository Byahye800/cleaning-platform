# NEXT-SESSION-HANDOVER.md

**Written for an engineer (or a future Claude session) with zero prior context on this project.** Read this file first, before touching anything.

---

## PROJECT

**cleaning-platform** — a Next.js app with three portals (admin/cleaner/client) backed by Supabase, deployed on a Hostinger VPS at `http://187.124.112.253:3002` via PM2, source at `github.com/Byahye800/cleaning-platform` (branch `main`). Production Supabase project is `wqdyshgoxtkbreijbbha` ("Cleaning Platform - Dev"). The app itself has extensive prior history — see `docs/PROJECT-STATUS.md`, `docs/SESSION-LOG.md`, and `docs/memory/` for the full application-feature track (Phases 0–7, Stages 1–2.5). This handover is scoped specifically to the **staging-environment build-out** work, which is a separate, newer track layered on top of that app.

## Current status

A brand-new, fully isolated staging Supabase project has been created and its database schema has been successfully bootstrapped and verified. **No Auth, SMTP, or Vercel configuration has been done for staging yet.** No staging deployment of the application exists yet. Production is completely untouched by any of this work.

## Completed checkpoints

- **Checkpoint 1** — pre-creation readiness: PASSED.
- **Checkpoint 2** — staging Supabase project created: PASSED.
- **Checkpoint 3 (original attempt)** — apply full migration history literally: **FAILED** at `0005_schema_catchup.sql` (see Known Defects below). Correctly detected and stopped, not silently worked around.
- **Checkpoint 3 Remediation** — reset staging, bootstrap via the documented authoritative path (`0005` through `0027`, skipping `0001`–`0003`): PASSED, with full structural and security verification.

## Outstanding checkpoints

- **Checkpoint 4 — Staging Auth Configuration.** Not started. This is the next approved task (see below) — but it is **not started**, and this handover does not authorize starting it; that requires the user's explicit go-ahead in a new session.
- **Checkpoint 5** — staging custom SMTP (Resend). Not started.
- **Checkpoint 6** — Vercel staging deployment. Not started.
- **Checkpoint 7** — staging environment integrity audit. Not started.
- **Checkpoint 8** — Stage 2.5 execution (live E2E testing of the account-invitation/onboarding flow), to happen only after staging is fully built out. Not started. The test plan itself must be re-presented and re-approved before any test execution begins — this was an explicit standing instruction from earlier in the engagement, carried forward.

## Current environment status

See `STAGING-RECOVERY-STATE.md` for the full field-by-field snapshot (project ref, region, plan, schema/security verification status, etc.) — not duplicated here to avoid the two files drifting apart. In short: staging is healthy, schema-complete (19 tables, 4 views, 23 functions, 7 triggers), security-verified, and completely empty of data and Auth users.

## Known risks

- **The staging environment has had zero functional/behavioral testing.** Everything verified so far is structural (tables/columns/constraints exist) and static-privilege (grants/ownership are correct). Nobody has actually called `reserve_account_invitation`, `cleaner_check_in`, or any other RPC against staging yet. Do not assume the schema being structurally correct means the application will work correctly against it end-to-end — that is exactly what Checkpoint 8/Stage 2.5 exists to establish.
- **Two BEFORE-trigger functions carry unrevoked default EXECUTE grants** (`enforce_single_role_profile`, `guard_invitation_status_write`) — not currently exploitable, but flagged. See `KNOWN-ISSUES-REGISTER.md`, `STAGING-002`.

## Known defects

- **`STAGING-001` — Historical Migration Replay Defect. Still OPEN.** Running migrations `0001` → `0002` → `0003` → `0005` in that literal order against a fresh database fails at `0005` (Postgres error `2BP01`, a policy from `0003` depends on a column `0005` tries to drop). This is a real repository governance issue, not fixed by anything done so far — the Checkpoint 3 Remediation worked *around* it (by starting the bootstrap at `0005` instead) rather than fixing it, and a 2026-07-14 Pre-Checkpoint-4 closure task explicitly excluded it from resolution by owner decision. Full detail and two candidate fix directions (neither approved yet) are in `KNOWN-ISSUES-REGISTER.md`. **Do not edit `0001`/`0003`/`0005` without separate explicit approval.**
- **`STAGING-002` — RESOLVED 2026-07-14.** Was: inconsistent EXECUTE grants on two BEFORE-trigger-only functions. Fixed via migration `0028_resolve_staging_002_trigger_function_execute_grants.sql`, applied to staging only, live-verified (pre/post-change evidence, rolled-back functional trigger-path test). Full detail in `KNOWN-ISSUES-REGISTER.md`.

## What NOT to touch

- **Do not run migrations `0001`, `0002`, or `0003` against staging, or against any fresh database, in sequence with `0005+`.** This is the exact known-broken path. If a from-scratch bootstrap is ever needed again, use `0005` through `0027` only, exactly as the Checkpoint 3 Remediation did.
- **Do not touch production** (`wqdyshgoxtkbreijbbha`, "Cleaning Platform - Dev") as part of any staging work. The two projects are and must remain fully isolated — no shared secrets, no shared data, no assumption that a fix validated in staging has been applied to production or vice versa.
- **Do not edit any migration file** to "fix" `STAGING-001` without explicit approval — this was an explicit standing instruction during the remediation and there's no reason to assume it's lifted. Two candidate fixes are documented in `KNOWN-ISSUES-REGISTER.md` for when that approval is sought.
- **Do not use `CASCADE`** when working with staging's schema, following the pattern established during the reset (explicit `DROP POLICY` before `DROP TABLE` instead).
- **Do not begin Checkpoint 4** (or any later checkpoint) without the user's explicit go-ahead — every checkpoint in this engagement has required an explicit stop-and-approve gate, and that pattern should continue.

## What NOT to change

- Nothing about production's Auth, SMTP, database schema, policies, functions, users, or invitations should be changed as part of staging work.
- No repository file should be edited or committed without it being reviewed first — this has been the standing pattern throughout the engagement (see `docs/SESSION-LOG.md`/`docs/PROJECT-STATUS.md` for the app-track version of the same discipline).

## What has been verified

- Staging project creation, region, plan, compute tier, and password-handling method (Checkpoint 2).
- Staging schema structural completeness: 19 tables, 4 views, all matching the expected list exactly (Checkpoint 3 Remediation, Section 5).
- Staging schema security correctness: RLS on every table, correct function ownership (critically `accept_account_invitation` owned by `service_role`), correct view `security_invoker`, no dangerous unconditional-access policies, no stale duplicate policies from the skipped `0001`/`0003` (Checkpoint 3 Remediation, Sections 6–15).
- Zero residual data, zero Auth users in staging (Checkpoint 3 Remediation, Sections 13–14).
- Production non-impact throughout every checkpoint (verified by construction — no tool call in any checkpoint ever targeted the production project ref).
- **As of 2026-07-14:** the four checkpoint evidence reports (`CHECKPOINT-1-READINESS-REPORT.md`, `CHECKPOINT-2-STAGING-SUPABASE-CREATION-REPORT.md`, `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md`, `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md`) — previously cited by name in committed docs but never actually committed to the repo — are now present in `docs/`, confirmed authentic (originals, not reconstructed) and scanned for secrets before commit.

## What remains unverified

- Any functional/behavioral correctness of staging (no RPCs have been called, no rows have been inserted, no real invite/onboarding/attendance/checklist/issue flow has been exercised against staging).
- Staging Auth, SMTP, and Vercel configuration — none of it exists yet, so there's nothing to verify.
- Whether the application code itself (as deployed to production) would work correctly if pointed at staging — untested.

---

## NEXT ACTION

**NEXT APPROVED TASK: Checkpoint 4 — Staging Auth Configuration.**

**Not started.**
