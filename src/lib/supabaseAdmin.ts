import { createClient } from '@supabase/supabase-js';

// Service-role client. Used ONLY server-side, for the account-invitation
// lifecycle functions, which grant EXECUTE to `service_role` only (see
// supabase/0027_account_invitation_lifecycle_completion.sql) -- an ordinary
// authenticated-session client cannot call reserve/resend/cancel/reconcile/
// mark_failed/expire_stale/sweep, by design (defense in depth: even if the
// route-level admin check were bypassed, the DB grants alone still block a
// non-service-role caller).
//
// Constructed lazily inside each call site (not at module load / top level)
// so this file can be imported during `next build`'s page-data collection
// without SUPABASE_SERVICE_ROLE_KEY needing to be set at build time -- same
// discipline already used in src/app/api/stripe/webhook/route.ts.
export function createSupabaseAdminClient() {
    return createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
        );
}
