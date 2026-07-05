'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { spacing } from '@/lib/theme';
import ActionItems, { type CompletedNoInvoiceJob, type FailedInvoiceJob, type UnassignedTodayJob } from './_dashboard/ActionItems';
import RevenueSnapshot, { type RevenueTotals } from './_dashboard/RevenueSnapshot';
import JobPipeline, { type StatusCount } from './_dashboard/JobPipeline';
import ActivityFeed, { type ActivityItem } from './_dashboard/ActivityFeed';

const ZERO_TOTALS: RevenueTotals = { invoiced: 0, collected: 0, outstanding: 0 };

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Plain YYYY-MM-DD in the *browser's* local time zone, matching how
// admin/jobs/page.tsx's <input type="date"> writes scheduled_date -- both
// reading and writing go through the same local-date convention.
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = (day + 6) % 7; // days since Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

type RevenueRow = { price: number | null; payment_status: string; stripe_invoice_id: string | null };

function summarizeRevenue(rows: RevenueRow[]): RevenueTotals {
  return rows.reduce(
    (totals, row) => {
      const amount = row.price ?? 0;
      if (row.stripe_invoice_id) totals.invoiced += amount;
      if (row.payment_status === 'paid') totals.collected += amount;
      if (row.payment_status === 'invoiced' || row.payment_status === 'failed') totals.outstanding += amount;
      return totals;
    },
    { ...ZERO_TOTALS }
  );
}

// Groups by whatever status strings actually show up this week -- no
// hardcoded bucket list, since this project has already been burned once by
// assuming a status value ('scheduled') instead of checking the real data.
function countByStatus(rows: { status: string }[]): StatusCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => ({ status, count }));
}

type ActivityRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

function describeActivity(row: ActivityRow, jobLabel: string, actorName: string): string {
  switch (row.action) {
    case 'job.created':
      return `${actorName} created ${jobLabel}`;
    case 'job.started':
      return `${actorName} started ${jobLabel}`;
    case 'job.completed':
      return `${actorName} marked ${jobLabel} completed`;
    case 'invoice.sent':
      return `${actorName} sent an invoice for ${jobLabel}`;
    case 'invoice.paid':
      return `Payment received for ${jobLabel}`;
    case 'invoice.failed':
      return `Payment failed for ${jobLabel}`;
    case 'job.status_changed':
      return `${actorName} updated ${jobLabel}'s status`;
    default:
      return `${actorName} — ${row.action} on ${jobLabel}`;
  }
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [failedInvoices, setFailedInvoices] = useState<FailedInvoiceJob[]>([]);
  const [completedNoInvoice, setCompletedNoInvoice] = useState<CompletedNoInvoiceJob[]>([]);
  const [unassignedToday, setUnassignedToday] = useState<UnassignedTodayJob[]>([]);

  const [thisMonthRevenue, setThisMonthRevenue] = useState<RevenueTotals>(ZERO_TOTALS);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<RevenueTotals>(ZERO_TOTALS);
  const [pipelineCounts, setPipelineCounts] = useState<StatusCount[]>([]);

  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const today = new Date();
      const todayIso = isoDate(today);
      const thisMonthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
      const thisMonthEnd = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1));
      const lastMonthStart = isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      const weekStartDate = startOfWeekMonday(today);
      const weekStart = isoDate(weekStartDate);
      const weekEnd = isoDate(new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 7));

      const [
        failedRes,
        completedNoInvoiceRes,
        unassignedTodayRes,
        thisMonthRes,
        lastMonthRes,
        weekRes,
        activityRes,
      ] = await Promise.all([
        supabase.from('jobs').select('id, address, price').eq('payment_status', 'failed'),
        supabase.from('jobs').select('id, address, price').eq('status', 'completed').eq('payment_status', 'unpaid'),
        supabase
          .from('jobs')
          .select('id, address, scheduled_time')
          .eq('scheduled_date', todayIso)
          .is('cleaner_id', null)
          .neq('status', 'cancelled'),
        supabase
          .from('jobs')
          .select('price, payment_status, stripe_invoice_id')
          .gte('scheduled_date', thisMonthStart)
          .lt('scheduled_date', thisMonthEnd),
        supabase
          .from('jobs')
          .select('price, payment_status, stripe_invoice_id')
          .gte('scheduled_date', lastMonthStart)
          .lt('scheduled_date', thisMonthStart),
        supabase.from('jobs').select('status').gte('scheduled_date', weekStart).lt('scheduled_date', weekEnd),
        supabase
          .from('activity_log')
          .select('id, actor_id, action, entity_type, entity_id, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      for (const res of [failedRes, completedNoInvoiceRes, unassignedTodayRes, thisMonthRes, lastMonthRes, weekRes, activityRes]) {
        if (res.error) throw res.error;
      }

      setFailedInvoices((failedRes.data ?? []) as FailedInvoiceJob[]);
      setCompletedNoInvoice((completedNoInvoiceRes.data ?? []) as CompletedNoInvoiceJob[]);
      setUnassignedToday((unassignedTodayRes.data ?? []) as UnassignedTodayJob[]);
      setThisMonthRevenue(summarizeRevenue((thisMonthRes.data ?? []) as RevenueRow[]));
      setLastMonthRevenue(summarizeRevenue((lastMonthRes.data ?? []) as RevenueRow[]));
      setPipelineCounts(countByStatus((weekRes.data ?? []) as { status: string }[]));

      const activity = (activityRes.data ?? []) as ActivityRow[];
      const jobIds = [...new Set(activity.map((r) => r.entity_id))];
      const actorIds = [...new Set(activity.map((r) => r.actor_id).filter((id): id is string => id !== null))];

      const [jobsForFeedRes, cleanersForFeedRes] = await Promise.all([
        jobIds.length > 0
          ? supabase.from('jobs').select('id, address').in('id', jobIds)
          : Promise.resolve({ data: [] as { id: string; address: string }[], error: null }),
        actorIds.length > 0
          ? supabase.from('cleaners').select('user_id, name').in('user_id', actorIds)
          : Promise.resolve({ data: [] as { user_id: string; name: string }[], error: null }),
      ]);
      if (jobsForFeedRes.error) throw jobsForFeedRes.error;
      if (cleanersForFeedRes.error) throw cleanersForFeedRes.error;

      const addressByJobId = new Map((jobsForFeedRes.data ?? []).map((j) => [j.id, j.address]));
      const cleanerNameByUserId = new Map((cleanersForFeedRes.data ?? []).map((c) => [c.user_id, c.name]));

      setActivityItems(
        activity.map((row) => {
          const address = row.entity_type === 'job' ? addressByJobId.get(row.entity_id) : undefined;
          const jobLabel = address ? `job at ${address}` : `job #${row.entity_id.slice(0, 8)}`;
          const actorName = row.actor_id === null ? 'Stripe' : cleanerNameByUserId.get(row.actor_id) ?? 'Admin';
          return {
            id: row.id,
            description: describeActivity(row, jobLabel, actorName),
            createdAt: row.created_at,
          };
        })
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Dashboard</h2>
      {error && (
        <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
          <ActionItems
            failedInvoices={failedInvoices}
            completedNoInvoice={completedNoInvoice}
            unassignedToday={unassignedToday}
            onInvoiceSent={loadDashboard}
          />

          <div style={{ display: 'flex', gap: spacing.xl, flexWrap: 'wrap', marginBottom: spacing.xl }}>
            <RevenueSnapshot thisMonth={thisMonthRevenue} lastMonth={lastMonthRevenue} />
            <JobPipeline counts={pipelineCounts} />
          </div>

          <ActivityFeed items={activityItems} />
        </>
      )}
    </div>
  );
}
