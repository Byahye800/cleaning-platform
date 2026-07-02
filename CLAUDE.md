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

