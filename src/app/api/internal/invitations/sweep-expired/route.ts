export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { invitationError, invitationErrorStatus } from '@/lib/invitationErrors';

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.INTERNAL_CRON_SECRET;
  const providedSecret = request.headers.get('x-internal-cron-secret');
  if (!configuredSecret) {
    console.error('[invitations/sweep-expired] INTERNAL_CRON_SECRET is not configured; rejecting all requests.');
    return NextResponse.json(invitationError('INTERNAL_ERROR', 'This endpoint is not configured.'), { status: 500 });
  }

if (!providedSecret || providedSecret !== configuredSecret) {
  return NextResponse.json(invitationError('NOT_AUTHENTICATED', 'Not authorized.'), {
    status: invitationErrorStatus('NOT_AUTHENTICATED'),
  });
}

const supabaseAdmin = createSupabaseAdminClient();
  const { data: expiredCount, error } = await supabaseAdmin.rpc('sweep_expired_account_invitations');

if (error) {
  console.error('[invitations/sweep-expired] sweep_expired_account_invitations failed:', error.message);
  return NextResponse.json(invitationError('INTERNAL_ERROR', 'Sweep failed.'), { status: 500 });
}

console.log(`[invitations/sweep-expired] expired ${expiredCount} stale pending invitation(s).`);
  return NextResponse.json({ expired_count: expiredCount });
}
