# SECURITY-MODEL.md

Consolidated security posture for this codebase. Read this before writing any route, RPC, or RLS policy. Sourced from `BUILD-STANDARDS.md` §10, `ITEM-3-SECURITY-REVIEW.md`, `PHASE-0-7-PLATFORM-AUDIT.md` §9, `STAGE-2-INDEPENDENT-AUDIT.md`, and the Stage 2.4 design spec's security sections.

## The layered model

Three independent layers, each must hold on its own — never assume a lower layer is protected because a higher one looks right:

1. **Routing** (`src/proxy.ts`) — is this session logged in, right role for this portal tree, right lifecycle status to be here at all.
2. **API/RPC authorization** — does this specific mutation independently verify the caller's authority, re-derived server-side, never trusted from the request body or client state.
3. **RLS** — row-level policies on the tables themselves.

**These are not redundant layers of the same protection — they catch different failure modes, and this project has been burned by assuming otherwise twice:**

- The original safe views (`cleaner_own_profile`, `jobs_cleaner_safe`, `jobs_client_safe`) were missing `security_invoker = true`. They ran as the view owner (`postgres`), which has `rolbypassrls = true` — meaning RLS provided **zero** protection through those views regardless of the policies defined on the underlying tables. Any authenticated cleaner/client querying the view directly (bypassing the app UI) could read every row in the system. Fixed in migration `0021`. **Lesson: any new view exposing cleaner/client-facing data must have `security_invoker = true` set from creation, non-negotiable.**
- `SECURITY DEFINER` functions owned by `postgres` or `service_role` also bypass RLS by owner privilege — confirmed live (`rolbypassrls = true` for both). For the account-invitation functions, this means **the function body is the entire authorization boundary, not RLS plus function logic.** This must be documented in code comments wherever it applies (it currently is not, in the invitation-function migration files — flagged as a known documentation gap, not yet fixed).

## Never trust the client — the specific things this has meant in practice

- User id: never accept from a request body; always derive from the server-verified session (`requireSession()`).
- Role: same — read from `user_roles` server-side, never a client-supplied param.
- Lifecycle status: `finalize`, `accept`, `complete_onboarding`, and `activate` all independently re-check status server-side rather than trusting what the browser last saw.
- "I already did X" claims: `complete_onboarding` re-verifies invitation acceptance actually succeeded server-side before allowing `onboarding_status = submitted` — it does not trust the browser's claim that the prior step succeeded.

## Fail-closed conditions (apply everywhere, not just Stage 2.4)

Missing session, stale/revoked session, missing role, unknown role, missing lifecycle row, missing cleaner/client row, invalid lifecycle value, expired/cancelled/superseded/failed invitation, partially-created account, concurrent onboarding attempts, duplicate submissions, race conditions, database failures, unexpected null values, inconsistent already-active state, identity mismatch, incomplete profile data, invitation not accepted. All of these deny by default.

## Never log

Passwords, access tokens, refresh tokens, session contents, PKCE verifier, authorization headers, invite secrets, recovery tokens, service-role credentials, either email address during identity-mismatch logging (log safe categories/identifiers only). Redaction patterns must match the actual secret format (`sb_secret_...`, not a generic `eyJ...` JWT assumption — this project's own keys are the newer Supabase format).

## RLS history (`cleaners`/`clients`) — read before assuming a policy exists

Across every migration `0001`–`0027`, the only policies ever created on `cleaners`/`clients` are: `cleaners_admin_all`/`clients_admin_all` (admin, all commands), some dead `0003` policies referencing a non-existent column (never live), and `0005`'s live replacements — `"Admins full access"` (all commands) and `"Cleaners/Clients read own row"` (SELECT only, `user_id = auth.uid()`). **No UPDATE/INSERT policy for a non-admin "own row" case has ever existed.** This is why Stage 2.4's profile-completion route had to be a narrow server route with an explicit per-role field allowlist (`cleaner`: `phone`, `emergency_contact`; `client`: `address`, `contact_phone`) rather than a direct browser update — direct updates are blocked outright by RLS, and even if they weren't, a blanket update would be the wrong architecture (no way to protect `status`/`hourly_rate`/`dbs_status`/etc. from user tampering).

## The 10-point hostile-user review result (`ITEM-3-SECURITY-REVIEW.md`, full battery, real non-admin identities via `request.jwt.claims`)

Every one of: view RLS bypass, account-status enforcement, trigger-function EXECUTE grants, RPC privilege escalation (12 tables × 2 identities on read, 6 hostile write attempts) — came back clean or was fixed. The one real gap found (`send-invoice` relying on RLS alone, with no explicit role check, plus a genuine operational bug querying dropped columns) was fixed with an explicit admin-role check layered on top of RLS — belt and suspenders, the standing pattern.

## The 3-dimensional account lifecycle security model (Stage 2 specifics — full rationale in `ARCHITECTURE-DECISIONS.md`)

- `finalize_account_invitation`, `reconcile_account_invitation`: owned by `postgres`, `EXECUTE` granted to `service_role` only.
- `accept_account_invitation`: owned by `service_role`, granted to both `authenticated` and `service_role` — the one function end users call directly via `supabase.rpc()`.
- The identity-match gap (finalize route bound `auth_user_id` to whatever the caller supplied without checking the invitation's `canonical_email` matched the session's actual email) was route-level, not DB-level — confirmed authoritative via exhaustive grep of every call site; `reconcile`'s internal repair path derives the user id safely from `canonical_email` directly, so it cannot mismatch by construction. Fix: `finalize/route.ts` compares (trimmed, lowercased) `canonical_email` against the session user's own verified email before calling the RPC; on mismatch, returns `INVITATION_IDENTITY_MISMATCH`, creates no role/profile rows, logs no email addresses.
- Admin activation is the **only** place `status = 'active'` and `onboarding_status = 'approved'` are set, and always together as one atomic update, after independently re-verifying: role is cleaner/client, `status = restricted`, `invitation_status = invite_accepted`, `onboarding_status = submitted`, and all role-specific required profile fields are present. Explicitly prohibited from being set by: the onboarding page, browser code, `accept_account_invitation`, any onboarding API, or profile submission.
- Onboarding cannot become `submitted` before `accept_account_invitation` has actually succeeded — `complete_onboarding` independently re-verifies session, role, row ownership, `status = restricted`, `invitation_status = invite_accepted`, and required-fields-complete, server-side, before allowing the transition. Never trusts the browser's claim that a prior step succeeded.

## Password handling (Stage 2.4)

`supabase.auth.updateUser({ password })`, not the `reset-password` page's flow (that page signs out afterward, which would break onboarding continuity). No safe "password already set" signal exists in the Supabase JS client — deliberately not solved by adding a new schema column; the design makes repeating the password step harmless instead.

## Staging environment (separate track from the application security model above)

The staging Supabase project (`jwdfzgibrijcyypibhjw`, "Cleaning Platform - Staging") is fully isolated from production (`wqdyshgoxtkbreijbbha`) — no shared secrets, no shared data, no code path connects them. Least-privilege expectations for staging mirror production's: trigger-only functions should not carry direct client `EXECUTE` grants they don't need, matching the pattern `0022` established.

**STAGING-002 (resolved 2026-07-14):** `enforce_single_role_profile` and `guard_invitation_status_write` — both BEFORE-trigger-only functions bound to `cleaners`/`clients` triggers — retained Supabase's default `anon`/`authenticated` `EXECUTE` auto-grant, inconsistent with `0022`'s pattern for the three AFTER-trigger functions. Hardened via migration `0028_resolve_staging_002_trigger_function_execute_grants.sql`: `EXECUTE` revoked from `public`, `anon`, `authenticated`; `service_role` and the function owner (`postgres`) retain `EXECUTE`, unchanged. Trigger behaviour verified preserved via a transaction-wrapped, rolled-back functional test (both triggers still fire and enforce their business rules correctly post-change). Function bodies confirmed byte-identical pre/post via `md5(pg_get_functiondef(...))`. Production was not modified. Full evidence: `KNOWN-ISSUES-REGISTER.md`, `STAGING-002`.

Secrets for staging (DB password, anon key, service-role key) follow the same rule as production: environment-scoped only, never committed, never printed in chat/logs/reports. `STAGING-RECOVERY-STATE.md` records staging's state without any secret material, by design.

**Checkpoint 4 Part A (2026-07-14):** staging Auth hardened with two domain-independent changes, both aligned with the repository's own design: public signup ("Allow new users to sign up") disabled — the app has no code path anywhere in `src/` that calls `.signUp(`, so this closes an Auth-API-level account-creation path the application never used; minimum password length raised from Supabase's default 6 to 8, matching the 8-character minimum already enforced client-side in `reset-password/page.tsx`, closing a gap where a password 6-7 characters long could previously be set via direct Auth-API calls bypassing the app's own form. Provider states independently re-verified with certainty (Email enabled; Phone, SAML 2.0, Web3 Wallet, and all OAuth providers disabled; no custom providers) before any change was made. URL-dependent Auth configuration (Site URL, Redirect URLs) remains deferred pending Checkpoint 6.

## Standing rule for any new sensitive route

`requireSession()` or `requireAdmin()` first, then `createSupabaseAdminClient()` (service-role, bypasses RLS deliberately and explicitly) to re-derive all lifecycle-relevant state server-side. Never mix "trust RLS" and "trust the service-role client's caller" — the service-role client trusts nothing by default; the route's own logic is what must enforce authorization.
