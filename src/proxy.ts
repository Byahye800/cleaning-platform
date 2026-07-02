import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin/clients',
  cleaner: '/cleaner/inbox',
  client: '/client/jobs',
};

function portalForPath(pathname: string): keyof typeof ROLE_HOME | null {
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

  const role = roleRows?.[0]?.role as keyof typeof ROLE_HOME | undefined;

  if (!role || !ROLE_HOME[role]) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
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
