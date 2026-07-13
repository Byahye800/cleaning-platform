# ACTIVE-WORK.md

**Purpose:** the single place that says "what exactly happens next." Keep this short and precise — it should always answer "if I have 10 minutes and no other context, what do I do" correctly. Superseded/completed items move to `SESSION-SUMMARIES/`, not deleted from history, but this file itself should only ever describe the *current* task.

## Current task

**None in progress.** Stage 2.4 closed out this session (2026-07-13) — all 7 files pushed and remote-verified, HEAD `e940da6` = `origin/main`. Awaiting the user's direction on what to pick up next: Stage 2.5 (retire the legacy manual-UUID admin insert path + full live E2E browser verification of the whole invite -> onboard -> activate flow) is the natural next step, but has not been started and is not assumed to be next without confirmation.

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

None currently blocking Stage 2.4 (closed). Before Stage 2.5 starts, the user should decide whether to prioritize the live E2E verification pass first, or move on to Phase 0/6/7 product work and treat Stage 2.5 as a later hardening pass — this is a sequencing choice, not a technical blocker.

## What NOT to do without explicit user approval

- Do not silently begin Stage 2.5, Phase 0/6/7, or any remaining tick-list item without the user confirming that's the next priority.
- Do not touch `proxy.ts`, `roleHome.ts`, `admin/login/page.tsx`, `reset-password/page.tsx`, migration 0027, or any invitation-state vocabulary — all were out of Stage 2.4 scope and remain unchanged.
- Do not claim browser/E2E verification has happened for any Stage 2.4 file — it hasn't. Keep evidence-tier language honest per `VERIFICATION-REGISTER.md`.
