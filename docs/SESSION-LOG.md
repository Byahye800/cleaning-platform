# Session Log

Running dated log of work sessions on this codebase. Newest entries at the top.

## 2026-07-01

- Fixed `src/app/cleaner/inbox/page.tsx` schema mismatch (location/access_instructions → address/service_type/scheduled_date/scheduled_time/notes) and scoped the job query to the signed-in cleaner via `cleaner_id`.
- Committed cleaner portal files that were untracked (`layout.tsx`, `page.tsx`) and `package-lock.json`.
- Set up `credential.helper=store` for git push auth on the VPS (no OS keyring available in this environment).
- Fixed `src/app/admin/clients/page.tsx`: `user_id` was sent as an empty string instead of `null` on create/update, which broke inserts against the UUID column.
- Rewrote `src/app/admin/cleaners/page.tsx` to match the real `cleaners` table schema — removed the nonexistent `utr_number` column and added `email`, `phone`, `dbs_status` (dropdown: pending/clear/flagged/expired, default pending), `dbs_check_date`, `emergency_contact`, `skills` (array, comma-separated input), and `notes`. Applied the same `user_id`-empty-string-to-null fix here for consistency.
- Replaced placeholder content in `docs/PROJECT-STATUS.md` with an accurate current-state summary.
- Each fix above was verified with `npm run build` before commit, followed by `pm2 restart cleaning-platform` and `git push origin master:main`.
