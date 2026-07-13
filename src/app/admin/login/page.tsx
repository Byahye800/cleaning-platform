'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { ROLE_HOME, type Role } from '@/lib/roleHome';
import { color, spacing, radius, font } from '@/lib/theme';

async function resolveHomeForUser(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .limit(1);

  const role = data?.[0]?.role as Role | undefined;
  return role && ROLE_HOME[role] ? ROLE_HOME[role] : null;
}

export default function AdminLoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resetBusy, setResetBusy] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'success') setResetSuccess(true);

    // Stage 2.3 -- proxy.ts's lifecycle routing (src/proxy.ts) attaches one
    // of these three error codes when it signs a user out. Preserve
    // account_disabled exactly as before; account_suspended and
    // account_configuration are new in Stage 2.3. Wording is deliberately
    // generic -- no internal database/lifecycle detail is exposed here.
    const errorParam = params.get('error');
    if (errorParam === 'account_disabled') {
          setError('Your account is not active. Contact your administrator.');
    } else if (errorParam === 'account_suspended') {
          setError('Your account is temporarily suspended. Please contact your administrator.');
    } else if (errorParam === 'account_configuration') {
          setError('We could not verify your account access. Please contact your administrator.');
    }
}, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) return;
      const home = await resolveHomeForUser(supabase, data.session.user.id);
      if (home) router.replace(home);
    })().catch(() => {
      // ignore; user may not be logged in
    });
  }, [router, supabase]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const home = data.user ? await resolveHomeForUser(supabase, data.user.id) : null;
      if (!home) {
        await supabase.auth.signOut();
        throw new Error('No role is configured for this account. Contact an admin.');
      }
      router.replace(home);
    } catch (e: any) {
      setError(e?.message ?? 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setResetNotice('Enter your email above first, then click "Forgot password?" again.');
      return;
    }
    setResetBusy(true);
    setResetNotice(null);
    try {
      await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // ignore — same message is shown either way, for enumeration safety
    } finally {
      setResetBusy(false);
      setResetNotice('If an account exists for that email, a reset link has been sent. Check your inbox.');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: color.gray50,
        fontFamily: font.family,
        padding: spacing.lg,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: color.white,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: spacing.xxl,
        }}
      >
        <div style={{ marginBottom: spacing.xl, textAlign: 'center' }}>
          <div style={{ fontWeight: font.weight.heavy, fontSize: font.size.xl, color: color.navy, letterSpacing: '-0.01em' }}>
            FM Pro Cleaning
          </div>
          <p style={{ marginTop: spacing.sm, color: color.textSecondary, fontSize: font.size.base }}>
            Sign in to your account
          </p>
        </div>

        {resetSuccess && (
          <div style={{ padding: spacing.md, marginBottom: spacing.lg, border: '1px solid #bbf7d0', background: '#f0fdf4', color: color.success, borderRadius: radius.md, fontSize: font.size.sm }}>
            Password updated — sign in with your new password.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
              autoComplete="email"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              style={inputStyle}
              autoComplete="current-password"
            />
          </label>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetBusy}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              padding: 0,
              color: color.navy,
              fontSize: font.size.sm,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {resetBusy ? 'Sending…' : 'Forgot password?'}
          </button>

          {resetNotice && (
            <div style={{ padding: spacing.md, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', borderRadius: radius.md, fontSize: font.size.sm }}>
              {resetNotice}
            </div>
          )}

          {error && (
            <div style={{ padding: spacing.md, border: '1px solid #fecaca', background: '#fff1f2', color: color.error, borderRadius: radius.md, fontSize: font.size.sm }}>
              {error}
            </div>
          )}

          <button
            onClick={signIn}
            disabled={busy || !email || !password}
            style={buttonStyle}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  outline: 'none',
  fontSize: font.size.base,
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: radius.md,
  border: `1px solid ${color.navy}`,
  background: color.navy,
  color: color.textInverse,
  fontWeight: font.weight.medium,
  fontSize: font.size.base,
  cursor: 'pointer',
};
