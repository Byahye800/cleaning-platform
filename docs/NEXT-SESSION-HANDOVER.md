# NEXT-SESSION-HANDOVER.md

**Written for an engineer (or a future Claude session) with zero prior context on this project.** Read this file first, before touching anything.

---

## PROJECT

**cleaning-platform** — a Next.js app with three portals (admin/cleaner/client) backed by Supabase, deployed on a Hostinger VPS at `http://187.124.112.253:3002` via PM2, source at `github.com/Byahye800/cleaning-platform` (branch `main`). Production Supabase project is `wqdyshgoxtkbreijbbha` ("Cleaning Platform - Dev"). The app itself has extensive prior history — see `docs/PROJECT-STATUS.md`, `docs/SESSION-LOG.md`, and `docs/memory/` for the full application-feature track (Phases 0–7, Stages 1–2.5). This handover is scoped specifically to the **staging-environment build-out** work, which is a separate, newer track layered on top of that app.

## Current status

A brand-new, fully isolated staging Supabase project has been created and its database schema has been successfully bootstrapped and verified. **Checkpoint 4 (staging Auth) is COMPLETE:** Part A (domain-independent hardening: public signup disabled, minimum password length raised to 8, 2026-07-14) and Part B (Site URL, Redirect URLs, `NEXT_PUBLIC_APP_URL` configured against the working staging deployment, 2026-07-15) are both done and verified — see "Checkpoint 4 Part A/B" below. **Checkpoint 5 (staging custom SMTP) is COMPLETE** via Resend's free-tier test sender (`onboarding@resend.dev`), configured and verified 2026-07-17 — with a known limitation: this sender only delivers to the Resend account owner's own email until a domain is verified (see "Known risks" below). **Checkpoint 6 Phase A (Vercel staging deployment) is COMPLETE and live** at `https://cleaning-platform-staging.vercel.app`, with a bootstrapped first staging admin account (2026-07-15, login/session/logout/route-protection all verified) — Checkpoint 6 Phase B (further authenticated/access-control staging tests) is in progress. A real end-to-end invite-email test on 2026-07-18 (from the newly-built admin Invite UI) failed with `502 AUTH_DELIVERY_FAILED`, root-caused to the Checkpoint 5 delivery limitation above — a fix (free `nic.eu.org` subdomain + Cloudflare DNS, verified with Resend) is in progress, domain request submitted 2026-07-18, pending nic.eu.org approval. Production is completely untouched by any of this work.

## Completed checkpoints

- **Checkpoint 1** — pre-creation readiness: PASSED.
- **Checkpoint 2** — staging Supabase project created: PASSED.
- **Checkpoint 3 (original attempt)** — apply full migration history literally: **FAILED** at `0005_schema_catchup.sql` (see Known Defects below). Correctly detected and stopped, not silently worked around.
- **Checkpoint 3 Remediation** — reset staging, bootstrap via the documented authoritative path (`0005` through `0027`, skipping `0001`–`0003`): PASSED, with full structural and security verification.
- **Checkpoint 4** — staging Auth configuration: PASSED. Part A (domain-independent hardening, 2026-07-14) and Part B (Site URL/Redirect URLs/`NEXT_PUBLIC_APP_URL`, 2026-07-15) both complete and verified.
- **Checkpoint 5** — staging custom SMTP via Resend: PASSED (2026-07-17), using Resend's free-tier test sender. Known limitation: delivery restricted to the Resend account owner's own email until a domain is verified — see Known risks.
- **Checkpoint 6 Phase A** — Vercel staging deployment: PASSED. Live and reachable at `https://cleaning-platform-staging.vercel.app`; first staging admin account bootstrapped and login/session/logout/route-protection verified (2026-07-15).

## Outstanding checkpoints

- **Checkpoint 6 Phase B** — authenticated/access-control staging tests. In progress. Phase A (deployment) is complete and documented above under "Completed checkpoints."
- **Checkpoint 7** — staging environment integrity audit. Not started.
- **Checkpoint 8** — Stage 2.5 execution (live E2E testing of the account-invitation/onboarding flow), to happen only after staging is fully built out. Not started, and currently blocked on the Resend domain-verification issue described in "Current status" above — a real invite-email test on 2026-07-18 confirmed the invite/onboarding code paths work correctly but email delivery to arbitrary addresses does not yet. The test plan itself must be re-presented and re-approved before any test execution begins — this was an explicit standing instruction from earlier in the engagement, carried forward.

## Current environment status

See `STAGING-RECOVERY-STATE.md` for the full field-by-field snapshot (project ref, region, plan, schema/security verification status, etc.) — not duplicated here to avoid the two files drifting apart. In short: staging is healthy, schema-complete (19 tables, 4 views, 23 functions, 7 triggers), security-verified, and completely empty of data and Auth users.

## Known risks

- **Staging functional testing is partial, not comprehensive.** Login/session/logout/route-protection for one bootstrapped admin account is live-verified (2026-07-15). `reserve_account_invitation` has now been exercised for real via the admin Invite UI (2026-07-18) — the reservation and failure-compensation paths worked correctly, but the invite email itself was not delivered (see "Current status" above). No cleaner/client account, onboarding flow, `cleaner_check_in`, or other RPC has been exercised against staging yet. Do not assume this partial testing means the application works correctly end-to-end — that is exactly what Checkpoint 8/Stage 2.5 exists to establish, once the email-delivery blocker is resolved.
- **Real invite-email delivery to arbitrary addresses does not work yet** — Resend's free-tier sender only delivers to the account owner's own email until a domain is verified. Fix in progress (`nic.eu.org` + Cloudflare), pending approval.
- **Two BEFORE-trigger functions carry unrevoked default EXECUTE grants** (`enforce_single_role_profile`, `guard_invitation_status_write`) — not currently exploitable, but flagged. See `KNOWN-ISSUES-REGISTER.md`, `STAGING-002` (resolved 2026-07-14 via migration `0028`).

## Known defects

- **`STAGING-001` — Historical Migration Replay Defect. Still OPEN.** Running migrations `0001` → `0002` → `0003` → `0005` in that literal order against a fresh database fails at `0005` (Postgres error `2BP01`, a policy from `0003` depends on a column `0005` tries to drop). This is a real repository governance issue, not fixed by anything done so far — the Checkpoint 3 Remediation worked *around* it (by starting the bootstrap at `0005` instead) rather than fixing it, and a 2026-07-14 Pre-Checkpoint-4 closure task explicitly excluded it from resolution by owner decision. Full detail and two candidate fix directions (neither approved yet) are in `KNOWN-ISSUES-REGISTER.md`. **Do not edit `0001`/`0003`/`0005` without separate explicit approval.**
- **`STAGING-002` — RESOLVED 2026-07-14.** Was: inconsistent EXECUTE grants on two BEFORE-trigger-only functions. Fixed via migration `0028_resolve_staging_002_trigger_function_execute_grants.sql`, applied to staging only, live-verified (pre/post-change evidence, rolled-back functional trigger-path test). Full detail in `KNOWN-ISSUES-REGISTER.md`.
- **`STAGING-003` — RESOLVED 2026-07-18.** Was: `job_billing`/`cleaner_pay_rates` (plus their shared `set_updated_at()` trigger function) existed live in production but were never captured in a migration file — this caused a "Could not find the table 'public.job_billing' in the schema cache" error when staging (bootstrapped purely from committed migrations) reached code that queried it. Fixed via migration `0029_job_billing_and_cleaner_pay_rates_schema.sql`, applied to staging and verified. Full detail in `KNOWN-ISSUES-REGISTER.md`.

## Vercel pre-configuration artifact (2026-07-14, ahead of Checkpoint 6)

A Vercel project, `cleaning-platform-staging` (team "Facility Pro Management Maintenance", repository `Byahye800/cleaning-platform`, branch `main`, framework Next.js auto-detected, root directory `./`, build overrides left default), was created under a narrow, explicitly authorised sequencing exception — not as part of a started Checkpoint 6. During setup, a stale browser coordinate caused the Deploy button to be triggered accidentally before any environment variable was entered. The resulting deployment (`dpl_EvxiYCSNQ2c6fB9L3jeLWBKuXMR5`, commit `4fe3415`) failed safely: `npm install`, Next.js compilation, and TypeScript checking all succeeded, but the build failed during page-data collection because the Stripe SDK found no `STRIPE_SECRET_KEY`. Zero environment variables (Supabase or otherwise) were ever attached, zero routes were served, no custom domain is connected, and no integration was activated. Full detail: `docs/memory/VERIFICATION-REGISTER.md` (incident record) and `docs/STAGING-CHECKPOINT-HISTORY.md` ("SEQUENCING EXCEPTION" entry).

**Corrected env-var finding for Checkpoint 6 planning:** the earlier assumption that only the three Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) would be sufficient for a first successful build was disproved by this real build evidence — `STRIPE_SECRET_KEY` is also required for the build to complete, since the Stripe client is initialized in a way `next build`'s page-data-collection step evaluates. `NEXT_PUBLIC_APP_URL` is a Vercel deployment-environment dependency used by the invitation API routes when generating redirect URLs — not confirmed as a build-time dependency (the prior build evidence showed the build compiled without it). Its exact deployment-time/runtime behaviour, and whether a redeployment is required after changing it in Vercel to guarantee the deployed application uses the updated value, must be verified during Checkpoint 6 rather than assumed. `STRIPE_WEBHOOK_SECRET` and `INTERNAL_CRON_SECRET` are feature-specific/later needs. `ALLOW_DEV_INVITE_LINK_DISPLAY` is optional and safe to leave unset (defaults off). `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` remain unreferenced by any code path. **Checkpoint 6 must establish a verified Stripe test-mode strategy (a test-mode secret key, never a production one) before the next deployment attempt.** No variable has been added to Vercel as part of this note — this is planning documentation only.

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
- **As of 2026-07-15:** Checkpoint 4 Part B — Site URL and Redirect URLs set against the working Vercel deployment, `NEXT_PUBLIC_APP_URL` added to Vercel (Production scope only), one redeploy triggered and reached Ready with no errors, runtime verified (root redirects to `/admin/login`, page renders, zero console messages).
- **As of 2026-07-15:** Checkpoint 6 Phase A — Vercel deployment live at `https://cleaning-platform-staging.vercel.app`; one staging admin Auth user + `user_roles` row bootstrapped and verified; login, session persistence, logout, and post-logout route-protection all tested and passed.
- **As of 2026-07-17:** Checkpoint 5 — custom SMTP via Resend configured on staging; one real test email delivered successfully to the Resend account owner's own address.
- **As of 2026-07-18:** the admin Invite UI (`InviteForm.tsx`) built and deployed to staging; a real invite send exercised `reserve_account_invitation` and the failure-compensation path correctly, though email delivery itself failed for the known Resend free-tier reason above.

## What remains unverified

- Full functional/behavioral correctness of staging's onboarding lifecycle: no real cleaner/client account has completed onboarding, and `cleaner_check_in` and most other RPCs have not been exercised against staging yet. `reserve_account_invitation` has been exercised once (2026-07-18) via the Invite UI, but the flow could not be completed end-to-end because invite-email delivery is blocked (see "Current status").
- Whether Checkpoint 7's full staging environment integrity audit would surface anything beyond what Checkpoints 1-6 have already found — not yet performed.
- Whether the application code itself (as deployed to production) would work correctly if pointed at staging — still untested beyond the admin login/session path.

---

## NEXT ACTION

**NEXT APPROVED TASK: resolve the Resend domain-verification blocker.** A free `nic.eu.org` subdomain (`fmprocleaning-staging.eu.org`) has been requested and pointed at Cloudflare's free DNS; the domain request is pending nic.eu.org approval as of 2026-07-18. Once approved: add Resend's verification DNS records in Cloudflare, verify the domain with Resend, reconfigure Supabase's staging SMTP sender, then retry the cleaner and client invite tests end-to-end. After that: Checkpoint 6 Phase B, Checkpoint 7 (integrity audit), then Checkpoint 8/Stage 2.5.

**Checkpoint 4 (both parts) and Checkpoint 5 are done. Checkpoint 6 Phase A is done; Phase B is in progress.**
