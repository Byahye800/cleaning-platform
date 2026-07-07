'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, spacing, radius, font } from '@/lib/theme';
import InitialsAvatar from '@/components/InitialsAvatar';
import DetailField from '@/components/DetailField';

type Cleaner = {
  id: string;
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

type CleanerJob = {
  id: string;
  address: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  payment_status: string;
  price: number | null;
};

export default function CleanerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [cleaner, setCleaner] = useState<Cleaner | null>(null);
  const [jobs, setJobs] = useState<CleanerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const [cleanerRes, jobsRes] = await Promise.all([
          supabase
            .from('cleaners')
            .select('id, name, email, phone, dbs_status, dbs_check_date, emergency_contact, skills, notes, status')
            .eq('id', id)
            .maybeSingle(),
          supabase
            .from('jobs')
            .select('id, address, scheduled_date, scheduled_time, status')
            .eq('cleaner_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (cleanerRes.error) throw cleanerRes.error;
        if (jobsRes.error) throw jobsRes.error;

        const cleanerRow = cleanerRes.data as Omit<Cleaner, 'hourly_rate'> | null;
        if (!cleanerRow) {
          setCleaner(null);
        } else {
          const rateRes = await supabase.from('cleaner_pay_rates').select('hourly_rate').eq('cleaner_id', id).maybeSingle();
          if (rateRes.error) throw rateRes.error;
          setCleaner({ ...cleanerRow, hourly_rate: (rateRes.data as { hourly_rate: number } | null)?.hourly_rate ?? '' });
        }

        const jobRows = (jobsRes.data ?? []) as Omit<CleanerJob, 'payment_status' | 'price'>[];
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

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={errorBoxStyle}>{error}</div>;
  if (!cleaner) return <div style={errorBoxStyle}>Cleaner not found (or RLS denied SELECT).</div>;

  return (
    <div>
      <Link href="/admin/cleaners" style={{ fontSize: font.size.sm, color: color.textSecondary }}>
        ← Back to Cleaners
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, margin: `${spacing.lg}px 0` }}>
        <InitialsAvatar name={cleaner.name} />
        <div>
          <h2 style={{ margin: 0 }}>{cleaner.name}</h2>
          <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>{cleaner.status}</span>
        </div>
      </div>

      <section style={sectionStyle}>
        <div style={gridStyle}>
          <DetailField label="Email" value={cleaner.email} />
          <DetailField label="Phone" value={cleaner.phone} />
          <DetailField label="Hourly rate" value={cleaner.hourly_rate != null ? `£${cleaner.hourly_rate}` : null} />
          <DetailField label="DBS status" value={cleaner.dbs_status} />
          <DetailField label="DBS check date" value={cleaner.dbs_check_date} />
          <DetailField label="Emergency contact" value={cleaner.emergency_contact} />
          <DetailField label="Skills" value={cleaner.skills && cleaner.skills.length > 0 ? cleaner.skills.join(', ') : null} />
          <DetailField label="Notes" value={cleaner.notes} />
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: spacing.xl }}>
        <h3 style={{ marginTop: 0 }}>Jobs</h3>
        {jobs.length === 0 ? (
          <div style={{ color: color.textSecondary, fontSize: font.size.base }}>No jobs assigned to this cleaner yet.</div>
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
