# CURRENT-STATE.md

**Last updated:** 2026-07-13, this session. **Update this file at the end of every session that changes project state — this is the single most important file to keep accurate.**

## One-line position

Stage 2.4 (onboarding UI + admin-gated activation) is **complete and fully pushed**. All 7 approved files are on `origin/main`, remote-verified byte-identical against local, independently re-cloned and statically re-checked (TypeScript clean, ESLint clean except 2 pre-existing baseline errors, production build compiles/type-checks clean with one disclosed unrelated sandbox limitation). Real browser/E2E verification has not been performed — see `VERIFICATION-REGISTER.md`. Stage 2.5 (retire the legacy manual-UUID admin insert path, full live E2E) is the next open track.

## Verified repository state (re-confirm this at the start of every session — do not trust this number without re-checking)

```
origin/main HEAD as of 2026-07-13 (this session, end of Stage 2.4): e940da6
Branch: main (only branch used for real work; phase4-ui-review and
              phase5-ui-review exist remotely but are stale/unrelated)
Working tree: clean (confirmed via fresh clone this session)
```

Last 5 commits on `origin/main` as of this writing:
```
e940da6  Stage 2.4: add onboarding page
a75ca5b  Stage 2.4: add admin activation UI to client detail page
48b990d  Stage 2.4: add admin activation UI to cleaner detail page
7045ccb  Stage 2.4: harden finalize route with identity-match check
19c66f5  Stage 2.4: add admin account activation route
```

## Stage 2.4 file-by-file state — ALL 7 FILES DONE

| File | Remote state | Notes |
|---|---|---|
| `src/app/api/auth/invitation/status/route.ts` | Live at `f110f52`, 136 lines | Done |
| `src/app/api/onboarding/profile/route.ts` | Live at `61aa63f`, 207 lines | Done |
| `src/app/api/admin/accounts/activate/route.ts` | Live at `19c66f5`, 188 lines | Done |
| `src/app/api/auth/invitation/finalize/route.ts` | Live at `7045ccb`, 125 lines | Done — identity-match hardening applied, restored verbatim from ADR-007 |
| `src/app/admin/cleaners/[id]/page.tsx` | Live, 243 lines | Done — activation UI added, rebuilt (not restored — see `RECOVERY-RUNBOOK.md`) |
| `src/app/admin/clients/[id]/page.tsx` | Live at `a75ca5b`, 229 lines | Done — activation UI added, rebuilt |
| `src/app/onboarding/page.tsx` | Live at `e940da6`, 594 lines | Done — new file, full rebuild from `STAGE-2-4-DESIGN-SPECIFICATION.md` against the 3 already-shipped API routes' actual contracts |

**Full-tree independent verification (fresh clone, this session):** `tsc --noEmit` clean across the whole tree. `eslint` on all 7 Stage 2.4 files: 0 new issues, exactly the 2 pre-existing `Unexpected any` errors in the two admin detail pages (confirmed pre-existing against the unmodified baseline before this session's edits). `next build`: compiles successfully, TypeScript passes, fails collecting page data for the unrelated `/api/stripe/send-invoice` route due to a missing Stripe API key in this sandbox (no `.env.local`) — not a Stage 2.4 regression, disclosed honestly per the verification-tier rule.

## Phase 0–7 roadmap status (product feature roadmap — separate from the Stage 1–2.5 track below)

| Phase | Status |
|---|---|
| 0 — Sites | ~20% — schema/RLS correct, zero UI |
| 1 — Shifts (full lifecycle) | ~40% — basic 4-state works; full lifecycle is a dormant stub column |
| 2 — Attendance | ~80% code-complete, proven correct in one supervised real test, zero ongoing real usage |
| 3 — Checklists | 100% — live-verified end-to-end |
| 4 — Issues | 100% — live-verified end-to-end |
| 5 — Payroll events | ~80% — trigger logic correct and live-confirmed, never fired on real non-test data |
| 6 — Contracts, Schedules, Recurrence | 0% — not started, blocked behind Stage 2 |
| 7 — Client reporting | ~15% — portal exists as a flat job list only |

## Stage 1–2.5 track status (account lifecycle — currently active work, blocks Phase 0/6/7)

| Stage | Status |
|---|---|
| Stage 1 | Done — original status redefinition (superseded by Stage 2.1's 3-dimension model) |
| Stage 2.1 | Done — 3-dimension lifecycle schema migration |
| Stage 2.1A | Done — revised design doc |
| Stage 2.2a | Done — `account_invitations` table/trigger/grants |
| Stage 2.2b | Done — reserve/finalize/reconcile/mark_failed/accept functions (had one hard defect found and fixed mid-build — see ADR-006) |
| Migration 0027 | Done — closed all 6 mandatory Stage 2.2b audit findings, independently re-verified twice |
| Stage 2.2c | Done — invite/resend/cancel/reconcile/finalize/sweep API routes |
| Stage 2.3 | Done — lifecycle-aware `proxy.ts` routing, approved with one caveat (no `/onboarding` route yet — exactly what 2.4 built) |
| **Stage 2.4** | **Done — all 7 files pushed, remote-verified, statically clean. See `SESSION-SUMMARIES/2026-07-13-...md` and the Stage 2.4 completion report for full evidence-tier detail.** |
| Stage 2.5 | Not started — retire manual-UUID admin insert path, full live E2E browser verification. Next open track. |

## 20-item product tick list (audited 2026-07-10, updated with what's changed since — full detail in `VERIFICATION-REGISTER.md`)

Complete: #1, 2, 4, 9, 14 (fixed+deployed 2026-07-09), 17. Stage 2.4 (#8 onboarding, #13 admin approval) now statically/dev-complete — real E2E still open, tracked under Stage 2.5. Built since audit: #11 (resend, shipped in Stage 2.2c). Unverified: #10. Still not implemented: #5, 6, 7, 12, 15, 16, 18 (partial), 19, 20.

## Non-phase production blockers (independent of any phase/stage above)

No domain/HTTPS. No refund handling. No Resend/Twilio accounts (user's own prerequisite, not buildable by an agent). No monitoring/alerting pass. Login rate-limiting not explicitly verified. Two orphaned backup tables (`cleaners_backup_pre_stage5c`, `jobs_backup_pre_stage5c`) safely locked down but not yet dropped.

## What changed most recently

This session: recovered from a mid-Stage-2.4 context-loss event, built the permanent project memory system (this file tree), then completed Stage 2.4 — restored the finalize-route identity-match hardening verbatim from ADR-007, rebuilt both admin detail pages' activation UI, and rebuilt `onboarding/page.tsx` from the design spec against the three already-shipped API routes' real contracts. All 7 files pushed and remote-verified. No real browser/E2E test has been run — that remains Stage 2.5's job.
