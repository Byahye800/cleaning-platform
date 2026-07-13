# 2026-07-05 — Visual Language Upgrade + Dark-Mode Bug

**Context:** catch-up from a separate chat session with browser access that wasn't yet reflected in docs — migration `0012` (cleaner status action names) applied live, and a visual pass on `/admin` confirmed working.

**What happened:** found and fixed a real bug via direct code read (not just trusting the relayed report): admin sidebar nav links and header text had no explicit `color`, inheriting `body`'s `prefers-color-scheme: dark` value, making them nearly invisible in OS dark mode. Fixed with explicit `color.gray900`. Added active-route highlighting to the admin sidebar (`usePathname()`, Client Component).

**Outcome:** build clean, PM2 restarted, held for commit pending user go-ahead. Noted `DASHBOARD-ROTA-EXPANSION-SPEC.md` (referenced as the basis for upcoming Financials/Rota work) does not exist anywhere in the repo or git history — never resolved, subsequent sessions worked from in-chat descriptions instead.
