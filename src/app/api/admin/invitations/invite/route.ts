export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import {
  invitationError,
  invitationErrorStatus,
  mapInvitationDbError,
  checkAdminInvitationRateLimit,
  classifyAuthDeliveryError,
} from '@/lib/invitationErrors';

const DEFAULT_TTL_DAYS = 7;

// POST /api/admin/invitations/invite
// Body: { email: string, role: 'cleaner' | 'client' }
//
// Implements the reservation/Auth compensation sequence mandated by
// STAGE-2-2C-SPECIFICATION.md Section 7:
// 1. Authenticate the caller.
// 2. Verify the caller is an active admin (route layer, before calling
// any DB function).
// 3. Call reserve_account_invitation.
// 4. Call the Supabase Auth invite API (inviteUserByEmail -- confirmed in
// STAGE-2-1A-REVISED-DESIGN-V2.md as the verified mechanism for fresh
// invites, since it sends automatically via Supabase's own mailer).
// 5. On Auth success: no further action -- finalize happens later via the
// callback route once the invited user completes signup.
// 6. On Auth failure: immediately call mark_account_invitation_failed.
// 7. Never return the raw Auth API error body to the caller.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(invitationError(admin.code, admin.message), {
      status: invitationErrorStatus(admin.code),
    });
  }
  const adminUser = admin.user;

let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'Invalid JSON body.'), { status: 400 });
  }

const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return NextResponse.json(invitationError('INVALID_REQUEST', 'A valid email address is required.'), {
    status: 400,
  });
}
  if (role !== 'cleaner' && role !== 'client') {
    return NextResponse.json(invitationError('INVALID_REQUEST', "role must be 'cleaner' or 'client'."), {
      status: 400,
    });
  }

const supabaseAdmin = createSupabaseAdminClient();

const rateLimit = await checkAdminInvitationRateLimit(supabaseAdmin, adminUser.id);
  if (rateLimit.limited) {
    return NextResponse.json(
      invitationError('RATE_LIMITED', 'Too many invite/resend actions in the last hour. Please try again later.'),
      { status: invitationErrorStatus('RATE_LIMITED') }
      );
  }

const beforeReserve = Date.now();
  const { data: reservation, error: reserveError } = await supabaseAdmin.rpc('reserve_account_invitation', {
    p_email: email,
    p_intended_role: role,
    p_invited_by: adminUser.id,
    p_ttl_days: DEFAULT_TTL_DAYS,
  });

if (reserveError) {
  console.error('[invitations/invite] reserve_account_invitation failed:', reserveError.message);
  const mapped = mapInvitationDbError(reserveError.message);
  return NextResponse.json(invitationError(mapped.code, mapped.message), {
    status: invitationErrorStatus(mapped.code),
  });
}

const isNewReservation = new Date(reservation.invited_at).getTime() >= beforeReserve - 2000;

if (!isNewReservation) {
  return NextResponse.json({
    invitation: {
      id: reservation.id,
      canonical_email: reservation.canonical_email,
      intended_role: reservation.intended_role,
      status: reservation.status,
      expires_at: reservation.expires_at,
      resend_count: reservation.resend_count,
    },
    already_pending: true,
    message: 'A pending invitation already exists for this email. Use resend to send it again.',
  });
}

const { error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
  data: { invitation_id: reservation.id },
});

if (authError) {
  const reason = classifyAuthDeliveryError(authError);
  console.error(`[invitations/invite] inviteUserByEmail failed for invitation ${reservation.id}:`, authError.message);

  const { error: markFailedError } = await supabaseAdmin.rpc('mark_account_invitation_failed', {
    p_invitation_id: reservation.id,
    p_reason: reason,
    p_actor_id: adminUser.id,
  });
  if (markFailedError) {
    console.error(
      `[invitations/invite] mark_account_invitation_failed also failed for ${reservation.id}:`,
      markFailedError.message
      );
  }

  await supabaseAdmin.from('activity_log').insert({
    actor_id: adminUser.id,
    action: 'account_invitation_delivery_failed',
    entity_type: 'account_invitation',
    entity_id: reservation.id,
    detail: `Auth delivery failed for invitation (${reason})`,
    metadata: {
      invitation_id: reservation.id,
      canonical_email: email,
      intended_role: role,
      actor_id: adminUser.id,
      reason,
      success: false,
    },
  });

  return NextResponse.json(
    invitationError('AUTH_DELIVERY_FAILED', 'Could not send the invitation email. Please try again.'),
    { status: invitationErrorStatus('AUTH_DELIVERY_FAILED') }
    );
}

await supabaseAdmin.from('activity_log').insert({
  actor_id: adminUser.id,
  action: 'account_invitation_delivery_requested',
  entity_type: 'account_invitation',
  entity_id: reservation.id,
  detail: `Invitation email requested for ${email}`,
  metadata: {
    invitation_id: reservation.id,
    canonical_email: email,
    intended_role: role,
    actor_id: adminUser.id,
    delivery_method: 'invite_user_by_email',
    success: true,
  },
});

return NextResponse.json({
  invitation: {
    id: reservation.id,
    canonical_email: reservation.canonical_email,
    intended_role: reservation.intended_role,
    status: reservation.status,
    expires_at: reservation.expires_at,
    resend_count: reservation.resend_count,
  },
  already_pending: false,
});
}
