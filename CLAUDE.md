@AGENTS.md

# Standing Operating Rules

These rules apply to every session in this repo and override default behavior.

1. **Schema of record**: Never trust the SQL migration files in `supabase/` as the source of truth for the live database schema — they are known to be stale/drifted from production. Before writing any code that touches a table, verify the actual live columns either by asking the user to run an `information_schema` query in Supabase, or by checking `docs/SESSION-LOG.md` for previously confirmed schema facts. If neither is available, ask before assuming column names/types.

2. **Build gate before commit**: Before committing any code change, run `npm run build` and confirm it completes with zero errors. Never commit code that hasn't been built and verified this way.

3. **Deploy order**: After a successful build, the order is always: (1) `pm2 restart cleaning-platform`, (2) `git commit`, (3) `git push`. Never skip a step or reorder them.

4. **Proactive security flags**: Proactively flag security concerns without waiting to be asked — especially RLS policy gaps, missing auth checks, exposed secrets, or overly permissive access. Flag even if unrelated to the immediate task if noticed nearby.

5. **Proactive UX/completeness flags**: Proactively flag UX or completeness gaps noticed while working nearby (e.g. missing logout buttons, missing error states, missing loading states). Flag and ask — do not build them unprompted.

6. **Manual test suggestion**: After finishing any feature, suggest a quick manual test the user (non-technical) can perform in the browser to confirm it actually works end-to-end — not just that the build succeeded.

7. **Docs upkeep**: At the end of any session with meaningful changes, add a dated entry to `docs/SESSION-LOG.md` and keep `docs/PROJECT-STATUS.md` accurate as things change.

8. **Secrets handling**: Never have the user paste real secrets (API keys, tokens, passwords) into chat. Always have them enter such values directly via terminal commands or environment files instead.

9. **Autonomy tiers**: To reduce interruptions, actions are split into two tiers.

   **Auto-approved — proceed without asking, then summarize at a natural checkpoint** (a feature done, a bug found, a build finished — not per command):
   - `git add`, `git commit`, `git fetch`/`git pull`
   - `npm run build`
   - `pm2 restart`
   - Reading/listing files
   - Running the app locally to verify a change
   - `grep`/`cat` on non-secret files
   - Editing docs (`docs/SESSION-LOG.md`, `docs/PROJECT-STATUS.md`)
   - Stripe CLI commands

   **Always pause and describe what you're about to do first, then wait for confirmation:**
   - `git push`
   - Anything touching the production database schema (migrations stay a manual, user-reviewed step — see rule 1)
   - Anything that would print a real secret/key/token to terminal output
   - Deleting any data
   - Anything that sends a real email/SMS to an actual customer
   - Anything irreversible

9b. **Env reload after `.env.local` changes**: Any change to `.env.local` requires `pm2 restart <name> --update-env`, not a plain `pm2 restart`. A plain restart keeps serving the process's previously cached environment, so the process will silently keep running on stale env vars (secrets, keys, etc.) even though the file on disk is correct.

