# Project Status

## Current State (as of 2026-07-02)
Live app running on Hostinger VPS at http://187.124.112.253:3002, PM2-managed, deployed via git pull from GitHub (Byahye800/cleaning-platform). Claude Code installed on VPS for direct development. No domain/HTTPS yet — pending.

## What's Working
- Admin portal: login, Clients CRUD, Cleaners CRUD, Jobs CRUD — all confirmed working end-to-end with real data
- Cleaner-to-job assignment: admin can assign a cleaner to a job via dropdown
- Cleaner inbox page exists, schema-correct, filters by cleaner_id; client portal (home + read-only jobs view) exists — both confirmed working end-to-end with real test logins
- RLS policies confirmed present on: jobs, clients, cleaners, bookings, recurrence_rules, user_roles — live policy bodies audited and documented in `supabase/0005_schema_catchup.sql`
- Logout works on all three portals; login auto-redirects by role; in-app forgot-password flow (no more manual Supabase dashboard resets)
- `src/proxy.ts` gates all three portals on both "is logged in" and "is the right role for this portal"
- Stripe invoicing: admin can send an invoice for a completed, priced job; Stripe emails it directly; admin/client Jobs pages show payment status. Webhook for auto-updating payment status on paid/failed exists but isn't live-testable yet (see gaps below)

## Known Gaps / Next Steps
- No cleaner accounts linked to real logins yet beyond the one test account — most cleaner-side usage still untested with additional real logins
- Schema drift catch-up (`0005_schema_catchup.sql`) is written but has not been run against any database yet — it's a documentation/no-op-on-live migration; first real test would be against a fresh environment
- No domain or HTTPS yet (blocked on domain purchase) — this also blocks registering a real Stripe Dashboard webhook endpoint
- Stripe webhook (`/api/stripe/webhook`) needs `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` added to `.env.local` before it can be tested, even locally via `stripe listen --forward-to`
- Twilio, Resend: not started

## Operating Rules
- Hermes, Claude Code (on VPS), and Claude (chat/architect) may all touch this codebase — always git pull before starting work, always commit+push after finishing, to avoid drift.
- Owner (Bakar Yahye) reviews and approves all deploys.
