-- 0030_invitation_finalization_eligibility.sql
--
-- Adds public.invitation_finalization_eligibility(p_invitation_id uuid),
-- a narrowly-scoped SECURITY DEFINER function that is the single source
-- of truth for whether the CURRENTLY AUTHENTICATED user may be allowed
-- through src/proxy.ts's /onboarding gate while they still have no
-- public.user_roles row.
--
-- Background: the new /auth/confirm route (verifyOtp) establishes a real
-- session server-side BEFORE the browser ever reaches /onboarding. That
-- broke proxy.ts's pre-existing assumption (documented in its own
-- comments) that the first hit on /onboarding is always sessionless.
-- proxy.ts's role-resolution step now runs for a legitimate, just-invited
-- user who has no user_roles row yet -- because that row is only created
-- by finalize_account_invitation, which the onboarding page itself calls
-- AFTER it renders. proxy.ts's existing fail-closed design signs the user
-- out and redirects to /admin/login?error=account_configuration before
-- onboarding ever gets the chance to run finalize. Confirmed live on
-- staging (jwdfzgibrijcyypibhjw): auth.users row created and confirmed,
-- session established (last_sign_in_at populated), account_invitations
-- row still status='pending'/auth_user_id=NULL -- finalize never ran.
--
-- Design: proxy.ts must NOT infer eligibility itself (row-count, id
-- comparison, etc.) -- that would duplicate business rules in middleware.
-- Instead this function is the single place all finalization-eligibility
-- rules live and always returns exactly one row (for an authenticated
-- caller) with an explicit eligible_for_finalization boolean. proxy.ts's
-- only job is to call this function and branch on that one boolean. Any
-- future eligibility rule (tenant suspension, onboarding freeze,
-- compliance hold, additional expiry semantics, etc.) is added here only
-- -- proxy.ts never needs to change again for such a rule.
--
-- account_invitations has RLS enabled with zero policies (confirmed live:
-- relrowsecurity=true, 0 rows in pg_policies for this table) -- by design
-- reachable only via the service-role key or SECURITY DEFINER functions,
-- per migration 0025. This function follows that same established
-- pattern, and the same ownership/grant precedent already used by
-- accept_account_invitation/finalize_account_invitation in migration
-- 0027 (owned by service_role, EXECUTE limited to authenticated).
--
-- Identity match uses auth_user_id first (covers a partially-completed
-- finalize retry), falling back to the caller's own verified email
-- compared against account_invitations.canonical_email -- both
-- server-derived, never a client-supplied value. This mirrors the exact
-- identity-match pattern already shipped and reviewed in
-- src/app/api/auth/invitation/finalize/route.ts.
--
-- Email is read via auth.email() (Postgres function auth.email(),
-- prosecdef=false, confirmed live to read only request.jwt.claims and to
-- NOT touch auth.users), not via a direct join to auth.users. Confirmed
-- live that auth.users' ACL grants only supabase_auth_admin and
-- dashboard_user -- service_role (this function's owner) has no grant on
-- that table, so a direct join would fail with "permission denied for
-- table users" despite SECURITY DEFINER (caught by live functional
-- testing before this migration was finalized, not assumed). auth.email()
-- and auth.uid() are both granted EXECUTE to PUBLIC, so this function can
-- always call them regardless of owner.
--
-- p_invitation_id is the only input, and it is never trusted on its own:
-- it only narrows which single invitation's eligibility is being asked
-- about. The eligibility boolean itself is computed entirely from
-- auth.uid()/auth.email()-derived server state plus account_invitations,
-- so no request parameter can make this function return true for an
-- invitation that does not genuinely belong to the calling session.
-- Returns zero rows if p_invitation_id does not exist or the caller is
-- unauthenticated; proxy.ts's .maybeSingle() already treats an absent row
-- identically to eligible_for_finalization = false.
--
-- Environment: written and tested against staging (jwdfzgibrijcyypibhjw)
-- only. Not applied to production (wqdyshgoxtkbreijbbha) as part of this
-- change.

begin;

create or replace function public.invitation_finalization_eligibility(p_invitation_id uuid)
returns table (invitation_id uuid, eligible_for_finalization boolean)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    ai.id as invitation_id,
    (
      ai.status = 'pending'
      and (ai.expires_at is null or ai.expires_at > now())
      and (
        ai.auth_user_id = auth.uid()
        or (ai.auth_user_id is null and ai.canonical_email = lower(trim(auth.email())))
      )
    ) as eligible_for_finalization
  from public.account_invitations ai
  where ai.id = p_invitation_id
    and auth.uid() is not null;
$$;

comment on function public.invitation_finalization_eligibility(uuid) is
  'Single source of truth for the proxy.ts narrow /onboarding exception: '
  'returns whether p_invitation_id is a pending, unexpired invitation '
  'belonging to the currently authenticated user (auth_user_id or, before '
  'finalize runs, matching auth.users.email). Always returns exactly one '
  'row for an authenticated caller. All finalization-eligibility rules '
  'must live here, never duplicated in middleware.';

revoke all on function public.invitation_finalization_eligibility(uuid) from public, anon;
grant execute on function public.invitation_finalization_eligibility(uuid) to authenticated;
grant create on schema public to service_role;
alter function public.invitation_finalization_eligibility(uuid) owner to service_role;
revoke create on schema public from service_role;

commit;
