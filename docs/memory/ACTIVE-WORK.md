# ACTIVE-WORK.md

**Purpose:** the single place that says "what exactly happens next." Keep this short and precise — it should always answer "if I have 10 minutes and no other context, what do I do" correctly. Superseded/completed items move to `SESSION-SUMMARIES/`, not deleted from history, but this file itself should only ever describe the *current* task.

## Current task

**None in progress.** Stage 2.4 closed out this session (2026-07-13) — all 7 files pushed and remote-verified. A documentation-only closeout pass then corrected a stale HEAD reference in this very file and brought `VERIFICATION-REGISTER.md`/the session summary in line with Stage 2.4's actual completion. **Do not hard-code a HEAD commit hash as a fact in this file** — every commit that touches a memory file necessarily moves `origin/main` HEAD past whatever hash was last written here. To find the true current HEAD, run `git log -1 --format=%H` against a fresh clone of `origin/main`. Awaiting the user's direction on what to pick up next: Stage 2.5 (full live E2E browser verification of the whole invite -> onboard -> activate flow, plus a *separately-approved* decision on the legacy manual-UUID form — see `VERIFICATION-REGISTER.md` for the scope evidence, which documents demotion to emergency/dev-only, not deletion) is the natural next step, but has not been started and is not assumed to be next without confirmation.

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

**Current task: none in progress.** Checkpoint 3 Remediation closed out 2026-07-13 — staging (`jwdfzgibrijcyypibhjw`) reset and successfully re-bootstrapped via migrations `0005` through `0027`, full structural/security verification passed. **Next approved task: Checkpoint 4 — staging Auth configuration — but it has NOT been started**, and requires explicit user go-ahead before beginning, per the standing checkpoint-gate discipline used throughout this track. Full detail: `docs/NEXT-SESSION-HANDOVER.md` (read this first if picking up staging work), `docs/STAGING-CHECKPOINT-HISTORY.md`, `docs/STAGING-RECOVERY-STATE.md`, `docs/KNOWN-ISSUES-REGISTER.md`.

**Do not** run migrations `0001`–`0003` against staging (or any fresh database) in sequence with `0005+` — that is the exact known-broken replay path (`STAGING-001`). **Do not** touch production as part of any staging work.
