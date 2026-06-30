'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

type CheckResult = {
  ok: boolean;
  label: string;
  details?: string;
};

type UserRoleRow = {
  user_id: string;
  role: 'admin' | 'client' | 'cleaner' | string;
  is_active: boolean;
};

export default function RlsSanityTestPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [sessionInfo, setSessionInfo] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [myRole, setMyRole] = useState<string>('unknown');

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      setSessionInfo('Not signed in');
      setMyRole('unknown');
      return;
    }

    const { data: roleData, error: roleErr } = await supabase
      .from('user_roles')
      .select('role,is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleErr) {
      setSessionInfo(`Signed in as ${user.email ?? user.id} (could not read user_roles: ${roleErr.message})`);
      setMyRole('unknown');
      return;
    }

    const roleRow = roleData as unknown as UserRoleRow | null;
    const role = roleRow?.role ?? 'unknown';
    setMyRole(role);
    setSessionInfo(`Signed in as ${user.email ?? user.id} (role: ${roleRow?.role ?? 'unknown'})`);
  }

  useEffect(() => {
    refreshSession().catch(() => setSessionInfo('Could not read session'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runChecks() {
    setBusy(true);
    setResults([]);
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        setResults([{ ok: false, label: 'Must be signed in to run checks', details: 'No Supabase session.' }]);
        return;
      }

      // Determine role (expected outcomes)
      const { data: roleData, error: roleErr } = await supabase
        .from('user_roles')
        .select('role,is_active')
        .eq('user_id', user.id)
        .maybeSingle();

      const roleRow = (roleData as any) as UserRoleRow | null;
      const role = roleRow?.role ?? 'unknown';
      const isActive = roleRow?.is_active ?? false;
      const isAdmin = role === 'admin' && isActive;

      setResults((prev) => [
        ...prev,
        { ok: true, label: `user_roles: current role = ${role}`, details: roleRow ? JSON.stringify(roleRow) : 'null' },
      ]);

      // 1) SELECT checks (should not error; may return empty)
      const selectChecks: Array<{ label: string; run: () => Promise<void> }> = [
        {
          label: 'user_roles: SELECT self',
          run: async () => {
            const { error } = await supabase
              .from('user_roles')
              .select('user_id,role,is_active')
              .eq('user_id', user.id)
              .limit(1);
            if (error) throw error;
          },
        },
        {
          label: 'clients: SELECT (may be empty if not tenant owner)',
          run: async () => {
            const { error } = await supabase.from('clients').select('id,name,contact_email').limit(5);
            if (error) throw error;
          },
        },
        {
          label: 'cleaners: SELECT (may be empty if not tenant owner)',
          run: async () => {
            const { error } = await supabase.from('cleaners').select('id,name,hourly_rate').limit(5);
            if (error) throw error;
          },
        },
      ];

      for (const c of selectChecks) {
        try {
          await c.run();
          setResults((prev) => [...prev, { ok: true, label: c.label }]);
        } catch (e: any) {
          setResults((prev) => [...prev, { ok: false, label: c.label, details: e?.message ?? String(e) }]);
        }
      }

      // 2) Admin-only write test via RLS enforcement
      const testEmail = `rls-test-${Date.now()}@example.com`;
      const testClientPayload = {
        user_id: user.id,
        name: `RLS Test Client ${Date.now()}`,
        address: 'RLS test address',
        contact_email: testEmail,
        contact_phone: null,
        agreed_rate: null,
        notes: null,
        status: 'active',
      };

      let insertOk = false;
      let insertErrMsg: string | undefined;
      try {
        const { error: insertErr } = await supabase.from('clients').insert(testClientPayload);
        if (insertErr) throw insertErr;
        insertOk = true;
      } catch (e: any) {
        insertErrMsg = e?.message ?? String(e);
      }

      const expectedOk = isAdmin;
      setResults((prev) => [
        ...prev,
        {
          ok: insertOk === expectedOk,
          label: `clients: INSERT enforcement (expected ${expectedOk ? 'allow' : 'deny'} for role=${role})`,
          details: insertOk
            ? 'Insert succeeded (admin allowed)'
            : `Insert denied or failed as expected${insertErrMsg ? `: ${insertErrMsg}` : ''}`,
        },
      ]);

      // Cleanup if admin inserted
      if (insertOk) {
        const { error: delErr } = await supabase.from('clients').delete().eq('contact_email', testEmail);
        if (delErr) {
          setResults((prev) => [
            ...prev,
            { ok: false, label: 'Cleanup: delete inserted test client', details: delErr.message },
          ]);
        } else {
          setResults((prev) => [...prev, { ok: true, label: 'Cleanup: delete inserted test client' }]);
        }
      }
    } finally {
      setBusy(false);
      await refreshSession().catch(() => {});
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>RLS Sanity Test</h1>
      <div style={{ marginBottom: 14, color: '#6b7280' }}>{sessionInfo}</div>
      <div style={{ marginBottom: 14, fontSize: 12, color: '#6b7280' }}>
        Expected behavior: admin can INSERT; clients/cleaners should be denied tenant table writes.
      </div>

      <button
        onClick={() => runChecks()}
        disabled={busy}
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #111827',
          background: busy ? '#9ca3af' : '#111827',
          color: 'white',
          fontWeight: 700,
          cursor: busy ? 'not-allowed' : 'pointer',
          marginBottom: 16,
        }}
      >
        {busy ? 'Running checks…' : 'Run RLS sanity checks'}
      </button>

      <div style={{ display: 'grid', gap: 10 }}>
        {results.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>No results yet. Click the button.</div>
        ) : (
          results.map((r, idx) => (
            <div
              key={idx}
              style={{
                padding: 12,
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: r.ok ? '#ecfdf5' : '#fef2f2',
              }}
            >
              <div style={{ fontWeight: 800, color: r.ok ? '#047857' : '#b91c1c' }}>
                {r.ok ? '✅' : '❌'} {r.label}
              </div>
              {r.details && (
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 12, color: r.ok ? '#064e3b' : '#991b1b' }}>
                  {r.details}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: '#6b7280' }}>
        If you see unexpected allows/denies, check:
        <ul>
          <li>your user’s row in <code>public.user_roles</code> (admin + is_active=true)</li>
          <li>RLS policies were applied in the right order (policy file executed after enabling RLS)</li>
          <li>Supabase Auth session is using the correct project URL/anon key</li>
        </ul>
      </div>
    </div>
  );
}
