'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

type ClientRow = {
  id: string;
  user_id: string;
  name: string;
  address: string;
  contact_email: string;
  contact_phone: string | null;
  agreed_rate: number | null;
  notes: string | null;
  status: string;
};

const emptyForm: any = {
  user_id: '',
  name: '',
  address: '',
  contact_email: '',
  contact_phone: '',
  agreed_rate: null as number | null,
  notes: '',
  status: 'active',
};

export default function AdminClientsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });

  async function load() {
    setError(null);
    const { data, error } = await supabase
      .from('clients')
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

  async function createClient() {
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        user_id: form.user_id || null,
        name: form.name,
        address: form.address,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone || null,
        agreed_rate: form.agreed_rate,
        notes: form.notes || null,
        status: form.status,
      };

      const { error } = await supabase.from('clients').insert(payload);
      if (error) throw error;

      setForm({ ...emptyForm });
      setSelectedId(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateClient(id: string) {
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        user_id: form.user_id || null,
        name: form.name,
        address: form.address,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone || null,
        agreed_rate: form.agreed_rate,
        notes: form.notes || null,
        status: form.status,
      };

      const { error } = await supabase.from('clients').update(payload).eq('id', id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteClient(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;

      if (selectedId === id) {
        setSelectedId(null);
        setForm({ ...emptyForm });
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function pickRow(r: ClientRow) {
    setSelectedId(r.id);
    setForm({
      user_id: r.user_id,
      name: r.name,
      address: r.address,
      contact_email: r.contact_email,
      contact_phone: r.contact_phone ?? '',
      agreed_rate: r.agreed_rate,
      notes: r.notes ?? '',
      status: r.status,
    });
  }

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Clients</h2>
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
        <h3 style={{ marginTop: 0 }}>{selectedId ? 'Edit client' : 'Create client'}</h3>
        <div style={gridStyle}>
          <Field
            label="user_id (auth.users UUID)"
            value={form.user_id}
            onChange={(v) => setForm((p: any) => ({ ...p, user_id: v }))}
            placeholder="UUID"
          />
          <Field label="name" value={form.name} onChange={(v) => setForm((p: any) => ({ ...p, name: v }))} placeholder="Acme Cleaning Ltd" />
          <Field label="address" value={form.address} onChange={(v) => setForm((p: any) => ({ ...p, address: v }))} placeholder="Street address" />
          <Field
            label="contact_email"
            value={form.contact_email}
            onChange={(v) => setForm((p: any) => ({ ...p, contact_email: v }))}
            placeholder="client@example.com"
          />
          <Field
            label="contact_phone"
            value={form.contact_phone}
            onChange={(v) => setForm((p: any) => ({ ...p, contact_phone: v }))}
            placeholder="Optional"
          />
          <Field
            label="agreed_rate"
            value={form.agreed_rate ?? ''}
            onChange={(v) =>
              setForm((p: any) => ({
                ...p,
                agreed_rate: v === '' ? null : Number(v),
              }))
            }
            placeholder="e.g. 120.50"
          />
          <Field label="notes" value={form.notes} onChange={(v) => setForm((p: any) => ({ ...p, notes: v }))} placeholder="Optional" />
          <SelectField
            label="status"
            value={form.status ?? 'active'}
            onChange={(v) => setForm((p: any) => ({ ...p, status: v }))}
            options={['pending', 'active', 'disabled']}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={createClient} disabled={busy} style={primaryBtn}>
            {busy ? 'Working…' : 'Create client'}
          </button>

          <button
            onClick={() => selectedId && updateClient(selectedId)}
            disabled={busy || !selectedId}
            style={{
              ...secondaryBtn,
              borderColor: '#2563eb',
              background: '#eff6ff',
              color: '#1d4ed8',
              cursor: busy || !selectedId ? 'not-allowed' : 'pointer',
            }}
          >
            Save changes
          </button>

          <button
            onClick={() => {
              setSelectedId(null);
              setForm({ ...emptyForm });
            }}
            disabled={busy || !selectedId}
            style={{
              ...secondaryBtn,
              background: '#fff',
              borderColor: '#e5e7eb',
              color: '#111827',
              cursor: busy || !selectedId ? 'not-allowed' : 'pointer',
            }}
          >
            Clear selection
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          Click a row below to load it into the form for editing.
        </div>
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>Existing</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Rate</th>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link href={`/admin/clients/${r.id}`} style={{ fontWeight: 700, color: selectedId === r.id ? '#1d4ed8' : '#111827' }}>
                          {r.name}
                        </Link>
                        <button
                          onClick={() => pickRow(r)}
                          title="Load into form"
                          style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: '#6b7280', display: 'inline-flex' }}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                    <td style={tdStyle}>{r.contact_email}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}>{r.agreed_rate ?? ''}</td>
                    <td style={tdStyle}>
                      <button
                        disabled={busy}
                        onClick={() => deleteClient(r.id)}
                        style={{
                          ...secondaryBtn,
                          background: '#fff',
                          borderColor: '#ef4444',
                          color: '#b91c1c',
                        }}
                      >
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <input value={value as any} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
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
