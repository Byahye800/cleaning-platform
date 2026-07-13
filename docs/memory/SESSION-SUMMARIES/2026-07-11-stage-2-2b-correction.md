# 2026-07-11 — Stage 2.2b Correction: Real SET ROLE Defect Found and Fixed

**Context:** the prior Stage 2.2b implementation had been formally rejected via a 10-point review (architecture direction KEEP, implementation REQUIRES CORRECTION, commit DENIED).

**What happened:** all 10 review issues resolved live against the DB (no repo files touched until the very end). While fixing issues 2/3/8, found a genuine, previously-undiscovered production-blocking defect: `accept_account_invitation` used `SET LOCAL ROLE service_role` inside a `SECURITY DEFINER` body, which Postgres unconditionally forbids (error 42501) — meaning the core cache-write path had never actually worked. A prior session had misread this exact error as a pass. Fixed by transferring the function's ownership to `service_role` directly (see ARCHITECTURE-DECISIONS.md ADR-006). Full verification battery re-run: 24 checks across 21 test groups, all passed, including a real two-connection concurrency race.

**Outcome:** `supabase/0026_account_invitation_functions.sql` written matching live state exactly. **Not committed this session** — held per the review's explicit hold instruction, pending user approval of the corrected report. (Approved and committed the following session, see 2026-07-12.)
