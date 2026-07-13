export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

// POST /api/auth/invitation/status
// Body: { invitation_id: string }
//
// Stage 2.4. Small, read-only, server-verified lifecycle-status lookup for
// the onboarding page. Deliberately does not rely on the browser's own RLS
// read of cleaners/clients ("Cleaners/Clients read own row" would in fact
// permit it) -- authorization-relevant decisions in this flow are routed
// through a server boundary throughout, per the approved Stage 2.4 design.
//
// Returns only the minimum shape the UI needs. Never returns
// canonical_email, internal audit metadata, or raw database error text.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StatusErrorCode = 'NOT_AUTHENTICATED' | 'INVALID_REQUEST' | 'INVITATION_NOT_FOUND' | 'INTERNAL_ERROR';

function statusError(code: StatusErrorCode, message: string) {
  return { error: { code, message } };
}

const STATUS_HTTP: Record<StatusErrorCode, number> = {
  NOT_AUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  INVITATION_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session.ok) {
    return jsonNoStore(statusError('NOT_AUTHENTICATED', session.message), STATUS_HTTP.NOT_AUTHENTICATED);
  }
  const user = session.user;

let body: { invitation_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(statusError('INVALID_REQUEST', 'Invalid JSON body.'), STATUS_HTTP.INVALID_REQUEST);
  }

const invitationId = typeof body.invitation_id === 'string' ? body.invitation_id : '';
  if (!invitationId || !UUID_RE.test(invitationId)) {
    return jsonNoStore(statusError('INVALID_REQUEST', 'A valid invitation_id is required.'), STATUS_HTTP.INVALID_REQUEST);
  }

const supabaseAdmin = createSupabaseAdminClient();

// Verify the invitation is bound to the authenticated identity. Do not
// trust the browser's claim of ownership -- re-derive it here.
const { data: invitationRow, error: invitationLookupError } = await supabaseAdmin
  .from('account_invitations')
  .select('auth_user_id')
  .eq('id', invitationId)
  .maybeSingle();

if (invitationLookupError) {
  console.error(`[invitation/status] invitation lookup failed for ${invitationId}:`, invitationLookupError.message);
  return jsonNoStore(statusError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), STATUS_HTTP.INTERNAL_ERROR);
}

if (!invitationRow || invitationRow.auth_user_id !== user.id) {
  return jsonNoStore(statusError('INVITATION_NOT_FOUND', 'Invitation not found.'), STATUS_HTTP.INVITATION_NOT_FOUND);
}

// Role, derived server-side only.
const { data: roleRows, error: roleError } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .limit(1);

if (roleError || !Array.isArray(roleRows) || roleRows.length === 0) {
  console.error(`[invitation/status] role lookup failed for user ${user.id}:`, roleError?.message ?? 'no role row');
  return jsonNoStore(statusError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), STATUS_HTTP.INTERNAL_ERROR);
}

const role = roleRows[0]?.role as string | undefined;
  if (role !== 'cleaner' && role !== 'client') {
    console.error(`[invitation/status] unexpected role for user ${user.id}`);
    return jsonNoStore(statusError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), STATUS_HTTP.INTERNAL_ERROR);
  }

const table = role === 'cleaner' ? 'cleaners' : 'clients';
  const fieldSelect =
    role === 'cleaner'
  ? 'status, invitation_status, onboarding_status, phone, emergency_contact'
    : 'status, invitation_status, onboarding_status, address, contact_phone';

const { data: profileRow, error: profileError } = await supabaseAdmin
  .from(table)
  .select(fieldSelect)
  .eq('user_id', user.id)
  .maybeSingle();

if (profileError || !profileRow) {
  console.error(`[invitation/status] profile lookup failed for user ${user.id}:`, profileError?.message ?? 'no profile row');
  return jsonNoStore(statusError('INTERNAL_ERROR', 'Something went wrong. Please try again.'), STATUS_HTTP.INTERNAL_ERROR);
}

const row = profileRow as {
  status: string;
  invitation_status: string;
  onboarding_status: string;
  phone?: string | null;
  emergency_contact?: string | null;
  address?: string | null;
  contact_phone?: string | null;
};

const requiredComplete =
  role === 'cleaner'
  ? Boolean(row.phone && row.phone.trim()) && Boolean(row.emergency_contact && row.emergency_contact.trim())
  : Boolean(row.address && row.address.trim()) && Boolean(row.contact_phone && row.contact_phone.trim());

return jsonNoStore(
  {
    role,
    status: row.status,
    invitation_status: row.invitation_status,
    onboarding_status: row.onboarding_status,
    required_profile_fields_complete: requiredComplete,
  },
  200
  );
}
