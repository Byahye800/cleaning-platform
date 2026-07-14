# VERIFICATION-REGISTER.md

Every significant claim in this project's history, with its actual evidence tier stated honestly. Tiers, low to high: **designed** (spec written, nothing built) → **implemented** (code exists) → **statically verified** (TypeScript/ESLint/build clean) → **DB verified** (live query against the database confirms behavior) → **route verified** (API tested directly, e.g. via curl or a direct call) → **browser verified** (a human or agent clicked through it in an actual browser) → **E2E verified** (full real user journey, real data, real cleanup) → **production verified** (confirmed live on the deployed VPS, not just `origin/main`).

**Rule: never state a higher tier than what was actually done. This file exists because this project has repeatedly found gaps between what was claimed and what was tested, and the fix each time was more rigor, not less.**

## Fully E2E/production verified

| Item | Evidence |
|---|---|
| Checklists (Phase 3) | Real template created, real cleaner toggle, persisted across reload, completed-job guard confirmed, cleaned up. `PHASE3-CHECKLISTS-REVIEW.md`, 2026-07-08 |
| Issues (Phase 4) | Real issue reported/replied/resolved by both roles, notification triggers confirmed firing, cleaned up. 2026-07-08 |
| Payroll/correction UI (Phase 5) | Real correction request approved, `payroll_events` row correctly recalculated, cleaned up. 2026-07-08 |
| Attendance check-in/check-out (Phase 2, Item 4) | Real cleaner browser session, real check-in/check-out, DB rows + activity_log + auto-generated payroll_events all confirmed, cleaned up. 2026-07-09 |
| Account-status enforcement (Fix 2 / ADR-003) | Real disable/re-enable cycle against the real cleaner's actual session, confirmed force-signout and restore. 2026-07-09 |
| Stripe invoicing + webhook | Real Stripe customer/invoice, real `stripe trigger` webhook delivery, idempotency and dedup confirmed. Multiple sessions |
| Migration 0027 (account invitation lifecycle) | Full battery re-run twice independently with fresh test data, including a genuine two-connection concurrency race and a real happy-path accept. `0027-FRESH-INDEPENDENT-VERIFICATION-REPORT.md` |
| Rota page core grid/edit flow | User-confirmed live in a real browser, save round-trip verified. 2026-07-06 |

## DB/route verified, not yet browser or E2E verified

| Item | What's confirmed | What's not |
|---|---|---|
| `src/app/api/auth/invitation/status/route.ts` (Stage 2.4) | Pushed, live on `origin/main`, statically verified pre-compaction (per prior-session claim, not independently re-run this session) | No live route call, no browser test |
| `src/app/api/onboarding/profile/route.ts` (Stage 2.4) | Same as above | Same as above |
| `src/app/api/admin/accounts/activate/route.ts` (Stage 2.4) | Pushed, live on `origin/main`. **Weakest evidence chain of the three earliest Stage 2.4 files**: its final commit was closed out in a *later* session based on a tail-end screenshot of previously-typed content, not a fresh top-to-bottom diff against a known-good local source (the local source didn't survive a context-loss event in between) | No live route call, no browser test, no fresh full-content re-diff |
| `src/app/api/auth/invitation/finalize/route.ts` identity-match hardening (Stage 2.4) | **Done.** Restored verbatim from ADR-007 against the confirmed-unchanged 88-line baseline, commit `7045ccb`. Remote-verified byte-identical via fresh clone. `tsc`/`eslint` clean on an independent fresh clone | No live route call, no browser test — the identity-mismatch branch (`INVITATION_IDENTITY_MISMATCH`) has never actually been triggered against a real session |
| `src/app/admin/cleaners/[id]/page.tsx` activation UI (Stage 2.4) | **Done.** Rebuilt (not restored — no verbatim source survived), commit `48b990d`. Remote-verified byte-identical via fresh clone. `tsc` clean; `eslint` shows only the 1 pre-existing `any` error, confirmed present in the unmodified baseline by a before/after swap test | No browser click of the "Activate account" button has ever occurred |
| `src/app/admin/clients/[id]/page.tsx` activation UI (Stage 2.4) | **Done.** Same pattern as above, commit `a75ca5b` | Same as above |
| `src/app/onboarding/page.tsx` (Stage 2.4) | **Done.** New file, full rebuild (no verbatim source survived the context-loss event), reconstructed from `STAGE-2-4-DESIGN-SPECIFICATION.md` against the actual, already-shipped contracts of the three routes above (re-read directly from `origin/main`, not assumed). Commit `e940da6`. Remote-verified byte-identical via fresh clone. `tsc`/`eslint` clean on the full tree, independent fresh clone | **Zero browser/E2E evidence of any kind.** No PKCE exchange, no real invite email, no click through any of its 11 UI states has ever happened. This is the single largest evidence gap in the whole Stage 2.4 delivery and is explicitly Stage 2.5's job, not assumed done here |
| Attendance/Payroll chain (Phase 2/5) generally | Trigger logic confirmed correct against live schema via `pg_get_functiondef` | Zero rows in production `attendance` table — the chain has literally never fired on real, non-test data |

## Stage 2.4 context-loss event — resolved

The four files below were listed here through 2026-07-13 as "designed/implemented only, not statically re-verified after context loss." All four are now complete, pushed, and remote-verified (see the table above) — this section is kept as a historical record of what the gap looked like mid-session, not as a current status.

| Item | Status as of the context-loss event (historical) | Resolution |
|---|---|---|
| `finalize/route.ts` identity-match edit | Approved, verbatim-preserved (ADR-007), not yet reapplied to the file | Reapplied verbatim, commit `7045ccb` |
| `src/app/onboarding/page.tsx` | Approved, structurally specified, no verbatim source survives — flagged as a rebuild, not a restore | Rebuilt, commit `e940da6` |
| `src/app/admin/cleaners/[id]/page.tsx` edit | Approved, structurally specified, no verbatim diff survives — rebuild | Rebuilt, commit `48b990d` |
| `src/app/admin/clients/[id]/page.tsx` edit | Approved, structurally specified, no verbatim diff survives — rebuild | Rebuilt, commit `a75ca5b` |

## Designed only, zero implementation

(Note: this section header was previously cut off mid-word — "zero implement" — in the committed file. Completed here during the 2026-07-14 Pre-Checkpoint-4 closure pass; no other content was added to or removed from this pre-existing section, which had no body beneath the header in the committed file.)

## Staging environment track (separate from the application-feature tiers above)

| Item | Evidence tier | Evidence |
|---|---|---|
| Checkpoint 1 (pre-creation readiness) | **DB verified** | Org/production-project/region/plan/password-method confirmed live before any creation action. `CHECKPOINT-1-READINESS-REPORT.md` |
| Checkpoint 2 (staging project creation) | **DB verified** | 15-item post-creation check passed live; one stale-UI-widget discrepancy honestly flagged and independently resolved via direct `count(*)` query. `CHECKPOINT-2-STAGING-SUPABASE-CREATION-REPORT.md` |
| Checkpoint 3 original attempt | **DB verified (failure)** | Literal `0001→0002→0003→0005` replay attempted live against staging, failed deterministically at `0005` with Postgres `2BP01`; zero partial state confirmed left behind. `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md` |
| Checkpoint 3 Remediation | **DB verified** | Fresh-bootstrap path (`0005`→`0027`) applied live, full structural/security battery passed (19 tables, 4 views, 23 functions, 7 triggers, RLS everywhere, correct ownership/`security_invoker`, zero data/users). `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md` |
| STAGING-001 (historical replay defect) | **DB verified (open, unresolved)** | Root cause independently re-confirmed against migration source (`0001`/`0003`/`0005`) during the 2026-07-14 Pre-Checkpoint-4 audit. Remains open by explicit instruction — no migration file edited. `KNOWN-ISSUES-REGISTER.md`, `STAGING-001` |
| STAGING-002 (trigger EXECUTE grants) | **DB verified, resolved** | Pre/post-change live evidence (signatures, owners, `md5` definition hashes, ACLs) plus a transaction-wrapped, rolled-back functional trigger-path test proving both triggers still enforce their rules correctly post-change. Migration `0028`, applied to staging only, 2026-07-14. `KNOWN-ISSUES-REGISTER.md`, `STAGING-002` |
| Finding A (missing checkpoint evidence reports) | **Resolved, remote-verified** | The four evidence reports cited by `STAGING-CHECKPOINT-HISTORY.md`/`KNOWN-ISSUES-REGISTER.md`/`STAGING-RECOVERY-STATE.md` were confirmed authentic (originals from this session's own working files, not reconstructed) and committed to `docs/`. Remote presence confirmed via fresh clone after push. |
| Finding B (memory/recovery coverage gap) | **Resolved** | `ARCHITECTURE-DECISIONS.md`, `RECOVERY-RUNBOOK.md`, `SECURITY-MODEL.md`, and this file (`VERIFICATION-REGISTER.md`) updated with staging-track content and cross-references, closing the gap identified in the 2026-07-14 audit. |
| Remote commit / sync verification (this closure task) | **Remote verified** | Both commits (STAGING-002 technical, documentation completion) confirmed present on `origin/main` via fresh clone; local HEAD confirmed equal to remote HEAD; working tree confirmed clean after each push. |

**Explicitly not claimed here:** no functional/behavioral testing of staging beyond the narrow STAGING-002 trigger-path test above has been performed. Checkpoint 4 was not started. STAGING-001 was not touched.

## INCIDENT — Unauthorized Vercel deployment triggered during import (2026-07-14)

**Status:** Recorded as an implementation error. Not concealed, minimized, or rewritten.

**What happened:** During initial Vercel import, a stale browser coordinate caused the Deploy button to be selected unintentionally before environment variables were configured. The operator stopped immediately. No secrets were entered or exposed. No production infrastructure was touched.

**Deployment ID:** `dpl_EvxiYCSNQ2c6fB9L3jeLWBKuXMR5`
**Commit:** `4fe3415` (branch `main`, "docs(staging): complete checkpoint evidence and recovery records (memory)")
**Final deployment status:** Error (build failed), duration 40s.
**Build result:** `npm install` completed (dependency installation succeeded). `next build` compiled successfully (13.1s) and TypeScript checking passed (7.6s). The build then failed during the "Collecting page data" step with `Error: Neither apiKey nor config.authenticator provided` — the Stripe Node SDK's own validation error, thrown because `STRIPE_SECRET_KEY` was not set (zero environment variables were attached to this deployment). This is a missing-configuration failure in a third-party SDK client, not a Supabase-specific failure and not a TypeScript/lint/compile defect.

**Confirmed impact:**
- One Vercel project (`cleaning-platform-staging`, team "Facility Pro Management Maintenance") was created.
- One deployment attempt was made and failed; zero routes were ever served (build did not complete).
- Two auto-assigned `.vercel.app` preview/production hostnames exist on the project (standard Vercel behavior for any deployment attempt, successful or not); neither served working content.
- The GitHub connection between this Vercel project and `Byahye800/cleaning-platform` was established (a prerequisite of the import itself, not a separate action).

**Confirmed non-impact:**
- Zero environment variables were attached to the project or deployment at any point (verified directly on the Environment Variables settings page: "No Environment Variables Added").
- No Supabase key (staging or production) was entered, displayed, copied, or logged at any point.
- No custom domain is connected (only the two auto-assigned `.vercel.app` hostnames exist; the primary one shows "No Deployment" since the build never completed).
- Production Supabase (`wqdyshgoxtkbreijbbha`), the live VPS, DNS, Stripe, Resend, Twilio, cron, and SMTP were not touched.
- Project configuration matches the intended, approved values exactly: repository `Byahye800/cleaning-platform`, branch `main`, framework Next.js (auto-detected), root directory `./`, all build-command/output-directory/install-command overrides left off/default.

**Recovery plan:** Leave the Vercel project and the failed deployment in place (no deletion, no cancellation — deployment already reached a final state and consumed no further resources). Resume only once environment variables are entered directly by the project owner from the verified staging Supabase project, followed by a fresh deployment.

**Prevention measure:** Before every browser write action, capture a fresh screenshot, visually identify the current target, and avoid coordinate reuse from previous page states.

**Sequencing note (separate from this incident):** this Vercel project-creation work falls under Checkpoint 6 ("Vercel staging deployment") per `STAGING-CHECKPOINT-HISTORY.md`, performed ahead of Checkpoint 4 ("Staging Auth configuration"), which remains not started. No formal sequencing exception was recorded in `STAGING-CHECKPOINT-HISTORY.md` prior to this work beginning; this entry constitutes that record after the fact, pending the owner's confirmation of the exception.

## Checkpoint 6 planning note — corrected environment-variable requirements (2026-07-14)

Recorded during a documentation-only reconciliation pass, based on real build evidence from the incident above (not repeated/re-tested here).

**Precise status:** Checkpoint 6 pre-configuration artifact exists under a documented limited sequencing exception (`docs/STAGING-CHECKPOINT-HISTORY.md`, "SEQUENCING EXCEPTION"). Checkpoint 6 implementation remains not started.

**Corrected finding:** the earlier assumption that only the three Supabase variables would be sufficient for a first successful Vercel build was disproved by the incident's build logs.

| Variable | Requirement level |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Required for core Supabase operation |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required for core Supabase operation |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for core Supabase operation |
| `STRIPE_SECRET_KEY` | **Proven required for the repository's current Vercel build path** — its absence caused the incident's build failure during page-data collection |
| `NEXT_PUBLIC_APP_URL` | Required only after a real staging URL exists, for correct invitation-link generation — not required for the build itself (confirmed: referenced only inside two Node-runtime API route handlers, evaluated at request time) |
| `STRIPE_WEBHOOK_SECRET` | Feature-specific / later |
| `INTERNAL_CRON_SECRET` | Feature-specific / later |
| `ALLOW_DEV_INVITE_LINK_DISPLAY` | Optional, default-off, safe to leave unset |
| `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Currently unreferenced by any code path (placeholders in `.env.example` only) |

**Standing requirement for Checkpoint 6:** a verified Stripe **test-mode** strategy (test-mode secret key, never a production Stripe secret) must be established before the next deployment attempt. No variable has been added to Vercel as part of this note or this reconciliation — planning documentation only.
