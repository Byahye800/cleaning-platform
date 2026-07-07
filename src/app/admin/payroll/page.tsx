'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { spacing } from '@/lib/theme';

type PayrollEvent = {
  id: string;
  hours_worked: number;
  hourly_rate: number | null;
  amount: number | null;
  status: string;
  created_at: string;
  cleaners: { name: string } | null;
  jobs: { address: string; scheduled_date: string | null } | null;
};

type CorrectionRequest = {
  id: string;
  attendance_id: string;
  requested_check_in_at: string | null;
  requested_check_out_at: string | null;
  reason: string;
  status: string;
  created_at: string;
  cleaners: { name: string } | null;
  attendance: { check_in_at: string; check_out_at: string | null; jobs: { address: string } | null } | null;
};

export default function AdminPayrollPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PayrollEvent[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [eventsRes, correctionsRes] = await Promise.all([
        supabase
          .from('payroll_events')
          .select('id, hours_worked, hourly_rate, amount, status, created_at, cleaners(name), jobs(address, scheduled_date)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('attendance_corrections')
          .select('id, attendance_id, requested_check_in_at, requested_check_out_at, reason, status, created_at, cleaners(name), attendance:attendance_id(check_in_at, check_out_at, jobs(address))')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (correctionsRes.error) throw correctionsRes.error;
      setEvents((eventsRes.data ?? []) as unknown as PayrollEvent[]);
      setCorrections((correctionsRes.data ?? []) as unknown as CorrectionRequest[]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markPaid(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const { error: updError } = await supabase.from('payroll_events').update({ status: 'paid' }).eq('id', id);
      if (updError) throw updError;
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reviewCorrection(id: string, decision: 'approved' | 'rejected') {
    setBusyId(id);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_review_attendance_correction', {
        p_correction_id: id,
        p_decision: decision,
        p_resolution_notes: null,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };
  const actionBtn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #111827', background: '#111827', color: 'white', fontSize: 12, cursor: 'pointer' };
  const secondaryBtn = { ...actionBtn, background: '#fff', color: '#111827' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <div>
        <h2 style={{ marginBottom: 14 }}>Payroll</h2>
        {error && (
          <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        )}
      </div>

      <section>
        <h3 style={{ marginTop: 0 }}>Pending attendance correction requests</h3>
        {loading ? 'Loading…' : corrections.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>No pending correction requests.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Cleaner</th>
                <th style={th}>Job</th>
                <th style={th}>On file</th>
                <th style={th}>Requested</th>
                <th style={th}>Reason</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.cleaners?.name ?? '-'}</td>
                  <td style={td}>{c.attendance?.jobs?.address ?? '-'}</td>
                  <td style={td}>
                    {c.attendance ? `${new Date(c.attendance.check_in_at).toLocaleString()} -> ${c.attendance.check_out_at ? new Date(c.attendance.check_out_at).toLocaleString() : 'open'}` : '-'}
                  </td>
                  <td style={td}>
                    {c.requested_check_in_at ? new Date(c.requested_check_in_at).toLocaleString() : '-'}
                    {' -> '}
                    {c.requested_check_out_at ? new Date(c.requested_check_out_at).toLocaleString() : '-'}
                  </td>
                  <td style={td}>{c.reason}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={actionBtn} disabled={busyId === c.id} onClick={() => reviewCorrection(c.id, 'approved')}>
                        {busyId === c.id ? '…' : 'Approve'}
                      </button>
                      <button style={secondaryBtn} disabled={busyId === c.id} onClick={() => reviewCorrection(c.id, 'rejected')}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>Payroll events</h3>
        {loading ? 'Loading…' : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Cleaner</th>
                <th style={th}>Job</th>
                <th style={th}>Date</th>
                <th style={th}>Hours</th>
                <th style={th}>Rate</th>
                <th style={th}>Amount</th>
                <th style={th}>Status</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={td}>{e.cleaners?.name ?? '-'}</td>
                  <td style={td}>{e.jobs?.address ?? '-'}</td>
                  <td style={td}>{e.jobs?.scheduled_date ?? '-'}</td>
                  <td style={td}>{e.hours_worked}</td>
                  <td style={td}>{e.hourly_rate ?? 'not set'}</td>
                  <td style={td}>{e.amount ?? '-'}</td>
                  <td style={td}>{e.status}</td>
                  <td style={td}>
                    {e.status !== 'paid' ? (
                      <button style={actionBtn} disabled={busyId === e.id} onClick={() => markPaid(e.id)}>
                        {busyId === e.id ? '…' : 'Mark as paid'}
                      </button>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {events.length === 0 && <tr><td style={td} colSpan={8}>No payroll events yet.</td></tr>}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
