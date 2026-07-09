import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ROLE_HOME, type Role } from '@/lib/roleHome';

function portalForPath(pathname: string): Role | null {
    if (pathname.startsWith('/admin')) return 'admin';
    if (pathname.startsWith('/cleaner')) return 'cleaner';
    if (pathname.startsWith('/client')) return 'client';
    return null;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin/login')) {
        return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
            cookies: {
                      getAll() {
                                  return request.cookies.getAll();
                      },
                      setAll(cookiesToSet) {
                                  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                                  response = NextResponse.next({ request });
                                  cookiesToSet.forEach(({ name, value, options }) =>
                                                response.cookies.set(name, value, options)
                                                                 );
                      },
            },
    }
      );

  const {
        data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
        return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .limit(1);

  const role = roleRows?.[0]?.role as Role | undefined;

  if (!role || !ROLE_HOME[role]) {
        return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Account status enforcement: cleaners/clients carry a status column
  // ('active' | 'pending' | 'disabled') that, before this check, was purely
  // cosmetic -- an admin setting a cleaner/client to 'disabled' had no actual
  // effect on login/access. Anything other than 'active' now blocks access
  // at the routing layer (not just RLS), and the session is signed out so a
  // reactivated account requires a fresh login rather than reusing a stale
  // session. Admins have no status column and are not subject to this check.
  async function denyForInactiveAccount() {
        await supabase.auth.signOut();
        const redirectResponse = NextResponse.redirect(
                new URL('/admin/login?error=account_disabled', request.url)
              );
        response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
        return redirectResponse;
  }

  if (role === 'cleaner') {
        const { data: cleanerRows } = await supabase
          .from('cleaners')
          .select('status')
          .eq('user_id', user.id)
          .limit(1);
        if (cleanerRows?.[0]?.status !== 'active') {
                return denyForInactiveAccount();
        }
  }

  if (role === 'client') {
        const { data: clientRows } = await supabase
          .from('clients')
          .select('status')
          .eq('user_id', user.id)
          .limit(1);
        if (clientRows?.[0]?.status !== 'active') {
                return denyForInactiveAccount();
        }
  }

  const portal = portalForPath(pathname);

  if (portal && role !== portal) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  }

  return response;
}

export const config = {
    matcher: ['/admin/:path*', '/cleaner/:path*', '/client/:path*'],
};
