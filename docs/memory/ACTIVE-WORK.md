# ACTIVE-WORK.md

> **Governance:** All engineering work, checkpoints, approvals, and completion criteria on this project are governed by [`docs/ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md). Read it before beginning any work on this project.

**Purpose:** the single place that says "what exactly happens next." Keep this short and precise — it should always answer "if I have 10 minutes and no other context, what do I do" correctly. Superseded/completed items move to `SESSION-SUMMARIES/`, not deleted from history, but this file itself should only ever describe the *current* task.


## Latest status (2026-07-21) — FMPRO-OPERATIONS-HARDENING-001 programme opened; child cycle 1 (ADMIN-CLIENTS-001) LOCKED

**FMPRO-OPERATIONS-HARDENING-001** ("Production Remediation and Capability Completion Programme") is a new 8-child-cycle engineering programme, opened to remediate verified defects and capability gaps surfaced during the `NEEDS-ATTENTION-001` Operations Attention Engine design review, before that attention engine itself is built. Each child module gets its own full DESIGN-through-LOCK cycle, executed **sequentially** in this explicitly approved order:

1. **ADMIN-CLIENTS-001 — LOCKED (2026-07-21).** See below.
2. **ADMIN-INVITATIONS-001 — next up.** Build `/admin/invitations` (no such page currently exists). Repository pre-flight and DESIGN phase not yet started.
3. CLIENT-ISSUES-001
4. SCHEDULE-INTEGRITY-001
5. CHECKLIST-MANDATORY-001
6. OPERATIONAL-FAILURE-LOG-001
7. ACCOUNT-INTEGRITY-001
8. NEEDS-ATTENTION-001 (attention engine, built last — consumes the other completed capabilities rather than hardcoding workarounds for gaps it should surface)

**ADMIN-CLIENTS-001** — the Admin Clients create/edit form exposed an unsupported `status` value (`'pending'`, not accepted by the live `clients_status_check` constraint) and allowed arbitrary status changes outside the intended activation flow. Resolved via Option B (approved): the editable status control was removed entirely, matching the already-established cleaner pattern (`admin_create_cleaner`/`admin_update_cleaner`, migration `0031`) — new clients always insert `status='restricted'`; the edit path never sends `status`. Single file, `src/app/admin/clients/page.tsx`, commit `f045a6b`. Live E2E verified against staging including **direct SQL confirmation** (not just UI) of both the create and edit paths, plus test-data cleanup. **Reporting note for future cycles:** the `/admin/clients/[id]` activation page was confirmed to render correctly for the test client — this is page/render verification only; the restricted→active transition action itself was not exercised in this verification pass. Full detail: `docs/SESSION-LOG.md` (2026-07-21, FMPRO-OPERATIONS-HARDENING-001 entry), `docs/KNOWN-ISSUES-REGISTER.md` (`ADMIN-CLIENTS-001`).

**ADMIN-CLEANERS-001** and **ADMIN-CLEANERS-002** (admin create/edit-cleaner functionality, and the `hourly_rate` edit-mode over-validation fix) remain **LOCKED and CLOSED** — production baseline, unaffected by and unrelated to this programme. See `docs/KNOWN-ISSUES-REGISTER.md` (`ADMIN-CLEANERS-001`, `ADMIN-CLEANERS-002`).

**Separately logged, not built:** the admin dashboard's "Needs your attention" panel has no category for a cleaner/client record with missing mandatory profile information — logged as `NEEDS-ATTENTION-001` in `docs/KNOWN-ISSUES-REGISTER.md`, now programme child cycle 8, not to be built until cycles 1-7 are complete.

**Not yet done as part of any of these closeouts:** none of ADMIN-CLEANERS-001's, ADMIN-CLEANERS-002's, or ADMIN-CLIENTS-001's LOCK decisions have yet been cross-referenced into `STAGING-RECOVERY-STATE.md` or `CURRENT-STATE.md`'s phase-completion table — flagged here so a future session closes that gap rather than assuming it's done.

## Current task

**ADMIN-INVITATIONS-001 — repository pre-flight and DESIGN phase.** Per the programme's sequencing rule, no coding begins until DESIGN and the affected-surface map are reported and approved. Not yet started as of this entry.

## Task immediately before this one (now closed)

**Stage 2.4 — onboarding UI + admin-gated activation.** All 7 approved files done:
1. `finalize/route.ts` identity-match hardening — restored verbatim from ADR-007, commit `7045ccb`.
2. `admin/cleaners/[id]/page.tsx` activation UI — rebuilt, commit `48b990d`.
3. `admin/clients/[id]/page.tsx` activation UI — rebuilt, commit `a75ca5b`.
4. `onboarding/page.tsx` — new file, full rebuild from `STAGE-2-4-DESIGN-SPECIFICATION.md` against the three already-shipped API routes' actual response shapes, commit `e940da6`.
5. Full-tree static verification run on a fresh independent clone: `tsc` clean, `eslint` clean (2 pre-existing baseline errors only, confirmed not new), `next build` compiles/type-checks clean with one disclosed unrelated sandbox limitation (`/api/stripe/send-invoice`, missing Stripe key).
6. Every file remote-verified via fresh clone byte-diff against the locally-verified version before being marked done.

Evidence tier for all of Stage 2.4: **Statically verified** (tsc/ESLint/build) plus **DB-adjacent verified** for the three already-shipped routes (their underlying RPCs were live-tested in earlier stages). **No browser/E2E verification has been performed** for the onboarding page or the two activation UI buttons — nobody has clicked through the actual invite link -> PKCE exchange -> password set -> profile form -> accept -> admin-activate sequence in a real browser against a real Supabase project this engagement. That is explicitly Stage 2.5's job, not assumed done here.

## Open decisions blocking nothing right now, but flagged for the user

None currently blocking Stage 2.4 (closed). Before Stage 2.5 starts, the user should decide whether to prioritize the live E2E verification pass first, or move on to Phase 0/6/7 product work and treat Stage 2.5 as a later hardening pass — this is a scheduling/prioritization decision, not a technical blocker, and has not been made yet. (Note: this sentence was previously cut off mid-word in the committed file — completed here during the 2026-07-13 staging closeout pass, no content beyond finishing the sentence was added or changed.)

## Staging environment track (separate work stream, not part of the Stage 1–2.5 app-code track above)

**Current task: register the free `nic.eu.org` subdomain + Cloudflare DNS, verify it with Resend, reconfigure Supabase's SMTP sender to use it, then retry the cleaner and client invite tests.** Checkpoint 3 Remediation closed out 2026-07-13 — staging (`jwdfzgibrijcyypibhjw`) reset and successfully re-bootstrapped via migrations `0005` through `0027`, full structural/security verification passed. A 2026-07-14 Pre-Checkpoint-4 read-only audit then closed three follow-up items with explicit owner approval: `STAGING-002` resolved (migration `0028`, live-verified), and two documentation-completeness findings resolved (evidence reports committed to `docs/`; staging content added to `ARCHITECTURE-DECISIONS.md`/`RECOVERY-RUNBOOK.md`/`SECURITY-MODEL.md`/`VERIFICATION-REGISTER.md`). `STAGING-001` was explicitly excluded and remains open. **Checkpoint 4 — staging Auth configuration — is now COMPLETE (Part A 2026-07-14, Part B 2026-07-15).** Part A (domain-independent hardening: public signup disabled, minimum password length raised 6->8) and Part B (Site URL, Redirect URLs, `NEXT_PUBLIC_APP_URL`, against `https://cleaning-platform-staging.vercel.app`) are both done and verified. **Checkpoint 5 (SMTP) is also COMPLETE as of 2026-07-17** — staging Supabase's custom SMTP configured via Resend's free-tier test sender, verified working to the owner's own inbox. **The admin-facing Invite UI was built and deployed to staging as of 2026-07-18**, but a live invite test revealed a Resend domain-verification blocker: `staging-mail.fmprocleaning.com` is still unverified, so only the Resend account owner's own email can currently receive invites — the current task above is the agreed fix. Still requires explicit user go-ahead before resuming, per the standing checkpoint-gate discipline used throughout this track. Full detail: `docs/SESSION-LOG.md` (2026-07-17 and 2026-07-18 entries), `docs/NEXT-SESSION-HANDOVER.md`, `docs/STAGING-CHECKPOINT-HISTORY.md`, `docs/STAGING-RECOVERY-STATE.md`, `docs/KNOWN-ISSUES-REGISTER.md`.

The Vercel project (`cleaning-platform-staging`, team "Facility Pro Management Maintenance") had one accidental deployment attempt during initial setup that failed safely with zero environment variables attached, zero routes served, and no secrets exposed — see `docs/memory/VERIFICATION-REGISTER.md` (incident record) and `docs/STAGING-CHECKPOINT-HISTORY.md` ("SEQUENCING EXCEPTION" entry) for that historical incident. **Checkpoint 6 Phase A (a real, working deployment) is now COMPLETE** — live and reachable at `https://cleaning-platform-staging.vercel.app`, env var `NEXT_PUBLIC_APP_URL` configured, used as the target for Checkpoint 4 Part B and the staging admin bootstrap. **Checkpoint 6 Phase B (authenticated/access-control staging tests) is in progress.**

**2026-07-20 update — ONBOARDING-001 fixed, Checkpoint 1 (fresh cleaner invitation) in progress, paused at password step.** The onboarding "Finish" step was root-caused: `/api/onboarding/profile` selected role-mismatched columns (`42703 undefined_column`), blocking onboarding completion entirely. Fixed via a role-scoped `currentRowSelect` (mirrors `/api/auth/invitation/status`'s existing pattern), delivered to `main` as commit `85e51fa` via GitHub's web editor after a sandbox `git push` credential failure. A local, unpushed evidence commit `4e6d906` (same logic, whitespace-only diff) exists in a preserved temporary clone and must not be pushed, amended, or reconciled. Full delivery detail: `docs/SESSION-LOG.md` (2026-07-20 entry), `docs/KNOWN-ISSUES-REGISTER.md` (`ONBOARDING-001`, resolved). Checkpoint 1 — a controlled resume of the preserved fresh cleaner invitation (`1d279bf1-aa8f-4c2f-b0c9-661255d8b5a0`, `bakar.yahye+cleanerv2a@gmail.com`) to prove the fix works end-to-end through the deployed staging app — is in progress: pre-browser DB checks and browser-resume verification passed, and the flow is currently paused at the password-entry step awaiting the user to manually enter the password (the assistant does not enter passwords into any field). Once the user confirms the profile-details step is visible, the remaining FUNCTION TEST / VERIFY / SECURITY / EVIDENCE phases resume. Checkpoint 2 and all other work are explicitly out of scope until Checkpoint 1's report is delivered and approved.

**Do not** run migrations `0001`–`0003` against staging (or any fresh database) in sequence with `0005+` — that is the exact known-broken replay path (`STAGING-001`, still open — do not edit `0001`/`0003`/`0005` without separate approval). **Do not** touch production as part of any staging work.


**Closure update (2026-07-21):** Per explicit engineering instruction, ADMIN-CLEANERS-001 is recorded as **CLOSED**. Do not reopen this checkpoint. Any future work affecting the Admin Cleaners module must begin as a new engineering task and follow the full Production Engineering Confirmation Cycle from DESIGN through LOCK — not a direct edit or a reopening of this one.

**Closure update (2026-07-21, same day):** ADMIN-CLEANERS-002 (the `hourly_rate` edit-mode over-validation fix) is likewise recorded as **RESOLVED, LOCKED**. Same rule applies: any further change to `src/app/admin/cleaners/page.tsx` (or the rest of the Admin Cleaners module) requires a new engineering cycle, not a direct edit. `NEEDS-ATTENTION-001` (the dashboard "Needs your attention" gap) remains **Open**, logged in `docs/KNOWN-ISSUES-REGISTER.md`, and requires formal approval before any implementation work begins.

**Closure update (2026-07-21, same day):** Per explicit engineering instruction, ADMIN-CLIENTS-001 (the unsupported client-status-control fix, first child cycle of `FMPRO-OPERATIONS-HARDENING-001`) is recorded as **RESOLVED, LOCKED**. Same rule applies: any further change to `src/app/admin/clients/page.tsx` requires a new engineering cycle, not a direct edit. Programme proceeds to child cycle 2, `ADMIN-INVITATIONS-001`.
