'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
type CleanerRow = { id: string; user_id: string; name: string; status: string; };
type JobRow = { id: string; status: string; location: string; access_instructions: string | null; cleaner_id: string | null; created_at: string; };
export default function CleanerInboxPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaner, setCleaner] = useState<CleanerRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
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
      const jr = await supabase.from('jobs').select('id,status,location,access_instructions,cleaner_id,created_at').order('created_at', { ascending: false }).limit(200);
      if (jr.error) throw jr.error;
      setCleaner(cr.data as CleanerRow);
      setJobs((jr.data ?? []) as JobRow[]);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load().catch(() => {}); }, []); // eslint-disable-line
  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };
  return (
    <div>
      <h2>Cleaner Inbox</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <p>{busy ? 'Loading...' : cleaner ? 'Hi ' + cleaner.name : 'Not signed in'}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Created</th><th style={th}>Location</th><th style={th}>Status</th><th style={th}>Access notes</th></tr></thead>
        <tbody>
          {jobs.map((j) => (<tr key={j.id}><td style={td}>{new Date(j.created_at).toLocaleString()}</td><td style={td}>{j.location}</td><td style={td}>{j.status}</td><td style={td}>{j.access_instructions ?? '-'}</td></tr>))}
          {jobs.length === 0 && <tr><td style={td} colSpan={4}>No jobs yet.</td></tr>}
        </tbody>
      </table>
      <p><Link href="/admin/login">Admin login</Link></p>
    </div>
  );
}
