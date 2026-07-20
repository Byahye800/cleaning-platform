import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ROLE_HOME, type Role } from '@/lib/roleHome';

// Stage 2.3 -- lifecycle-aware routing enforcement.
//
// This file is UX/navigation enforcement ONLY. It is not, and must never
// become, the sole authorization boundary -- every mutating action is
// independently re-checked at the API-route layer (requireAdmin/
// requireSession, src/lib/adminAuth.ts) and at the database layer (RLS,
// function grants, ownership, all verified independently in Stages
// 2.2a/2.2b/2.2c). Nothing here should ever be relied on as the only
// thing standing between a request and sensitive data.
//
// Decision order (approved Stage 2.3 specification, implemented exactly,
// evaluation terminates at the first matching condition):
//   1. /admin/login is always allowed (bypass).
//   2. Resolve the session. No session (or a session-lookup failure,
//      treated identically -- see below) -> /onboarding is allowed
//      through unconditionally (first-load case, see the /onboarding
//      comment below); every other matched path -> redirect to
//      /admin/login with a safe, same-origin ?next=.
//   3. Resolve role from user_roles. Any failure -- query error, zero
//      rows, malformed response, or a value outside {admin, cleaner,
//      client} -- fails closed to a single account_configuration
//      outcome. Never assumed active, never falls through.
//   4. role === 'admin' -> no lifecycle-status logic at all. Admins have
//      no status column today; this is intentional (see the comment
//      further down), not an oversight.
//   5. role === 'cleaner' | 'client' -> resolve status from the matching
//      table. Same fail-closed contract as role resolution: query
//      error, missing row, missing value, or a value outside the four
//      known lifecycle states all fail closed to account_configuration.
//   6. Apply lifecycle status (disabled/suspended/restricted/active)
//      BEFORE the portal-boundary check, so a non-active user is routed
//      correctly regardless of which URL they originally requested.
//   7. Portal-boundary check (unchanged from pre-2.3 behavior).
//
// /onboarding's first, unauthenticated hit must be allowed through
// because Supabase's invite/reset links land the browser on this page
// carrying a PKCE `code` query parameter (confirmed against this repo's
// own reset-password/page.tsx precedent, not assumed) that only the
// CLIENT-SIDE Supabase SDK can exchange for a session -- the PKCE
// code_verifier half of that exchange lives only in the browser and
// never reaches this server-side request. proxy.ts therefore has no way
// to establish or verify a session on that first request. This is an
// unconditional allow-through for /onboarding whenever no session is
// resolved, not a one-time exception: proxy.ts cannot distinguish
// "mid-exchange" from "never had a session" using only server-visible
// state, and it doesn't need to -- nothing sensitive is rendered before
// a session exists (mirrors reset-password/page.tsx's own "verifying
// your reset link..." loading-state pattern). Once a session exists,
// /onboarding is fully gated like any other matched path (step 6).
type LifecycleStatus = 'restricted' | 'active' | 'suspended' | 'disabled';

const KNOWN_STATUSES: readonly LifecycleStatus[] = ['restricted', 'active', 'suspended', 'disabled'];
const KNOWN_ROLES: readonly Role[] = ['admin', 'cleaner', 'client'];

// UUID format guard for the ?invitation= query param, mirrored from
// src/app/auth/confirm/route.ts's own UUID_RE (not shared/imported --
// keeping this file's dependency surface unchanged).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function portalForPath(pathname: string): Role | null {
    if (pathname.startsWith('/admin')) return 'admin';
    if (pathname.startsWith('/cleaner')) return 'cleaner';
    if (pathname.startsWith('/client')) return 'client';
    return null;
}

// Safe, structured server-side logging for routing decisions. Only the
// fields explicitly listed below are ever passed in -- never a token,
// cookie, session object, header, or request body. A logging failure
// must never interrupt routing, so this never throws outward.
function logDecision(fields: {
    userId?: string | null;
    role?: string | null;
    status?: string | null;
    pathname: string;
    decision: string;
    redirect?: string | null;
    failureCategory?: string | null;
}) {
    try {
        console.error(
            '[proxy]',
            JSON.stringify({
                user_id: fields.userId ?? null,
                role: fields.role ?? null,
                status: fields.status ?? null,
                pathname: fields.pathname,
                decision: fields.decision,
                redirect: fields.redirect ?? null,
                failure_category: fields.failureCategory ?? null,
            })
            );
    } catch {
        // Logging must never break routing.
    }
}

// The sole source for the "next" redirect param: the current request's
// own server-derived pathname. Never a client-supplied value, never a
// full URL, never protocol-relative, never carries query parameters that
// might contain sensitive values. Only ever attached to the plain
// "no session on a protected path" redirect -- never to the suspended,
// disabled, or account_configuration redirects.
function safeNextParam(request: NextRequest): string {
    return request.nextUrl.pathname;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

// 1. /admin/login is always allowed.
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

// Signs out (best-effort -- a sign-out failure must never leave the
// request proceeding to portal rendering) and redirects, propagating
// any refreshed-token cookies onto the redirect response so the
// browser's cookie state stays consistent with the server's.
async function signOutAndRedirect(destination: string) {
    try {
        await supabase.auth.signOut();
    } catch {
        // Proceed to redirect regardless -- denial does not depend on
    // sign-out succeeding.
    }
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
}

// 2. Resolve session. A lookup failure (thrown error or a non-null
// `error` field) is treated identically to "no session" for routing
// purposes -- we cannot confirm a session exists either way, and
// guessing "probably still valid" would violate the fail-closed
// requirement. Logged distinctly from a genuine "not logged in" case
// so the two are distinguishable in server logs even though the
// routing outcome is the same.
const {
    data: { user },
    error: userError,
} = await supabase.auth.getUser();
    if (userError || !user) {
        if (userError) {
            logDecision({
                pathname,
                decision: pathname.startsWith('/onboarding') ? 'allow' : 'redirect',
                redirect: pathname.startsWith('/onboarding') ? null : '/admin/login',
                failureCategory: 'session_lookup_failed',
            });
        }
        if (pathname.startsWith('/onboarding')) {
            return response;
        }
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('next', safeNextParam(request));
        return NextResponse.redirect(loginUrl);
    }

// 3. Resolve role. Any failure fails closed to account_configuration.
const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);

if (roleError || !Array.isArray(roleRows)) {
    logDecision({
        userId: user.id,
        pathname,
        decision: 'sign_out',
        redirect: '/admin/login?error=account_configuration',
        failureCategory: 'role_lookup_failed',
    });
    return signOutAndRedirect('/admin/login?error=account_configuration');
}

const candidateRole = roleRows[0]?.role as string | undefined;
    const role = KNOWN_ROLES.find((r) => r === candidateRole);

if (!role) {
    // Narrow onboarding-finalization exception. A user who just accepted a
    // real invite via /auth/confirm's verifyOtp now holds a valid session
    // but, by design, has no user_roles row until finalize_account_invitation
    // runs from the onboarding page itself. Without this, every invite
    // acceptance fails closed here before onboarding can ever render.
    //
    // This does NOT relax the fail-closed rule generally: it fires only for
    // the exact "no role row exists at all" case (never 'unknown_role',
    // never a lookup error -- both still fall straight through to the
    // unconditional sign-out below), and only when the database's own
    // single source of truth -- invitation_finalization_eligibility(),
    // migration 0030 -- reports this exact invitation as eligible for the
    // currently authenticated caller. proxy.ts makes no eligibility
    // judgment of its own (no row-count or id-comparison logic here): it
    // consumes one explicit boolean the database computed. Any future
    // eligibility rule (tenant suspension, onboarding freeze, compliance
    // hold, etc.) only ever needs to change that function, never this file.
    if (!candidateRole && pathname === '/onboarding') {
        const invitationParam = request.nextUrl.searchParams.get('invitation');
        if (invitationParam && UUID_RE.test(invitationParam)) {
            const { data: eligibility, error: eligibilityError } = await supabase
                .rpc('invitation_finalization_eligibility', { p_invitation_id: invitationParam })
                .maybeSingle();
            const eligibilityRow = eligibility as { eligible_for_finalization?: boolean } | null;

            if (!eligibilityError && eligibilityRow?.eligible_for_finalization === true) {
                logDecision({
                    userId: user.id,
                    pathname,
                    decision: 'allow',
                    failureCategory: 'missing_role_pending_invitation',
                });
                return response;
            }
        }
    }

    logDecision({
        userId: user.id,
        role: candidateRole ?? null,
        pathname,
        decision: 'sign_out',
        redirect: '/admin/login?error=account_configuration',
        failureCategory: candidateRole ? 'unknown_role' : 'missing_role',
    });
    return signOutAndRedirect('/admin/login?error=account_configuration');
}

// 4/5/6. Lifecycle-status logic. Admin is exempt by design -- no
// status column exists for admin identities (confirmed live: admin
// rows have no corresponding cleaners/clients row), and the
// invitation system itself refuses to create admin invitations, so
// this branch is structurally unreachable for role === 'admin'. Not
// an artificial admin-lifecycle model -- simply not applying
// cleaner/client logic to a role that has no such data to read.
if (role === 'cleaner' || role === 'client') {
    const table = role === 'cleaner' ? 'cleaners' : 'clients';
    const { data: statusRows, error: statusError } = await supabase
    .from(table)
    .select('status')
    .eq('user_id', user.id)
    .limit(1);

    if (statusError || !Array.isArray(statusRows)) {
        logDecision({
            userId: user.id,
            role,
            pathname,
            decision: 'sign_out',
            redirect: '/admin/login?error=account_configuration',
            failureCategory: 'status_lookup_failed',
        });
        return signOutAndRedirect('/admin/login?error=account_configuration');
    }

    const rawStatus = statusRows[0]?.status as string | undefined;

    if (!rawStatus) {
        logDecision({
            userId: user.id,
            role,
            pathname,
            decision: 'sign_out',
            redirect: '/admin/login?error=account_configuration',
            failureCategory: 'missing_lifecycle_row',
        });
        return signOutAndRedirect('/admin/login?error=account_configuration');
    }

    const status = KNOWN_STATUSES.find((s) => s === rawStatus);

    if (!status) {
        logDecision({
            userId: user.id,
            role,
            status: rawStatus,
            pathname,
            decision: 'sign_out',
            redirect: '/admin/login?error=account_configuration',
            failureCategory: 'unexpected_lifecycle_value',
        });
        return signOutAndRedirect('/admin/login?error=account_configuration');
    }

    const onOnboarding = pathname.startsWith('/onboarding');

    if (status === 'disabled') {
        logDecision({ userId: user.id, role, status, pathname, decision: 'sign_out', redirect: '/admin/login?error=account_disabled' });
        return signOutAndRedirect('/admin/login?error=account_disabled');
    }

    if (status === 'suspended') {
        logDecision({ userId: user.id, role, status, pathname, decision: 'sign_out', redirect: '/admin/login?error=account_suspended' });
        return signOutAndRedirect('/admin/login?error=account_suspended');
    }

    if (status === 'restricted') {
        if (onOnboarding) {
            return response;
        }
        logDecision({ userId: user.id, role, status, pathname, decision: 'redirect', redirect: '/onboarding' });
        return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    // status === 'active'
    if (onOnboarding) {
        logDecision({ userId: user.id, role, status, pathname, decision: 'redirect', redirect: ROLE_HOME[role] });
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
    // Otherwise fall through to the portal-boundary check below.
}

// 7. Portal-boundary check (unchanged from pre-2.3 behavior).
const portal = portalForPath(pathname);
    if (portal && role !== portal) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }

return response;
}

export const config = {
    matcher: ['/admin/:path*', '/cleaner/:path*', '/client/:path*', '/onboarding/:path*'],
};
