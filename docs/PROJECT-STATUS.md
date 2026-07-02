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
- Stripe invoicing: admin can send an invoice for a completed, priced job; Stripe emails it directly; admin/client Jobs pages show payment status. **Confirmed fully working end-to-end** (real Stripe customer + invoice created, migration `0006` applied to production, tested via live network traffic). The auto-update-on-payment webhook is separate and still blocked — see gaps below.
- Admin Jobs "Save changes" (edit an existing job) — investigated a reported no-op bug; confirmed a testing artifact (row selection wasn't actually registering in the earlier failed attempts), not a real defect. No fix needed; edit flow works.

## Known Gaps / Next Steps
- No cleaner accounts linked to real logins yet beyond the one test account — most cleaner-side usage still untested with additional real logins
- Schema drift catch-up (`0005_schema_catchup.sql`) is written but has not been run against any database yet — it's a documentation/no-op-on-live migration; first real test would be against a fresh environment
- No domain or HTTPS yet (blocked on domain purchase) — this also blocks registering a real Stripe Dashboard webhook endpoint
- **SECURITY — action needed before webhook work resumes**: a `SUPABASE_SERVICE_ROLE_KEY` value was pasted into a non-silent terminal prompt and must be treated as exposed. Revoke/rotate the current service role secret in Supabase Dashboard → Project Settings → API and generate a new one before the Stripe webhook is finished or trusted. Enter the replacement via a non-echoing method, not an inline shell command.
- Stripe webhook (`/api/stripe/webhook`, auto-updates `payment_status` on paid/failed): CLI-based local testing is now wired up (`stripe listen` running persistently under pm2 as `stripe-listen`, `STRIPE_WEBHOOK_SECRET` set), and the send/forward path is confirmed reaching the route — but every event currently 500s because `SUPABASE_SERVICE_ROLE_KEY` isn't validly set (see security item above; blocks this too). Also note: `stripe listen` generates a new signing secret on every restart of that process — `STRIPE_WEBHOOK_SECRET` and a `pm2 restart cleaning-platform --update-env` will need to be redone any time `stripe-listen` restarts, until a real Stripe Dashboard webhook endpoint exists post-domain.
- Twilio, Resend: not started

## Operating Rules
- Hermes, Claude Code (on VPS), and Claude (chat/architect) may all touch this codebase — always git pull before starting work, always commit+push after finishing, to avoid drift.
- Owner (Bakar Yahye) reviews and approves all deploys.
