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

// POST /api/admin/invitations/resend
// Body: { invitation_id: string }
//
// Follows the identical 8-step shape as invite (STAGE-2-2C-SPECIFICATION.md
// Section 7), substituting resend_account_invitation for
// reserve_account_invitation at step 3.
//
// Delivery mechanism deliberately differs from invite: per
// STAGE-2-1A-REVISED-DESIGN.md Section 8, repeat-calling
// inviteUserByEmail against an already-invited (unconfirmed) identity is
// "unverified" undocumented behavior and was explicitly rejected in favor
// of the verified default -- generateLink({type:'invite'}), which returns
// a link without relying on unconfirmed repeat-invite semantics. Until a
// real mail provider (Resend/custom SMTP) is configured, this project has
// no automatic delivery channel for that link, so per the same design
// doc's explicit rule, the raw link is never shown/logged/returned in the
// ordinary response -- only surfaced when ALLOW_DEV_INVITE_LINK_DISPLAY is
// explicitly set (dev-only, default off, never set in production).
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

const rateLimit = await checkAdminInvitationRateLimit(supabaseAdmin, adminUser.id);
  if (rateLimit.limited) {
    return NextResponse.json(
      invitationError('RATE_LIMITED', 'Too many invite/resend actions in the last hour. Please try again later.'),
      { status: invitationErrorStatus('RATE_LIMITED') }
      );
  }

const { data: resent, error: resendError } = await supabaseAdmin.rpc('resend_account_invitation', {
  p_invitation_id: invitationId,
  p_actor_id: adminUser.id,
});

if (resendError) {
  console.error('[invitations/resend] resend_account_invitation failed:', resendError.message);
  const mapped = mapInvitationDbError(resendError.message);
  return NextResponse.json(invitationError(mapped.code, mapped.message), {
    status: invitationErrorStatus(mapped.code),
  });
}
  if (resent.status !== 'pending') {
    return NextResponse.json(
      invitationError('INVITATION_EXPIRED', 'This invitation expired and could not be resent. Cancel it and create a new invitation.'),
      { status: invitationErrorStatus('INVITATION_EXPIRED') }
      );
  }

const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?invitation=${resent.id}`;

const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
  type: 'invite',
  email: resent.canonical_email,
  options: { redirectTo },
});

if (linkError) {
  const reason = classifyAuthDeliveryError(linkError);
  console.error(`[invitations/resend] generateLink failed for invitation ${resent.id}:`, linkError.message);

  const { error: markFailedError } = await supabaseAdmin.rpc('mark_account_invitation_failed', {
    p_invitation_id: resent.id,
    p_reason: reason,
    p_actor_id: adminUser.id,
  });
  if (markFailedError) {
    console.error(
      `[invitations/resend] mark_account_invitation_failed also failed for ${resent.id}:`,
      markFailedError.message
      );
  }

  await supabaseAdmin.from('activity_log').insert({
    actor_id: adminUser.id,
    action: 'account_invitation_delivery_failed',
    entity_type: 'account_invitation',
    entity_id: resent.id,
    detail: `Auth delivery failed on resend (${reason})`,
    metadata: {
      invitation_id: resent.id,
      canonical_email: resent.canonical_email,
      intended_role: resent.intended_role,
      actor_id: adminUser.id,
      reason,
      success: false,
    },
  });

  return NextResponse.json(
    invitationError('AUTH_DELIVERY_FAILED', 'Could not generate a fresh invitation link. Please try again.'),
    { status: invitationErrorStatus('AUTH_DELIVERY_FAILED') }
    );
}

await supabaseAdmin.from('activity_log').insert({
  actor_id: adminUser.id,
  action: 'account_invitation_delivery_requested',
  entity_type: 'account_invitation',
  entity_id: resent.id,
  detail: `Invitation link regenerated for ${resent.canonical_email} (resend #${resent.resend_count})`,
  metadata: {
    invitation_id: resent.id,
    canonical_email: resent.canonical_email,
    intended_role: resent.intended_role,
    actor_id: adminUser.id,
    delivery_method: 'generate_link_manual_relay',
    success: true,
  },
});

const devLinkExposureAllowed = process.env.ALLOW_DEV_INVITE_LINK_DISPLAY === 'true';

return NextResponse.json({
  invitation: {
    id: resent.id,
    canonical_email: resent.canonical_email,
    intended_role: resent.intended_role,
    status: resent.status,
    expires_at: resent.expires_at,
    resend_count: resent.resend_count,
  },
  delivery: devLinkExposureAllowed
  ? { method: 'manual_relay', dev_only_link: linkData?.properties?.action_link ?? null }
    : { method: 'manual_relay', note: 'No mail provider configured yet -- link generated but not auto-delivered. See docs.' },
});
}
