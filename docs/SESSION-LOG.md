# Session Log

Running dated log of work sessions on this codebase. Newest entries at the top.

## 2026-07-02

- Built the client portal: `src/app/client/layout.tsx` (branded shell + nav), `src/app/client/page.tsx` (home redirect), and `src/app/client/jobs/page.tsx` (read-only jobs view scoped to the signed-in client). Created a real test client login and confirmed the flow end-to-end: client logs in → sees only their own jobs in `/client/jobs`. First fully verified end-to-end client flow in the app.
- Added a shared `src/components/LogoutButton.tsx` and wired it into all three portal layouts (admin, cleaner, client).
- Fixed the admin logout button rendering as an invisible/blank box: it was missing `color: 'inherit'`, so the unstyled `<button>` fell back to native UA button text color instead of inheriting the page's text color like the `<Link>` nav items do.
- Added `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) for server-side, session-based route protection across `/admin`, `/cleaner`, and `/client` — unauthenticated requests are redirected to `/admin/login` before any page renders. Uses `supabase.auth.getUser()` (revalidates against Supabase Auth) rather than trusting a session cookie directly.
- Audited live RLS policies via `pg_policies` (per the new schema-verification rule below — did not trust the `0003_rls_phase2_policies.sql` migration file as current). Confirmed every SELECT policy requires `auth.uid()` to match an owner or the admin role, with no anonymous or cross-role access on any table except the intentionally public booking insert. The missing route protection above was therefore a UX gap, not a data leak.
- Added `CLAUDE.md` with standing operating rules for all future sessions: never trust `supabase/` migration files as the live schema source of truth, build-before-commit, restart-then-commit-then-push order, proactive security/UX flags, manual test suggestions, docs upkeep, and no secrets pasted into chat.

## 2026-07-01

- Fixed `src/app/cleaner/inbox/page.tsx` schema mismatch (location/access_instructions → address/service_type/scheduled_date/scheduled_time/notes) and scoped the job query to the signed-in cleaner via `cleaner_id`.
- Committed cleaner portal files that were untracked (`layout.tsx`, `page.tsx`) and `package-lock.json`.
- Set up `credential.helper=store` for git push auth on the VPS (no OS keyring available in this environment).
- Fixed `src/app/admin/clients/page.tsx`: `user_id` was sent as an empty string instead of `null` on create/update, which broke inserts against the UUID column.
- Rewrote `src/app/admin/cleaners/page.tsx` to match the real `cleaners` table schema — removed the nonexistent `utr_number` column and added `email`, `phone`, `dbs_status` (dropdown: pending/clear/flagged/expired, default pending), `dbs_check_date`, `emergency_contact`, `skills` (array, comma-separated input), and `notes`. Applied the same `user_id`-empty-string-to-null fix here for consistency.
- Replaced placeholder content in `docs/PROJECT-STATUS.md` with an accurate current-state summary.
- Each fix above was verified with `npm run build` before commit, followed by `pm2 restart cleaning-platform` and `git push origin master:main`.
- Created a real test cleaner login (linked via user_roles + cleaners.user_id) and confirmed the full assignment flow end-to-end: admin assigns job → cleaner logs in → job appears correctly in /cleaner/inbox. This is the first fully verified end-to-end user flow in the app.
