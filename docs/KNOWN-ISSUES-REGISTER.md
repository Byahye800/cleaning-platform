# KNOWN-ISSUES-REGISTER.md

**Purpose:** track known defects and open risks across the project that are not yet fixed, with enough detail that anyone picking this up cold can understand the issue without re-deriving it. Do not delete resolved issues — mark them Resolved with a date and pointer to the fix, keep them in this file for history.

---

## STAGING-001

**Title:** Historical Migration Replay Defect

**Description:** Running the repository's migration files in their full literal historical order — `0001`, `0002`, `0003`, then `0005` (there is no `0004`; confirmed via full git history) — against a clean, empty database fails partway through `0005`. The failure is deterministic and reproducible.

**Root Cause:** Migration `0003` (marked "SUPERSEDED — kept for historical record only, do not run in isolation" in its own header, but not excluded from a literal full-history replay) creates a policy, `recurrence_rules_select_for_own_client_jobs`, on `public.recurrence_rules`, whose `USING` expression references `jobs.recurrence_rule_id`. Migration `0005_schema_catchup.sql` — despite documenting itself as safe to run on a fresh database — attempts `alter table public.jobs drop column if exists recurrence_rule_id;` without first dropping that dependent 0003-era policy. Postgres correctly refuses with error `2BP01` ("cannot drop column ... because other objects depend on it").

**Affected Area:** Recovery / historical replay / disaster-recovery bootstrap of any fresh environment (new staging project, new production project in the event of full loss, any from-scratch database recreation).

**Production Impact:** None observed. Production was never bootstrapped via this literal replay path — it accumulated its current schema through incremental live application of migrations over time, not a fresh replay. This defect was only ever discovered because a fresh staging project's bootstrap attempt hit it directly.

**Staging Impact:** None after remediation. Staging was reset and successfully re-bootstrapped using the documented authoritative fresh-bootstrap path (`0005` through `0027`, explicitly skipping `0001`–`0003`), which is unaffected by this defect since it never runs `0003` at all. See `STAGING-CHECKPOINT-HISTORY.md`, "CHECKPOINT 3 REMEDIATION."

**Status:** Open

**Priority:** Medium — not currently blocking any approved work (the fresh-bootstrap path around it is proven and in active use for staging), but it means **the repository cannot currently be used to recreate an environment from a truly clean database via its full literal migration history**. This is a real disaster-recovery gap: if production were ever lost entirely and someone reached for "just replay all the migrations in order," it would fail at the same point staging did.

**Resolution:** Not yet approved. Two candidate directions were identified during the original Checkpoint 3 failure analysis (documented in `CHECKPOINT-3-STAGING-DATABASE-MIGRATION-AND-STRUCTURAL-VERIFICATION-REPORT.md`) but neither has been decided on or executed:
1. Edit `0005` to drop the dependent `0003`-era policy before dropping `jobs.recurrence_rule_id` (repairs the literal replay path itself).
2. Formally document `0005` as the actual bootstrap starting point for any fresh environment (i.e., codify what the Checkpoint 3 Remediation already did in practice) and mark `0001`–`0003` as excluded-from-replay rather than merely "superseded," e.g. by moving them to an `archive/` subfolder or renaming them out of the numeric sequence.

No migration file was edited as part of the Checkpoint 3 Remediation — per explicit instruction, that remediation intentionally worked around this defect rather than fixing it, to keep the fix decision separate and deliberate.

---

## STAGING-002

**Title:** Inconsistent EXECUTE grants on BEFORE-trigger-only functions

**Description:** Two BEFORE-trigger functions introduced in migration `0025` — `enforce_single_role_profile` and `guard_invitation_status_write` — retain Supabase's default `anon`/`authenticated` EXECUTE auto-grant. This is inconsistent with the pattern migration `0022` established for three *other* (AFTER-)trigger-only functions (`generate_payroll_event`, `notify_admins_on_new_issue`, `notify_on_new_issue_comment`), which explicitly revoke those same default grants.

**Root Cause:** `0025`'s migration file, as written, contains no explicit `revoke` statements for these two functions — this is not something introduced by any session's execution, it is exactly what the committed migration file produces when applied as-is.

**Affected Area:** Function privilege hygiene / least-privilege consistency across the schema.

**Production Impact:** None observed — production has not had this specific gap assessed directly, but the same migration file (`0025`) is presumably applied there too if account-invitation functionality is live in production.

**Staging Impact:** Confirmed present in staging as of the Checkpoint 3 Remediation verification (Section 11 of `CHECKPOINT-3-REMEDIATION-STAGING-DATABASE-BOOTSTRAP-AND-VERIFICATION-REPORT.md`). Not currently exploitable: Postgres unconditionally refuses to invoke any trigger function outside real trigger-firing context ("trigger functions can only be called as triggers"), regardless of the calling role's EXECUTE privilege — so this is a hygiene gap, not a live vulnerability.

**Status:** Open

**Priority:** Low — cosmetic/consistency issue, not exploitable given Postgres's own protection.

**Resolution:** Not yet approved. Would require a small new migration adding explicit `revoke all on function public.enforce_single_role_profile() from public, anon, authenticated;` (and the same for `guard_invitation_status_write`), matching `0022`'s pattern exactly.
