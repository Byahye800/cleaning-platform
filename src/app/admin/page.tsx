'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { spacing } from '@/lib/theme';
import { summarizeRevenue, isoDate, ZERO_REVENUE_TOTALS, type RevenueRow } from '@/lib/revenue';
import { countByStatus } from '@/lib/counts';
import { describeActivity, type ActivityRow } from '@/lib/activity';
import ActionItems, { type CompletedNoInvoiceJob, type FailedInvoiceJob, type OpenIssueJob, type UnassignedTodayJob } from './_dashboard/ActionItems';
import RevenueSnapshot, { type RevenueTotals } from './_dashboard/RevenueSnapshot';
import JobPipeline, { type StatusCount } from './_dashboard/JobPipeline';
import ActivityFeed, { type ActivityItem } from './_dashboard/ActivityFeed';

function startOfWeekMonday(d: Date) {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = (day + 6) % 7; // days since Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [failedInvoices, setFailedInvoices] = useState<FailedInvoiceJob[]>([]);
  const [completedNoInvoice, setCompletedNoInvoice] = useState<CompletedNoInvoiceJob[]>([]);
  const [unassignedToday, setUnassignedToday] = useState<UnassignedTodayJob[]>([]);
  const [openIssues, setOpenIssues] = useState<OpenIssueJob[]>([]);

  const [thisMonthRevenue, setThisMonthRevenue] = useState<RevenueTotals>(ZERO_REVENUE_TOTALS);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<RevenueTotals>(ZERO_REVENUE_TOTALS);
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
        failedBillingRes,
        unpaidBillingRes,
        unassignedTodayRes,
        thisMonthRes,
        lastMonthRes,
        weekRes,
        activityRes,
        openIssuesRes,
      ] = await Promise.all([
        supabase.from('job_billing').select('job_id, price').eq('payment_status', 'failed'),
        supabase.from('job_billing').select('job_id, price').eq('payment_status', 'unpaid'),
        supabase
          .from('jobs')
          .select('id, address, scheduled_time')
          .eq('scheduled_date', todayIso)
          .is('cleaner_id', null)
          .neq('status', 'cancelled'),
        supabase
          .from('job_billing')
          .select('price, payment_status, stripe_invoice_id')
          .gte('invoiced_at', thisMonthStart)
          .lt('invoiced_at', thisMonthEnd),
        supabase
          .from('job_billing')
          .select('price, payment_status, stripe_invoice_id')
          .gte('invoiced_at', lastMonthStart)
          .lt('invoiced_at', thisMonthStart),
        supabase.from('jobs').select('status').gte('scheduled_date', weekStart).lt('scheduled_date', weekEnd),
        supabase
          .from('activity_log')
          .select('id, actor_id, action, entity_type, entity_id, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('issues').select('id, job_id, description, jobs(address)').neq('status', 'resolved'),
      ]);

      for (const res of [failedBillingRes, unpaidBillingRes, unassignedTodayRes, thisMonthRes, lastMonthRes, weekRes, activityRes, openIssuesRes]) {
        if (res.error) throw res.error;
      }

      const failedBillingRows = (failedBillingRes.data ?? []) as { job_id: string; price: number | null }[];
      const unpaidBillingRows = (unpaidBillingRes.data ?? []) as { job_id: string; price: number | null }[];
      const allCandidateJobIds = [...new Set([...failedBillingRows.map((r) => r.job_id), ...unpaidBillingRows.map((r) => r.job_id)])];

      const jobsForBillingRes =
        allCandidateJobIds.length > 0
          ? await supabase.from('jobs').select('id, address, status').in('id', allCandidateJobIds)
          : { data: [] as { id: string; address: string; status: string }[], error: null };
      if (jobsForBillingRes.error) throw jobsForBillingRes.error;

      const jobById = new Map((jobsForBillingRes.data ?? []).map((j) => [j.id, j]));

      setFailedInvoices(
        failedBillingRows.map((r) => ({
          id: r.job_id,
          address: jobById.get(r.job_id)?.address ?? '(unknown address)',
          price: r.price,
        }))
      );
      setCompletedNoInvoice(
        unpaidBillingRows
          .filter((r) => jobById.get(r.job_id)?.status === 'completed')
          .map((r) => ({
            id: r.job_id,
            address: jobById.get(r.job_id)?.address ?? '(unknown address)',
            price: r.price,
          }))
      );
      setUnassignedToday((unassignedTodayRes.data ?? []) as UnassignedTodayJob[]);
      setThisMonthRevenue(summarizeRevenue((thisMonthRes.data ?? []) as RevenueRow[]));
      setLastMonthRevenue(summarizeRevenue((lastMonthRes.data ?? []) as RevenueRow[]));
      setPipelineCounts(countByStatus((weekRes.data ?? []) as { status: string }[]));
      setOpenIssues(
        ((openIssuesRes.data ?? []) as unknown as { id: string; job_id: string; description: string; jobs: { address: string } | null }[]).map(
          (row) => ({ id: row.id, job_id: row.job_id, description: row.description, address: row.jobs?.address ?? '(unknown address)' })
        )
      );

      const activity = (activityRes.data ?? []) as ActivityRow[];
      const jobIds = [...new Set(activity.map((r) => r.entity_id))];
      const actorIds = [...new Set(activity.map((r) => r.actor_id).filter((id): id is string => id !== null))];

      const [jobsForFeedRes, cleanersForFeedRes, clientsForFeedRes] = await Promise.all([
        jobIds.length > 0
          ? supabase.from('jobs').select('id, address').in('id', jobIds)
          : Promise.resolve({ data: [] as { id: string; address: string }[], error: null }),
        actorIds.length > 0
          ? supabase.from('cleaners').select('user_id, name').in('user_id', actorIds)
          : Promise.resolve({ data: [] as { user_id: string; name: string }[], error: null }),
        actorIds.length > 0
          ? supabase.from('clients').select('user_id, name').in('user_id', actorIds)
          : Promise.resolve({ data: [] as { user_id: string; name: string }[], error: null }),
      ]);
      if (jobsForFeedRes.error) throw jobsForFeedRes.error;
      if (cleanersForFeedRes.error) throw cleanersForFeedRes.error;
      if (clientsForFeedRes.error) throw clientsForFeedRes.error;

      const addressByJobId = new Map((jobsForFeedRes.data ?? []).map((j) => [j.id, j.address]));
      const cleanerNameByUserId = new Map((cleanersForFeedRes.data ?? []).map((c) => [c.user_id, c.name]));
      const clientNameByUserId = new Map((clientsForFeedRes.data ?? []).map((c) => [c.user_id, c.name]));

      // Actor resolution mirrors resolveActorName in admin/jobs/[id]/page.tsx:
      // cleaner lookup, then client lookup, then a safe fallback. Unlike the
      // job-detail page (which only ever sees cleaner/client/admin actors on
      // a single job), the dashboard feed also sees actor_id === null
      // (Stripe, handled above) and genuine admin actors -- an actor found in
      // neither table is assumed to be an admin, since every admin action in
      // this codebase is attributed to auth.uid() of an admin user_roles row,
      // and admins have no cleaners/clients row of their own.
      setActivityItems(
        activity.map((row) => {
          const address = row.entity_type === 'job' ? addressByJobId.get(row.entity_id) : undefined;
          const jobLabel = address ? `job at ${address}` : `job #${row.entity_id.slice(0, 8)}`;
          const actorName =
            row.actor_id === null
              ? 'Stripe'
              : cleanerNameByUserId.get(row.actor_id) ?? clientNameByUserId.get(row.actor_id) ?? 'Admin';
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
            openIssues={openIssues}
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
