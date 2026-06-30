'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

export default function AdminLoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) router.replace('/admin/clients');
    })().catch(() => {
      // ignore; user may not be logged in
    });
  }, [router, supabase]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.replace('/admin/clients');
    } catch (e: any) {
      setError(e?.message ?? 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 520 }}>
      <h1 style={{ marginBottom: 8 }}>Admin Login</h1>
      <p style={{ marginBottom: 16, color: '#6b7280' }}>
        Supabase email/password sign-in. RLS will enforce admin vs client/cleaner visibility.
      </p>

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

        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          After login, go to <a href="/admin/rls-sanity">RLS Sanity Test</a> to verify policies.
        </div>
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
