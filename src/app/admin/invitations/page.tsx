'use client';

import { useEffect, useState } from 'react';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type InvitationRole = 'cleaner' | 'client';
type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled' | 'superseded' | 'failed';

type InvitationRow = {
  id: string;
  canonical_email: string;
  intended_role: InvitationRole;
  status: InvitationStatus;
  invited_at: string;
  expires_at: string | null;
  resend_count: number;
  cancelled_at: string | null;
};

// Only 'pending' invitations can be resent or cancelled -- both
// resend_account_invitation and cancel_account_invitation reject any
// other status (0027_account_invitation_lifecycle_completion.sql), so the
// row actions below are disabled outside that state rather than
// attempted-and-rejected.
const STATUS_OPTIONS: { value: '' | InvitationStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'failed', label: 'Failed' },
];

const ROLE_OPTIONS: { value: '' | InvitationRole; label: string }[] = [
  { value: '', label: 'All roles' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'client', label: 'Client' },
];

export default function AdminInvitationsPage() {
  const [rows, setRows] = useState<InvitationRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | InvitationStatus>('');
  const [roleFilter, setRoleFilter] = useState<'' | InvitationRole>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`/api/admin/invitations?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? 'Could not load invitations.');
      }
      setRows(body.invitations ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, roleFilter]);

  async function resend(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/invitations/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? 'Could not resend the invitation.');
      }
      setMessage(`Invitation resent to ${body.invitation?.canonical_email ?? 'recipient'}.`);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/invitations/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) {
        throw new Error(body?.error?.message ?? 'Could not cancel the invitation.');
      }
      setMessage(`Invitation to ${body.invitation?.canonical_email ?? 'recipient'} cancelled.`);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Invitations</h2>

      {error && <div style={errorBoxStyle}>{error}</div>}
      {message && <div style={successBoxStyle}>{message}</div>}

      <section style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | InvitationStatus)}
              style={inputStyle}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Role</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as '' | InvitationRole)}
              style={inputStyle}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => load()} disabled={loading} style={secondaryBtn}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          To send a new invitation, use the Invite a cleaner / Invite a client form on the Cleaners or Clients page.
        </div>
      </section>

      <section>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Invited</th>
                <th style={thStyle}>Expires</th>
                <th style={thStyle}>Resends</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: '#6b7280' }}>
                    {loading ? 'Loading…' : 'No invitations match this filter.'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const actionable = r.status === 'pending';
                  const rowBusy = busyId === r.id;
                  return (
                    <tr key={r.id}>
                      <td style={tdStyle}>{r.canonical_email}</td>
                      <td style={tdStyle}>{r.intended_role}</td>
                      <td style={tdStyle}>{r.status}</td>
                      <td style={tdStyle}>{formatDate(r.invited_at)}</td>
                      <td style={tdStyle}>{formatDate(r.expires_at)}</td>
                      <td style={tdStyle}>{r.resend_count}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            disabled={rowBusy || !actionable}
                            onClick={() => resend(r.id)}
                            style={{
                              ...secondaryBtn,
                              cursor: rowBusy || !actionable ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {rowBusy ? 'Working…' : 'Resend'}
                          </button>
                          <button
                            disabled={rowBusy || !actionable}
                            onClick={() => cancel(r.id)}
                            style={{
                              ...secondaryBtn,
                              borderColor: '#ef4444',
                              color: '#b91c1c',
                              cursor: rowBusy || !actionable ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  outline: 'none',
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
  fontWeight: 600,
  cursor: 'pointer',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 10,
  borderBottom: '1px solid #e5e7eb',
  fontSize: 12,
  color: '#6b7280',
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid #f3f4f6',
  fontSize: 13,
};

const errorBoxStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#b91c1c',
  borderRadius: 8,
  marginBottom: 12,
};

const successBoxStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #bbf7d0',
  background: '#f0fdf4',
  color: '#15803d',
  borderRadius: 8,
  marginBottom: 12,
};
