# CURRENT-STATE.md

**Last updated:** 2026-07-13, this session. **Update this file at the end of every session that changes project state — this is the single most important file to keep accurate.**

## One-line position

Stage 2.4 (onboarding UI + admin-gated activation) is in progress. 3 of 7 approved files are pushed and confirmed on `origin/main`. 4 remain, one of which needs a rebuild after a context-loss event this session (not a restore — see `RECOVERY-RUNBOOK.md`). Implementation is currently paused: the user has ordered a permanent memory system built before Stage 2.4 resumes.

## Verified repository state (re-confirm this at the start of every session — do not trust this number without re-checking)

```
origin/main HEAD as of 2026-07-13: 19c66f5
Branch: main (only branch used for real work; phase4-ui-review and
              phase5-ui-review exist remotely but are stale/unrelated)
Working tree: clean (confirmed via fresh clone this session)
```

Last 4 commits on `origin/main` as of this writing:
```
19c66f5  Stage 2.4: add admin account activation route
61aa63f  Stage 2.4: add onboarding profile route (save_profile + complete_onboarding)
f110f52  Stage 2.4: add invitation status route
367a941  Improve error messages for account issues   <- last pre-Stage-2.4 commit
```

## Stage 2.4 file-by-file state

| File | Remote state | Notes |
|---|---|---|
| `src/app/api/auth/invitation/status/route.ts` | Live at `f110f52`, 136 lines | Done |
| `src/app/api/onboarding/profile/route.ts` | Live at `61aa63f`, 207 lines | Done |
| `src/app/api/admin/accounts/activate/route.ts` | Live at `19c66f5`, 188 lines | Done. Weakest-evidence of the three pushed files — see `VERIFICATION-REGISTER.md` |
| `src/app/api/auth/invitation/finalize/route.ts` | Baseline only (88 lines, unedited) | Approved identity-match edit **not yet applied**. Edit text is fully verbatim-preserved — see `ARCHITECTURE-DECISIONS.md` ADR-007 and `RECOVERY-RUNBOOK.md` |
| `src/app/admin/cleaners/[id]/page.tsx` | Baseline only (176 lines, unedited since `53b7078`) | Approved activation-UI edit **not yet applied**, structural spec only, needs rebuild |
| `src/app/admin/clients/[id]/page.tsx` | Baseline only (158 lines, unedited since `53b7078`) | Same as above |
| `src/app/onboarding/page.tsx` | **Does not exist on remote** | New file, structural spec only, needs rebuild. Highest-priority, highest-surface-area file remaining |

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
| Stage 2.3 | Done — lifecycle-aware `proxy.ts` routing, approved with one caveat (no `/onboarding` route yet — exactly what 2.4 builds) |
| **Stage 2.4** | **In progress — see file table above** |
| Stage 2.5 | Not started — retire manual-UUID admin insert path, full live E2E browser verification |

## 20-item product tick list (audited 2026-07-10, updated with what's changed since — full detail in `VERIFICATION-REGISTER.md`)

Complete: #1, 2, 4, 9, 14 (fixed+deployed 2026-07-09), 17. In progress right now: #8, #13 (both = Stage 2.4). Built since audit: #11 (resend, shipped in Stage 2.2c). Unverified: #10. Still not implemented: #5, 6, 7, 12, 15, 16, 18 (partial), 19, 20.

## Non-phase production blockers (independent of any phase/stage above)

No domain/HTTPS. No refund handling. No Resend/Twilio accounts (user's own prerequisite, not buildable by an agent). No monitoring/alerting pass. Login rate-limiting not explicitly verified. Two orphaned backup tables (`cleaners_backup_pre_stage5c`, `jobs_backup_pre_stage5c`) safely locked down but not yet dropped.

## What changed most recently

This session: recovered from a mid-Stage-2.4 context-loss event (full detail in `RECOVERY-RUNBOOK.md` and the original `STAGE-2-4-RECOVERY-REPORT.md`), then the user ordered this permanent memory system built before implementation resumes. **Stage 2.4 is currently paused, not abandoned** — see `ACTIVE-WORK.md` for the exact resume point.
