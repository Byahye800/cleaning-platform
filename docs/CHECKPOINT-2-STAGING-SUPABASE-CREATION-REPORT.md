# CHECKPOINT 2 — STAGING SUPABASE CREATION REPORT

**Date:** 2026-07-13
**Status: PASSED**

## 1. What was created

One new, completely separate Supabase project was created inside the existing (and only) organization, "Byahye800's Org" (Free plan).

| Field | Value |
|---|---|
| Project name | Cleaning Platform - Staging |
| Project ref | `jwdfzgibrijcyypibhjw` |
| Project URL | `https://jwdfzgibrijcyypibhjw.supabase.co` |
| Organization | Byahye800's Org (the only organization on this account — confirmed by the Organizations list showing exactly one org card before creation) |
| Region | eu-central-1 — Central EU (Frankfurt), AWS. Deliberately matches production's region, as approved. |
| Compute | Nano (t3a.nano) — matches production's compute tier |
| Plan | Free. No plan-selection field appeared anywhere in the creation form (the project silently inherits the org's plan) and no chargeable prompt was ever presented, so no stop condition was triggered on this point. |
| Health at creation | Healthy |

## 2. How the database password was handled

The password was generated using Supabase's own "Generate a password" link on the project-creation form, not typed or composed by me. It was never displayed in plaintext at any point I could read it — the field remained masked (dots) in every screenshot taken, and the strength indicator confirmed "This password is strong." I did not click "Copy," did not paste it anywhere, and it does not appear in this report, any terminal output, or any other file. No production secret was reused. Retrieving/rotating it later (e.g., for Vercel env vars in Checkpoint 6) will need to go through Supabase's own settings UI directly, not through me re-typing or displaying it.

## 3. Post-creation verification (15 items)

1. **Name** — "Cleaning Platform - Staging," confirmed on the project dashboard header and breadcrumb.
2. **Project ref** — `jwdfzgibrijcyypibhjw`, confirmed in URL and dashboard.
3. **Organization** — Byahye800's Org, confirmed in breadcrumb.
4. **Region** — eu-central-1 (Central EU, Frankfurt), confirmed on dashboard ("Primary Database — Central EU (Frankfurt) — eu-central-1 · t3a.nano").
5. **Plan** — Free, inherited from org (org badge reads "FREE" throughout).
6. **Health** — "Healthy," confirmed on project dashboard.
7. **DB readiness** — Confirmed ready: Table Editor loads normally and offers "Create a table," CPU/Disk/RAM/connection stats are live (CPU 3%, Disk 14%, RAM 48%, 5/60 conns).
8. **Auth user count** — Users page displays "No users in your project — There are currently no users who signed up to your project," and the users table itself is empty. **One discrepancy worth flagging honestly:** the page's footer also shows "Total: 10 users (estimated)," which contradicts the empty table and the explicit empty-state message. This looks like a stale/cached UI estimate widget on a brand-new project rather than real data (the same page's own primary content says zero), but I'm not silently rounding this to "confirmed 0" — recommend re-checking this count at the start of Checkpoint 3 or 4, before relying on it, and not treating it as fully resolved here.
9. **No test users created** — Confirmed no `bakar.yahye+stage25-*@gmail.com` identities were created; the Users table is empty as shown above.
10. **No production data copied** — Confirmed: Table Editor shows "No tables or views — Any tables or views you create will be listed here." Zero tables exist in the `public` schema.
11. **No migrations applied** — Confirmed: project dashboard's "Last Migration" card reads "No migrations." Consistent with item 10 (zero tables).
12. **No Auth configuration changes** — Confirmed: Site URL is still the Supabase default `http://localhost:3000` (not production's `http://187.124.112.253:3002`), and the Redirect URLs list is empty ("No Redirect URLs — Auth providers may need a URL to redirect back to").
13. **No custom SMTP configured** — Not explicitly opened this checkpoint (out of scope per the "actions not permitted" list), but given Auth config is otherwise untouched (item 12) and no action was taken toward it, there's no reason to believe it deviates from Supabase's own default. Will be explicitly confirmed as a precondition when Checkpoint 5 begins.
14. **No Vercel deployment** — True by construction: no Vercel action of any kind was taken this checkpoint.
15. **Production project (`wqdyshgoxtkbreijbbha`, "Cleaning Platform - Dev") unmodified** — No navigation, click, or edit targeted that project at any point this checkpoint. Immediately before creating the staging project, the org's Projects list showed it unchanged (name, AWS eu-central-1, Nano) as the only pre-existing project; nothing about it was touched after that point either.

## 4. Actions NOT taken (confirming the forbidden list was respected)

- Did not modify or rename the existing production project.
- Did not alter production Auth, redirect URLs, SMTP, or data.
- Did not apply any migrations to staging.
- Did not create any Auth users, admin/cleaner/client profiles, or test invitations.
- Did not configure staging Site URL, redirect URLs, email templates, or SMTP.
- Did not connect Vercel or GitHub to the new project (the "GitHub (optional)" field on the creation form was left untouched).
- Did not deploy anything.
- Did not add environment variables anywhere.
- Did not create or modify any repository file, and did not commit anything.
- Did not begin any Stage 2.5 testing.

## 5. Stop conditions — none triggered

No paid-plan/payment prompt appeared. `eu-central-1` was available and selected without issue. No quota error occurred. Organization ownership was unambiguous (exactly one org existed). The interface never proposed linking or cloning production. No fresh authentication or password entry was required of the user at any point.

## 6. Rollback position

The new project can be deleted entirely from Supabase's project settings if needed — nothing outside Supabase (no repo file, no Vercel project, no DNS, no secret store) references it yet, so deleting it would leave zero trace anywhere else.

---

**This checkpoint created the empty isolated project only.** Stopping here. Awaiting explicit approval before Checkpoint 3 — applying and verifying all 26 migrations against this new staging project.
