'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit() {
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      router.replace('/admin/login?reset=success');
    } catch (e: any) {
      setError(e?.message ?? 'Could not update password.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 520 }}>
        <p style={{ color: '#6b7280' }}>Verifying your reset link…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 520 }}>
      <h1 style={{ marginBottom: 8 }}>Set a new password</h1>
      <p style={{ marginBottom: 16, color: '#6b7280' }}>Choose a new password for your account.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>New password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            style={inputStyle}
            autoComplete="new-password"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>Confirm new password</span>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            style={inputStyle}
            autoComplete="new-password"
          />
        </label>

        {error && (
          <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy || !password || !confirmPassword}
          style={buttonStyle}
        >
          {busy ? 'Updating…' : 'Set password'}
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
