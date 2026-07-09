# Scoping Doc — Phase 6 (Contracts/Schedules/Recurrence) + Sites Wiring + Cancellation/Cover + Shift Modal

Review and design only. No code, schema, or migrations applied. Built on the confirmed live state from the Phase 0-7 audit (Sections 4 and 12). Updated with your confirmed decisions and a full specification for the Shift Details/Assignment Modal.

## Why these are scoped together

`jobs` today conflates four things that should be separable — a physical location (Site), a recurring commercial arrangement (Contract), a single scheduled occurrence (Shift), and the operational record of that occurrence happening (the current `jobs` row). Sites and cancellation/cover both need a real Shift concept to attach to; Contracts/Schedules is what generates Shifts in the first place; the Shift Modal is the interface that makes the whole lifecycle usable. One redesign, not four.

## Confirmed decisions

1. **Cancellation:** cleaner-request + admin-approve. Cleaner flags "cannot attend"; only admin actually cancels. Matches the reasoning that cancellation has money/invoice/audit consequences a single cleaner shouldn't unilaterally trigger.
2. **Job generation:** manual "Generate upcoming jobs" admin button first. Automate later once trusted.
3. **Cover/reassignment:** both — the small notification+audit-log fix, and a full cover-request queue, built now together (not staged).
4. **Sites:** build `/admin/sites` and the site picker now, since Contracts depend on it.

## Current state (confirmed live, not assumed)

- **Sites:** table exists, correctly related to clients, RLS correct, one real row (backfilled). Zero application code reads or writes `site_id`. No structured site-instruction fields — only one generic, unused `access_notes` column.
- **Cancellation:** `jobs.cancelled_at` / `jobs.cancellation_reason` exist, read/written by nothing. `status = 'cancelled'` is free text with no reason captured.
- **Cover/reassignment:** admin changes `jobs.cleaner_id` via a plain dropdown in `/admin/rota`. No notification, no dedicated audit entry.
- **Contracts/Schedules/Recurrence:** zero code, zero schema. `recurrence_rules` is a dead table from the first migration — recommend dropping it rather than resurrecting it, and building the model below clean.
- **No modal/dialog pattern exists anywhere in this codebase today.** This is a new UI pattern being introduced, not a variant of something already built.
- **Cleaner has no calendar/rota view at all** — only the flat `/cleaner/inbox` table. **Client has no calendar view either** — only the flat `/client/jobs` list. Your spec asks for the modal on "cleaner rota/calendar" and "client rota/calendar" routes that don't exist yet. Flagging this explicitly since it changes the size of the work: this either means (a) build the modal to open from the existing inbox/jobs table rows as the MVP, with a real calendar view for cleaner/client as separate, later scope, or (b) build actual calendar UIs for all three roles now, as part of this same pass. Recommend (a) — the modal's value (approve/reject/accept/decline/cover-request workflow) doesn't depend on a calendar grid existing yet, and building three calendar UIs at once is a much larger undertaking than the modal itself. Your call, but I'd treat "cleaner/client calendar UI" as its own follow-on scope rather than bundling it silently into this.

## Proposed data model (design sketch, not applied)

```
contracts
  id, client_id, site_id, service_type, status ('active'|'paused'|'ended'),
  start_date, end_date (nullable = ongoing), created_at, created_by

contract_billing   (admin-only, same split precedent as job_billing/cleaner_pay_rates)
  id, contract_id, rate, billing_frequency

schedules
  id, contract_id, day_of_week, time, duration_minutes,
  effective_from, effective_until (nullable)

jobs  (existing table, additive columns)
  + contract_id (nullable — null for one-off jobs)
  + schedule_id (nullable — which recurrence rule produced this instance)
  + shift_status  (already exists, currently unused — becomes the new lifecycle field, see below)

sites  (existing table, additive columns)
  + access_code, alarm_code, lockbox_code, parking_notes
  + contact_name, contact_phone, contact_email

cover_requests
  id, job_id, cleaner_id, issue_type ('illness'|'emergency'|'transport'|'site_problem'|'other'),
  details, status ('open'|'resolved'|'cancelled'), created_at, resolved_by, resolved_at
```

Deliberately not proposing a full RRULE/iCal recurrence engine — a plain `day_of_week + time + duration` per schedule, wrapped in a `contracts` table, covers this scale's real patterns without that complexity.

### Job generation

Admin-triggered "Generate upcoming jobs" action (confirmed decision #2) — an idempotent RPC that creates `jobs` rows for the next N days from active contracts' schedules, skipping any that already exist. Automating it later (e.g. `pg_cron` calling the same function) is a small follow-on once trusted.

## The state machine — and how it fits the existing `jobs.status`

Your spec's states (`offered`, `accepted_pending_admin`, `confirmed`, `declined`, `cover_requested`, `cancelled`, `completed`) are, functionally, Phase 1's full shift lifecycle — the one `jobs.shift_status` was added for and explicitly left unwired (its own migration comment says exactly that: "nothing reads or writes shift_status yet"). This modal is what finally wires it up. Important constraint: `jobs.status` (the existing, working field — `pending`/`in_progress`/`completed`/`cancelled`) currently drives invoicing, checklists, and attendance, all live-verified working this engagement. **That field must not be touched or repurposed** — breaking it breaks three already-working phases. Instead:

- `shift_status` becomes the new field the modal reads/writes, tracking the assignment/approval lifecycle.
- `jobs.status` stays exactly as-is, continuing to drive invoicing/checklists/attendance/payroll unchanged.
- Mapping between them (so the two fields stay coherent rather than contradicting each other):

| shift_status | jobs.status |
|---|---|
| `offered`, `accepted_pending_admin`, `confirmed` | `pending` (unchanged until cleaner actually checks in) |
| — cleaner checks in (existing attendance flow) | flips to `in_progress`, exactly as it does today |
| — cleaner/admin marks complete | flips to `completed`, exactly as it does today |
| `cancelled` | `status` also set to `cancelled` via the same `cancel_job` RPC from this doc's Cancellation section |
| `declined` | `status` stays `pending`; job becomes unassigned again (cleaner_id cleared or reassignment prompted) |
| `cover_requested` | `status` unchanged (whatever it already was); the cover request is tracked separately in `cover_requests`, not by overloading `shift_status` alone |

This keeps the two fields cleanly separated by concern: `shift_status` = "has this shift been agreed to and by whom," `jobs.status` = "has the work itself started/finished," which is also exactly why the audit's original Phase 1 note deferred wiring `shift_status` up until there was a real feature that needed it — this modal is that feature.

## Cancellation workflow (tick #19) — confirmed: cleaner-request + admin-approve

- `cleaner_request_cancellation(job_id, reason)` — cleaner-only, own job, required `reason`, creates a request (could reuse `cover_requests` with `issue_type` covering it, or a small sibling table — leaning toward reusing `cover_requests` with a distinguishing field, since "I can't make it" and "I need cover" are the same underlying signal from the cleaner's side; admin decides whether the resolution is a reassignment or a full cancellation). Flagging this as worth a quick decision from you: one unified request table, or two separate concepts?
- `admin_cancel_shift(job_id, reason)` — admin-only. Sets `shift_status = 'cancelled'`, `jobs.status = 'cancelled'`, `cancelled_at = now()`, `cancellation_reason = reason`.
- Guard: cannot cancel a job already `completed` or `cancelled`.
- Guard: if already invoiced (`job_billing.payment_status not in ('unpaid','failed')`), block and surface that it needs manual handling — refund handling doesn't exist yet (audit finding, unchanged).
- Writes `activity_log` (`shift.cancelled`), currently missing entirely for this transition.

## Cover/reassignment (tick #18) — confirmed: small fix + full queue, together

- `admin_reassign_shift(job_id, new_cleaner_id)` — admin-only, updates `cleaner_id`, writes `activity_log` (`shift.reassigned`, old + new cleaner), inserts a `notifications` row for the new cleaner (same pattern already proven live for Issues).
- `/admin/cover-requests` — new admin page/section listing all open `cover_requests` centrally (not just visible inside each job's modal), so admin has one queue to work rather than hunting through individual shifts.
- Resolving a cover request = admin reassigns (above) or cancels (above); either action marks the `cover_requests` row `resolved`.

## Sites (Phase 0 wiring) — confirmed: build now

- `/admin/sites` — list/create/edit sites per client.
- Structured fields added per the model above (access/alarm/lockbox codes, parking, contact name/phone/email).
- Job creation gets a site picker (auto-fills address).
- **Sensitive fields (access/alarm/lockbox codes) visibility:** admin + the cleaner currently assigned to that site's job, nobody else. This must be enforced at the RLS/query layer, not just hidden in the UI — same lesson as this engagement's core finding (a UI filter is a courtesy, not a boundary). Any new view built for cleaner-facing site data must have `security_invoker = true` set from creation — non-negotiable given what the original audit found when that was missed.

---

## Shift Details / Assignment Modal — full specification

### Component architecture

One reusable `<ShiftModal>` component, role passed in (derived from the session, not a client-trusted prop), rendering different sub-sections and action buttons conditionally. Sub-components: `ShiftInfoSection`, `SiteInfoSection`, `OperationalDetailsSection`, `AssignmentStatusSection` (all with admin-only inline ✏️ edit), plus `ActivityHistoryPanel` (📋 Activity / 🕒 History, admin-only). Opens on click/tap; hover triggers a lightweight preview tooltip only, never the full modal — required for tablet/mobile where hover doesn't exist.

### Admin modal — full shift control centre

All fields listed in your spec (title, date, times, auto-calculated hours, site name/address/access notes/sensitive fields, role, assigned cleaner, contact name/phone/email, tasks, instructions, current status, acceptance status, cover status, attendance status, audit summary) — all backed by real columns already listed in the data model above, none invented for the UI alone.

Action buttons and the RPC each one calls:

| Button | RPC | Effect |
|---|---|---|
| Green — Approve | `admin_approve_shift(job_id)` | `accepted_pending_admin` → `confirmed`; notifies cleaner (SMS + email) |
| Red — Reject | `admin_reject_shift(job_id, reason)` | `accepted_pending_admin` → `declined`; notifies cleaner |
| Blue — Assign | `admin_assign_shift(job_id, cleaner_id)` | sets `cleaner_id`, `shift_status = 'offered'` |
| Purple — Reassign | `admin_reassign_shift(job_id, new_cleaner_id)` | as above (Cover/reassignment section) |
| Dark — Cancel Shift | `admin_cancel_shift(job_id, reason)` | as above (Cancellation section) |

Every one of these is a `SECURITY DEFINER` function with its own admin-role check inside the function body — the same pattern already proven for every cleaner-write path in this codebase, and the same pattern just applied to `send-invoice`. **No raw client-side table updates for any of these**, per your explicit requirement.

### Cleaner modal

Own shifts only (enforced by RLS + an explicit role/ownership check in every RPC, not just a client-side filter). Fields as specified. Buttons:

| Button | RPC | Visible when |
|---|---|---|
| Green — Accept | `cleaner_accept_shift(job_id)` | `shift_status = 'offered'` |
| Red — Decline | `cleaner_decline_shift(job_id)` | `shift_status = 'offered'` |
| Yellow — Report/Need Cover | `cleaner_request_cover(job_id, issue_type, details)` | `shift_status = 'confirmed'` only, per your requirement — never before confirmation |

Report/Need Cover creates a `cover_requests` row and notifies admin (dashboard alert + email + SMS). It does **not** cancel the shift or clear the cleaner's assignment — admin resolves it via reassign or cancel.

### Client modal

Client-safe fields only, per your list. Explicit exclusions enforced at the query/RLS layer (not just omitted from the component): cleaner pay, payroll data, internal admin notes, internal audit trail, sensitive access/security fields, other clients'/sites' data. This mirrors the exact split already proven correct in `jobs_client_safe` — same discipline, extended to the new site/contract fields.

### Idempotency / duplicate-action prevention

Every button's RPC follows the same atomic-claim pattern already proven in `send-invoice` (claim the state transition in the same statement that checks the precondition, e.g. `UPDATE jobs SET shift_status = 'confirmed' WHERE id = ... AND shift_status = 'accepted_pending_admin'`) — if zero rows are affected, the action has already happened and no duplicate notification fires. This is not a new pattern to invent; it's the one already used for the invoice double-click guard and the attendance duplicate-checkin guard.

### Notifications — new infrastructure dependency, flagging clearly

The audit confirmed **zero** email/SMS packages installed today — the only email capability in this app is Supabase Auth's own built-in email (used for password reset). SMS doesn't exist at all. Your spec requires both email and SMS for: shift approved, shift rejected, cover request raised (to admin), optional cleaner acknowledgement. This means:

- An email provider needs to be added (Resend is the natural fit — already referenced in code comments as the intended-but-not-yet-added channel).
- An SMS provider needs to be added (Twilio is the natural fit).
- **Both require you to create the actual provider accounts and hand over API keys** — creating third-party accounts isn't something I can do on your behalf. This is a real prerequisite, not a code task, and should be treated as a blocker to check off before the notification pieces of this can be built (the rest of the modal — approve/reject/assign/reassign/cancel/accept/decline/cover-request, all the RPCs, RLS, audit logging — can be built and tested independently of notifications actually sending, with the notification calls stubbed/logged until the provider accounts exist).

### Audit trail

Every action writes `activity_log` with the exact action strings you specified (`shift.offered`, `shift.accepted`, `shift.declined`, `shift.approved`, `shift.rejected`, `shift.assigned`, `shift.reassigned`, `shift.cancelled`, `shift.cover_requested`, plus the already-live `attendance.checked_in`/`attendance.checked_out`), each with `actor_id`, timestamp, `entity_id` (job id), and old/new value where relevant — same non-blocking insert pattern already proven in `cleaner_check_in`/`cleaner_check_out` (a logging failure warns but never blocks the actual action).

### Routing / security enforcement

| Route | Access |
|---|---|
| `/admin/rota` (existing) | admin only |
| Cleaner shift view (existing `/cleaner/inbox`, or a future dedicated calendar — see note above) | cleaner only, own shifts only |
| Client shift view (existing `/client/jobs`, or a future dedicated calendar) | client only, own sites only |

All already enforced today by `proxy.ts` role-gating (now also account-status-gated per Fix 2) at the route level, plus RLS/RPC-level ownership checks at the data level — the same two-layer discipline this whole engagement has been built on, extended to the new tables/RPCs rather than introducing a new pattern.

### Error/success UX

Every RPC returns a clear error on failed preconditions (wrong state, wrong role, already-actioned) rather than a generic failure — the modal surfaces that message directly rather than a raw exception. Successful actions update the modal's state immediately (optimistic or refetch-on-success, implementation detail for the build phase) without requiring a full page reload.

## What this doc is not

Still not a migration, not a file-by-file build plan, not an estimate. It's the confirmed shape of Phase 6 plus the full modal design, with every RPC mapped to the exact button/state that triggers it, and the two things you should resolve before implementation starts flagged explicitly below.

## Open questions remaining

1. Cleaner-side cancellation-request and cover-request — one unified request concept, or two separate ones? (Section: Cancellation workflow)
2. Cleaner/client calendar UI: build now as part of this pass, or treat as separate follow-on scope with the modal wired into the existing inbox/jobs list tables as the MVP? (recommended: latter)
3. Email/SMS provider accounts (Resend + Twilio suggested) — you'll need to create these and provide API keys before the notification pieces can go live; everything else in this spec can be built and verified without them.
