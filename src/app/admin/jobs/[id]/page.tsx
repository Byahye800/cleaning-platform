'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, spacing, radius, font } from '@/lib/theme';
import DetailField from '@/components/DetailField';
import ActivityFeed, { type ActivityItem } from '../../_dashboard/ActivityFeed';
import { describeActivity, type ActivityRow } from '@/lib/activity';

type Job = {
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
};

type ChecklistItem = { id: string; label: string; is_checked: boolean; checked_at: string | null; sort_order: number };

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [job, setJob] = useState<Job | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [cleanerName, setCleanerName] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const jobRes = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
        if (jobRes.error) throw jobRes.error;
        const jobData = jobRes.data as Job | null;
        setJob(jobData);
        if (!jobData) return;

        const [clientRes, cleanerRes, activityRes, checklistRes] = await Promise.all([
          supabase.from('clients').select('name').eq('id', jobData.client_id).maybeSingle(),
          jobData.cleaner_id
            ? supabase.from('cleaners').select('name').eq('id', jobData.cleaner_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('activity_log')
            .select('id, actor_id, action, entity_type, entity_id, created_at')
            .eq('entity_type', 'job')
            .eq('entity_id', id)
            .order('created_at', { ascending: false }),
          supabase
            .from('job_checklist_items')
            .select('id,label,is_checked,checked_at,sort_order')
            .eq('job_id', id)
            .order('sort_order', { ascending: true }),
        ]);
        if (clientRes.error) throw clientRes.error;
        if (cleanerRes.error) throw cleanerRes.error;
        if (activityRes.error) throw activityRes.error;
        if (checklistRes.error) throw checklistRes.error;

        setClientName((clientRes.data as { name: string } | null)?.name ?? null);
        setCleanerName((cleanerRes.data as { name: string } | null)?.name ?? null);
        setChecklistItems((checklistRes.data ?? []) as ChecklistItem[]);

        const activity = (activityRes.data ?? []) as ActivityRow[];
        const actorIds = [...new Set(activity.map((r) => r.actor_id).filter((v): v is string => v !== null))];
        const actorsRes =
          actorIds.length > 0
            ? await supabase.from('cleaners').select('user_id, name').in('user_id', actorIds)
            : { data: [] as { user_id: string; name: string }[], error: null };
        if (actorsRes.error) throw actorsRes.error;
        const cleanerNameByUserId = new Map((actorsRes.data ?? []).map((c) => [c.user_id, c.name]));

        setActivityItems(
          activity.map((row) => {
            const actorName = row.actor_id === null ? 'Stripe' : cleanerNameByUserId.get(row.actor_id) ?? 'Admin';
            return {
              id: row.id,
              description: describeActivity(row, 'this job', actorName),
              createdAt: row.created_at,
            };
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
  if (!job) return <div style={errorBoxStyle}>Job not found (or RLS denied SELECT).</div>;

  return (
    <div>
      <Link href="/admin/jobs" style={{ fontSize: font.size.sm, color: color.textSecondary }}>
        ← Back to Jobs
      </Link>

      <h2 style={{ margin: `${spacing.lg}px 0` }}>{job.address}</h2>

      <section style={sectionStyle}>
        <div style={gridStyle}>
          <DetailField label="Client" value={<Link href={`/admin/clients/${job.client_id}`}>{clientName ?? job.client_id}</Link>} />
          <DetailField
            label="Assigned cleaner"
            value={job.cleaner_id ? <Link href={`/admin/cleaners/${job.cleaner_id}`}>{cleanerName ?? job.cleaner_id}</Link> : '(unassigned)'}
          />
          <DetailField label="Service type" value={job.service_type} />
          <DetailField label="Scheduled" value={[job.scheduled_date, job.scheduled_time].filter(Boolean).join(' ') || null} />
          <DetailField label="Duration" value={job.duration_hours != null ? `${job.duration_hours}h` : null} />
          <DetailField label="Price" value={job.price != null ? `£${job.price}` : null} />
          <DetailField label="Payment status" value={job.payment_status} />
          <DetailField label="Status" value={job.status} />
          <DetailField label="Notes" value={job.notes} />
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: spacing.xl }}>
        <h3 style={{ marginTop: 0 }}>Checklist</h3>
        {checklistItems.length === 0 ? (
          <div style={{ color: color.textSecondary }}>No checklist for this job yet.</div>
        ) : (
          <div style={gridStyle}>
            {checklistItems.map((item) => (
              <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <input type="checkbox" checked={item.is_checked} disabled />
                <span>{item.label}</span>
                {item.checked_at && (
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>
                    {new Date(item.checked_at).toLocaleString()}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: spacing.xl }}>
        <ActivityFeed items={activityItems} />
      </div>
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

const errorBoxStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#b91c1c',
  borderRadius: 8,
};
