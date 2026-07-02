'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
type ClientRow = { id: string; user_id: string; name: string; status: string; };
type JobRow = {
  id: string;
  status: string;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  cleaner_id: string | null;
  payment_status: string;
};
export default function ClientJobsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  async function load() {
    if (!supabase) return;
    setBusy(true); setError(null);
    try {
      const sd = await supabase.auth.getSession();
      const user = sd.data.session?.user;
      if (!user) { setError('Sign in required.'); return; }
      const cl = await supabase.from('clients').select('id,user_id,name,status').eq('user_id', user.id).maybeSingle();
      if (cl.error) throw cl.error;
      if (!cl.data) { setError('Profile not found.'); return; }
      const jr = await supabase
        .from('jobs')
        .select('id,status,address,service_type,scheduled_date,scheduled_time,cleaner_id,payment_status')
        .eq('client_id', cl.data.id)
        .order('scheduled_date', { ascending: true })
        .limit(200);
      if (jr.error) throw jr.error;
      setClient(cl.data as ClientRow);
      setJobs((jr.data ?? []) as JobRow[]);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load().catch(() => {}); }, []); // eslint-disable-line
  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };
  return (
    <div>
      <h2>My Jobs</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <p>{busy ? 'Loading...' : client ? 'Hi ' + client.name : 'Not signed in'}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Scheduled</th><th style={th}>Address</th><th style={th}>Service</th><th style={th}>Status</th><th style={th}>Payment</th><th style={th}>Cleaner assigned</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td style={td}>{[j.scheduled_date, j.scheduled_time].filter(Boolean).join(' ') || '-'}</td>
              <td style={td}>{j.address}</td>
              <td style={td}>{j.service_type ?? '-'}</td>
              <td style={td}>{j.status}</td>
              <td style={td}>{j.payment_status}</td>
              <td style={td}>{j.cleaner_id ? 'Assigned' : 'Not yet assigned'}</td>
            </tr>
          ))}
          {jobs.length === 0 && <tr><td style={td} colSpan={6}>No jobs yet.</td></tr>}
        </tbody>
      </table>
      <p><Link href="/admin/login">Admin login</Link></p>
    </div>
  );
}
