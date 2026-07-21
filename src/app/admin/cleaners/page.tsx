'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import InviteForm from '../_shared/InviteForm';

// ADMIN-CLEANERS-001 UI integration checkpoint.
//
// Create and update now go through the approved Route Handlers
// (POST /api/admin/cleaners, PATCH /api/admin/cleaners/[id]) instead of
// direct browser writes to `cleaners` / `cleaner_pay_rates`. Those two
// tables are never written to from the browser on this page anymore --
// the only remaining direct Supabase calls here are the read-only
// `select()`s in load().
//
// Delete is intentionally NOT wired to anything in this checkpoint. The
// previous direct-browser `.delete()` call has been removed outright
// (per explicit decision: no DELETE RPC and no DELETE Route Handler exist
// yet, and adding one is out of scope for a UI-integration checkpoint --
// it needs its own DESIGN -> BUILD -> ... -> LOCK cycle). There is
// currently no way to delete a cleaner from this page.
//
// This also fixes a correctness defect found during Phase 1 discovery:
// the old page kept one shared `form` object for both create and edit,
// and the per-row "Edit" button called updateCleaner(row.id) using
// whatever was currently sitting in `form` -- which was only that row's
// own data if the pencil icon had just been clicked for that exact row.
// Clicking "Edit" on a different row without first reloading it into the
// form would silently overwrite that row with stale data. `selectedId`
// now makes "which cleaner is this form editing" an explicit, single
// source of truth: null = create mode, otherwise the id of the cleaner
// being edited. The single Save action always targets `selectedId`, and
// the per-row "Edit" button (redundant/dangerous under the old design)
// is gone -- selecting a row for edit is done once, via the pencil icon,
// exactly as before.
type CleanerRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  hourly_rate: number | string;
  dbs_status: string | null;
  dbs_check_date: string | null;
  emergency_contact: string | null;
  skills: string[] | null;
  notes: string | null;
  status: string;
};

type CleanerForm = {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  hourly_rate: string;
  dbs_status: string;
  dbs_check_date: string;
  emergency_contact: string;
  skills: string;
  notes: string;
};

const emptyForm: CleanerForm = {
  user_id: '',
  name: '',
  email: '',
  phone: '',
  hourly_rate: '',
  dbs_status: 'pending',
  dbs_check_date: '',
  emergency_contact: '',
  skills: '',
  notes: '',
};

function parseSkills(input: string): string[] | null {
  const arr = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

export default function AdminCleanersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<CleanerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CleanerForm>({ ...emptyForm });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [cleanersRes, ratesRes] = await Promise.all([
      supabase
        .from('cleaners')
        .select('id, user_id, name, email, phone, dbs_status, dbs_check_date, emergency_contact, skills, notes, status')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('cleaner_pay_rates').select('cleaner_id, hourly_rate'),
    ]);
    if (cleanersRes.error) throw cleanersRes.error;
    if (ratesRes.error) throw ratesRes.error;

    const rateByCleanerId = new Map(
      ((ratesRes.data ?? []) as { cleaner_id: string; hourly_rate: number }[]).map((r) => [r.cleaner_id, r.hourly_rate])
    );
    setRows(
      ((cleanersRes.data ?? []) as Omit<CleanerRow, 'hourly_rate'>[]).map((c) => ({
        ...c,
        hourly_rate: rateByCleanerId.get(c.id) ?? '',
      }))
    );
  }

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickRow(r: CleanerRow) {
    setError(null);
    setSelectedId(r.id);
    setForm({
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      phone: r.phone ?? '',
      hourly_rate: String(r.hourly_rate ?? ''),
      dbs_status: r.dbs_status ?? 'pending',
      dbs_check_date: r.dbs_check_date ?? '',
      emergency_contact: r.emergency_contact ?? '',
      skills: (r.skills ?? []).join(', '),
      notes: r.notes ?? '',
    });
  }

  function clearSelection() {
    setSelectedId(null);
    setForm({ ...emptyForm });
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const trimmedName = form.name.trim();
      if (!trimmedName) throw new Error('name is required.');

      const trimmedEmail = form.email.trim();
      if (!trimmedEmail) throw new Error('email is required.');

      // ADMIN-CLEANERS-002: hourly_rate is only unconditionally required
      // when creating a brand-new cleaner. In edit mode, a cleaner may
      // not have a cleaner_pay_rates row yet (e.g. self-service
      // onboarding never collects one) -- the PATCH Route Handler and
      // admin_update_cleaner RPC already support field-scoped partial
      // updates and only touch hourly_rate/cleaner_pay_rates when the
      // caller actually supplies it. Leaving this field blank while
      // editing must be able to save every other field without
      // inventing or touching payroll data. If a value IS supplied
      // (create or edit), it is still validated as a positive number.
      const trimmedRate = form.hourly_rate.trim();
      let hourlyRate: number | null = null;
      if (trimmedRate) {
        hourlyRate = Number(trimmedRate);
        if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
          throw new Error('hourly_rate must be a number greater than 0.');
        }
      } else if (!selectedId) {
        throw new Error('hourly_rate is required.');
      }

      const skills = parseSkills(form.skills);

      let res: Response;
      if (selectedId) {
        // Update always targets selectedId -- the id captured when this
        // row was loaded into the form -- never anything inferred from
        // the currently-rendered table.
        const payload: Record<string, unknown> = {
          name: trimmedName,
          email: trimmedEmail,
          phone: form.phone,
          dbs_status: form.dbs_status,
          dbs_check_date: form.dbs_check_date,
          emergency_contact: form.emergency_contact,
          skills: skills ?? [],
          notes: form.notes,
        };
        // Only included when the admin actually supplied a rate --
        // omitting the key entirely means the Route Handler/RPC never
        // touch hourly_rate or cleaner_pay_rates for this save.
        if (hourlyRate !== null) payload.hourly_rate = hourlyRate;

        res = await fetch(`/api/admin/cleaners/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const payload: Record<string, unknown> = {
          name: trimmedName,
          email: trimmedEmail,
          hourly_rate: hourlyRate,
        };
        if (form.user_id.trim()) payload.user_id = form.user_id.trim();
        if (form.phone.trim()) payload.phone = form.phone.trim();
        if (form.dbs_status) payload.dbs_status = form.dbs_status;
        if (form.dbs_check_date) payload.dbs_check_date = form.dbs_check_date;
        if (form.emergency_contact.trim()) payload.emergency_contact = form.emergency_contact.trim();
        if (skills) payload.skills = skills;
        if (form.notes.trim()) payload.notes = form.notes.trim();

        res = await fetch('/api/admin/cleaners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new Error(body?.error?.message ?? 'Save failed. Please try again.');
      }

      clearSelection();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isEditing = selectedId !== null;

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

      <InviteForm role="cleaner" />

      <section style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>{isEditing ? 'Edit cleaner' : 'Create cleaner (manual, advanced)'}</h3>
        <div style={gridStyle}>
          <Field
            label={isEditing ? 'user_id (set at creation only)' : 'user_id (auth.users UUID)'}
            value={form.user_id}
            onChange={(v) => setForm((p) => ({ ...p, user_id: v }))}
            placeholder="UUID"
            disabled={isEditing}
          />
          <Field label="name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="John Doe Cleaning" />
          <Field label="email" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="cleaner@example.com" />
          <Field label="phone" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} placeholder="Optional" />
          <Field label="hourly_rate" value={form.hourly_rate} onChange={(v) => setForm((p) => ({ ...p, hourly_rate: v }))} placeholder="e.g. 18.50" />
          <SelectField
            label="dbs_status"
            value={form.dbs_status}
            onChange={(v) => setForm((p) => ({ ...p, dbs_status: v }))}
            options={['pending', 'clear', 'flagged', 'expired']}
          />
          <Field
            label="dbs_check_date"
            type="date"
            value={form.dbs_check_date}
            onChange={(v) => setForm((p) => ({ ...p, dbs_check_date: v }))}
          />
          <Field
            label="emergency_contact"
            value={form.emergency_contact}
            onChange={(v) => setForm((p) => ({ ...p, emergency_contact: v }))}
            placeholder="Optional"
          />
          <Field
            label="skills (comma-separated)"
            value={form.skills}
            onChange={(v) => setForm((p) => ({ ...p, skills: v }))}
            placeholder="windows, deep-clean, carpets"
          />
          <Field label="notes" value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} placeholder="Optional" />
        </div>

        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
          Account status (restricted / active / suspended) is not editable here -- new cleaners always start
          restricted, and existing accounts are activated from their profile page.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={save} disabled={busy} style={primaryBtn}>
            {isEditing ? (busy ? 'Saving…' : 'Save changes') : busy ? 'Working…' : 'Create cleaner'}
          </button>
          {isEditing && (
            <button onClick={clearSelection} disabled={busy} style={secondaryBtn}>
              Clear selection
            </button>
          )}
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
            Click the pencil next to a cleaner&rsquo;s name to load it here for editing.
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
                <th style={thStyle}>Email</th>
                <th style={thStyle}>DBS status</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Hourly</th>
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
                  <tr key={r.id} style={r.id === selectedId ? selectedRowStyle : undefined}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link href={`/admin/cleaners/${r.id}`} style={{ fontWeight: 600 }}>
                          {r.name}
                        </Link>
                        <button
                          onClick={() => pickRow(r)}
                          title="Load into edit form"
                          style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: '#6b7280', display: 'inline-flex' }}
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                    <td style={tdStyle}>{r.email}</td>
                    <td style={tdStyle}>{r.dbs_status ?? ''}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}>{String(r.hourly_rate ?? '')}</td>
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
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={disabled ? { ...inputStyle, background: '#f3f4f6', color: '#9ca3af' } : inputStyle}
      />
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

const selectedRowStyle: React.CSSProperties = {
  background: '#f0f9ff',
};
