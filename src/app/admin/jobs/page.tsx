'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

type ClientRow = { id: string; name: string };

type RecurrenceRuleRow = {
  id: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
};

type JobRow = {
  id: string;
  client_id: string;
  recurrence_rule_id: string | null;
  location: string;
  location_lat: number;
  location_lng: number;
  geofence_radius_m: number;
  access_instructions: string | null;
  status: string;
};

const emptyForm: any = {
  client_id: '',
  recurrence_rule_id: '',
  location: '',
  location_lat: '',
  location_lng: '',
  geofence_radius_m: '100',
  access_instructions: '',
  status: 'active',
};

export default function AdminJobsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });

  const [rows, setRows] = useState<JobRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [rules, setRules] = useState<RecurrenceRuleRow[]>([]);

  async function loadAll() {
    setError(null);
    const [jobsRes, clientsRes, rulesRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('clients')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('recurrence_rules')
        .select('id, frequency, start_date, end_date')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (jobsRes.error) throw jobsRes.error;
    if (clientsRes.error) throw clientsRes.error;
    if (rulesRes.error) throw rulesRes.error;

    setRows((jobsRes.data ?? []) as any);
    setClients((clientsRes.data ?? []) as any);
    setRules((rulesRes.data ?? []) as any);
  }

  useEffect(() => {
    loadAll().catch((e: any) => setError(e?.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createJob() {
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        client_id: form.client_id,
        recurrence_rule_id: form.recurrence_rule_id ? form.recurrence_rule_id : null,
        location: form.location,
        location_lat: Number(form.location_lat),
        location_lng: Number(form.location_lng),
        geofence_radius_m: Number(form.geofence_radius_m),
        access_instructions: form.access_instructions || null,
        status: form.status,
      };

      if (!payload.client_id) throw new Error('client_id is required');
      if (!payload.location) throw new Error('location is required');
      if (Number.isNaN(payload.location_lat) || Number.isNaN(payload.location_lng)) {
        throw new Error('location_lat and location_lng must be numbers');
      }
      if (Number.isNaN(payload.geofence_radius_m)) throw new Error('geofence_radius_m must be a number');

      const { error: insertError } = await supabase.from('jobs').insert(payload);
      if (insertError) throw insertError;

      setSelectedId(null);
      setForm({ ...emptyForm });
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateJob(id: string) {
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        client_id: form.client_id,
        recurrence_rule_id: form.recurrence_rule_id ? form.recurrence_rule_id : null,
        location: form.location,
        location_lat: Number(form.location_lat),
        location_lng: Number(form.location_lng),
        geofence_radius_m: Number(form.geofence_radius_m),
        access_instructions: form.access_instructions || null,
        status: form.status,
      };

      const { error: updateError } = await supabase.from('jobs').update(payload).eq('id', id);
      if (updateError) throw updateError;

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('jobs').delete().eq('id', id);
      if (delError) throw delError;

      if (selectedId === id) {
        setSelectedId(null);
        setForm({ ...emptyForm });
      }

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function pickRow(r: JobRow) {
    setSelectedId(r.id);
    setForm({
      client_id: r.client_id,
      recurrence_rule_id: r.recurrence_rule_id ?? '',
      location: r.location,
      location_lat: String(r.location_lat),
      location_lng: String(r.location_lng),
      geofence_radius_m: String(r.geofence_radius_m),
      access_instructions: r.access_instructions ?? '',
      status: r.status,
    });
  }

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Jobs</h2>
      {error && (
        <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <section style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>{selectedId ? 'Edit job' : 'Create job'}</h3>

        <div style={gridStyle}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>client_id (clients.id)</span>
            <select value={form.client_id} onChange={(e) => setForm((p: any) => ({ ...p, client_id: e.target.value }))} style={inputStyle}>
              <option value="">(select client)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>recurrence_rule_id (optional)</span>
            <select
              value={form.recurrence_rule_id}
              onChange={(e) => setForm((p: any) => ({ ...p, recurrence_rule_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">(none)</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.frequency} ({r.start_date})
                </option>
              ))}
            </select>
          </label>

          <Field label="location" value={form.location} onChange={(v) => setForm((p: any) => ({ ...p, location: v }))} />
          <Field label="location_lat" value={form.location_lat} onChange={(v) => setForm((p: any) => ({ ...p, location_lat: v }))} />
          <Field label="location_lng" value={form.location_lng} onChange={(v) => setForm((p: any) => ({ ...p, location_lng: v }))} />
          <Field label="geofence_radius_m" value={form.geofence_radius_m} onChange={(v) => setForm((p: any) => ({ ...p, geofence_radius_m: v }))} />
          <Field label="access_instructions" value={form.access_instructions} onChange={(v) => setForm((p: any) => ({ ...p, access_instructions: v }))} />

          <label style={labelStyle}>
            <span style={labelTextStyle}>status</span>
            <select value={form.status} onChange={(e) => setForm((p: any) => ({ ...p, status: e.target.value }))} style={inputStyle}>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="closed">closed</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={createJob} disabled={busy} style={primaryBtn}>
            {busy ? 'Working…' : 'Create job'}
          </button>

          <button onClick={() => selectedId && updateJob(selectedId)} disabled={busy || !selectedId} style={secondaryPrimaryBtn}>
            Save changes
          </button>

          <button
            onClick={() => {
              setSelectedId(null);
              setForm({ ...emptyForm });
            }}
            disabled={busy || !selectedId}
            style={secondaryBtn}
          >
            Clear selection
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Click a row to load it into the form.</div>
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>Existing</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Geofence</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: '#6b7280' }}>
                    No rows (or RLS denied SELECT).
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td style={tdStyle}>
                      <button
                        onClick={() => pickRow(r)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontWeight: 700,
                          color: selectedId === r.id ? '#1d4ed8' : '#111827',
                        }}
                      >
                        {r.location}
                      </button>
                    </td>
                    <td style={tdStyle}>{clients.find((c) => c.id === r.client_id)?.name ?? r.client_id}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}>{r.geofence_radius_m} m</td>
                    <td style={tdStyle}>
                      <button onClick={() => deleteJob(r.id)} disabled={busy} style={dangerBtn}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} style={inputStyle} />
    </label>
  );
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelTextStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280' };

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  outline: 'none',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #111827',
  background: '#111827',
  color: 'white',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryPrimaryBtn: React.CSSProperties = {
  ...secondaryBtn,
  borderColor: '#2563eb',
  background: '#eff6ff',
  color: '#1d4ed8',
};

const dangerBtn: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ef4444',
  background: '#fff',
  color: '#b91c1c',
  fontWeight: 700,
  cursor: 'pointer',
};

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' };
const tdStyle: React.CSSProperties = { padding: 10, borderBottom: '1px solid #f3f4f6', fontSize: 13 };
