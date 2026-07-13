export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { invitationError, invitationErrorStatus, mapInvitationDbError } from '@/lib/invitationErrors';

// POST /api/admin/invitations/reconcile
// Body: { invitation_id: string }
//
// Restricted admin action (STAGE-2-2C-SPECIFICATION.md Section 8): lets a
// human manually trigger repair on a specific invitation when something
// looks wrong. This is in addition to the automatic call the finalize
// route always makes as a safety net -- both paths call the same DB
// function, which is idempotent by construction (a second call after a
// successful repair finds nothing left to fix).
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(invitationError(admin.code, admin.message), {
      status: invitationErrorStatus(admin.code),
    });
  }
  const adminUser = admin.user;

let body: { invitation_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'Invalid JSON body.'), { status: 400 });
  }

const invitationId = typeof body.invitation_id === 'string' ? body.invitation_id : '';
  if (!invitationId) {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'invitation_id is required.'), { status: 400 });
  }

const supabaseAdmin = createSupabaseAdminClient();

const { data: reconciled, error: reconcileError } = await supabaseAdmin.rpc('reconcile_account_invitation', {
  p_invitation_id: invitationId,
  p_actor_id: adminUser.id,
});

if (reconcileError) {
  console.error('[invitations/reconcile] reconcile_account_invitation failed:', reconcileError.message);
  const mapped = mapInvitationDbError(reconcileError.message);
  return NextResponse.json(invitationError(mapped.code, mapped.message), {
    status: invitationErrorStatus(mapped.code),
  });
}

return NextResponse.json({
  invitation: {
    id: reconciled.id,
    canonical_email: reconciled.canonical_email,
    intended_role: reconciled.intended_role,
    status: reconciled.status,
    auth_user_id: reconciled.auth_user_id,
  },
});
}
