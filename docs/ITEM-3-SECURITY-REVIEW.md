# Item 3 — Least-Privilege & Hostile-User Security Review

Prepared as a direct continuation of the Phase 0-7 audit's top finding (view RLS bypass). Covers your "Build, Fix, Refine" priority items 1-3, and the expanded 10-point hostile-user review you sent mid-task. Every claim below is backed by a live test against the production Supabase project (`wqdyshgoxtkbreijbbha`) or a direct code read from the `main` branch — nothing here is inferred from file presence alone.

## Summary

Two real vulnerabilities were found and fixed. One broken (but not exploitable) production route was found and fixed. The role-escalation battery — the core of what you asked me to hunt for — came back clean across every table, every write path, and both non-admin identities. Two of the three code fixes are committed to GitHub but not yet live on the VPS (same deploy-access blocker flagged earlier).

| # | Fix | Status |
|---|---|---|
| 1 | View RLS bypass (`security_invoker`) | Live in DB, verified |
| 2 | Account status enforcement (`proxy.ts`) | Committed, **pending VPS deploy** |
| 3 | Trigger function EXECUTE grants (anon/authenticated) | Live in DB, verified |
| 4 | `send-invoice` route querying dropped columns | Committed, **pending VPS deploy** |

## Point 1 — Route Security

`proxy.ts` gates the three portal trees only: matcher is `['/admin/:path*', '/cleaner/:path*', '/client/:path*']`. It does **not** cover `/api/*`. The app has exactly two API routes (`/api/stripe/send-invoice`, `/api/stripe/webhook`) and no Next.js Server Actions (`'use server'` — grepped, zero matches), so this isn't an oversight with a large blast radius, but it does mean route-level gating and API-level gating are two separate systems that each need their own review, which is what points 1 and 3 below cover.

Within the matched trees, `proxy.ts` now (once deployed): rejects unauthenticated requests, looks up the real role from `user_roles`, rejects cleaners/clients whose `status` isn't `'active'` and force-signs-out the session (Fix 2), and redirects cross-portal access (e.g. a cleaner hitting `/admin/*`) to that role's home. This defeats direct-URL and stale-session attacks at the routing layer — a disabled cleaner with a still-valid cookie is signed out on their next navigation, not just hidden from menus.

**Caveat, not yet closed:** this is still code-in-git, not code-in-production. Until the VPS pulls it, a disabled account can still log in and everything below in this document that references "account status" is a design guarantee, not a currently-live one.

## Point 2 — UI Permission Leaks vs. Backend Enforcement

Checked whether any of the access patterns below rely on the UI simply not rendering a button, versus an actual backend/RLS check:

- Cross-role table reads: enforced by RLS (verified below, point 9), not UI.
- Cross-role table writes: enforced by RLS (verified below, point 9), not UI.
- Cleaner/client self-service status changes: **no UPDATE policy exists at all** for cleaners/clients on their own `cleaners`/`clients` rows in this respect — even a legitimate self-edit form, if one existed, would fail. Not a leak; if anything, stricter than necessary, but worth knowing if a self-service profile feature is ever built.
- Invoicing: previously enforced by nothing (the route was broken), now enforced by both RLS on `job_billing` (admin-only ALL policy) and an explicit role check in the route itself (Fix 4) — belt and suspenders, matching your instruction not to rely on RLS alone.

## Point 3 — RPC Security

Enumerated `has_function_privilege` for every SECURITY DEFINER / trigger function against `anon` and `authenticated`. Found three trigger-only functions (`generate_payroll_event`, `notify_admins_on_new_issue`, `notify_on_new_issue_comment`) still carrying Supabase's default EXECUTE grants to `anon`/`authenticated`, even though they can only ever run as triggers and can't be called directly. Revoked all three (migration `0022`), applied live, and re-verified the triggers still fire correctly (inserted a real temp issue, confirmed the notification row was created, cleaned up). Zero functional regression, one less thing an attacker could probe.

## Point 4 — View Security

This was the original audit's top finding: `cleaner_own_profile`, `jobs_cleaner_safe`, and `jobs_client_safe` were missing `security_invoker = true`, meaning they ran with the view owner's (`postgres`) privileges — and `postgres` has `rolbypassrls = true`. Any authenticated user querying those views directly bypassed RLS entirely. Fixed in migration `0021`, applied live, verified before/after with real cleaner and client identities against temporary cross-tenant test data (cleaned up immediately after).

## Point 5 — Notification Security

`notifications` RLS is a simple, correct pair of policies: `SELECT`/`UPDATE` both gated on `user_id = auth.uid()`. Tested this with **real, non-empty, cross-user data** rather than trusting the policy text alone: inserted one temp notification for the real cleaner and one for the real client, then queried as each identity in turn. Cleaner saw exactly their own row; client saw exactly their own row; neither saw the other's. Rows deleted immediately after, confirmed 0 remaining.

## Point 6 — File/Attachment Security (forward-looking)

No file/attachment upload feature exists in the codebase yet (confirmed against the Phase 0-7 audit and this session's route/schema inspection — no storage bucket policies, no upload routes). Nothing to test today. Recommendation for whenever this is built: store attachments in a private (non-public) Supabase Storage bucket, gate object access through signed URLs generated server-side after an explicit ownership/role check (never a public bucket + "unguessable filename" as the only protection), and make sure the same `security_invoker`/explicit-role-check discipline from points 3-4 above applies to any storage-adjacent RPC.

## Point 7 — Payroll Security

`cleaner_pay_rates`, `job_billing`, and `payroll_events` all returned 0 rows for both the cleaner and client identity across the full read battery — no non-admin role can see rate or billing data at all, let alone another user's. Write-side: a simulated cleaner attempting `UPDATE job_billing SET payment_status = 'paid'` affected 0 rows. Separately, this review found and fixed `send-invoice/route.ts`, which had been left querying `jobs.price`/`payment_status`/`stripe_invoice_id` after those columns were moved to `job_billing` during the earlier Stage 5 hardening pass — every invoicing call was failing outright. Not a live exposure (nobody could successfully call it), but a real operational break, now fixed with an explicit admin-role check added on top.

## Point 8 — Activity Log Security

`activity_log` returned 0 rows for both non-admin identities on read. On write, a simulated cleaner attempting to `DELETE FROM activity_log` (covering tracks) affected 0 rows — the audit trail cannot be tampered with by a non-admin under any of the paths tested.

## Point 9 — Role Escalation Paths

The core battery. Simulated the real cleaner and real client identities (via `request.jwt.claims`, not synthetic ones) and tried both directions in both media:

**Reads** — 12 tables × 2 identities, all correctly scoped:

| Table | Cleaner sees | Client sees |
|---|---|---|
| cleaners | own row only | 0 |
| cleaner_pay_rates | 0 | 0 |
| job_billing | 0 | 0 |
| payroll_events | 0 | 0 |
| activity_log | 0 | 0 |
| user_roles | own row only | own row only |
| attendance | 0 | 0 |
| issues | 0 | 0 |
| notifications | 0 (own, tested separately w/ real data above) | 0 (same) |
| sites | own site only | 0 |
| attendance_corrections | 0 | 0 |
| clients | 0 | own row only |

**Writes** — 6 hostile attempts, all blocked at 0 rows affected:

1. Cleaner self-escalating to admin via `user_roles` — blocked
2. Cleaner writing another cleaner's `status` — blocked
3. Cleaner tampering with `job_billing.payment_status` — blocked
4. Cleaner deleting `activity_log` rows — blocked
5. Client self-activating their own account — blocked (no write policy at all, see Point 2)
6. Client writing another client's job `status` — blocked

No read or write path let either identity see or touch anything outside their own scope.

## Point 10 — Overall

Treating this as the pentest you asked for rather than a checklist: the pattern from the original audit (RLS looked right but the view layer silently bypassed it) does not recur elsewhere. Every other access path checked — RPCs, direct table reads/writes, notifications, the two API routes — enforces authorization at the backend, not just in the UI. The one place backend enforcement was *missing* (`send-invoice`, relying on RLS alone with no explicit role check) has been closed. The one broken thing found (`send-invoice` querying dropped columns) was operational, not a security hole, and is also fixed. The two code fixes from this engagement (account status enforcement, send-invoice repair) are not yet live — that's the one open item before Item 3 can be called fully closed end-to-end.
