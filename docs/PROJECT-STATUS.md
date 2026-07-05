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
- `activity_log` writes are now wired up in app code at three of the four action points -- job created/status changed (admin), invoice sent, invoice paid/failed -- all deployed and build-verified (2026-07-05). The fourth (cleaner-triggered status change) is a migration-only change to the `cleaner_update_job_status` SECURITY DEFINER function -- see `supabase/0012` below, **not yet applied to production**.
- Admin dashboard home page (`/admin`) rebuilt to the planned 3-zone layout, reading from `jobs`/`activity_log`: action items with direct action buttons, revenue snapshot + job pipeline side by side, recent activity feed. Deployed and build-verified (2026-07-05), but **not yet visually confirmed in a browser** -- no browser access in the dev environment this session. `roleHome.ts` now sends admins to `/admin` (was `/admin/clients`) on login.
- Migration `supabase/0012_cleaner_status_action_names.sql` supersedes `0011`: writes `job.started`/`job.completed` instead of a generic `job.status_changed`, so the activity feed never has to infer a job's historical status from its current value. Applying `0012` alone (after `0010`) is sufficient in a fresh environment -- it fully replaces `0011`'s function body. **Neither `0011` nor `0012` has been applied to production yet.**

## Known Gaps / Next Steps
- No cleaner accounts linked to real logins yet beyond the one test account — most cleaner-side usage still untested with additional real logins
- Schema drift catch-up (`0005_schema_catchup.sql`) is written but has not been run against any database yet — it's a documentation/no-op-on-live migration; first real test would be against a fresh environment
- No domain or HTTPS yet (blocked on domain purchase) — this also blocks registering a real Stripe Dashboard webhook endpoint, and means password reset links go out over plain HTTP (flagged as a hard dependency, not a nice-to-have)
- `stripe listen` generates a new signing secret on every restart of that process — `STRIPE_WEBHOOK_SECRET` and a `pm2 restart cleaning-platform --update-env` will need to be redone any time `stripe-listen` restarts, until a real Stripe Dashboard webhook endpoint exists post-domain.
- Twilio, Resend: not started
- `supabase/0012_cleaner_status_action_names.sql` (supersedes `0011`) needs to be applied to production and verified, then a manual test: cleaner marks a job `in_progress`→`completed` in `/cleaner/inbox`, confirm `job.started`/`job.completed` rows land with the cleaner's user id as `actor_id`
- Admin dashboard (`/admin`) needs a real browser check: all 3 zones against live data (including empty states) and the "Assign cleaner" action item's `?select=<id>` deep link into `/admin/jobs`
- Site redesign next step after that: none currently identified -- this was the last planned step (tokens → layouts → activity_log table → writes → dashboard)

## Operating Rules
- Hermes, Claude Code (on VPS), and Claude (chat/architect) may all touch this codebase — always git pull before starting work, always commit+push after finishing, to avoid drift.
- Owner (Bakar Yahye) reviews and approves all deploys.
