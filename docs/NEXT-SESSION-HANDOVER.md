# NEXT-SESSION-HANDOVER.md

**Written for an engineer (or a future Claude session) with zero prior context on this project.** Read this file first, before touching anything.

---

## PROJECT

**cleaning-platform** — a Next.js app with three portals (admin/cleaner/client) backed by Supabase, deployed on a Hostinger VPS at `http://187.124.112.253:3002` via PM2, source at `github.com/Byahye800/cleaning-platform` (branch `main`). Production Supabase project is `wqdyshgoxtkbreijbbha` ("Cleaning Platform - Dev"). The app itself has extensive prior history — see `docs/PROJECT-STATUS.md`, `docs/SESSION-LOG.md`, and `docs/memory/` for the full application-feature track (Phases 0–7, Stages 1–2.5). This handover is scoped specifically to the **staging-environment build-out** work, which is a separate, newer track layered on top of that app.

## Current status

A brand-new, fully isolated staging Supabase project has been created and its database schema has been successfully bootstrapped and verified. **Checkpoint 4 (staging Auth) is partially complete:** two domain-independent Auth hardening changes are done (public signup disabled; minimum password length raised to 8) — see "Checkpoint 4 Part A" below. URL-dependent Auth configuration (Site URL, Redirect URLs) and SMTP/template configuration remain deferred pending Checkpoints 6 and 5 respectively. A Vercel project (`cleaning-platform-staging`, team "Facility Pro Management Maintenance") exists as a limited, documented pre-configuration artifact created ahead of sequence — see "Vercel pre-configuration artifact" below — but Checkpoint 6 (full Vercel staging deployment) has not started, no environment variables are attached, and no working staging deployment of the application exists yet. Production is completely untouched by any of this work.

## Completed checkpoints

- **Checkpoint 1** — pre-creation readiness: PASSED.
- **Checkpoint 2** — staging Supabase project created: PASSED.
- **Checkpoint 3 (original attempt)** — apply full migration history literally: **FAILED** at `0005_schema_catchup.sql` (see Known Defects below). Correctly detected and stopped, not silently worked around.
- **Checkpoint 3 Remediation** — reset staging, bootstrap via the documented authoritative path (`0005` through `0027`, skipping `0001`–`0003`): PASSED, with full structural and security verification.

## Outstanding checkpoints

- **Checkpoint 4 — Staging Auth Configuration.** **Partially complete.** Part A (domain-independent hardening: public signup disabled, minimum password length raised to 8) is done and verified. Part B (Site URL, Redirect URLs — both depend on a working Checkpoint 6 deployment) remains deferred. Do not resume Checkpoint 4 Part B without the user's explicit go-ahead in a new session.
- **Checkpoint 5** — staging custom SMTP (Resend). Not started.
- **Checkpoint 6** — Vercel staging deployment. Not started (implementation). A limited pre-configuration artifact (one Vercel project, one failed/unconfigured deployment attempt) exists under a documented sequencing exception — see "Vercel pre-configuration artifact" below. This is not Checkpoint 6 having started.
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

## Vercel pre-configuration artifact (2026-07-14, ahead of Checkpoint 6)

A Vercel project, `cleaning-platform-staging` (team "Facility Pro Management Maintenance", repository `Byahye800/cleaning-platform`, branch `main`, framework Next.js auto-detected, root directory `./`, build overrides left default), was created under a narrow, explicitly authorised sequencing exception — not as part of a started Checkpoint 6. During setup, a stale browser coordinate caused the Deploy button to be triggered accidentally before any environment variable was entered. The resulting deployment (`dpl_EvxiYCSNQ2c6fB9L3jeLWBKuXMR5`, commit `4fe3415`) failed safely: `npm install`, Next.js compilation, and TypeScript checking all succeeded, but the build failed during page-data collection because the Stripe SDK found no `STRIPE_SECRET_KEY`. Zero environment variables (Supabase or otherwise) were ever attached, zero routes were served, no custom domain is connected, and no integration was activated. Full detail: `docs/memory/VERIFICATION-REGISTER.md` (incident record) and `docs/STAGING-CHECKPOINT-HISTORY.md` ("SEQUENCING EXCEPTION" entry).

**Corrected env-var finding for Checkpoint 6 planning:** the earlier assumption that only the three Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) would be sufficient for a first successful build was disproved by this real build evidence — `STRIPE_SECRET_KEY` is also required for the build to complete, since the Stripe client is initialized in a way `next build`'s page-data-collection step evaluates. `NEXT_PUBLIC_APP_URL` is not required for the build (confirmed via code audit: only referenced inside two Node-runtime API route handlers, evaluated at request time, not build time) but is required afterward, once a real staging URL exists, for correct invitation-link generation. `STRIPE_WEBHOOK_SECRET` and `INTERNAL_CRON_SECRET` are feature-specific/later needs. `ALLOW_DEV_INVITE_LINK_DISPLAY` is optional and safe to leave unset (defaults off). `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` remain unreferenced by any code path. **Checkpoint 6 must establish a verified Stripe test-mode strategy (a test-mode secret key, never a production one) before the next deployment attempt.** No variable has been added to Vercel as part of this note — this is planning documentation only.

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
- **As of 2026-07-14:** Checkpoint 4 Part A — staging Auth "Allow new users to sign up" = OFF and minimum password length = 8 — both saved successfully on the confirmed staging project and independently re-verified post-save via fresh page loads; every adjacent Auth/URL/SMTP/rate-limit/session setting confirmed unchanged.

## What remains unverified

- Any functional/behavioral correctness of staging (no RPCs have been called, no rows have been inserted, no real invite/onboarding/attendance/checklist/issue flow has been exercised against staging).
- Staging Auth URL-dependent configuration (Site URL, Redirect URLs) and SMTP/template configuration — none of it exists yet, so there's nothing to verify. (Domain-independent Auth hardening — public signup, minimum password length — is done; see Checkpoint 4 Part A above.)
- Staging Vercel configuration beyond the bare project shell described above — no environment variables, no successful build, no working deployment exists yet.
- Whether the application code itself (as deployed to production) would work correctly if pointed at staging — untested.

---

## NEXT ACTION

**NEXT APPROVED TASK: Checkpoint 4 Part B — URL-dependent staging Auth configuration (Site URL, Redirect URLs), once Checkpoint 6 produces a working staging deployment URL.**

**Checkpoint 4 Part A is done. Part B is deferred, not started.**
