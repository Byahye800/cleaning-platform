export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { invitationError, invitationErrorStatus, mapInvitationDbError } from '@/lib/invitationErrors';

// POST /api/auth/invitation/finalize
// Body: { invitation_id: string }
//
// Any authenticated user may call this -- but strictly for their OWN
// session-derived identity. p_auth_user_id is always taken from the
// server-verified session (requireSession), never accepted from the
// request body, per the authorization matrix in
// STAGE-2-2C-SPECIFICATION.md Section 9 ("only for their own session-
// derived user id, never a supplied one").
//
// finalize_account_invitation is itself idempotent for repeat calls from
// the same auth user (its own status<>pending branch treats
// auth_user_id = p_auth_user_id as a no-op continue rather than an error),
// so a client retry after a lost response is always safe to just call
// again with the same invitation_id.
//
// reconcile_account_invitation is always called afterward as a safety net
// (Section 8), regardless of whether finalize appeared to succeed cleanly
// -- it is a no-op-safe operation on any row it doesn't recognize as
// needing repair, so this is unconditionally safe to run every time.
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session.ok) {
    return NextResponse.json(invitationError(session.code, session.message), {
      status: invitationErrorStatus(session.code),
    });
  }
  const user = session.user;

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

const { data: finalizeResult, error: finalizeError } = await supabaseAdmin.rpc('finalize_account_invitation', {
  p_invitation_id: invitationId,
  p_auth_user_id: user.id,
});

if (finalizeError) {
  console.error(`[invitation/finalize] finalize_account_invitation failed for ${invitationId}:`, finalizeError.message);
}

const { data: reconcileResult, error: reconcileError } = await supabaseAdmin.rpc('reconcile_account_invitation', {
  p_invitation_id: invitationId,
  p_actor_id: null,
});

if (reconcileError) {
  console.error(`[invitation/finalize] safety-net reconcile failed for ${invitationId}:`, reconcileError.message);
}

if (finalizeError) {
  const mapped = mapInvitationDbError(finalizeError.message);
  return NextResponse.json(invitationError(mapped.code, mapped.message), {
    status: invitationErrorStatus(mapped.code),
  });
}

const result = reconcileError ? finalizeResult : (reconcileResult ?? finalizeResult);

return NextResponse.json({
  invitation: {
    id: result.id,
    canonical_email: result.canonical_email,
    intended_role: result.intended_role,
    status: result.status,
    auth_user_id: result.auth_user_id,
  },
});
}
