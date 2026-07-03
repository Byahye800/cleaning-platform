# Project Status

## Current State (as of 2026-07-03)
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

## Known Gaps / Next Steps
- No cleaner accounts linked to real logins yet beyond the one test account — most cleaner-side usage still untested with additional real logins
- Schema drift catch-up (`0005_schema_catchup.sql`) is written but has not been run against any database yet — it's a documentation/no-op-on-live migration; first real test would be against a fresh environment
- **`supabase/0008_cleaner_job_status_update.sql` (cleaner_update_job_status RPC) is written and pushed but not yet applied to production** — cleaners can't actually mark jobs in_progress/completed via `/cleaner/inbox` until this is run via the Supabase SQL Editor and verified
- No domain or HTTPS yet (blocked on domain purchase) — this also blocks registering a real Stripe Dashboard webhook endpoint, and means password reset links go out over plain HTTP (flagged as a hard dependency, not a nice-to-have)
- `stripe listen` generates a new signing secret on every restart of that process — `STRIPE_WEBHOOK_SECRET` and a `pm2 restart cleaning-platform --update-env` will need to be redone any time `stripe-listen` restarts, until a real Stripe Dashboard webhook endpoint exists post-domain.
- Unused `@supabase/auth-helpers-nextjs` dependency still needs removing (app uses `@supabase/ssr` everywhere now) — LOW priority, not yet done
- Twilio, Resend: not started
- Next planned work: full site redesign (white/black primary, navy accents, no gold) plus a "boss-level" admin dashboard home page (revenue snapshot, job pipeline, action items, activity feed) — spec pending from the user

## Operating Rules
- Hermes, Claude Code (on VPS), and Claude (chat/architect) may all touch this codebase — always git pull before starting work, always commit+push after finishing, to avoid drift.
- Owner (Bakar Yahye) reviews and approves all deploys.
