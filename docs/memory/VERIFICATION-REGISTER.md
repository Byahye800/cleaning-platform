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
| `src/app/api/admin/accounts/activate/route.ts` (Stage 2.4) | Pushed, live on `origin/main`. **Weakest evidence chain of the Stage 2.4 files**: its final commit was closed out in a *later* session based on a tail-end screenshot of previously-typed content, not a fresh top-to-bottom diff against a known-good local source (the local source didn't survive a context-loss event in between) | No live route call, no browser test, no fresh full-content re-diff |
| Attendance/Payroll chain (Phase 2/5) generally | Trigger logic confirmed correct against live schema via `pg_get_functiondef` | Zero rows in production `attendance` table — the chain has literally never fired on real, non-test data |

## Designed/implemented only, not statically re-verified after context loss (2026-07-13 event)

| Item | Status |
|---|---|
| `finalize/route.ts` identity-match edit | Approved, verbatim-preserved (ADR-007), not yet reapplied to the file |
| `src/app/onboarding/page.tsx` | Approved, structurally specified, **no verbatim source survives** — will be a rebuild, not a restore |
| `src/app/admin/cleaners/[id]/page.tsx` edit | Approved, structurally specified, no verbatim diff survives — rebuild |
| `src/app/admin/clients/[id]/page.tsx` edit | Approved, structurally specified, no verbatim diff survives — rebuild |

## Designed only, zero implementation

Phase 6 (Contracts/Schedules/Recurrence) and its full Shift Modal spec, Phase 0 Sites UI, cover/reassignment full queue, shift cancellation workflow, site instructions structured fields, refund handling, attachments/photo upload, internal-vs-public notes split, cleaner payroll/service-history/issues-history own-view pages.

## Explicitly flagged as unverified (not merely "not yet done" — actively uncertain)

- **Expired invite-link behavior (tick #10).** Governed by Supabase Auth's own settings; never actually tested with a real expired link.
- **Supabase invite-resend behavior when called twice for the same email** — flagged in `STAGE-2-ONBOARDING-LIFECYCLE-ASSESSMENT.md` §7 as needing real testing during implementation, not assumed. Status of that testing: not confirmed in any doc read.
- **Login rate-limiting/lockout** — believed to rely on Supabase Auth defaults, never explicitly confirmed.
- **VPS deployment currency** — commits on `origin/main` are not automatically live on the production VPS; deployment is a separate manual step (`git pull` + `npm run build` + `pm2 restart`). Multiple session-log entries note code committed but "not yet re-verified live." Do not assume `origin/main` state matches what a real user experiences without an explicit deployment check.

## Known-stale documentation (do not treat as current fact without cross-checking)

- `docs/PROJECT-STATUS.md` — last substantively updated 2026-07-07/12, does not reflect Stage 2.2c through 2.4. Use `CURRENT-STATE.md` instead for anything Stage 2-related; `PROJECT-STATUS.md` is still reasonably current for the Phase 0-7 operational feature set as of its last edit.
- `PHASE5-PAYROLL-AND-ACCESS-AUDIT.md` — described a client-visible "Payment" column that was later confirmed removed from live code; superseded by later audits.
- `DASHBOARD-ROTA-EXPANSION-SPEC.md` referenced as "the basis for" the Financials/Rota build, but multiple sessions independently confirmed this file never actually existed in the repo or its git history — the actual build proceeded from in-chat descriptions instead. Treat any reference to this file as historical color, not a real artifact to look for.
