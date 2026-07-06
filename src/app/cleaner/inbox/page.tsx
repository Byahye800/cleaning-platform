'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
type CleanerRow = { id: string; user_id: string; name: string; status: string; };
type JobRow = {
  id: string;
  status: string;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  notes: string | null;
  cleaner_id: string | null;
  created_at: string;
};
type ChecklistItem = { id: string; label: string; is_checked: boolean; checked_at: string | null; sort_order: number };
export default function CleanerInboxPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaner, setCleaner] = useState<CleanerRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openAttendanceJobIds, setOpenAttendanceJobIds] = useState<Set<string>>(new Set());
  const [attendanceBusyId, setAttendanceBusyId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [checklistsByJob, setChecklistsByJob] = useState<Record<string, ChecklistItem[]>>({});
  const [checklistLoadingId, setChecklistLoadingId] = useState<string | null>(null);
  const [checklistItemBusyId, setChecklistItemBusyId] = useState<string | null>(null);
  async function load() {
    if (!supabase) return;
    setBusy(true); setError(null);
    try {
      const sd = await supabase.auth.getSession();
      const user = sd.data.session?.user;
      if (!user) { setError('Sign in required.'); return; }
      const cr = await supabase.from('cleaners').select('id,user_id,name,status').eq('user_id', user.id).maybeSingle();
      if (cr.error) throw cr.error;
      if (!cr.data) { setError('Profile not found.'); return; }
      const jr = await supabase
        .from('jobs')
        .select('id,status,address,service_type,scheduled_date,scheduled_time,notes,cleaner_id,created_at')
        .eq('cleaner_id', cr.data.id)
        .order('scheduled_date', { ascending: true })
        .limit(200);
      if (jr.error) throw jr.error;
      const ar = await supabase
        .from('attendance')
        .select('job_id')
        .eq('cleaner_id', cr.data.id)
        .is('check_out_at', null);
      if (ar.error) throw ar.error;
      setCleaner(cr.data as CleanerRow);
      setJobs((jr.data ?? []) as JobRow[]);
      setOpenAttendanceJobIds(new Set((ar.data ?? []).map((row: any) => row.job_id)));
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load().catch(() => {}); }, []); // eslint-disable-line

  async function updateStatus(jobId: string, newStatus: 'in_progress' | 'completed') {
    setUpdatingId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_update_job_status', {
        p_job_id: jobId,
        p_new_status: newStatus,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  async function checkIn(jobId: string) {
    setAttendanceBusyId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_check_in', {
        p_job_id: jobId,
        p_user_agent: navigator.userAgent,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAttendanceBusyId(null);
    }
  }

  async function checkOut(jobId: string) {
    setAttendanceBusyId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_check_out', {
        p_job_id: jobId,
        p_user_agent: navigator.userAgent,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAttendanceBusyId(null);
    }
  }

  async function loadChecklist(jobId: string) {
    setChecklistLoadingId(jobId);
    setError(null);
    try {
      const { error: seedError } = await supabase.rpc('cleaner_seed_job_checklist', { p_job_id: jobId });
      if (seedError) throw seedError;
      const { data, error: selError } = await supabase
        .from('job_checklist_items')
        .select('id,label,is_checked,checked_at,sort_order')
        .eq('job_id', jobId)
        .order('sort_order', { ascending: true });
      if (selError) throw selError;
      setChecklistsByJob((prev) => ({ ...prev, [jobId]: (data ?? []) as ChecklistItem[] }));
    } catch (e) {
      setError(String(e));
    } finally {
      setChecklistLoadingId(null);
    }
  }

  async function toggleChecklistPanel(jobId: string) {
    if (expandedJobId === jobId) { setExpandedJobId(null); return; }
    setExpandedJobId(jobId);
    if (!checklistsByJob[jobId]) {
      await loadChecklist(jobId);
    }
  }

  async function toggleChecklistItem(jobId: string, itemId: string, checked: boolean) {
    setChecklistItemBusyId(itemId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_toggle_checklist_item', {
        p_item_id: itemId,
        p_checked: checked,
      });
      if (rpcError) throw rpcError;
      await loadChecklist(jobId);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecklistItemBusyId(null);
    }
  }

  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };
  const actionBtn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #111827', background: '#111827', color: 'white', fontSize: 12, cursor: 'pointer' };
  return (
    <div>
      <h2>Cleaner Inbox</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <p>{busy ? 'Loading...' : cleaner ? 'Hi ' + cleaner.name : 'Not signed in'}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Scheduled</th><th style={th}>Address</th><th style={th}>Service</th><th style={th}>Status</th><th style={th}>Notes</th><th style={th}>Attendance</th><th style={th}>Checklist</th><th style={th}>Action</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <Fragment key={j.id}>
            <tr>
              <td style={td}>{[j.scheduled_date, j.scheduled_time].filter(Boolean).join(' ') || '-'}</td>
              <td style={td}>{j.address}</td>
              <td style={td}>{j.service_type ?? '-'}</td>
              <td style={td}>{j.status}</td>
              <td style={td}>{j.notes ?? '-'}</td>
              <td style={td}>
                {j.status === 'completed' ? (
                  '-'
                ) : openAttendanceJobIds.has(j.id) ? (
                  <button
                    style={actionBtn}
                    disabled={attendanceBusyId === j.id}
                    onClick={() => checkOut(j.id)}
                  >
                    {attendanceBusyId === j.id ? 'Saving…' : 'Check out'}
                  </button>
                ) : (
                  <button
                    style={actionBtn}
                    disabled={attendanceBusyId === j.id}
                    onClick={() => checkIn(j.id)}
                  >
                    {attendanceBusyId === j.id ? 'Saving…' : 'Check in'}
                  </button>
                )}
              </td>
              <td style={td}>
                <button style={actionBtn} onClick={() => toggleChecklistPanel(j.id)}>
                  {expandedJobId === j.id ? 'Hide checklist' : 'Show checklist'}
                </button>
              </td>
              <td style={td}>
                {j.status === 'completed' ? (
                  '-'
                ) : j.status === 'in_progress' ? (
                  <button
                    style={actionBtn}
                    disabled={updatingId === j.id}
                    onClick={() => updateStatus(j.id, 'completed')}
                  >
                    {updatingId === j.id ? 'Saving…' : 'Mark completed'}
                  </button>
                ) : (
                  <button
                    style={actionBtn}
                    disabled={updatingId === j.id}
                    onClick={() => updateStatus(j.id, 'in_progress')}
                  >
                    {updatingId === j.id ? 'Saving…' : 'Start job'}
                  </button>
                )}
              </td>
            </tr>
            {expandedJobId === j.id && (
              <tr>
                <td style={td} colSpan={8}>
                  {checklistLoadingId === j.id ? 'Loading checklist…' : (
                    (checklistsByJob[j.id] ?? []).length === 0 ? 'No checklist items.' : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(checklistsByJob[j.id] ?? []).map((item) => (
                          <li key={item.id} style={{ marginBottom: 4 }}>
                            <label style={{ cursor: j.status === 'completed' ? 'default' : 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={item.is_checked}
                                disabled={j.status === 'completed' || checklistItemBusyId === item.id}
                                onChange={(e) => toggleChecklistItem(j.id, item.id, e.target.checked)}
                              />{' '}
                              {item.label}
                              {j.status === 'completed' && item.checked_at ? ` (checked ${new Date(item.checked_at).toLocaleString()})` : ''}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {jobs.length === 0 && <tr><td style={td} colSpan={8}>No jobs assigned yet. Ask admin to assign one in Jobs.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
