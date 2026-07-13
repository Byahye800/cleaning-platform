import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { User } from '@supabase/supabase-js';

// Shared admin-session verification for the account-invitation API routes.
// This is the route-level half of the two-layer enforcement required by
// STAGE-2-2C-SPECIFICATION.md Section 9 (authorization matrix): every
// action is checked here (session + role) AND independently by the
// database function's own grants. Neither layer alone is sufficient by
// design -- this file must never be the only thing standing between an
// unauthenticated/non-admin caller and a lifecycle function.
export type AdminAuthResult =
  | { ok: true; user: User }
| { ok: false; code: 'NOT_AUTHENTICATED' | 'NOT_ADMIN'; message: string };

export async function requireAdmin(): Promise<AdminAuthResult> {
  const cookieStore = await cookies();
  const cookieRecord = Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value]));
  const supabase = createServerSupabaseClient(cookieRecord);

const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  return { ok: false, code: 'NOT_AUTHENTICATED', message: 'You must be signed in.' };
}

const { data: roleRows } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .limit(1);

if (roleRows?.[0]?.role !== 'admin') {
  return { ok: false, code: 'NOT_ADMIN', message: 'This action requires an admin account.' };
}

return { ok: true, user };
}

// Session-only check (no role requirement) for routes like
// /api/auth/invitation/finalize, which any authenticated user may call --
// but strictly for their own session-derived identity, never a
// client-supplied one (STAGE-2-2C-SPECIFICATION.md Section 9).
export type SessionAuthResult =
  | { ok: true; user: User }
| { ok: false; code: 'NOT_AUTHENTICATED'; message: string };

export async function requireSession(): Promise<SessionAuthResult> {
  const cookieStore = await cookies();
  const cookieRecord = Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value]));
  const supabase = createServerSupabaseClient(cookieRecord);

const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  return { ok: false, code: 'NOT_AUTHENTICATED', message: 'You must be signed in.' };
}

return { ok: true, user };
}
