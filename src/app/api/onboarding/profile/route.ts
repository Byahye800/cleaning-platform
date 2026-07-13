export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// POST /api/onboarding/profile
// Body: { action: 'save_profile' | 'complete_onboarding', fields?: Record<string,string> }
//
// Stage 2.4. Narrow, server-owned column-scoped profile route. Direct
// browser UPDATE against cleaners/clients is not available to a non-admin
// authenticated user at all -- RLS history was inspected across every
// migration and no UPDATE/INSERT policy for a non-admin "own row" case
// exists anywhere (only SELECT). This route uses the service-role client,
// independently authorizes via requireSession(), and column-scopes every
// write itself -- the request body is only ever trusted for the *values*
// of the two allowed fields per role, never for which columns to write.
//
// Two actions, per the approved sequencing:
//  - save_profile: writes only the allowed self-service fields; advances
//    onboarding_status from 'not_started' to 'in_progress' (never regresses
//    a later state).
//  - complete_onboarding: independently re-verifies status='restricted',
//    invitation_status='invite_accepted' (never trusts the browser's claim
//    that accept_account_invitation succeeded -- re-reads the authoritative
//    cached column), and that the required fields are actually present,
//    before setting onboarding_status='submitted'. status is never touched
//    here -- activation is admin-only, a separate route entirely.

type ProfileErrorCode =
  | 'NOT_AUTHENTICATED'
| 'INVALID_REQUEST'
| 'NOT_ELIGIBLE'
| 'ONBOARDING_NOT_READY'
| 'INTERNAL_ERROR';

const PROFILE_HTTP: Record<ProfileErrorCode, number> = {
  NOT_AUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  NOT_ELIGIBLE: 409,
  ONBOARDING_NOT_READY: 409,
  INTERNAL_ERROR: 500,
};

function profileError(code: ProfileErrorCode, message: string) {
  return { error: { code, message } };
}

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const ALLOWED_FIELDS: Record<'cleaner' | 'client', readonly string[]> = {
  cleaner: ['phone', 'emergency_contact'],
  client: ['address', 'contact_phone'],
};

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session.ok) {
    return jsonNoStore(profileError('NOT_AUTHENTICATED', session.message), PROFILE_HTTP.NOT_AUTHENTICATED);
  }
  const user = session.user;

let body: { action?: unknown; fields?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(profileError('INVALID_REQUEST', 'Invalid JSON body.'), PROFILE_HTTP.INVALID_REQUEST);
  }

const action = body.action;
  if (action !== 'save_profile' && action !== 'complete_onboarding') {
    return jsonNoStore(profileError('INVALID_REQUEST', "action must be 'save_profile' or 'complete_onboarding'."), PROFILE_HTTP.INVALID_REQUEST);
  }

const supabaseAdmin = createSupabaseAdminClient();

// Role, derived server-side only -- never accepted from the request.
const { data: roleRows, error: roleError } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .limit(1);

if (roleError || !Array.isArray(roleRows) || roleRows.length === 0) {
  console.error(`[onboarding/profile] role lookup failed for user ${user.id}:`, roleError?.message ?? 'no role row');
  return jsonNoStore(profileError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), PROFILE_HTTP.INTERNAL_ERROR);
}

const role = roleRows[0]?.role as string | undefined;
  if (role !== 'cleaner' && role !== 'client') {
    console.error(`[onboarding/profile] unexpected role for user ${user.id}`);
    return jsonNoStore(profileError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), PROFILE_HTTP.INTERNAL_ERROR);
  }

const table = role === 'cleaner' ? 'cleaners' : 'clients';
  const allowedFields = ALLOWED_FIELDS[role];

// Authoritative current row -- always re-read fresh, never trust the
// browser's claim of current state.
const { data: currentRow, error: currentRowError } = await supabaseAdmin
  .from(table)
  .select('status, invitation_status, onboarding_status, phone, emergency_contact, address, contact_phone')
  .eq('user_id', user.id)
  .maybeSingle();

if (currentRowError || !currentRow) {
  console.error(`[onboarding/profile] profile lookup failed for user ${user.id}:`, currentRowError?.message ?? 'no profile row');
  return jsonNoStore(profileError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), PROFILE_HTTP.INTERNAL_ERROR);
}

const row = currentRow as {
  status: string;
  invitation_status: string;
  onboarding_status: string;
  phone: string | null;
  emergency_contact: string | null;
  address: string | null;
  contact_phone: string | null;
};

// Onboarding actions only ever apply to a restricted account. Anything
// else (active/suspended/disabled) is out of this route's authority.
if (row.status !== 'restricted') {
  return jsonNoStore(profileError('NOT_ELIGIBLE', 'This action is not available for your account.'), PROFILE_HTTP.NOT_ELIGIBLE);
}

if (action === 'save_profile') {
  const fields = body.fields;
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    return jsonNoStore(profileError('INVALID_REQUEST', 'fields must be an object.'), PROFILE_HTTP.INVALID_REQUEST);
  }
  const submittedKeys = Object.keys(fields as Record<string, unknown>);
  const disallowedKey = submittedKeys.find((k) => !allowedFields.includes(k));
  if (disallowedKey) {
    return jsonNoStore(profileError('INVALID_REQUEST', `Field '${disallowedKey}' is not allowed.`), PROFILE_HTTP.INVALID_REQUEST);
  }

  const payload: Record<string, string> = {};
  for (const key of allowedFields) {
    const value = (fields as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      return jsonNoStore(profileError('INVALID_REQUEST', `Field '${key}' must be a string.`), PROFILE_HTTP.INVALID_REQUEST);
    }
    payload[key] = value.trim();
  }

  if (Object.keys(payload).length === 0) {
    return jsonNoStore(profileError('INVALID_REQUEST', 'No valid fields supplied.'), PROFILE_HTTP.INVALID_REQUEST);
  }

  // Advance onboarding_status forward only -- never regress a later state.
  if (row.onboarding_status === 'not_started') {
    payload.onboarding_status = 'in_progress';
  }

  const { error: updateError } = await supabaseAdmin.from(table).update(payload).eq('user_id', user.id);
  if (updateError) {
    console.error(`[onboarding/profile] save_profile update failed for user ${user.id}:`, updateError.message);
    return jsonNoStore(profileError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), PROFILE_HTTP.INTERNAL_ERROR);
  }

  return jsonNoStore({ ok: true, onboarding_status: payload.onboarding_status ?? row.onboarding_status }, 200);
}

// action === 'complete_onboarding'
if (row.onboarding_status === 'submitted' || row.onboarding_status === 'approved') {
  // Idempotent no-op -- already completed, not an error.
  return jsonNoStore({ ok: true, onboarding_status: row.onboarding_status }, 200);
}

// Never trust the browser's claim that accept_account_invitation
// succeeded -- re-read the authoritative cached column directly.
if (row.invitation_status !== 'invite_accepted') {
  return jsonNoStore(
    profileError('ONBOARDING_NOT_READY', 'Please complete invitation acceptance before finishing onboarding.'),
    PROFILE_HTTP.ONBOARDING_NOT_READY
    );
}

const requiredComplete =
  role === 'cleaner'
  ? Boolean(row.phone && row.phone.trim()) && Boolean(row.emergency_contact && row.emergency_contact.trim())
  : Boolean(row.address && row.address.trim()) && Boolean(row.contact_phone && row.contact_phone.trim());

if (!requiredComplete) {
  return jsonNoStore(
    profileError('ONBOARDING_NOT_READY', 'Please complete all required fields before finishing onboarding.'),
    PROFILE_HTTP.ONBOARDING_NOT_READY
    );
}

const { error: completeError } = await supabaseAdmin
  .from(table)
  .update({ onboarding_status: 'submitted' })
  .eq('user_id', user.id);

if (completeError) {
  console.error(`[onboarding/profile] complete_onboarding update failed for user ${user.id}:`, completeError.message);
  return jsonNoStore(profileError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), PROFILE_HTTP.INTERNAL_ERROR);
}

return jsonNoStore({ ok: true, onboarding_status: 'submitted' }, 200);
}
