'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

type CleanerRow = {
  id: string;
  user_id: string;
  name: string;
  hourly_rate: number | string;
  utr_number: string | null;
  status: string;
};

const emptyForm: any = {
  user_id: '',
  name: '',
  hourly_rate: '',
  utr_number: '',
  status: 'active',
};

export default function AdminCleanersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<CleanerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<any>({ ...emptyForm });

  async function load() {
    setError(null);
    const { data, error } = await supabase
      .from('cleaners')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    setRows((data ?? []) as any);
  }

  useEffect(() => {
    load().catch((e: any) => setError(e?.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCleaner() {
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        user_id: form.user_id,
        name: form.name,
        hourly_rate: form.hourly_rate === '' ? null : Number(form.hourly_rate),
        utr_number: form.utr_number === '' ? null : form.utr_number,
        status: form.status,
      };

      // hourly_rate is NOT NULL in schema; ensure it’s present
      if (!payload.hourly_rate || Number.isNaN(payload.hourly_rate)) {
        throw new Error('hourly_rate must be a valid number');
      }

      const { error } = await supabase.from('cleaners').insert(payload);
      if (error) throw error;

      setForm({ ...emptyForm });
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function pickRow(r: CleanerRow) {
    setForm({
      user_id: r.user_id,
      name: r.name,
      hourly_rate: String(r.hourly_rate ?? ''),
      utr_number: r.utr_number ?? '',
      status: r.status,
    });
  }

  async function updateCleaner(id: string) {
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        user_id: form.user_id,
        name: form.name,
        hourly_rate: Number(form.hourly_rate),
        utr_number: form.utr_number === '' ? null : form.utr_number,
        status: form.status,
      };
      if (Number.isNaN(payload.hourly_rate)) throw new Error('hourly_rate must be a valid number');

      const { error } = await supabase.from('cleaners').update(payload).eq('id', id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCleaner(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.from('cleaners').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Cleaners</h2>
      {error && (
        <div
          style={{
            padding: 10,
            border: '1px solid #fecaca',
            background: '#fff1f2',
            color: '#b91c1c',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <section style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Create / Edit</h3>
        <div style={gridStyle}>
          <Field label="user_id (auth.users UUID)" value={form.user_id} onChange={(v) => setForm((p: any) => ({ ...p, user_id: v }))} placeholder="UUID" />
          <Field label="name" value={form.name} onChange={(v) => setForm((p: any) => ({ ...p, name: v }))} placeholder="John Doe Cleaning" />
          <Field label="hourly_rate" value={form.hourly_rate} onChange={(v) => setForm((p: any) => ({ ...p, hourly_rate: v }))} placeholder="e.g. 18.50" />
          <Field label="utr_number" value={form.utr_number} onChange={(v) => setForm((p: any) => ({ ...p, utr_number: v }))} placeholder="Optional" />
          <SelectField label="status" value={form.status} onChange={(v) => setForm((p: any) => ({ ...p, status: v }))} options={['pending', 'active', 'disabled']} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={createCleaner} disabled={busy} style={primaryBtn}>
            {busy ? 'Working…' : 'Create cleaner'}
          </button>
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            For edit/delete: click a row to load it into the form, then use that row’s actions.
          </div>
        </div>
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>Existing</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>UTR</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Hourly</th>
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
                        style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td style={tdStyle}>{r.utr_number ?? ''}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}>{String(r.hourly_rate ?? '')}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button disabled={busy} onClick={() => updateCleaner(r.id)} style={secondaryBtn}>
                          Edit
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => deleteCleaner(r.id)}
                          style={{ ...secondaryBtn, background: '#fff', borderColor: '#ef4444', color: '#b91c1c' }}
                        >
                          Delete
                        </button>
                      </div>
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  fontWeight: 600,
  cursor: 'pointer',
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
