'use client';

import { useState } from 'react';

type InviteRole = 'cleaner' | 'client';

type InviteResult =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export default function InviteForm({ role }: { role: InviteRole }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function sendInvite() {
    const trimmed = email.trim();
    if (!trimmed) {
      setResult({ kind: 'error', message: 'Enter an email address.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/invitations/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) {
        setResult({
          kind: 'error',
          message: body?.error?.message ?? 'Could not send the invitation. Please try again.',
        });
        return;
      }
      if (body.already_pending) {
        setResult({
          kind: 'success',
          message: `A pending invitation already exists for ${trimmed}. Use the resend option to send it again if needed.`,
        });
      } else {
        setResult({ kind: 'success', message: `Invitation sent to ${trimmed}.` });
        setEmail('');
      }
    } catch {
      setResult({ kind: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>Invite a {role}</h3>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        Sends a real invitation email. The recipient sets their own password and completes onboarding; an admin
        activates the account once onboarding is submitted.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={role === 'cleaner' ? 'cleaner@example.com' : 'client@example.com'}
          style={{
            flex: '1 1 260px',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            outline: 'none',
          }}
        />
        <button
          onClick={sendInvite}
          disabled={busy}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: '#111827',
            color: 'white',
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      {result && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            fontSize: 13,
            border: `1px solid ${result.kind === 'error' ? '#fecaca' : '#bbf7d0'}`,
            background: result.kind === 'error' ? '#fff1f2' : '#f0fdf4',
            color: result.kind === 'error' ? '#b91c1c' : '#15803d',
          }}
        >
          {result.message}
        </div>
      )}
    </section>
  );
}
