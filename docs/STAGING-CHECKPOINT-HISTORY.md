# STAGING-CHECKPOINT-HISTORY.md

**Purpose:** the authoritative record of every staging-environment checkpoint, its outcome, and its evidence. Update this file at the end of every checkpoint — do not delete or rewrite completed entries, only append.

---

## CHECKPOINT 1 — Pre-creation readiness

**Status:** PASSED
**Date:** 2026-07-13
**Outcome:** Confirmed readiness to create an isolated staging Supabase project: exactly one organization on the account ("Byahye800's Org"), production project (`wqdyshgoxtkbreijbbha`) identified and left untouched, region/plan strategy agreed (match production's `eu-central-1`, Free plan), password-handling method agreed (Supabase's own generator, never viewed in plaintext).
**Evidence Summary:** Pre-creation readiness report produced and approved before any project-creation action was taken.

---

## CHECKPOINT 2 — Staging Supabase project creation

**Status:** PASSED
**Date:** 2026-07-13
**Outcome:** One new, isolated Supabase project created — "Cleaning Platform - Staging", ref `jwdfzgibrijcyypibhjw`, region `eu-central-1` (Frankfurt), Free plan, Nano compute (matches production's tier). Password generated via Supabase's own "Generate a password" link, never displayed in plaintext, never typed or pasted by the operator.
**Evidence Summary:** 15-item post-creation verification passed (name/ref/org/region/plan/health confirmed; zero tables, zero migrations, zero Auth users, default Auth Site URL, no redirect URLs, no custom SMTP, no Vercel link; production project confirmed unchanged throughout). One honestly-flagged discrepancy: the Users page footer showed a stale "Total: 10 users (estimated)" UI widget against an otherwise-empty Users table — later independently re-confirmed via direct `select count(*) from auth.users` returning 0, resolving the discrepancy as a stale UI cache artifact, not real data. Full detail in `CHECKPOINT-2-STAGING-SUPABASE-CREATION-REPORT.md`.

---

## CHECKPOINT 3 — Apply and verify all database migrations (original attempt)

**Status:** FAILED

**Root Cause:** Migration `0003` (superseded historical file) creates a policy, `recurrence_rules_select_for_own_client_jobs`, whose `USING` expression depends on `jobs.recurrence_rule_id`. Migration `0005_schema_catchup.sql` — the repository's documented "authoritative baseline" migration — attempts `alter table public.jobs drop column if exists recurrence_rule_id;` without first dropping that dependent 0003-era policy.

**Migration:** `0005_schema_catchup.sql`

**Error:** Postgres `2BP01` — "cannot drop column recurrence_rule_id of table jobs because other objects depend on it" (the dependent object being the `recurrence_rules_select_for_own_client_jobs` policy).

**Outcome:** Failure correctly detected and stopped immediately per the standing Failure Rule: no `CASCADE`, no manual patch, no retry, no continuing from the partially-applied schema. Migrations `0001`–`0003` had applied successfully immediately before this; the transaction for `0005` rolled back completely on error (confirmed via direct post-failure inspection of `information_schema`/`pg_policies` — zero partial state left behind by `0005` itself). Full failure report produced with root-cause analysis and three unexecuted remediation options, then execution stopped to await user decision. Full detail in `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md`.

---

## CHECKPOINT 3 REMEDIATION — Reset staging and use the authoritative fresh-bootstrap path

**Status:** PASSED
**Date:** 2026-07-13

**Outcome:** Per approved remediation, staging's public schema was reset to a clean empty state (all 10 known 0003-era policies dropped by name, then all 5 application tables dropped in dependency order — `jobs` first — with zero `CASCADE` usage and zero migration-file edits), then the authoritative fresh-bootstrap sequence was applied: migrations `0005` through `0027` (23 files), in exact order, explicitly excluding `0001`–`0003` as superseded historical files not part of the fresh-environment bootstrap path. All 23 migrations succeeded with zero failures.

**Security verification passed:** exactly 19 tables and 4 views (matching the expected schema exactly); exactly 23 functions with correct ownership — critically, `accept_account_invitation(uuid)` is owned by `service_role` (required for its internal `guard_invitation_status_write()` check to pass, since `SET ROLE` is disallowed inside `SECURITY DEFINER` bodies) while all 22 other functions are owned by `postgres`; exactly 7 triggers, matching expected; row-level security enabled on every table with zero exceptions; no dangerous unconditional-access policies found (the only two `null`-qualifier policies found are legitimate `INSERT`-only policies with proper `WITH CHECK` clauses); all 4 views correctly run with `security_invoker=true`; zero residual data across every application table; zero Auth users. The two stale, problem-specific 0001/0003-era policy names (`jobs_select_for_own_client`, `recurrence_rules_select_for_own_client_jobs`) were confirmed absent — `jobs_select_for_own_cleaner` is present but was verified to be created by `0005` itself as the sole, current, non-duplicated version, not a leftover from a skipped `0001`/`0003` run.

**Production untouched:** confirmed no browser tool call in this remediation ever navigated to, queried, or modified project ref `wqdyshgoxtkbreijbbha` at any point.

**Explicitly and honestly disclosed as still open, not fixed by this remediation:** the `0001 → 0003 → 0005` literal historical replay defect (Checkpoint 3's root cause, above) remains broken. This remediation proved the narrower, different claim that the documented fresh-bootstrap path (`0005 → 0027`) works — it did not repair migration history. See `KNOWN-ISSUES-REGISTER.md`, issue `STAGING-001`.

Full detail in `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md`.

---

## STAGING-002 RESOLUTION — Pre-Checkpoint-4 closure (not a numbered checkpoint)

**Status:** RESOLVED
**Date:** 2026-07-14

**Outcome:** Following a read-only Pre-Checkpoint-4 audit (2026-07-14) that reviewed all open staging-track defects before Checkpoint 4 began, the owner approved a narrow, controlled follow-up to close three specific items: STAGING-002 (technical fix), and two documentation-completeness findings from that audit (missing evidence reports; incomplete memory-file coverage). STAGING-001 was explicitly excluded and remains open and untouched.

STAGING-002 (inconsistent EXECUTE grants on the two BEFORE-trigger-only functions `enforce_single_role_profile` and `guard_invitation_status_write`) was resolved via one new additive migration, `0028_resolve_staging_002_trigger_function_execute_grants.sql`, applied to staging only. Full pre-change/post-change evidence and functional trigger-path verification (transaction-wrapped, rolled back, zero residual data) recorded in `KNOWN-ISSUES-REGISTER.md` under `STAGING-002`. Production was not touched. Checkpoint 4 was not started as part of this work.

---

## SEQUENCING EXCEPTION — Vercel project pre-configuration artifact (2026-07-14, not a numbered checkpoint)

**Status:** Limited exception, documented after the fact. Checkpoint 6 implementation itself remains NOT STARTED.

**Outcome:** Ahead of the normal checkpoint sequence (Checkpoint 4 had not yet started), the owner authorised a narrow, limited step: verify that no Vercel project existed, then create a new Vercel project (`cleaning-platform-staging`, team "Facility Pro Management Maintenance") from `Byahye800/cleaning-platform`, with environment-variable configuration and deployment explicitly withheld pending later approval. This was authorised only as a basic import/setup step, not as authorisation to begin Checkpoint 6 in full.

During that work, a stale browser coordinate caused the Deploy button to be selected unintentionally while the operator was attempting to prepare environment-variable fields, before any variable was entered. The resulting deployment (`dpl_EvxiYCSNQ2c6fB9L3jeLWBKuXMR5`, commit `4fe3415`) failed safely during Next.js's page-data-collection step (Stripe SDK missing `STRIPE_SECRET_KEY`) — dependency install, compilation, and TypeScript checking had all already succeeded. Zero routes were ever served, zero environment variables (including all Supabase values) were ever attached, no custom domain was connected, and no third-party integration was activated. Full incident detail, evidence, and recovery plan: `docs/memory/VERIFICATION-REGISTER.md`, "INCIDENT — Unauthorized Vercel deployment triggered during import."

**Precise status:** Checkpoint 6 pre-configuration artifact exists under a documented limited sequencing exception. Checkpoint 6 implementation remains not started. No further Checkpoint 6 work is authorised at this time. The normal checkpoint sequence resumes at Checkpoint 4.

---

## CHECKPOINT 4 — Staging Auth configuration

**Checkpoint 4 Part A — domain-independent Auth hardening: PASSED.**
**Checkpoint 4 Part B — URL-dependent Auth configuration: DEFERRED pending a working staging deployment.**
**Checkpoint 4 overall: PARTIALLY COMPLETE.**

**Date:** 2026-07-14

**Outcome (Part A):** Following the read-only Checkpoint 4 pre-implementation investigation, the owner approved exactly two staging Auth changes, both domain-independent (no dependency on Checkpoint 5 SMTP or Checkpoint 6 Vercel/URL): (1) "Allow new users to sign up" changed from ON to OFF, matching the repository's invitation-only design (zero code path in `src/` calls `.signUp(`); (2) minimum password length raised from 6 to 8 characters, aligning server-side enforcement with the client-side 8-character minimum already enforced in `reset-password/page.tsx`. Both changes were verified pre-change and post-change via fresh dashboard screenshots on the confirmed staging project (`jwdfzgibrijcyypibhjw`, "Cleaning Platform - Staging"); no adjacent setting (manual linking, anonymous sign-in, confirm email, provider states, OTP settings, leaked-password protection, password character-class rule) changed. No provider was found in an unexpected state — Email enabled; Phone, SAML 2.0, Web3 Wallet, and all OAuth providers confirmed Disabled with certainty via full page-text extraction, not just visual sampling.

**Outcome (Part B, deferred):** Site URL and Redirect URLs remain unset (`http://localhost:3000` default; empty allow-list) because no real, working staging deployment URL exists yet — Checkpoint 6 (Vercel) has not produced one. Custom SMTP and email-template configuration remain deferred pending Checkpoint 5 (Resend). No placeholder or the failed/unconfigured Vercel deployment URL was used as a stand-in, per explicit instruction.

**Confirmed unchanged after Part A:** Site URL, Redirect URLs, custom SMTP, email templates, CAPTCHA, secure password change, require-current-password, leaked-password protection, session settings, refresh-token configuration, rate limits — all independently re-verified via fresh dashboard pages after the two approved changes were saved.

**Production:** not touched at any point. Repository code and migrations: not touched.

**Evidence Summary:** Full pre-implementation investigation report (read-only) plus this implementation's own pre-change/save-safety/post-change verification, evidenced by dashboard screenshots and full page-text extraction. No commit references any secret value.

---

## CHECKPOINT 5 — Staging custom SMTP (Resend)

**Status:** Not started

## CHECKPOINT 6 — Vercel staging deployment

**Status:** Not started (implementation). A limited pre-configuration artifact — one Vercel project and one failed, unconfigured deployment attempt — exists under a documented sequencing exception; see "SEQUENCING EXCEPTION" above. This does not constitute Checkpoint 6 having started.

## CHECKPOINT 7 — Staging environment integrity audit

**Status:** Not started

## CHECKPOINT 8 — Stage 2.5 execution (post-staging live E2E testing)

**Status:** Not started — test plan must be re-presented and approved before any test execution begins, per standing instruction.
