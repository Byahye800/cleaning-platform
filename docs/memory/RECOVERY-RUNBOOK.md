# RECOVERY-RUNBOOK.md

**Read this the moment you suspect you're a fresh session with no memory of prior work on this project — whether from a context-window compaction, a new chat, or a handoff to a different agent/tool entirely.** This procedure is proven: it's exactly what was executed successfully on 2026-07-13 after a mid-Stage-2.4 context-loss event. Full worked example: `SESSION-SUMMARIES/2026-07-13-context-loss-recovery.md` and the original `STAGE-2-4-RECOVERY-REPORT.md`.

## The core principle

**Never assume prior session claims are still true. Re-verify everything from the actual repository and live systems before acting on it — including this file tree itself, if enough time has passed.** A sandbox that held a working tree in a previous session is gone in a new one; only `origin/main` (the real GitHub remote) and the live Supabase database are authoritative. This file tree is the next-best source, kept current specifically so a full re-derivation from scratch isn't needed every time — but it is not a substitute for checking `origin/main` directly when anything security- or data-relevant is at stake.

## Step 1 — Read this file tree, in this order

1. `CLAUDE.md` (this repo's root orientation)
2. `docs/memory/CURRENT-STATE.md` (exact position)
3. `docs/memory/ACTIVE-WORK.md` (exact next action)
4. Skim `docs/memory/ARCHITECTURE-DECISIONS.md` and `docs/memory/SECURITY-MODEL.md` for anything relevant to the task at hand — don't re-derive decisions that are already recorded.
5. **If the task at hand involves the staging environment** (separate track, not part of the Stage 1-2.5 app-code track above): read `docs/NEXT-SESSION-HANDOVER.md` first — written for zero prior context — then `docs/STAGING-RECOVERY-STATE.md` (exact current-state snapshot, no secrets) and `docs/STAGING-CHECKPOINT-HISTORY.md` (full checkpoint ledger). `docs/KNOWN-ISSUES-REGISTER.md` lists open staging defects (`STAGING-001`, open — do not touch without separate approval) and resolved ones (`STAGING-002`, resolved 2026-07-14). **Approved staging bootstrap route:** migrations `0005` through the current latest, on a clean database. **Broken route, do not use:** the literal `0001`→`0002`→`0003`→`0005`→... historical replay (`STAGING-001`). **Production (`wqdyshgoxtkbreijbbha`) must never be touched as part of staging work** — the two projects are fully isolated by design (`ARCHITECTURE-DECISIONS.md`, ADR-011). As of 2026-07-18, staging is schema-complete and security-verified; Checkpoints 4 (Auth), 5 (SMTP), and 6 Phase A (Vercel deployment) are all complete. The current blocker is Resend domain verification (see `KNOWN-ISSUES-REGISTER.md`) — do not begin further staging work without the user's explicit go-ahead in the current session.

## Step 2 — Independently verify repository state (do not trust Step 1 alone for anything you're about to act on)

```bash
git clone https://github.com/Byahye800/cleaning-platform.git /tmp/verify-clone
cd /tmp/verify-clone
git log --oneline -20
git status
git branch -a
```

Compare `HEAD`/`origin/main` and the last several commit messages against what `CURRENT-STATE.md` claims. If they don't match, **`CURRENT-STATE.md` is stale — trust the live repo, then update `CURRENT-STATE.md` before doing anything else.**

## Step 3 — Check for in-flight work not yet reflected in any file

- Check any still-connected browser session for open tabs — a prior session may have left a GitHub editor mid-draft. (This is how the 2026-07-13 recovery found and safely completed one in-flight commit.)
- Check the local sandbox/outputs folder for anything not yet committed to the real repo — the sandbox itself is ephemeral across sessions, but files explicitly saved to a persistent working folder survive.
- Check `docs/SESSION-LOG.md` (the original running log, still maintained) for the most recent entry — it may be more current than this memory system if the memory system itself hasn't been updated in a while.

## Step 4 — Classify what's actually recoverable before touching any code

For any file that's supposed to have a pending edit, classify it as exactly one of:
- **Exists on `origin/main`, verified** — safe, done.
- **Baseline on `origin/main`, edit verbatim-preserved elsewhere** (e.g. in `ARCHITECTURE-DECISIONS.md`, as with ADR-007) — a true restoration is possible; do it exactly, don't paraphrase.
- **Baseline on `origin/main`, edit only structurally described** — a rebuild is possible but is a *new draft against approved requirements*, not a restore. Say so explicitly when reporting on it. Do not represent a rebuild as a byte-identical restoration.
- **Nothing recoverable** — say so plainly rather than guessing.

**Never silently reconstruct and push code as if it were the exact previously-verified version when it wasn't.** This is the single most important rule in this file. It applies with extra force to anything security-relevant (identity checks, admin activation, RLS-adjacent code).

## Step 5 — If genuinely blocked on a classification or scope question, stop and ask

Use a structured question to the user rather than guessing when: the recoverability of a file is ambiguous, the scope of a rebuild might exceed what was originally approved, or evidence about what actually happened before context loss is contradictory. This project's standing discipline (see `BUILD-STANDARDS.md` §4) is to surface decision points explicitly rather than proceed on assumption for anything consequential.

## Step 6 — Report before resuming

Before writing or pushing any code, produce a short recovery summary: what's confirmed live, what's recoverable and how, what needs rebuilding, and the exact next action. Get explicit approval to proceed if the prior instruction required it (check `ACTIVE-WORK.md` for any standing "do not continue until X" conditions).

## Known-good verification commands (copy-paste ready)

```bash
# Fresh clone and current state
git clone https://github.com/Byahye800/cleaning-platform.git /tmp/verify-clone && cd /tmp/verify-clone && git log --oneline -10

# Confirm no unauthorized migration has landed
ls supabase/*.sql | sort | tail -5

# Confirm onboarding_status vocabulary hasn't drifted
grep -n "onboarding_status" supabase/0024_lifecycle_dimensions.sql

# Check line counts of the Stage 2.4 file set against CURRENT-STATE.md's table
wc -l src/app/api/auth/invitation/status/route.ts src/app/api/onboarding/profile/route.ts src/app/api/admin/accounts/activate/route.ts src/app/api/auth/invitation/finalize/route.ts "src/app/admin/cleaners/[id]/page.tsx" "src/app/admin/clients/[id]/page.tsx" 2>/dev/null
```

## Staging environment sync/verification (separate from the app-code repo checks above)

To verify local/remote synchronization and current state for the **staging** track specifically, don't rely on the generic `git log`/`git status` commands above alone — follow `docs/STAGING-RECOVERY-STATE.md`'s own "How to recover / re-verify this state from scratch" section, which includes the exact live-database verification queries (table/view/function/trigger/RLS/policy/data counts) needed to confirm staging's Supabase project matches what's documented, not just that the repo's migration files are present.

## What this runbook does NOT cover

Live Supabase database inspection (requires project credentials not stored in this file tree, for obvious security reasons) and live VPS/deployment state (requires separate access). If either is needed for the task at hand and isn't available, say so explicitly rather than assuming production matches what's on `origin/main` — deployment is a separate step from commit, confirmed multiple times in `SESSION-SUMMARIES/` as a real gap (code committed but not yet `git pull`+rebuilt+`pm2 restart`ed on the VPS).
