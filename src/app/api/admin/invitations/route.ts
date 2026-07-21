export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { invitationError, invitationErrorStatus } from '@/lib/invitationErrors';

// GET /api/admin/invitations?status=pending&role=cleaner
//
// Read-only list endpoint for the Admin Invitations page (ADMIN-INVITATIONS-001).
// This is a deliberate, minimal API contract -- NOT a raw projection of the
// account_invitations table. Only the fields the UI actually needs are
// selected from the database AND explicitly re-mapped onto the response
// object below, so the contract stays stable even if the table gains new
// internal columns later. Deliberately never exposed here: invited_by,
// auth_user_id, superseded_by, retry_of, cancelled_by, last_resent_at,
// created_at, updated_at -- these are internal linkage/audit fields, not
// data the UI needs to render a list or drive Resend/Cancel actions. There
// are no invitation tokens or secrets on this table at all (delivery tokens
// live only inside Supabase Auth, never in account_invitations), so nothing
// token-shaped could leak even by accident, but the explicit-field-list
// discipline is maintained regardless.
//
// This route makes no state change -- it does not call any of the
// lifecycle RPCs (reserve/resend/cancel/reconcile/mark_failed/etc.), which
// remain exactly as implemented. It is purely a read, gated by the same
// requireAdmin() check used by every other route in this directory.
const ALLOWED_STATUSES = ['pending', 'accepted', 'expired', 'cancelled', 'superseded', 'failed'] as const;
const ALLOWED_ROLES = ['cleaner', 'client'] as const;

// Safety cap on rows returned, matching the convention already used by
// admin/clients/page.tsx and admin/cleaners/page.tsx (both .limit(200)).
// No offset/cursor parameter is implemented in this cycle -- status/role
// filtering already narrows the common cases -- but the query shape below
// (independent status/role predicates layered onto a single base query)
// is structured so a page/cursor parameter could be added later without
// changing this contract's existing fields or behavior.
const ROW_LIMIT = 200;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(invitationError(admin.code, admin.message), {
      status: invitationErrorStatus(admin.code),
    });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const roleParam = searchParams.get('role');

  if (statusParam && !(ALLOWED_STATUSES as readonly string[]).includes(statusParam)) {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'Invalid status filter.'), { status: 400 });
  }
  if (roleParam && !(ALLOWED_ROLES as readonly string[]).includes(roleParam)) {
    return NextResponse.json(invitationError('INVALID_REQUEST', 'Invalid role filter.'), { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();

  let query = supabaseAdmin
    .from('account_invitations')
    .select('id, canonical_email, intended_role, status, invited_at, expires_at, resend_count, cancelled_at')
    .order('invited_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (statusParam) query = query.eq('status', statusParam);
  if (roleParam) query = query.eq('intended_role', roleParam);

  const { data, error } = await query;

  if (error) {
    console.error('[invitations/list] query failed:', error.message);
    return NextResponse.json(invitationError('INTERNAL_ERROR', 'Could not load invitations.'), {
      status: invitationErrorStatus('INTERNAL_ERROR'),
    });
  }

  const invitations = (data ?? []).map((row) => ({
    id: row.id as string,
    canonical_email: row.canonical_email as string,
    intended_role: row.intended_role as 'cleaner' | 'client',
    status: row.status as string,
    invited_at: row.invited_at as string,
    expires_at: row.expires_at as string | null,
    resend_count: row.resend_count as number,
    cancelled_at: row.cancelled_at as string | null,
  }));

  return NextResponse.json({ invitations });
}
