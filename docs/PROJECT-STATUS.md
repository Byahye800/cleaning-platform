# Project Status

## Current State (as of 2026-07-01)
Live app running on Hostinger VPS at http://187.124.112.253:3002, PM2-managed, deployed via git pull from GitHub (Byahye800/cleaning-platform). Claude Code installed on VPS for direct development. No domain/HTTPS yet — pending.

## What's Working
- Admin portal: login, Clients CRUD, Cleaners CRUD, Jobs CRUD — all confirmed working end-to-end with real data
- Cleaner-to-job assignment: admin can assign a cleaner to a job via dropdown
- Cleaner inbox page exists, schema-correct, filters by cleaner_id (untested with a real cleaner login yet)
- RLS policies confirmed present on: jobs, clients, cleaners, bookings, recurrence_rules, user_roles

## Known Gaps / Next Steps
- No cleaner accounts linked to real logins yet (user_id not set on any cleaner row) — cleaner-side view untested live
- No "forgot password" page/flow built in-app (currently requires manual Supabase dashboard reset)
- Schema drift: live Supabase schema has diverged from git migration files (0001-0004) — bookings table, expanded cleaners/jobs columns not represented in any migration. Needs a formal catch-up migration.
- No domain or HTTPS yet (blocked on domain purchase)
- Stripe, Twilio, Resend: not started. .env.local has no keys for any of them yet.
- Client portal: not built at all yet (only admin + cleaner portals exist)

## Operating Rules
- Hermes, Claude Code (on VPS), and Claude (chat/architect) may all touch this codebase — always git pull before starting work, always commit+push after finishing, to avoid drift.
- Owner (Bakar Yahye) reviews and approves all deploys.
