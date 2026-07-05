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

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const [clientRes, jobsRes] = await Promise.all([
          supabase.from('clients').select('*').eq('id', id).maybeSingle(),
          supabase
            .from('jobs')
            .select('id, address, scheduled_date, scheduled_time, status, payment_status, price')
            .eq('client_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (clientRes.error) throw clientRes.error;
        if (jobsRes.error) throw jobsRes.error;
        setClient(clientRes.data as Client | null);
        setJobs((jobsRes.data ?? []) as ClientJob[]);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, id]);

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

      <section style={sectionStyle}>
        <div style={gridStyle}>
          <DetailField label="Address" value={client.address} />
          <DetailField label="Contact email" value={client.contact_email} />
          <DetailField label="Contact phone" value={client.contact_phone} />
          <DetailField label="Agreed rate" value={client.agreed_rate != null ? `£${client.agreed_rate}` : null} />
          <DetailField label="Notes" value={client.notes} />
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

const errorBoxStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#b91c1c',
  borderRadius: 8,
};
