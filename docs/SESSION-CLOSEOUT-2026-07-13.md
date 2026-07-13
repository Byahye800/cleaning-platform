# SESSION-CLOSEOUT-2026-07-13.md

**Purpose:** end-of-day closeout for the staging-environment build-out work done in this session. Documentation only — no further implementation happened after this file was written.

## Session Summary

### What was attempted

A multi-checkpoint build-out of an isolated staging environment for the cleaning-platform project, run against a brand-new Supabase project (`jwdfzgibrijcyypibhjw`, "Cleaning Platform - Staging"), kept fully separate from the production Supabase project (`wqdyshgoxtkbreijbbha`, "Cleaning Platform - Dev") and the production VPS app. The plan was Checkpoint 1 (readiness) → Checkpoint 2 (create the staging project) → Checkpoint 3 (apply and verify all 26 repository migrations) → Checkpoint 4 (staging Auth) → Checkpoint 5 (staging SMTP) → Checkpoint 6 (Vercel staging deploy) → Checkpoint 7 (integrity audit) → Checkpoint 8 (Stage 2.5 live E2E testing), each requiring an explicit stop-and-approve gate before the next began.

### What succeeded

- **Checkpoint 1 & 2**: staging project created cleanly (region `eu-central-1`, Free plan, freshly-generated never-viewed password), 15-item post-creation verification passed.
- **Checkpoint 3 Remediation**: after the original Checkpoint 3 attempt failed (see below), a reset-and-bootstrap remediation was approved and executed. Staging's public schema was reset to a clean empty state (all policies then all tables dropped explicitly, no `CASCADE`, no migration files edited), then migrations `0005` through `0027` (23 files) were applied in exact order — every one succeeded. A full structural and security verification battery (19 tables, 4 views, 23 functions, 7 triggers, RLS on every table, correct `security_invoker` on every view, correct function ownership — critically, `accept_account_invitation(uuid)` owned by `service_role` as required — no dangerous policies, zero residual data, zero Auth users) all passed. Production was never touched at any point. Full detail in `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md`.

### What failed

- **Original Checkpoint 3 attempt** (literal replay of the full migration history 0001 → 0002 → 0003 → 0005 → ... against the fresh staging database): failed at migration `0005_schema_catchup.sql` with Postgres error `2BP01` ("cannot drop column recurrence_rule_id of table jobs because other objects depend on it"). Root cause: migration `0003` creates a policy (`recurrence_rules_select_for_own_client_jobs`) whose expression depends on `jobs.recurrence_rule_id`; migration `0005` tries to drop that column without first dropping the dependent 0003-era policy. The failure was detected correctly and stopped immediately per the standing Failure Rule — no CASCADE, no manual patch, no retry — and reported in full before any remediation was proposed or approved. Full detail in `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md`.

### What was discovered

- **A genuine repository migration-history/bootstrap defect**: the literal `0001 → 0003 → 0005` replay path does not work against a fresh database, and never has been proven to (the original `0005_schema_catchup.sql` header itself only ever claimed to be safe against a fresh DB *or* the already-migrated live DB — that claim was never actually tested against a truly fresh DB until this engagement). This is now proven, reproducible, and root-caused.
- **The documented authoritative bootstrap path (0005 → 0027, treating 0001–0003 as superseded historical files) is proven to work** end-to-end against a fresh database, with full structural and security correctness, in an isolated environment. This is a materially different and narrower claim than "migration history is healthy" — see the Known Issues Register below.
- Two BEFORE-trigger functions from migration `0025` (`enforce_single_role_profile`, `guard_invitation_status_write`) retain Supabase's default `anon`/`authenticated` EXECUTE auto-grant, unlike the three AFTER-trigger functions `0022` explicitly revoked those grants from. Not currently exploitable (Postgres blocks direct invocation of any trigger function regardless of grant), but is a minor inconsistency worth closing in a future migration.

### What remains unresolved

- The `0001 → 0003 → 0005` historical replay defect itself is **not fixed** — per explicit instruction, no migration file was edited this session. It remains open as a repository governance issue (see `KNOWN-ISSUES-REGISTER.md`, `STAGING-001`).
- No functional/behavioral testing has been performed against staging — only structural/static verification. The invitation lifecycle, attendance, checklist, and issue RPCs have not been exercised live in staging.
- Checkpoint 4 (staging Auth configuration) has not been started.
- Checkpoints 5–8 (SMTP, Vercel, integrity audit, Stage 2.5 E2E) have not been started.
- The two BEFORE-trigger functions' inconsistent EXECUTE grants (above) are undecided — no fix has been proposed or approved.

---

See `STAGING-CHECKPOINT-HISTORY.md`, `STAGING-RECOVERY-STATE.md`, `KNOWN-ISSUES-REGISTER.md`, and `NEXT-SESSION-HANDOVER.md` for full detail on each of the above.
