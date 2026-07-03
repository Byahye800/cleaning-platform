'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { ROLE_HOME, type Role } from '@/lib/roleHome';

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
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 520 }}>
      <h1 style={{ marginBottom: 8 }}>Admin Login</h1>
      <p style={{ marginBottom: 16, color: '#6b7280' }}>
        Supabase email/password sign-in. RLS will enforce admin vs client/cleaner visibility.
      </p>

      {resetSuccess && (
        <div style={{ padding: 10, marginBottom: 16, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 8 }}>
          Password updated — sign in with your new password.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            autoComplete="email"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Password</span>
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
            color: '#2563eb',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {resetBusy ? 'Sending…' : 'Forgot password?'}
        </button>

        {resetNotice && (
          <div style={{ padding: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', borderRadius: 8 }}>
            {resetNotice}
          </div>
        )}

        {error && (
          <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8 }}>
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

      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => router.replace('/')}
          style={{ ...buttonStyle, background: '#fff', border: '1px solid #e5e7eb', color: '#111827' }}
        >
          Back to home
        </button>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #111827',
  background: '#111827',
  color: 'white',
  fontWeight: 600,
  cursor: 'pointer',
};
