# CURRENT-STATE.md

> **Governance:** All engineering work, checkpoints, approvals, and completion criteria on this project are governed by [`docs/ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md). Read it before beginning any work on this project.

**Last updated:** 2026-07-13, this session. **Update this file at the end of every session that changes project state — this is the single most important file to keep accurate.**

## One-line position

Stage 2.4 (onboarding UI + admin-gated activation) is **complete and fully pushed**. All 7 approved files are on `origin/main`, remote-verified byte-identical against local, independently re-cloned and statically re-checked (TypeScript clean, ESLint clean except 2 pre-existing baseline errors, production build compiles/type-checks clean with one disclosed unrelated sandbox limitation). Real browser/E2E verification has not been performed — see `VERIFICATION-REGISTER.md`. Stage 2.5 (full live E2E, plus a *separately-approved* decision on the legacy manual-UUID form — repo docs describe demotion to emergency/dev-only, not deletion; see `VERIFICATION-REGISTER.md`) is the next open track.

## Verified repository state (re-confirm this at the start of every session — do not trust this number without re-checking)

**Important:** the exact HEAD hash below goes stale the moment any memory file (including this one) is next committed — that already happened once this session (Stage 2.4's application code finished at `e940da6`, then a memory-update commit `26002d5` moved HEAD past it, then a documentation-closeout commit moved it again). Treat every hash in this file as "true as of the commit that wrote it," never as a permanently-current fact. Always re-verify via a fresh clone: `git log -1 --format=%H` against `origin/main`.

```
Stage 2.4 application code finalized at: e940da6 (src/app/onboarding/page.tsx, the last of 7 files)
Memory-system update commit: 26002d5 (docs/memory/CURRENT-STATE.md, docs/memory/ACTIVE-WORK.md)
Documentation-closeout commit: <see latest SESSION-SUMMARIES entry or re-verify HEAD directly>
Branch: main (only branch used for real work; phase4-ui-review and
              phase5-ui-review exist remotely but are stale/unrelated)
Working tree: clean (confirmed via fresh clone at each of the checkpoints above)
```

Commits from the Stage 2.4 application-code push, oldest first:
```
19c66f5  Stage 2.4: add admin account activation route
7045ccb  Stage 2.4: harden finalize route with identity-match check
48b990d  Stage 2.4: add admin activation UI to cleaner detail page
a75ca5b  Stage 2.4: add admin activation UI to client detail page
e940da6  Stage 2.4: add onboarding page                              <- final app-code commit
26002d5  Update memory: CURRENT-STATE and ACTIVE-WORK reflect Stage 2.4 completion   <- later, memory-only
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

## Staging environment track (separate from the Stage 1–2.5 / Phase 0–7 tracks above and below — infrastructure, not application code)

A brand-new, fully isolated Supabase project (`jwdfzgibrijcyypibhjw`, "Cleaning Platform - Staging") was created and its schema successfully bootstrapped and verified as of 2026-07-13. Checkpoints 1, 2, and 3-Remediation are done; Checkpoint 3's *original* literal-replay attempt failed and was correctly stopped (not silently patched). **Checkpoint 4 (Auth) is COMPLETE as of 2026-07-15**: Part A (public signup disabled, minimum password length raised 6->8) PASSED and verified; Part B (Site URL, Redirect URLs, `NEXT_PUBLIC_APP_URL`) also PASSED and verified 2026-07-15 — configured against `https://cleaning-platform-staging.vercel.app`, redeployed (commit `f494e6b`, deployment `Bqdw3YzcZSJxcjYLphqN8m73jC1M`), build Ready in 52s, app loads with zero console errors. **As of 2026-07-15, the first staging admin account has been bootstrapped and live-verified end-to-end.** One Auth user + one linked `user_roles` admin row were created (password handled entirely by the owner, never seen/stored by the assistant); login, session persistence, logout, and route protection all passed against the live deployment. No unrelated database row was created by this work (broad post-test count re-verification across 9 tables). This unblocks admin login/session/route-protection testing under Checkpoint 6 Phase B, but cleaner and client account testing, invitation testing, and onboarding testing remain blocked pending further owner-approved account creation. Full detail: `docs/STAGING-CHECKPOINT-HISTORY.md`, "CHECKPOINT 6 PHASE B PREREQUISITE — First staging admin account bootstrap." **Checkpoint 5 (SMTP) is COMPLETE as of 2026-07-17**: staging Supabase's custom SMTP was configured via Resend's free-tier test sender (`onboarding@resend.dev`), verified working by sending a real test invitation to the owner's own inbox — but this sender can only deliver to the Resend account owner's own email until a domain is verified with Resend. **The admin-facing Invite UI was built and deployed to staging as of 2026-07-18** (`src/app/admin/_shared/InviteForm.tsx`, wired into both the Cleaners and Clients admin pages, commits `6cb6ecf`/`bc86d69`); a live invite test to a `+cleaner` alias failed as designed (`502 AUTH_DELIVERY_FAILED`, correctly logged and compensated) because `staging-mail.fmprocleaning.com` remains unverified with Resend (no DNS records ever added) — this is now the active blocker. Agreed next step: register a free subdomain via `nic.eu.org`, point it at Cloudflare's free DNS, and verify that domain with Resend instead of `fmprocleaning.com`/`mysecurecloudhost.com`. Checkpoints 7 and 8 (integrity audit, Stage 2.5 live E2E) are not started. Checkpoint 6 (Vercel staging deployment) implementation has also not started; a limited Vercel pre-configuration artifact (one project, one failed/unconfigured deployment attempt) exists under a documented sequencing exception dated 2026-07-14 — see `docs/STAGING-CHECKPOINT-HISTORY.md`, "SEQUENCING EXCEPTION," and `docs/memory/VERIFICATION-REGISTER.md`'s incident record. Full detail: `docs/STAGING-CHECKPOINT-HISTORY.md`, `docs/STAGING-RECOVERY-STATE.md`, `docs/NEXT-SESSION-HANDOVER.md`, `docs/KNOWN-ISSUES-REGISTER.md`.

As of 2026-07-14, a Pre-Checkpoint-4 read-only audit reviewed all open staging-track defects and two documentation-completeness gaps it discovered; the owner approved a narrow follow-up closing three of them: **`STAGING-002`** (inconsistent trigger-function EXECUTE grants) is now **resolved** via migration `0028`, live-verified on staging with a rolled-back functional test. **Finding A** (the four Checkpoint 1/2/3/3-Remediation evidence reports were never committed to the repo, only cited by name) is resolved — all four are now in `docs/`. **Finding B** (staging content was missing from `ARCHITECTURE-DECISIONS.md`, `RECOVERY-RUNBOOK.md`, `SECURITY-MODEL.md`, `VERIFICATION-REGISTER.md`) is resolved — all four now carry staging-track content. **`STAGING-001`** (the repository's literal migration-history replay path `0001→0003→0005` is broken on a fresh database) was explicitly excluded from this follow-up and **remains open, untouched** — a real governance defect, not yet fixed.

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
| Stage 2.5 | Not started — full live E2E browser verification is confi
