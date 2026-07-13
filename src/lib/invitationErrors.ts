import type { SupabaseClient } from '@supabase/supabase-js';

// Uniform error-response shape and error-code taxonomy, exactly as locked
// in STAGE-2-2C-SPECIFICATION.md Section 12. Raw Postgres `raise exception`
// text must never reach the client -- this file is the single place that
// translates the account-invitation lifecycle functions' stable,
// descriptive exception strings (confirmed by reading
// supabase/0027_account_invitation_lifecycle_completion.sql) into one of
// the codes below. Anything unrecognized becomes INTERNAL_ERROR, with the
// raw message logged server-side only.
export type InvitationErrorCode =
  | 'NOT_AUTHENTICATED'
| 'NOT_ADMIN'
| 'INVITATION_NOT_FOUND'
| 'INVITATION_NOT_PENDING'
| 'INVITATION_EXPIRED'
| 'ALREADY_INVITED'
| 'ROLE_MISMATCH'
| 'RESEND_CAP_REACHED'
| 'RATE_LIMITED'
| 'AUTH_DELIVERY_FAILED'
| 'INTERNAL_ERROR'
| 'INVALID_REQUEST';

export type InvitationErrorBody = { error: { code: InvitationErrorCode; message: string } };

const HTTP_STATUS: Record<InvitationErrorCode, number> = {
  NOT_AUTHENTICATED: 401,
  NOT_ADMIN: 403,
  INVITATION_NOT_FOUND: 404,
  INVITATION_NOT_PENDING: 409,
  INVITATION_EXPIRED: 409,
  ALREADY_INVITED: 409,
  ROLE_MISMATCH: 409,
  RESEND_CAP_REACHED: 429,
  RATE_LIMITED: 429,
  AUTH_DELIVERY_FAILED: 502,
  INTERNAL_ERROR: 500,
  INVALID_REQUEST: 400,
};

export function invitationErrorStatus(code: InvitationErrorCode): number {
  return HTTP_STATUS[code];
}

export function invitationError(code: InvitationErrorCode, message: string): InvitationErrorBody {
  return { error: { code, message } };
}

// Matches the exact, stable exception strings raised by the 9 lifecycle
// functions. Order matters: more specific patterns are checked before
// generic ones (e.g. "not an admin user" before a catch-all).
export function mapInvitationDbError(rawMessage: string): { code: InvitationErrorCode; message: string } {
  const m = rawMessage ?? '';

if (/is not an admin user/i.test(m)) {
  return { code: 'NOT_ADMIN', message: 'This action requires an admin account.' };
}
  if (/identity already exists for email .+, cannot reserve a new invitation/i.test(m)) {
    return {
      code: 'ALREADY_INVITED',
      message: 'This email already has an account. It cannot be invited again.',
    };
  }
  if (/a pending invitation for .+ already exists for role .+, cannot reserve for role/i.test(m)) {
    return {
      code: 'ROLE_MISMATCH',
      message: 'A pending invitation already exists for this email under a different role.',
    };
  }
  if (/has reached the maximum resend count/i.test(m)) {
    return {
      code: 'RESEND_CAP_REACHED',
      message: 'This invitation has been resent the maximum number of times. Cancel it and send a new invitation instead.',
    };
  }
  if (/invitation .+ not found/i.test(m)) {
    return { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' };
  }
  if (/does not belong to the calling user/i.test(m)) {
    return { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' };
  }
  if (/is not pending \(status=.+\), cannot/i.test(m)) {
    return { code: 'INVITATION_NOT_PENDING', message: 'This invitation is no longer pending.' };
  }
  if (/already finalized to a different auth user/i.test(m)) {
    return { code: 'INVITATION_NOT_PENDING', message: 'This invitation is already linked to a different account.' };
  }

return { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
}

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_ACTIONS = 20;

export async function checkAdminInvitationRateLimit(
  admin: SupabaseClient,
  actorId: string
  ): Promise<{ limited: boolean; count: number }> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

const { count, error } = await admin
  .from('activity_log')
  .select('id', { count: 'exact', head: true })
  .eq('actor_id', actorId)
  .in('action', ['account_invitation_reserved', 'account_invitation_resent'])
  .gte('created_at', since);

if (error) {
  console.error('[invitations] rate-limit count query failed:', error.message);
  return { limited: false, count: 0 };
}

const actualCount = count ?? 0;
  return { limited: actualCount >= RATE_LIMIT_MAX_ACTIONS, count: actualCount };
}

export function classifyAuthDeliveryError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number } | null)?.status;

if (/already registered|already exists|already been registered/i.test(message)) {
  return 'auth_identity_already_exists';
}
  if (status === 429 || /rate.?limit/i.test(message)) {
    return 'auth_rate_limited';
  }
  if (status && status >= 500) {
    return 'auth_service_error';
  }
  if (status === 401 || status === 403) {
    return 'auth_unauthorized';
  }
  return 'auth_delivery_failed';
}
