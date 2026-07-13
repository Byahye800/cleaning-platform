'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, spacing, radius, font } from '@/lib/theme';
import InitialsAvatar from '@/components/InitialsAvatar';
import DetailField from '@/components/DetailField';

type Client = {
  id: string;
  name: string;
  address: string;
  contact_email: string;
  contact_phone: string | null;
  agreed_rate: number | null;
  notes: string | null;
  status: string;
  invitation_status: string;
  onboarding_status: string;
};

type ClientJob = {
  id: string;
  address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  payment_status: string;
  price: number | null;
};

export default function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [client, setClient] = useState<Client | null>(null);
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateMessage, setActivateMessage] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const [clientRes, jobsRes] = await Promise.all([
          supabase
            .from('clients')
            .select(
              'id, name, address, contact_email, contact_phone, agreed_rate, notes, status, invitation_status, onboarding_status'
            )
            .eq('id', id)
            .maybeSingle(),
          supabase
            .from('jobs')
            .select('id, address, scheduled_date, scheduled_time, status')
            .eq('client_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (clientRes.error) throw clientRes.error;
        if (jobsRes.error) throw jobsRes.error;
        setClient(clientRes.data as Client | null);

        const jobRows = (jobsRes.data ?? []) as Omit<ClientJob, 'payment_status' | 'price'>[];
        const jobIds = jobRows.map((j) => j.id);
        const billingRes =
          jobIds.length > 0
            ? await supabase.from('job_billing').select('job_id, price, payment_status').in('job_id', jobIds)
            : { data: [] as { job_id: string; price: number | null; payment_status: string }[], error: null };
        if (billingRes.error) throw billingRes.error;
        const billingByJobId = new Map((billingRes.data ?? []).map((b) => [b.job_id, b]));

        setJobs(
          jobRows.map((j) => {
            const billing = billingByJobId.get(j.id);
            return { ...j, price: billing?.price ?? null, payment_status: billing?.payment_status ?? 'unpaid' };
          })
        );
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, id]);

  const eligibleForActivation =
    client?.status === 'restricted' &&
    client?.invitation_status === 'invite_accepted' &&
    client?.onboarding_status === 'submitted';

  async function handleActivate() {
    if (activating) return;
    setActivating(true);
    setActivateMessage(null);
    setActivateError(null);
    try {
      const res = await fetch('/api/admin/accounts/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'client', id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setActivateError(body?.error?.message ?? 'Activation failed. Please try again.');
        return;
      }
      setActivateMessage('Account activated.');
      setClient((prev) => (prev ? { ...prev, status: 'active', onboarding_status: 'approved' } : prev));
    } catch {
      setActivateError('Something went wrong. Please try again.');
    } finally {
      setActivating(false);
    }
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={errorBoxStyle}>{error}</div>;
  if (!client) return <div style={errorBoxStyle}>Client not found (or RLS denied SELECT).</div>;

  return (
    <div>
      <Link href="/admin/clients" style={{ fontSize: font.size.sm, color: color.textSecondary }}>
        ← Back to Clients
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, margin: `${spacing.lg}px 0` }}>
        <InitialsAvatar name={client.name} />
        <div>
          <h2 style={{ margin: 0 }}>{client.name}</h2>
          <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>{client.status}</span>
        </div>
      </div>

      {eligibleForActivation && (
        <section style={{ ...sectionStyle, marginBottom: spacing.lg, borderColor: color.navy }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
            <div>
              <strong>Onboarding complete, pending review</strong>
              <div style={{ fontSize: font.size.sm, color: color.textSecondary }}>
                This account has accepted its invitation and submitted onboarding. Activating grants full portal access.
              </div>
            </div>
            <button onClick={handleActivate} disabled={activating} style={activateButtonStyle}>
              {activating ? 'Activating…' : 'Activate account'}
            </button>
          </div>
          {activateMessage && <div style={{ marginTop: spacing.sm, color: color.success }}>{activateMessage}</div>}
          {activateError && <div style={{ marginTop: spacing.sm, color: '#b91c1c' }}>{activateError}</div>}
        </section>
      )}

      <section style={sectionStyle}>
        <div style={gridStyle}>
          <DetailField label="Address" value={client.address} />
          <DetailField label="Contact email" value={client.contact_email} />
          <DetailField label="Contact phone" value={client.contact_phone} />
          <DetailField label="Agreed rate" value={client.agreed_rate != null ? `£${client.agreed_rate}` : null} />
          <DetailField label="Notes" value={client.notes} />
          <DetailField label="Invitation status" value={client.invitation_status} />
          <DetailField label="Onboarding status" value={client.onboarding_status} />
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: spacing.xl }}>
        <h3 style={{ marginTop: 0 }}>Jobs</h3>
        {jobs.length === 0 ? (
          <div style={{ color: color.textSecondary, fontSize: font.size.base }}>No jobs for this client yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {jobs.map((j) => (
              <Link key={j.id} href={`/admin/jobs/${j.id}`} style={jobRowStyle}>
                <span>{j.address}</span>
                <span style={{ color: color.textSecondary, fontSize: font.size.sm }}>
                  {[j.scheduled_date, j.scheduled_time].filter(Boolean).join(' ') || '-'} · {j.status} · {j.payment_status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: spacing.lg,
};

const jobRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: spacing.md,
  padding: `${spacing.sm}px 0`,
  borderBottom: `1px solid ${color.border}`,
  color: color.textPrimary,
  flexWrap: 'wrap',
};

const activateButtonStyle: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.lg}px`,
  borderRadius: radius.md,
  border: 'none',
  background: color.navy,
  color: color.textInverse,
  fontSize: font.size.sm,
  cursor: 'pointer',
};

const errorBoxStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#b91c1c',
  borderRadius: 8,
};
