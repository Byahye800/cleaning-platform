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
