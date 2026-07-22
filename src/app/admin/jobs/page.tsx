'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { canInvoice, invoiceDisabledReason } from '@/lib/jobInvoicing';

type ClientRow = { id: string; name: string };

type CleanerRow = { id: string; name: string };

type JobRow = {
  id: string;
  client_id: string;
  cleaner_id: string | null;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_hours: number | null;
  price: number | null;
  notes: string | null;
  status: string;
  payment_status: string;
  stripe_invoice_id: string | null;
};

const emptyForm: any = {
  client_id: '',
  cleaner_id: '',
  address: '',
  service_type: '',
  scheduled_date: '',
  scheduled_time: '',
  duration_hours: '',
  price: '',
  notes: '',
  status: 'pending',
};

export default function AdminJobsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });

  const [rows, setRows] = useState<JobRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [cleaners, setCleaners] = useState<CleanerRow[]>([]);

  async function loadAll() {
    setError(null);
    const [jobsRes, billingRes, clientsRes, cleanersRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, client_id, cleaner_id, address, service_type, scheduled_date, scheduled_time, duration_hours, notes, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('job_billing').select('job_id, price, payment_status, stripe_invoice_id'),
      supabase
        .from('clients')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('cleaners')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (jobsRes.error) throw jobsRes.error;
    if (billingRes.error) throw billingRes.error;
    if (clientsRes.error) throw clientsRes.error;
    if (cleanersRes.error) throw cleanersRes.error;

    const billingByJobId = new Map(
      ((billingRes.data ?? []) as { job_id: string; price: number | null; payment_status: string; stripe_invoice_id: string | null }[]).map(
        (b) => [b.job_id, b]
      )
    );
    const jobs = ((jobsRes.data ?? []) as Omit<JobRow, 'price' | 'payment_status' | 'stripe_invoice_id'>[]).map((j) => {
      const billing = billingByJobId.get(j.id);
      return {
        ...j,
        price: billing?.price ?? null,
        payment_status: billing?.payment_status ?? 'unpaid',
        stripe_invoice_id: billing?.stripe_invoice_id ?? null,
      };
    }) as JobRow[];
    setRows(jobs);
    setClients((clientsRes.data ?? []) as any);
    setCleaners((cleanersRes.data ?? []) as any);
    return jobs;
  }

  useEffect(() => {
    loadAll()
      .then((jobs) => {
        // One-time read of a `?select=<id>` deep link (e.g. from the dashboard's
        // action items) — read directly off window.location rather than
        // useSearchParams so this stays a statically-rendered page with no
        // Suspense boundary needed for a value we only care about on mount.
        const selectId = new URLSearchParams(window.location.search).get('select');
        const match = selectId ? jobs.find((r) => r.id === selectId) : undefined;
        if (match) pickRow(match);
      })
      .catch((e: any) => setError(e?.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scheduling fields (cleaner_id, scheduled_date, scheduled_time,
  // duration_hours) are deliberately NOT part of this payload -- they are
  // written exclusively through admin_assign_job_schedule (see
  // scheduleFormValues()/the RPC call in createJob/updateJob below), which
  // is the single validated scheduling write path introduced by
  // SCHEDULE-INTEGRITY-001. This function now only ever touches the
  // non-scheduling columns of jobs.
  function buildJobPayload() {
    const payload: any = {
      client_id: form.client_id,
      address: form.address,
      service_type: form.service_type || null,
      notes: form.notes || null,
      status: form.status || 'pending',
    };

    if (!payload.client_id) throw new Error('client_id is required');
    if (!payload.address) throw new Error('address is required');

    return payload;
  }

  function scheduleFormValues() {
    const duration = form.duration_hours ? Number(form.duration_hours) : null;
    if (form.duration_hours && Number.isNaN(duration)) {
      throw new Error('duration_hours must be a number');
    }
    return {
      p_cleaner_id: form.cleaner_id ? form.cleaner_id : null,
      p_scheduled_date: form.scheduled_date || null,
      p_scheduled_time: form.scheduled_time || null,
      p_duration_hours: duration,
    };
  }

  function extractPrice(): number | null {
    const price = form.price ? Number(form.price) : null;
    if (form.price && Number.isNaN(price)) {
      throw new Error('price must be a number');
    }
    return price;
  }

  async function getActorId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  async function createJob() {
    setBusy(true);
    setError(null);
    let insertedId: string | null = null;
    try {
      const payload = buildJobPayload();
      const scheduleValues = scheduleFormValues();
      const price = extractPrice();
      const { data: inserted, error: insertError } = await supabase
        .from('jobs')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      insertedId = inserted.id;

      // The row is created first (unscheduled/unassigned), then scheduled
      // through the one validated RPC. If the requested schedule conflicts
      // with another job for the same cleaner, the RPC rejects it and the
      // job is left in its unscheduled state (visible in Rota's "Unscheduled
      // jobs" section) rather than silently double-booking anyone.
      const { error: scheduleError } = await supabase.rpc('admin_assign_job_schedule', {
        p_job_id: inserted.id,
        ...scheduleValues,
      });
      if (scheduleError) throw scheduleError;

      const { error: billingError } = await supabase.from('job_billing').upsert({ job_id: inserted.id, price });
      if (billingError) throw billingError;

      const { error: logError } = await supabase.from('activity_log').insert({
        actor_id: await getActorId(),
        action: 'job.created',
        entity_type: 'job',
        entity_id: inserted.id,
      });
      if (logError) console.error('Failed to write activity_log for job.created:', logError);

      setSelectedId(null);
      setForm({ ...emptyForm });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
      if (insertedId) await loadAll();
    }
  }

  async function updateJob(id: string) {
    setBusy(true);
    setError(null);
    try {
      const payload = buildJobPayload();
      const scheduleValues = scheduleFormValues();
      const price = extractPrice();
      const previousStatus = rows.find((r) => r.id === id)?.status;

      // Scheduling change is attempted first: if it would double-book the
      // cleaner, the RPC rejects it and nothing about this job changes --
      // not the schedule, not status/notes/etc below.
      const { error: scheduleError } = await supabase.rpc('admin_assign_job_schedule', {
        p_job_id: id,
        ...scheduleValues,
      });
      if (scheduleError) throw scheduleError;

      const { error: updateError } = await supabase.from('jobs').update(payload).eq('id', id);
      if (updateError) throw updateError;

      const { error: billingError } = await supabase.from('job_billing').upsert({ job_id: id, price });
      if (billingError) throw billingError;

      if (previousStatus !== undefined && previousStatus !== payload.status) {
        const action =
          payload.status === 'in_progress' ? 'job.started' : payload.status === 'completed' ? 'job.completed' : 'job.status_changed';
        const { error: logError } = await supabase.from('activity_log').insert({
          actor_id: await getActorId(),
          action,
          entity_type: 'job',
          entity_id: id,
        });
        if (logError) console.error(`Failed to write activity_log for ${action}:`, logError);
      }

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

  async function sendInvoice(id: string) {
    setInvoicingId(id);
    setError(null);
    try {
      const res = await fetch('/api/stripe/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to send invoice');
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setInvoicingId(null);
    }
  }

  function pickRow(r: JobRow) {
    setSelectedId(r.id);
    setForm({
      client_id: r.client_id,
      cleaner_id: r.cleaner_id ?? '',
      address: r.address,
      service_type: r.service_type ?? '',
      scheduled_date: r.scheduled_date ?? '',
      scheduled_time: r.scheduled_time ?? '',
      duration_hours: r.duration_hours != null ? String(r.duration_hours) : '',
      price: r.price != null ? String(r.price) : '',
      notes: r.notes ?? '',
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
            <span style={labelTextStyle}>Client</span>
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
            <span style={labelTextStyle}>Assigned cleaner</span>
            <select
              value={form.cleaner_id}
              onChange={(e) => setForm((p: any) => ({ ...p, cleaner_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">(unassigned)</option>
              {cleaners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <Field label="address" value={form.address} onChange={(v) => setForm((p: any) => ({ ...p, address: v }))} />
          <Field label="service_type" value={form.service_type} onChange={(v) => setForm((p: any) => ({ ...p, service_type: v }))} />

          <label style={labelStyle}>
            <span style={labelTextStyle}>scheduled_date</span>
            <input
              type="date"
              value={form.scheduled_date}
              onChange={(e) => setForm((p: any) => ({ ...p, scheduled_date: e.target.value }))}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>scheduled_time</span>
            <input
              type="time"
              value={form.scheduled_time}
              onChange={(e) => setForm((p: any) => ({ ...p, scheduled_time: e.target.value }))}
              style={inputStyle}
            />
          </label>

          <Field label="duration_hours" value={form.duration_hours} onChange={(v) => setForm((p: any) => ({ ...p, duration_hours: v }))} />
          <Field label="price" value={form.price} onChange={(v) => setForm((p: any) => ({ ...p, price: v }))} />
          <Field label="notes" value={form.notes} onChange={(v) => setForm((p: any) => ({ ...p, notes: v }))} />
          <Field label="status" value={form.status} onChange={(v) => setForm((p: any) => ({ ...p, status: v }))} />
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

        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          Click a row to load it into the form. &quot;status&quot; is free text for now — use whatever value your workflow expects (e.g. pending, scheduled, completed, cancelled).
        </div>
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>Existing</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Address</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Cleaner</th>
                <th style={thStyle}>Scheduled</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Payment</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: '#6b7280' }}>
                    No rows (or RLS denied SELECT).
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link href={`/admin/jobs/${r.id}`} style={{ fontWeight: 700, color: selectedId === r.id ? '#1d4ed8' : '#111827' }}>
                          {r.address}
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
                    <td style={tdStyle}>{clients.find((c) => c.id === r.client_id)?.name ?? r.client_id}</td>
                    <td style={tdStyle}>{cleaners.find((c) => c.id === r.cleaner_id)?.name ?? '(unassigned)'}</td>
                    <td style={tdStyle}>{[r.scheduled_date, r.scheduled_time].filter(Boolean).join(' ') || '-'}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}>{r.payment_status}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => deleteJob(r.id)} disabled={busy} style={dangerBtn}>
                          Delete
                        </button>
                        <button
                          onClick={() => sendInvoice(r.id)}
                          disabled={busy || invoicingId === r.id || !canInvoice(r)}
                          title={invoiceDisabledReason(r)}
                          style={secondaryPrimaryBtn}
                        >
                          {invoicingId === r.id ? 'Sending…' : 'Send invoice'}
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
