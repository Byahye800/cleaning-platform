import { NextResponse } from 'next/server';

// Shared error taxonomy for the admin cleaner-management Route Handlers
// (src/app/api/admin/cleaners/route.ts, src/app/api/admin/cleaners/[id]/route.ts).
// Scoped to this route family only, mirroring the self-contained pattern
// already used by src/app/api/admin/accounts/activate/route.ts rather than
// reusing src/lib/invitationErrors.ts, which is specific to the
// account-invitation lifecycle functions.
//
// mapCleanerDbError translates the exact, stable exception strings raised
// by the admin_create_cleaner / admin_update_cleaner RPCs (staging-verified
// this session as "migration 0030" -- the SQL file has not yet been
// committed to the repo. Note: origin/main independently committed
// supabase/0030_invitation_finalization_eligibility.sql first (ONBOARDING-001
// track, 2026-07-20), so this cleaner-RPC migration must be committed as
// 0031, not 0030, to avoid a filename collision. Not yet actioned.)
//
// Both RPCs are SECURITY INVOKER and perform their own independent
// auth.uid()/admin-role check as the second authorization layer beneath
// this route's requireAdmin() call, per SECURITY-MODEL.md's three-layer
// model -- so 'not authenticated' and 'not authorized: admin role
// required' are mapped here defensively even though requireAdmin() should
// already have stopped an unauthorized caller before the RPC is ever
// reached.
export type CleanerErrorCode =
    | 'NOT_AUTHENTICATED'
  | 'NOT_ADMIN'
  | 'INVALID_REQUEST'
  | 'CLEANER_NOT_FOUND'
  | 'EMAIL_ALREADY_IN_USE'
  | 'INTERNAL_ERROR';

const CLEANER_HTTP: Record<CleanerErrorCode, number> = {
    NOT_AUTHENTICATED: 401,
    NOT_ADMIN: 403,
    INVALID_REQUEST: 400,
    CLEANER_NOT_FOUND: 404,
    EMAIL_ALREADY_IN_USE: 409,
    INTERNAL_ERROR: 500,
};

export function cleanerErrorStatus(code: CleanerErrorCode): number {
    return CLEANER_HTTP[code];
}

export function cleanerError(code: CleanerErrorCode, message: string) {
    return { success: false as const, error: { code, message } };
}

export function jsonNoStore(body: unknown, status: number) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Maps the exact exception strings raised inside admin_create_cleaner /
// admin_update_cleaner to a stable error code + client-safe message.
// Never forwards a raw DB error string verbatim to the client except for
// the small set of messages that are themselves already client-safe
                             // validation text with no interpolated identifiers (name/email/hourly_rate/
// dbs_status checks, all of which this route also validates independently
// before ever calling the RPC).
//
// Messages that interpolate a field name or id ('unknown or protected
// field: %', 'cleaner update affected zero rows: %') are treated as
// internal/defensive-backstop conditions -- they should be unreachable
// given this route's own allow-list validation and p_fields construction,
// so if one ever fires it is logged server-side by the caller and reported
// to the client as INTERNAL_ERROR rather than echoed back.
export function mapCleanerDbError(rawMessage: string): { code: CleanerErrorCode; message: string } {
    const msg = rawMessage || '';

  if (msg.includes('not authenticated')) {
        return { code: 'NOT_AUTHENTICATED', message: 'You must be signed in.' };
  }
    if (msg.includes('not authorized: admin role required')) {
          return { code: 'NOT_ADMIN', message: 'This action requires an admin account.' };
    }
    if (msg.startsWith('cleaner not found')) {
          return { code: 'CLEANER_NOT_FOUND', message: 'Cleaner not found.' };
    }
    if (msg.includes('already in use by another cleaner')) {
          return { code: 'EMAIL_ALREADY_IN_USE', message: 'This email is already in use by another cleaner.' };
    }
    if (
          msg.includes('name must not be null or blank') ||
          msg.includes('email must not be null or blank') ||
          msg.includes('hourly_rate must not be null') ||
          msg.includes('hourly_rate must be greater than 0') ||
          msg.includes('dbs_status must be one of') ||
          msg.includes('no editable fields supplied') ||
          msg.includes('p_fields must not contain null entries')
        ) {
          return { code: 'INVALID_REQUEST', message: msg };
    }

  // Defensive backstops ('unknown or protected field: %',
  // 'cleaner update affected zero rows: %') and anything unrecognized.
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
}
