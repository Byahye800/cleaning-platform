# CLAUDE.md — Repo-Level Orientation for Any AI Agent

Read this file first, every session, before touching anything. It exists because this project has already survived one context-loss event mid-implementation (2026-07-13, Stage 2.4) and the standing rule going forward is: **conversation memory is never the primary source of truth. This file tree is.**

## What this project is

FM Pro Cleaning — a live, single-tenant cleaning/facilities-management SaaS for a real UK business. One admin, a handful of cleaners, one real client today. Real Stripe payments processed live. Running on a Hostinger VPS (PM2-managed), deployed via `git pull` + `npm run build` + `pm2 restart`. No domain/HTTPS yet.

Stack: Next.js, Supabase (Postgres + Auth + RLS + Storage), Stripe, `@supabase/supabase-js`. No Resend/Twilio yet (planned, not started — requires the user's own provider accounts). Repo: `github.com/Byahye800/cleaning-platform`, branch `main` only.

## Where to look for what

| Question | File |
|---|---|
| "Where are we right now, exactly?" | `docs/memory/CURRENT-STATE.md` |
| "What's the very next thing to do?" | `docs/memory/ACTIVE-WORK.md` |
| "Why was X built this way?" | `docs/memory/ARCHITECTURE-DECISIONS.md` |
| "What's the security model / what must never be trusted?" | `docs/memory/SECURITY-MODEL.md` |
| "I've just lost context / this is a fresh session, how do I recover?" | `docs/memory/RECOVERY-RUNBOOK.md` |
| "Was X actually tested, or just claimed?" | `docs/memory/VERIFICATION-REGISTER.md` |
| "What happened in past sessions, chronologically?" | `docs/memory/SESSION-SUMMARIES/` (one file per dated session) + `docs/SESSION-LOG.md` (the original, still-maintained running log) |
| "What's the day-to-day operational status doc?" | `docs/PROJECT-STATUS.md` (older, pre-Stage-2 focused — may be stale, cross-check against `CURRENT-STATE.md`) |

## Non-negotiable standing rules (full version: `docs/memory/SECURITY-MODEL.md` and the original `BUILD-STANDARDS.md`)

1. **Never trust the client.** Not user id, not role, not lifecycle status, not "I already did X" claims. Every mutation re-derives its own authority server-side.
2. **Fail closed.** Missing session, missing row, unknown status, DB error, unexpected null — all deny, never default-allow.
3. **RLS is not enough by itself.** This codebase has been burned by this twice (the safe-views `security_invoker` gap, and `SECURITY DEFINER` functions where `postgres`/`service_role` bypass RLS entirely by owner privilege). Every sensitive path needs an explicit in-code/in-function authorization check, not just a policy.
4. **Every migration is idempotent** (`if not exists` / `if exists` guards). Migration history in git must match what's actually live — if a migration file describes something never truly deployed, or was superseded, mark it superseded in place, don't leave it to mislead a future rebuild.
5. **Verification claims are tiered, and the tier must be stated honestly**: designed → implemented → statically verified (tsc/ESLint/build) → DB verified (live query) → route verified → browser verified → E2E verified → production verified. Never claim a higher tier than what was actually done. See `VERIFICATION-REGISTER.md`.
6. **Nothing is "safely stored" until it's confirmed on `origin/main`** with an independently re-fetched, re-diffed commit hash. Local existence, or "I typed it into the editor," is not storage.
7. **No local git push credentials exist in the standard sandbox.** GitHub work goes through the authenticated GitHub web editor via a browser-automation tool. This is slow and chunky (large files get split into ~100-line typed chunks) — budget for it, don't assume a fast local `git push` workflow is available. Always check `git clone`-ability and the current `origin/main` HEAD fresh at the start of any session that will touch the repo, per the recovery runbook.
8. **Secrets never in plain chat, logs, or terminal echo.** Redaction patterns must match the actual secret format in use (`sb_secret_...`, not generic `eyJ...` JWT assumptions).
9. **One coherent commit per logical stage where possible.** If the web editor forces multiple commits, say so before committing, keep them consecutive, no unrelated work interleaved.

## Three role model

Admin / Cleaner / Client. Admin-invite-only onboarding (no self-signup — deliberate, not a gap). Every portal is gated by `src/proxy.ts` on both "logged in" and "correct role for this portal," and (since Stage 2.1) on lifecycle status too.

## The three-dimensional account lifecycle (read this before touching anything invitation/onboarding/activation-related)

`cleaners`/`clients` rows carry three **independent** columns, never bundled into one status field:

- `status` (Access State): `restricted` → `active` → `suspended` / `disabled`
- `invitation_status`: `invite_pending` → `invite_accepted` / `invite_expired` / `invite_cancelled`
- `onboarding_status`: `not_started` → `in_progress` → `submitted` → `approved`

Full rationale and the migration that established this: `ARCHITECTURE-DECISIONS.md` ADR-004.

## Current position in one line

Stage 2.4 (onboarding UI + admin-gated activation), inside Stage 2 (account lifecycle rebuild), which blocks Phase 0/6/7 of the long-term product roadmap. See `CURRENT-STATE.md` for the exact file-by-file position.
