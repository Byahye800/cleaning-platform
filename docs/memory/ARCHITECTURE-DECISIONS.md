# ARCHITECTURE-DECISIONS.md

> **Governance:** All engineering work, checkpoints, approvals, and completion criteria on this project are governed by [`docs/ENGINEERING-PROTOCOL.md`](../ENGINEERING-PROTOCOL.md). Read it before beginning any work on this project.

Decision-record log, newest-relevant-context first within each entry. Each ADR states: the decision, why, and what it superseded (if anything). This is the file to check before "fixing" something that looks wrong but was actually a deliberate choice.

---

## ADR-001 — Column-split for sensitive data ("the deep fix", 2026-07-08)

**Decision:** split `cleaners.hourly_rate`, `jobs.price`/`payment_status`/`stripe_invoice_id`/`invoiced_at` out of tables cleaners/clients already had row-level SELECT on, into new admin-only tables `job_billing`/`cleaner_pay_rates`.
**Why:** Postgres RLS is row-level, not column-level. A cleaner/client with SELECT on their own row in `jobs`/`cleaners` could, via a crafted direct query, technically read another role's sensitive columns even though no UI ever exposed it. The UI filter was a courtesy, not a boundary.
**Status:** live, verified with real cleaner/client logins before and after. All 9 dependent application files migrated. Old columns dropped entirely (not just deprecated) after migration confirmed working.

## ADR-002 — Safe views need `security_invoker = true` (2026-07-09/10)

**Decision:** every view exposing cleaner/client-facing data must set `security_invoker = true` at creation.
**Why:** `cleaner_own_profile`/`jobs_cleaner_safe`/`jobs_client_safe` were created without it, ran as owner (`postgres`, `rolbypassrls = true`), and provided zero row-level protection to any authenticated user querying them directly. This was the single top finding of the Phase 0-7 audit. Fixed in migration `0021`.
**Superseded:** no prior explicit rule existed; this is the origin of the rule now stated in `SECURITY-MODEL.md`.

## ADR-003 — Account status enforcement moved into `proxy.ts` (2026-07-09 deploy)

**Decision:** `proxy.ts` checks `cleaners.status`/`clients.status` on every request to a gated route, not just role.
**Why:** a `disabled` account could previously still log in and use the app fully — the field existed, the admin UI to set it existed, but nothing read it at the routing layer.
**Status:** live, deployed to the VPS 2026-07-09, live-verified with a real disable/re-enable cycle against the real cleaner's session.

## ADR-004 — Three independent lifecycle dimensions, replacing Stage 1's single overloaded `status` column (Stage 2.1, superseding Stage 1)

**Decision:** `status` (Access State: `restricted`/`active`/`suspended`/`disabled`), `invitation_status` (`invite_pending`/`invite_accepted`/`invite_expired`/`invite_cancelled`), `onboarding_status` (`not_started`/`in_progress`/`submitted`/`approved`) — three genuinely independent columns, each updated by a distinct trigger/action, never bundled into one write except the one deliberate exception (ADR-005).
**Why:** Stage 1 had put invitation-progress, onboarding-progress, and access-control into one `status` field (`pending`, `pending_profile_complete`, `active`, `disabled`) — exactly the "don't overload a single status field with multiple responsibilities" anti-pattern this redesign explicitly rules out. `STAGE-2-ONBOARDING-LIFECYCLE-ASSESSMENT.md` is the full rationale document.
**Superseded:** Stage 1's `cleaners_status_check`/`clients_status_check` CHECK constraint (`pending`/`pending_profile_complete`/`active`/`disabled`) — replaced, not extended, by a new migration.
**No `invitations` table was created separately** — the `cleaners`/`clients` row created at invite time *is* the invitation record, avoiding a second place records could go out of sync. `activity_log` remains the append-only source of truth for who/when.

## ADR-005 — Admin activation is the one place two dimensions move together

**Decision:** `status = 'active'` and `onboarding_status = 'approved'` are set together, atomically, in exactly one place — the admin activation route — and nowhere else.
**Why:** explicit user final decision during Stage 2.4 design review: "submitted = user done, approved = admin reviewed, active = may enter platform... do not leave an activated account permanently showing onboarding_status='submitted'." Every other transition touches exactly one dimension.

## ADR-006 — `accept_account_invitation` ownership moved to `service_role` directly (Stage 2.2b correction, 2026-07-11)

**Decision:** `accept_account_invitation`'s owner is `service_role` (via a transient `grant create on schema public to service_role; alter function ... owner to service_role; revoke create ...`), not `postgres`.
**Why:** the original implementation tried `SET LOCAL ROLE service_role; ...; RESET ROLE;` inside the function body to satisfy a write-guard trigger requiring `current_user = 'service_role'`. Postgres unconditionally forbids `SET ROLE`/`SET LOCAL ROLE` inside any `SECURITY DEFINER` function body (error 42501) — a hard Postgres restriction, not a bug. A prior session had misread this exact error as a pass. `SECURITY DEFINER` functions execute with `current_user` set to their owner automatically with no `SET ROLE` needed, so transferring ownership was the only correct fix. Scoped narrowly — only this one function needed it, since it's the only one of the five that writes `invitation_status`; the other four remain owned by `postgres` because they need `auth.users` access that `service_role` doesn't have.

## ADR-007 — Identity-match hardening lives in the route, not the database (Stage 2.4 Amendment 1)

**Decision:** the `finalize_account_invitation` identity-match check is implemented in `src/app/api/auth/invitation/finalize/route.ts`, not as a change to migration `0027` or the function itself.
**Why:** exhaustive grep confirmed the finalize route is the *only* callable path passing untrusted, caller-supplied `(invitation_id, session_user_id)` into `finalize_account_invitation`. `reconcile_account_invitation`'s internal repair path derives the user id safely from `canonical_email` via a direct `auth.users` lookup, so it cannot mismatch by construction. Route-level hardening is therefore authoritative; no DB migration required.
**The exact approved insert** (for `finalize/route.ts`, between existing invitation-id parsing and the `finalize_account_invitation` RPC call):
```typescript
const supabaseAdmin = createSupabaseAdminClient();

// Identity-match hardening (Stage 2.4). Authoritative invitation lookup
// via the service-role client -- never trust anything the browser claims
// about the invitation. Compared against the server-verified session
// user's own email (never a client-supplied email). Both sides trimmed
// and lowercased before comparison.
const { data: invitationRow, error: invitationLookupError } = await supabaseAdmin
  .from('account_invitations')
  .select('canonical_email')
  .eq('id', invitationId)
  .maybeSingle();

if (invitationLookupError) {
  console.error(`[invitation/finalize] invitation lookup failed for ${invitationId}:`, invitationLookupError.message);
  return NextResponse.json(invitationError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), {
    status: invitationErrorStatus('INTERNAL_ERROR'),
  });
}

if (!invitationRow) {
  return NextResponse.json(invitationError('INVITATION_NOT_FOUND', 'Invitation not found.'), {
    status: invitationErrorStatus('INVITATION_NOT_FOUND'),
  });
}

const authoritativeEmail = typeof invitationRow.canonical_email === 'string' ? invitationRow.canonical_email.trim().toLowerCase() : '';
const sessionEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';

if (!authoritativeEmail || !sessionEmail || authoritativeEmail !== sessionEmail) {
  console.error(
    `[invitation/finalize] identity mismatch on invitation ${invitationId} for user ${user.id} -- finalize refused`
  );
  return NextResponse.json(
    { error: { code: 'INVITATION_IDENTITY_MISMATCH', message: "This invitation doesn't match your account." } },
    { status: 409 }
  );
}
```
Deliberately does not add a new error code to `src/lib/invitationErrors.ts`'s taxonomy (kept within the approved file scope) — the response is a raw inline object literal.
**Status:** approved, verbatim-preserved, not yet re-applied to the file after the 2026-07-13 context-loss event (see `RECOVERY-RUNBOOK.md`).

## ADR-008 — `jobs.status` and `jobs.shift_status` are deliberately separate fields, never merged (Phase 6 scoping)

**Decision:** `jobs.status` (existing, working, drives invoicing/checklists/attendance/payroll) stays exactly as-is. `shift_status` (dormant since its own migration, explicitly "nothing reads or writes shift_status yet") becomes the new assignment/approval lifecycle field once Phase 6 builds the Shift Modal.
**Why:** `jobs.status` is live-verified working across four already-shipped phases; touching it to add the fuller 11-state lifecycle would risk breaking all four. The two fields are cleanly separated by concern (`shift_status` = "has this shift been agreed to and by whom," `jobs.status` = "has the work started/finished") with an explicit mapping table in `PHASE-6-SITES-CANCELLATION-SCOPING.md`.
**Status:** designed, not yet implemented — Phase 6 has not started.

## ADR-009 — No RRULE/iCal recurrence engine for Phase 6

**Decision:** a plain `day_of_week + time + duration` per `schedules` row, wrapped in a `contracts` table, not a full recurrence-rule engine.
**Why:** covers this business's real scale/patterns without the complexity a full iCal-style engine would add — consistent with `BUILD-STANDARDS.md`'s "optimal means optimal for a small real business, not the most impressive-sounding approach" principle.
**Status:** designed, not implemented.

## ADR-010 — GitHub push workflow: authenticated web editor via browser automation, not local git credentials

**Decision:** all commits to `origin/main` go through the GitHub web CodeMirror editor via Chrome browser automation, chunking large files (~100 lines/chunk).
**Why:** no local `git push` credentials exist in the standard sandbox environment (confirmed repeatedly, session after session — `git push` fails with no stored credentials every time it's been tried).
**Consequence accepted by the user:** one file per commit is often forced by the editor's own UI flow, rather than one coherent multi-file commit per stage. Standing rule: disclose this upfront each time, keep the resulting commits consecutive with clear stage-specific messages, no unrelated work interleaved.

## ADR-011 — Staging is a fully isolated Supabase project, never a schema/branch within production (2026-07-13)

**Decision:** the staging environment is a separate Supabase project (`jwdfzgibrijcyypibhjw`, "Cleaning Platform - Staging"), not a separate schema, branch, or environment flag inside the production project (`wqdyshgoxtkbreijbbha`).
**Why:** guarantees no shared secrets, no shared data, and no code path that could accidentally point a staging action at production or vice versa — explicit standing instruction throughout the staging build-out track. Production must remain untouched by any staging work; this is enforced structurally (separate project, separate credentials) rather than by convention alone.
**Status:** live. Full detail: `docs/STAGING-RECOVERY-STATE.md`, `docs/STAGING-CHECKPOINT-HISTORY.md`.

## ADR-012 — Staging's proven fresh-bootstrap baseline is `0005` through the current latest migration, not `0001`

**Decision:** any fresh-environment bootstrap (staging, or a hypothetical from-scratch production rebuild) should apply migrations `0005` onward, explicitly skipping `0001`–`0003`.
**Why:** the literal full historical replay (`0001`→`0002`→`0003`→`0005`→...) is proven broken — deterministic Postgres `2BP01` failure at `0005`, root-caused to a `0003`-era policy depending on a column `0005` drops. This was discovered and proven via a real failed attempt (Checkpoint 3 original), not assumed. The `0005`→`0027`+ path was then proven to work end-to-end against a genuinely fresh database (Checkpoint 3 Remediation) — full structural and security verification passed.
**Important distinction — do not conflate these two claims:** "the fresh-bootstrap path works" is proven. "The full historical migration chain is healthy" is **not** proven and is in fact disproven — this is tracked as an open, unresolved governance defect (`STAGING-001`, `docs/KNOWN-ISSUES-REGISTER.md`), not fixed by this ADR or by the Checkpoint 3 Remediation. No migration file has been edited to address it; two candidate fix directions are documented but neither is approved.
**Status:** `0005`→`0027`+ path proven live on staging. `STAGING-001` remains open by explicit decision — do not edit `0001`, `0003`, or `0005` to "fix" this without separate approval.

