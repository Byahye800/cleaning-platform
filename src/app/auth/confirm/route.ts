export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// This route exists solely to complete the admin-triggered invitation
// flow. It must never be widened into a generic OTP-verification
// endpoint for other email types (magic link, recovery, signup) without
// a fresh security review -- accepting a caller-chosen `type` here is a
// known bug class in hand-rolled Supabase confirm routes.
const ALLOWED_TYPE = 'invite' as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const invitation = searchParams.get('invitation');

  // Reject anything that isn't exactly the invite flow this route was
  // built for. The literal ALLOWED_TYPE constant is what gets passed to
  // verifyOtp below -- never the raw request value -- even though we
  // also check equality here.
  if (!tokenHash || type !== ALLOWED_TYPE) {
    return NextResponse.redirect(new URL('/onboarding?error=invitation_failed', request.url));
  }

  // invitation is only ever used as a same-origin query-string value on
  // the fixed /onboarding redirect below -- never as a redirect
  // destination itself, never trusted for authorization. Still must be
  // shape-validated before use so a malformed or crafted value can't be
  // smuggled through.
  if (!invitation || !UUID_RE.test(invitation)) {
    return NextResponse.redirect(new URL('/onboarding?error=invitation_failed', request.url));
  }

  const cookieStore = await cookies();

  // The redirect target is fixed and derived only from server-validated
  // values (request.url's own origin + the shape-checked invitation id)
  // -- never from an externally supplied redirect parameter. No open
  // redirect is possible here.
  const response = NextResponse.redirect(new URL(`/onboarding?invitation=${invitation}`, request.url));
  response.headers.set('Cache-Control', 'private, no-store');

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: ALLOWED_TYPE });

  if (error) {
    const failed = NextResponse.redirect(new URL('/onboarding?error=invitation_failed', request.url));
    failed.headers.set('Cache-Control', 'private, no-store');
    return failed;
  }

  return response;
}
