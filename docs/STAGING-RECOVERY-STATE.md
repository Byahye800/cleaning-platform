# STAGING-RECOVERY-STATE.md

> **Governance:** All engineering work, checkpoints, approvals, and completion criteria on this project are governed by [`docs/ENGINEERING-PROTOCOL.md`](ENGINEERING-PROTOCOL.md). Read it before beginning any work on this project.

**Purpose:** the single source of truth for "what state is the staging environment in right now," for recovery after a laptop crash, Claude context loss, VPS loss, or staging loss. **Update this file at the end of every session that changes staging state.**

**Last updated:** 2026-07-18 (Checkpoint 4, Checkpoint 5, and Checkpoint 6 Phase A complete; Checkpoint 6 Phase B in progress)

**No secrets, passwords, tokens, or connection strings are recorded in this file, by design. Retrieve those from Supabase's own dashboard/settings UI directly when needed.**

---

| Field | Value |
|---|---|
| Project Name | Cleaning Platform - Staging |
| Project Ref | `jwdfzgibrijcyypibhjw` |
| Organization | Byahye800's Org (Free plan) |
| Region | eu-central-1 (Central EU, Frankfurt) |
| Plan | Free |
| Compute | Nano (t3a.nano) — matches production's tier |
| Current Status | Healthy |
| Auth Users | 1 (one bootstrapped staging admin account, created 2026-07-15) |
| Operational Data | 0 (every application table confirmed empty) |
| Schema Status | Verified — 19 tables + 4 views, matching the full expected schema exactly |
| Security Status | Verified — RLS enabled on every table, correct function ownership (`accept_account_invitation` owned by `service_role`, all others by `postgres`), correct view `security_invoker` settings, no dangerous policies found |
| Migration State | Migrations `0005` through `0029` applied (25 files, including `0028` STAGING-002 fix and `0029` STAGING-003 fix). Migrations `0001`, `0002`, `0003` were deliberately **not** applied — treated as superseded historical files per the approved remediation. See `KNOWN-ISSUES-REGISTER.md` (`STAGING-001`) for why. |
| Auth Configuration | Configured — Site URL `https://cleaning-platform-staging.vercel.app`, Redirect URLs allow-list has exactly 2 entries (`/onboarding`, `/reset-password`), custom SMTP configured via Resend's free-tier test sender (`onboarding@resend.dev` — delivery restricted to the Resend account owner's own address pending domain verification, see `KNOWN-ISSUES-REGISTER.md`) |
| Vercel Linkage | `cleaning-platform-staging` (team "Facility Pro Management Maintenance"), live and reachable at `https://cleaning-platform-staging.vercel.app`; env var `NEXT_PUBLIC_APP_URL` set (Production scope only) alongside the Supabase vars |
| Production Linkage | None — fully isolated from `wqdyshgoxtkbreijbbha` ("Cleaning Platform - Dev"); no shared secrets, no shared data, no code path connects them |
| Next Approved Checkpoint | Resolve the Resend domain-verification blocker (`nic.eu.org` request pending approval), then Checkpoint 6 Phase B / Checkpoint 7 |

---

## How to recover / re-verify this state from scratch

1. Log into the Supabase dashboard, confirm the project switcher shows exactly two projects: "Cleaning Platform - Dev" (production) and "Cleaning Platform - Staging" (this one, ref `jwdfzgibrijcyypibhjw`).
2. Open the SQL Editor against the **staging** project only (double-check the ref in the URL before running anything) and re-run the verification queries documented in `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md` sections 5–15 to re-confirm table/view/function/trigger/RLS/policy/data state matches this document.
3. If staging schema is ever found to have drifted from this record, do **not** attempt to patch it live. Reset (as documented in that same report, Section 2 — drop all policies, then all tables, no `CASCADE`) and re-run migrations `0005` through `0027` in order, excluding `0001`–`0003`.
4. Never run `0001`, `0002`, or `0003` against this project in sequence with `0005+` — that exact sequence is the known-broken replay path (`STAGING-001`).

## If staging is lost entirely (project deleted, account lost, etc.)

1. Create a new Supabase project in the same org, same region (`eu-central-1`) if possible, Free plan, generate a fresh password via Supabase's own generator (never type/paste one manually) — repeat Checkpoint 1/2's process, documented in `CHECKPOINT-2-STAGING-SUPABASE-CREATION-REPORT.md`.
2. Apply migrations `0005` through `0027` in exact order against the fresh empty project, excluding `0001`–`0003`.
3. Re-run the full Section 5–15 verification battery from `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md` before considering it ready for Checkpoint 4.
4. Update this file with the new project ref once created.
