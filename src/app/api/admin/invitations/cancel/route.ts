export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { invitationError, invitationErrorStatus, mapInvitationDbError } from '@/lib/invitationErrors';

// POST /api/admin/invitations/cancel
// Body: { invitation_id: string, reason?: string }
//
// Admin-only (checked here at the route layer, and independently by
// cancel_account_invitation's own grants -- EXECUTE to service_role only,
// per STAGE-2-2C-SPECIFICATION.md Section 9). Idempotent: calling this
// twice on an already-cancelled row is a no-op success, not an error
// (matches the DB function's own idempotency).
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(invitationError(admin.code, admin.message), {
      status: invitationErrorStatus(admin.code),
    });
  }
  const adminUser = admin.user;

let body: { invitation_id?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'Invalid JSON body.'), { status: 400 });
  }

const invitationId = typeof body.invitation_id === 'string' ? body.invitation_id : '';
  if (!invitationId) {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'invitation_id is required.'), { status: 400 });
  }
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

const supabaseAdmin = createSupabaseAdminClient();

const { data: cancelled, error: cancelError } = await supabaseAdmin.rpc('cancel_account_invitation', {
  p_invitation_id: invitationId,
  p_actor_id: adminUser.id,
  p_reason: reason,
});

if (cancelError) {
  console.error('[invitations/cancel] cancel_account_invitation failed:', cancelError.message);
  const mapped = mapInvitationDbError(cancelError.message);
  return NextResponse.json(invitationError(mapped.code, mapped.message), {
    status: invitationErrorStatus(mapped.code),
  });
}

return NextResponse.json({
  invitation: {
    id: cancelled.id,
    canonical_email: cancelled.canonical_email,
    intended_role: cancelled.intended_role,
    status: cancelled.status,
    cancelled_at: cancelled.cancelled_at,
  },
});
}
