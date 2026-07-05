# Project Status

## Current State (as of 2026-07-05)
Live app running on Hostinger VPS at http://187.124.112.253:3002, PM2-managed, deployed via git pull from GitHub (Byahye800/cleaning-platform). Claude Code installed on VPS for direct development. No domain/HTTPS yet — pending.

## What's Working
- Admin portal: login, Clients CRUD, Cleaners CRUD, Jobs CRUD — all confirmed working end-to-end with real data
- Cleaner-to-job assignment: admin can assign a cleaner to a job via dropdown
- Cleaner inbox page exists, schema-correct, filters by cleaner_id; client portal (home + read-only jobs view) exists — both confirmed working end-to-end with real test logins
- RLS policies confirmed present on: jobs, clients, cleaners, bookings, recurrence_rules, user_roles — live policy bodies audited and documented in `supabase/0005_schema_catchup.sql`
- Logout works on all three portals; login auto-redirects by role; in-app forgot-password flow (no more manual Supabase dashboard resets)
- `src/proxy.ts` gates all three portals on both "is logged in" and "is the right role for this portal"
- Stripe invoicing: admin can send an invoice for a completed, priced job; Stripe emails it directly; admin/client Jobs pages show payment status. **Confirmed fully working end-to-end** (real Stripe customer + invoice created, migration `0006` applied to production, tested via live network traffic). The auto-update-on-payment webhook is now also confirmed working (2026-07-03) — see below.
- Stripe webhook (`/api/stripe/webhook`, auto-updates `payment_status` on paid/failed): **confirmed working end-to-end (2026-07-03)**. `SUPABASE_SERVICE_ROLE_KEY` was rotated (old value had been exposed via a non-silent terminal prompt) and set correctly; `stripe trigger invoice.paid` forwarded through `stripe-listen` returned `200` for every event with no errors in the app log, confirming both signature verification and the DB update path work. Also hardened against duplicate delivery (`supabase/0007`, applied + verified) and now logs both DB-write failures and the "no matching job" drift case.
- `send-invoice` route is hardened against double-click/retry duplicate invoices: an atomic DB claim gates every Stripe call, plus idempotency keys on each mutating Stripe call.
- Admin Jobs "Save changes" (edit an existing job) — investigated a reported no-op bug; confirmed a testing artifact (row selection wasn't actually registering in the earlier failed attempts), not a real defect. No fix needed; edit flow works.
- Login page is a single shared, properly-branded sign-in for all three roles (no more "Admin Login" dev copy); the RLS Sanity Test debug tool and every stray "Admin login" link inside the cleaner/client portals have been removed.
- Migration history reconciled: `0001`/`0003` marked superseded, `0005` now actively cleans up `0001`'s never-live GPS-geofencing columns and status CHECK constraint so a from-scratch replay matches production instead of breaking on it.
- Site redesign in progress (white/black primary, navy `#1B2B4B` accent, no gold): `src/lib/theme.ts` design tokens created, and the admin/cleaner/client `BrandBar`/nav layouts are migrated to use them (visual unchanged). `activity_log` table (`supabase/0010`) applied and verified live -- immutable via RLS (SELECT/INSERT only for authenticated admins, no UPDATE/DELETE policy for any role).
- `activity_log` writes are wired up in app code at all four action points -- job created/status changed (admin), invoice sent, invoice paid/failed, and cleaner-triggered status change via `cleaner_update_job_status`. All four confirmed live.
- Admin dashboard home page (`/admin`) rebuilt to the planned 3-zone layout, reading from `jobs`/`activity_log`: action items with direct action buttons, revenue snapshot + job pipeline side by side, recent activity feed. **Visually confirmed live in a browser** (2026-07-05, via a Claude chat session with browser access, reported to this session -- not independently re-verified here): action-items empty state, revenue/pipeline numbers, and activity feed all checked out correctly against real data. `roleHome.ts` sends admins to `/admin` (was `/admin/clients`) on login.
- Migration `supabase/0012_cleaner_status_action_names.sql` (supersedes `0011`): writes `job.started`/`job.completed` instead of a generic `job.status_changed`. **Applied to production and verified live against `pg_proc`** (2026-07-05, via the same chat session, reported to this session -- not independently re-verified here).
- Fixed a real bug found during that browser check: admin sidebar nav links and the "Yahye Admin" header had no explicit text color, so a `prefers-color-scheme: dark` media query in `globals.css` flipped them to near-invisible (`#ededed` on a white background, ~1.06:1 contrast). Fixed with explicit `color.gray900`. Also added active-route highlighting to the sidebar in the same pass (previously no nav item ever indicated the current page) -- `admin/layout.tsx` is now a Client Component using `usePathname()`, navy background + inverse text on the active link.

## Known Gaps / Next Steps
- No cleaner accounts linked to real logins yet beyond the one test account — most cleaner-side usage still untested with additional real logins
- Schema drift catch-up (`0005_schema_catchup.sql`) is written but has not been run against any database yet — it's a documentation/no-op-on-live migration; first real test would be against a fresh environment
- No domain or HTTPS yet (blocked on domain purchase) — this also blocks registering a real Stripe Dashboard webhook endpoint, and means password reset links go out over plain HTTP (flagged as a hard dependency, not a nice-to-have)
- `stripe listen` generates a new signing secret on every restart of that process — `STRIPE_WEBHOOK_SECRET` and a `pm2 restart cleaning-platform --update-env` will need to be redone any time `stripe-listen` restarts, until a real Stripe Dashboard webhook endpoint exists post-domain.
- Twilio, Resend: not started
- Manual test still open: cleaner marks a job `in_progress`→`completed` in `/cleaner/inbox`, confirm `job.started`/`job.completed` rows land in `activity_log` with the cleaner's user id as `actor_id`
- The "Assign cleaner" action item's `?select=<id>` deep link into `/admin/jobs` hasn't been explicitly confirmed to pre-select the right row
- **`DASHBOARD-ROTA-EXPANSION-SPEC.md` does not exist in this repo, working tree, or git history** -- referenced by the user as the basis for the next phase (a Financials page with charts, a Rota/scheduling page) but not actually present on this machine. Needs to be added/pasted before that work can start here.
- Site redesign (tokens → layouts → activity_log table → writes → dashboard → nav contrast/active-state fix) is now complete. Next phase is the Financials + Rota expansion, pending the spec doc above.

## Operating Rules
- Hermes, Claude Code (on VPS), and Claude (chat/architect) may all touch this codebase — always git pull before starting work, always commit+push after finishing, to avoid drift.
- Owner (Bakar Yahye) reviews and approves all deploys.
