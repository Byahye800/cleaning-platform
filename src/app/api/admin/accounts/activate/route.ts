export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// POST /api/admin/accounts/activate
// Body: { role: 'cleaner' | 'client', id: string }
//
// Stage 2.4 admin-gated activation. This route is the sole security
// authority for the restricted -> active transition -- the "Activate
// account" button on the admin cleaner/client detail pages is a UI
// convenience only, rendered from the same data this route independently
// re-verifies. Nothing about the button's visibility is trusted here.
//
// Per the approved final decision: status and onboarding_status are
// updated together, in one UPDATE statement, as a single logical
// operation -- 'submitted' means the user finished their part, 'approved'
// means an administrator reviewed and approved it, 'active' means the
// account may enter the platform. An activated account must never be left
// showing onboarding_status='submitted'.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActivateErrorCode = 'NOT_AUTHENTICATED' | 'NOT_ADMIN' | 'INVALID_REQUEST' | 'ACCOUNT_NOT_FOUND' | 'NOT_ELIGIBLE' | 'INCONSISTENT_STATE' | 'INTERNAL_ERROR';

const ACTIVATE_HTTP: Record<ActivateErrorCode, number> = {
  NOT_AUTHENTICATED: 401,
  NOT_ADMIN: 403,
  INVALID_REQUEST: 400,
  ACCOUNT_NOT_FOUND: 404,
  NOT_ELIGIBLE: 409,
  INCONSISTENT_STATE: 409,
  INTERNAL_ERROR: 500,
};

function activateError(code: ActivateErrorCode, message: string, reason?: string) {
  return { error: { code, message, ...(reason ? { reason } : {}) } };
}

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return jsonNoStore(activateError(admin.code, admin.message), ACTIVATE_HTTP[admin.code]);
  }
  const adminUser = admin.user;

let body: { role?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(activateError('INVALID_REQUEST', 'Invalid JSON body.'), ACTIVATE_HTTP.INVALID_REQUEST);
  }

const role = body.role;
  if (role !== 'cleaner' && role !== 'client') {
    return jsonNoStore(activateError('INVALID_REQUEST', "role must be 'cleaner' or 'client'."), ACTIVATE_HTTP.INVALID_REQUEST);
  }

const id = typeof body.id === 'string' ? body.id : '';
  if (!id || !UUID_RE.test(id)) {
    return jsonNoStore(activateError('INVALID_REQUEST', 'A valid id is required.'), ACTIVATE_HTTP.INVALID_REQUEST);
  }

const supabaseAdmin = createSupabaseAdminClient();
  const table = role === 'cleaner' ? 'cleaners' : 'clients';
  const requiredFieldsSelect = role === 'cleaner' ? 'phone, emergency_contact' : 'address, contact_phone';

// Authoritative row, fetched fresh -- never trust lifecycle values from
// the request body.
const { data: accountRow, error: lookupError } = await supabaseAdmin
  .from(table)
  .select(`id, user_id, status, invitation_status, onboarding_status, ${requiredFieldsSelect}`)
  .eq('id', id)
  .maybeSingle();

if (lookupError) {
  console.error(`[admin/accounts/activate] lookup failed for ${role} ${id}:`, lookupError.message);
  return jsonNoStore(activateError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), ACTIVATE_HTTP.INTERNAL_ERROR);
}

if (!accountRow) {
  return jsonNoStore(activateError('ACCOUNT_NOT_FOUND', 'Account not found.'), ACTIVATE_HTTP.ACCOUNT_NOT_FOUND);
}

const row = accountRow as {
  id: string;
  user_id: string | null;
  status: string;
  invitation_status: string;
  onboarding_status: string;
  phone?: string | null;
  emergency_contact?: string | null;
  address?: string | null;
  contact_phone?: string | null;
};

// Idempotent no-op: already fully activated, not an error, no duplicate
// audit event.
if (row.status === 'active' && row.onboarding_status === 'approved') {
  return jsonNoStore({ ok: true, status: 'active', onboarding_status: 'approved', already_active: true }, 200);
}

// Inconsistent already-active state (e.g. status='active' but
// onboarding_status never got set to 'approved', from before this route
// existed, or from a direct manual edit) must be reported and fail
// closed -- never silently repaired.
if (row.status === 'active') {
  console.error(`[admin/accounts/activate] inconsistent active state for ${role} ${id}: onboarding_status=${row.onboarding_status}`);
  return jsonNoStore(
    activateError('INCONSISTENT_STATE', 'This account is already active but its onboarding record looks inconsistent. Please investigate before proceeding.'),
    ACTIVATE_HTTP.INCONSISTENT_STATE
    );
}

// Full eligibility check, independent of anything the request claims.
if (row.status !== 'restricted') {
  return jsonNoStore(
    activateError('NOT_ELIGIBLE', 'This account is not eligible for activation.', 'status_not_restricted'),
    ACTIVATE_HTTP.NOT_ELIGIBLE
    );
}
  if (row.invitation_status !== 'invite_accepted') {
    return jsonNoStore(
      activateError('NOT_ELIGIBLE', 'This account has not accepted its invitation yet.', 'invitation_not_accepted'),
      ACTIVATE_HTTP.NOT_ELIGIBLE
      );
  }
  if (row.onboarding_status !== 'submitted') {
    return jsonNoStore(
      activateError('NOT_ELIGIBLE', 'This account has not completed onboarding yet.', 'onboarding_not_submitted'),
      ACTIVATE_HTTP.NOT_ELIGIBLE
      );
  }

const requiredComplete =
  role === 'cleaner'
  ? Boolean(row.phone && row.phone.trim()) && Boolean(row.emergency_contact && row.emergency_contact.trim())
  : Boolean(row.address && row.address.trim()) && Boolean(row.contact_phone && row.contact_phone.trim());

if (!requiredComplete) {
  return jsonNoStore(
    activateError('NOT_ELIGIBLE', 'This account is missing required profile fields.', 'required_fields_incomplete'),
    ACTIVATE_HTTP.NOT_ELIGIBLE
    );
}

// status and onboarding_status updated together, one statement, per the
// approved final decision.
const { error: updateError } = await supabaseAdmin
  .from(table)
  .update({ status: 'active', onboarding_status: 'approved' })
  .eq('id', id);

if (updateError) {
  console.error(`[admin/accounts/activate] activation update failed for ${role} ${id}:`, updateError.message);
  return jsonNoStore(activateError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), ACTIVATE_HTTP.INTERNAL_ERROR);
}

const { error: auditError } = await supabaseAdmin.from('activity_log').insert({
  actor_id: adminUser.id,
  action: 'account_activated',
  entity_type: role,
  entity_id: id,
  detail: `Account activated (${role})`,
  metadata: {
    role,
    id,
    user_id: row.user_id,
    actor_id: adminUser.id,
    previous_status: 'restricted',
    new_status: 'active',
    previous_onboarding_status: 'submitted',
    new_onboarding_status: 'approved',
    success: true,
  },
});

if (auditError) {
  console.error(`[admin/accounts/activate] activity_log write failed for ${role} ${id} (activation itself succeeded):`, auditError.message);
}

return jsonNoStore({ ok: true, status: 'active', onboarding_status: 'approved' }, 200);
}
