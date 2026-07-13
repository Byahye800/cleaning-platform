# ACTIVE-WORK.md

**Purpose:** the single place that says "what exactly happens next." Keep this short and precise — it should always answer "if I have 10 minutes and no other context, what do I do" correctly. Superseded/completed items move to `SESSION-SUMMARIES/`, not deleted from history, but this file itself should only ever describe the *current* task.

## Current task

**Build the permanent project memory system** (this file tree), per explicit user instruction 2026-07-13: "Stop implementation... Do not continue Stage 2.4 until the memory system is complete." Status: in progress this session. See the project memory audit delivered alongside this file set for what's done vs. outstanding.

## Task immediately before this one (paused, will resume after memory system is complete and approved)

**Finish Stage 2.4** (onboarding UI + admin-gated activation). Exact resume point:

1. Reapply the `finalize/route.ts` identity-match edit — this one is a true restoration, not a rebuild. The exact insert block is preserved verbatim in `ARCHITECTURE-DECISIONS.md` ADR-007 and in the original recovery report. Apply it to the current baseline (88 lines, confirmed unchanged on `origin/main`).
2. Rebuild `src/app/onboarding/page.tsx`, `src/app/admin/cleaners/[id]/page.tsx`, `src/app/admin/clients/[id]/page.tsx` against the structural spec preserved in `STAGE-2-4-DESIGN-SPECIFICATION.md` (its full A–T design + Amendment 1) — these are functional rebuilds against approved requirements, not byte-restores of a lost draft. Say so plainly when reporting on them.
3. Run TypeScript, ESLint, and a production build on the complete rebuilt tree before touching GitHub at all.
4. Present the diffs for review before any GitHub action (standing rule).
5. Push the remaining 4 files via the GitHub web editor, following the standing multi-commit disclosure rule.
6. Fetch `origin/main`, diff every pushed file against the locally-verified version, confirm HEAD = `origin/main`, confirm clean status, report every commit hash.
7. Write the full A–Q Stage 2.4 completion report (structure specified in the original full-implementation-approval message — preserved in `SESSION-SUMMARIES/`).

## Open decisions blocking nothing right now, but flagged for the user

None currently blocking. (If a genuinely-necessary 8th file is discovered during the Stage 2.4 rebuild, the standing rule is STOP and report before expanding scope — do not silently add it.)

## What NOT to do without explicit user approval

- Do not resume Stage 2.4 code changes until the user confirms the memory system is complete and gives explicit go-ahead (their instruction was explicit: "Do not continue Stage 2.4 until the memory system is complete").
- Do not touch `proxy.ts`, `roleHome.ts`, `admin/login/page.tsx`, `reset-password/page.tsx`, migration 0027, or any invitation-state vocabulary — all explicitly out of Stage 2.4 scope.
- Do not begin Stage 2.5, Phase 0/6/7, or any of the remaining tick-list items until Stage 2.4 is fully closed and its completion report delivered.
