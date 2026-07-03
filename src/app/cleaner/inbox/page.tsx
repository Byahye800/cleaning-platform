'use client';
import { useEffect, useMemo, useState } from 'react';
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
export default function CleanerInboxPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaner, setCleaner] = useState<CleanerRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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
      setCleaner(cr.data as CleanerRow);
      setJobs((jr.data ?? []) as JobRow[]);
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

  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };
  const actionBtn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #111827', background: '#111827', color: 'white', fontSize: 12, cursor: 'pointer' };
  return (
    <div>
      <h2>Cleaner Inbox</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <p>{busy ? 'Loading...' : cleaner ? 'Hi ' + cleaner.name : 'Not signed in'}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Scheduled</th><th style={th}>Address</th><th style={th}>Service</th><th style={th}>Status</th><th style={th}>Notes</th><th style={th}>Action</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td style={td}>{[j.scheduled_date, j.scheduled_time].filter(Boolean).join(' ') || '-'}</td>
              <td style={td}>{j.address}</td>
              <td style={td}>{j.service_type ?? '-'}</td>
              <td style={td}>{j.status}</td>
              <td style={td}>{j.notes ?? '-'}</td>
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
          ))}
          {jobs.length === 0 && <tr><td style={td} colSpan={6}>No jobs assigned yet. Ask admin to assign one in Jobs.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
