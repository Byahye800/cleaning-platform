# CHECKPOINT 3 — STAGING DATABASE MIGRATION AND STRUCTURAL VERIFICATION REPORT

**Date:** 2026-07-13
**Status: CHECKPOINT 3 FAILED**

Migration application stopped on the first failure, at migration 4 of 26 (`0005_schema_catchup.sql`), per the Failure Rule. No later migrations were attempted. No manual schema edits, retries, or modified SQL were used. This report covers what was verified before the stop and the failure itself in full detail; sections that depend on migrations never reached (functions, triggers, later tables, etc.) are marked not applicable rather than guessed at.

## 1. Pre-migration verification

| Item | Result |
|---|---|
| Repository HEAD | `5634a442b5c38215b590aa42eb66d155f88a3d5f` (fresh clone, `git log -1`) |
| origin/main HEAD | `5634a442b5c38215b590aa42eb66d155f88a3d5f` (fresh `git fetch origin main`) |
| Ahead/behind | 0 / 0 |
| Working tree | Clean (`git status --porcelain` empty) |
| Staging project ref | `jwdfzgibrijcyypibhjw`, confirmed in dashboard URL and breadcrumb throughout |
| Selected dashboard project | "Cleaning Platform - Staging" — confirmed in breadcrumb on every screen used this checkpoint |
| Production project ref | `wqdyshgoxtkbreijbbha` — never selected, never navigated to, at any point this checkpoint |
| Staging public schema before migrations | Empty — reconfirmed via Table Editor ("No tables or views") immediately before starting |
| Migration files present | All 26 approved filenames confirmed present in `supabase/` via fresh clone; no `0004` file exists in git history (`git log --all --full-history -- "supabase/0004*"` empty), consistent with Checkpoint 1's finding |

## 2. Auth-user discrepancy re-check

**This should have been run before migration 1 and was not — I went straight to applying migrations after confirming the project selection, which was a process error on my part.** I ran it as soon as I noticed the gap, immediately after the migration failure and before touching anything else. It is read-only and does not change the outcome of anything above.

Direct SQL against `auth.users` (role `postgres`, the same role used for all migration execution): `select count(*) from auth.users` → **0**.

- Rows visible in the Users table (dashboard): 0, consistent with the earlier "No users in your project" empty state.
- Queryable identities: none — the count query itself is the authoritative source and returned 0.
- Footer "estimated" count: not re-checked in the dashboard UI this time, since the direct SQL count is a stronger, more authoritative result than the UI widget it was inconsistent with.
- Conclusion: the earlier "Total: 10 users (estimated)" discrepancy is confirmed to be **UI-only** — a stale estimate widget, not real data. No Auth users exist. No user was created, deleted, or modified by this check.

## 3. Migration-by-migration execution log

Applied via Supabase SQL Editor (Supabase CLI was not used — this sandbox has no network access to `supabase.com` and no Supabase credentials, so CLI-based linking was not feasible without exposing secrets; this was already established in earlier checkpoints). Each migration was set into the editor individually and run with `Ctrl+Enter`, one at a time, in the exact approved order. No batching of multiple files into one execution.

| # | Filename | Result | Notes |
|---|---|---|---|
| 1 | `0001_init_phase1.sql` | **Success.** No rows returned. | Creates original Phase 1 tables (`user_roles`, `clients`, `cleaners`, `recurrence_rules`, `jobs`) per the file's own design. File is marked "SUPERSEDED... do not run in isolation" but was run because it is part of the approved sequential order and 0005's own header claims full-history replay (0001→0005) reconstructs live reality. |
| 2 | `0002_admin_role_seed.sql` | **Success.** No rows returned. | File is 100% commented-out (a manual bootstrap helper with no executable statements besides comments); genuinely a no-op. |
| 3 | `0003_rls_phase2_policies.sql` | **Success.** No rows returned. | Creates 10 RLS policies (2 per table) on `user_roles`, `clients`, `cleaners`, `jobs`, `recurrence_rules` — the original Phase-2 policy set, also marked "SUPERSEDED." |
| 4 | `0005_schema_catchup.sql` | **FAILED.** | See Section 4 (Failure detail) below. Supabase's SQL Editor first raised its own "Potential issue detected — this query includes destructive operations" confirmation dialog (expected, since the file contains `DROP COLUMN` statements described in its own header); I confirmed that dialog since the drops are intentional and documented in the migration's own comments, not something to reject. The query then executed and failed with a database error. |
| 5–26 | Not attempted | — | Per the Failure Rule: stopped immediately, did not continue to later migrations. |

## 4. Failure detail

**Migration filename:** `0005_schema_catchup.sql`

**Exact database error:**
```
ERROR: 2BP01: cannot drop column recurrence_rule_id of table jobs because other objects depend on it
DETAIL: policy recurrence_rules_select_for_own_client_jobs on table recurrence_rules depends on column recurrence_rule_id of table jobs
HINT: Use DROP ... CASCADE to drop the dependent objects too.
```

**Objects created before failure:** None from `0005` itself — the failure occurred partway through the script (at the `alter table public.jobs drop column if exists recurrence_rule_id;` statement), but Postgres/Supabase's SQL Editor executes a pasted script as a single implicit transaction, so nothing from `0005` persisted.

**Whether the transaction rolled back fully:** **Yes, confirmed directly**, not assumed:
- `select table_name from information_schema.tables where table_schema='public'` returns exactly 5 tables: `cleaners`, `clients`, `jobs`, `recurrence_rules`, `user_roles` — the `0001`/`0003` state only. `0005` would have created a 6th table, `bookings`, before ever reaching the failing statement; `bookings` does not exist, proving `0005` did not even get that far, or if it did, none of it survived the rollback.
- `jobs` table columns are still exactly the `0001` set: `id, client_id, recurrence_rule_id, location, location_lat, location_lng, geofence_radius_m, access_instructions, status, created_at` — including `recurrence_rule_id` itself, which `0005` tried to drop. Zero trace of `0005`'s intended changes.
- `pg_policies` on `public` still shows exactly the 10 `0003`-created policies, including `recurrence_rules_select_for_own_client_jobs` — the exact policy named in the error's `DETAIL` line.

**Current schema state:** Equivalent to a fresh database with only `0001`, `0002`, `0003` applied. `0005` made zero net changes.

**Likely cause:** This is a genuine gap in the migration file itself, not an execution mistake. `0003` (marked "superseded, historical only") creates a policy, `recurrence_rules_select_for_own_client_jobs`, that reads `jobs.recurrence_rule_id` — the original 0001/0003-era FK direction. `0005`'s own header comment explicitly acknowledges this tension ("the recurrence_rules policy below keys off jobs.recurrence_rule_id, which is the reverse of the live FK direction... see the 0005 cleanup note"), and `0005` does clean up the *column* on `jobs`, but it never drops the *old `0003` policy* that depends on that column first. `0005` only adds new, differently-named policies via guarded `DO` blocks ("if not exists") — it never removes `0003`'s policies. So when `0001`→`0003`→`0005` are replayed in sequence on a genuinely fresh database (as this checkpoint's approved order requires), the drop fails. On the real production database, this never surfaced because production was never bootstrapped by literally replaying `0001` and `0003` — its schema was reconciled to live reality through other means, per `0005`'s own "Source of truth... is a live information_schema.columns pull," not through executing `0001`/`0003` first.

In short: **`0005`'s own claim that "replaying the full history (0001 -> 0005) on a fresh database still reconstructs the real live schema" is not accurate as written** — it's missing an explicit drop of the superseded `0003` policy (and likely others; see below) before dropping the column that policy depends on.

**One related risk worth flagging even though we never reached it:** even if this specific drop had succeeded, `0005` also creates its own differently-named policies (e.g., `"Clients read own jobs"` alongside `0003`'s `"jobs_select_for_own_client"`) without ever dropping `0003`'s originals. Had the column drop not blocked execution, the end state would likely have carried duplicate/overlapping RLS policies on `jobs`, `clients`, `cleaners`, `recurrence_rules`, and `user_roles` — old `0003` policies coexisting with new `0005` policies, both active. That would need to be checked explicitly once this is resolved; it isn't automatically fixed by fixing the column-drop failure alone.

**Smallest safe remediation options (not executed, awaiting your decision):**

1. **Skip `0001` and `0003` when initializing a fresh environment**, and start migration replay directly at `0005`. This uses `0005`'s own documented capability ("(a) a fresh database — creates the full live schema from scratch"). This touches no migration file content at all — only changes which files are applied to a *new* environment. Lowest risk, no repository change.
2. **Add an explicit `drop policy if exists` for the superseded `0003` policies at the start of `0005`** (or in a new, additive migration file), so the documented 0001→0005 full-history replay actually works as claimed. This is a repository content change to a migration file and should get its own review — including checking for the duplicate-policy risk noted above — before being applied anywhere.
3. **Reset the staging schema entirely** (drop the 5 existing tables) and leave it empty pending a decision on option 1 or 2, rather than continuing from the current partial (`0001`+`0003`-only) state.

I have not taken any of these actions. The staging database currently sits at the `0001`+`0002`+`0003` state described above — harmless, since it contains zero data and zero users, but not matching the intended full schema either.

**Whether repository migration changes appear necessary:** Yes, based on the evidence above — but this is a finding to report, not a decision for me to make unilaterally, per the checkpoint's explicit "do not edit migration files" and "do not patch a failed migration silently" rules.

**Rollback options:** The staging project can either be left as-is (empty of data/users, only structurally at the 0001+0003 state) pending your decision, or fully reset to a clean empty schema (`drop table` the 5 existing tables, `drop policy` the 10 policies) before retrying under a corrected plan. Either is low-risk since this is an isolated staging project with zero data and zero users.

## 5–19. Post-migration structural verification (tables, constraints, indexes, functions, ownership, triggers, RLS, policy absence, privileges, views, row counts, migration history)

**Not applicable / not performed.** These all depend on migrations 5 through 27 (activity log, sites, attendance, checklists, issues, payroll events, the security-invoker view fix, the account-invitation lifecycle functions, and the critical `accept_account_invitation` ownership transfer to `service_role`) which were never reached. Running any of this verification now would only describe the harmless `0001`+`0003` partial state, not the target schema, so I did not fabricate placeholder findings for these sections — they simply don't exist yet in staging.

One partial exception, already covered above: the RLS/policy state that *does* exist (10 policies from `0003`, all 5 tables RLS-enabled) is documented in Sections 3–4 since it's directly relevant to the failure's root cause.

**Migration-history tracking:** the SQL Editor method used here does not create any formal migration-history record (no `supabase_migrations.schema_migrations` table or equivalent was populated) — this is expected for SQL Editor execution as opposed to `supabase db push` via the CLI, and matches what the checkpoint instructions anticipated ("If SQL Editor execution does not create a formal migration-history record, state this clearly"). Stated clearly here: **no tracked migration history exists in this project**, only the schema objects created by the 3 successful executions.

## 20. Production non-impact confirmation

| Check | Result |
|---|---|
| Production project ref remains `wqdyshgoxtkbreijbbha` | Confirmed — this checkpoint never navigated to or interacted with that project |
| Production was not selected during migration execution | Confirmed — breadcrumb showed "Cleaning Platform - Staging" throughout every screenshot this checkpoint |
| Production tables not modified | True by construction — no SQL was ever run against production |
| Production Auth not modified | True by construction |
| Production redirect URLs not modified | True by construction |
| Production SMTP not modified | True by construction |
| No production users created or deleted | True by construction — all Auth activity this checkpoint was a single read-only `count(*)` against staging's own empty `auth.users` |
| No production deployment occurred | True by construction — no Vercel/deployment action was taken |

## Deviations and unresolved risks

1. **Process deviation (mine):** the mandatory Auth-user re-check was supposed to happen before migration 1, and I ran it after the failure instead. Disclosed above rather than glossed over. It does not change any finding — staging Auth was, and remains, empty — but the sequencing itself was wrong and I'm flagging it as a process gap, not treating it as a footnote.
2. **Repository-level defect (not mine to fix):** `0005_schema_catchup.sql` does not actually support the "replay 0001→0005 on a fresh database" claim in its own header, because it never drops the `0003`-era policy that blocks its own column drop. See Section 4 for full detail and three remediation options.
3. **Related, not yet confirmed:** likely duplicate/overlapping RLS policies between `0003` and `0005` on five tables, which would only surface if the column-drop issue above is resolved by option 1 or 2 without also addressing this.
4. Everything from migration 5 onward (activity log through the full account-invitation lifecycle, including the critical `accept_account_invitation` → `service_role` ownership transfer) remains completely unverified in staging — not because of any new problem, but because we never got there.

## Rollback position

Staging currently holds zero data, zero Auth users, and only the harmless `0001`+`0003` schema fragment (5 tables, 10 policies, no functions, no triggers, no later tables). It can be left exactly as-is, or fully reset to empty, with no risk either way — nothing outside Supabase references this project, and no data of any consequence exists in it.

---

**CHECKPOINT 3 FAILED.**

Stopping here per the Failure Rule. Awaiting your decision on which remediation option (or another approach) to take before any further migration attempts, and awaiting explicit approval before Checkpoint 4.
