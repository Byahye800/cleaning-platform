'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { spacing } from '@/lib/theme';
import {
  summarizeRevenue,
  isoDate,
  lastMonths,
  bucketRevenueByMonth,
  bucketCountByMonth,
  bucketInvoiceAging,
  ZERO_REVENUE_TOTALS,
  type RevenueTotals,
  type RevenueTrendRow,
  type MonthlyRevenue,
  type MonthlyCount,
  type AgingBucket,
} from '@/lib/revenue';
import { countByStatus, type StatusCount } from '@/lib/counts';
import RevenueSnapshot from '../_dashboard/RevenueSnapshot';
import RevenueTrendChart from '../_financials/RevenueTrendChart';
import InvoiceAgingChart from '../_financials/InvoiceAgingChart';
import JobVolumeChart from '../_financials/JobVolumeChart';
import InvoiceStatusDonut from '../_financials/InvoiceStatusDonut';

const MONTHS_OF_HISTORY = 6;

export default function FinancialsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [thisMonthRevenue, setThisMonthRevenue] = useState<RevenueTotals>(ZERO_REVENUE_TOTALS);
  const [lastMonthRevenue, setLastMonthRevenue] = useState<RevenueTotals>(ZERO_REVENUE_TOTALS);
  const [revenueTrend, setRevenueTrend] = useState<MonthlyRevenue[]>([]);
  const [jobVolume, setJobVolume] = useState<MonthlyCount[]>([]);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>([]);
  const [paymentStatusCounts, setPaymentStatusCounts] = useState<StatusCount[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const today = new Date();
      const months = lastMonths(MONTHS_OF_HISTORY, today);
      const historyStart = isoDate(months[0]);
      const thisMonthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
      const thisMonthEnd = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1));
      const lastMonthStart = isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));

      const [trendRes, completedActivityRes, agingRes, statusRes] = await Promise.all([
        supabase
          .from('job_billing')
          .select('price, payment_status, stripe_invoice_id, invoiced_at')
          .gte('invoiced_at', historyStart),
        supabase
          .from('activity_log')
          .select('created_at')
          .eq('action', 'job.completed')
          .gte('created_at', historyStart),
        supabase
          .from('job_billing')
          .select('price, invoiced_at')
          .in('payment_status', ['invoiced', 'failed'])
          .not('invoiced_at', 'is', null),
        supabase.from('job_billing').select('payment_status'),
      ]);

      for (const res of [trendRes, completedActivityRes, agingRes, statusRes]) {
        if (res.error) throw res.error;
      }

      const trendRows = (trendRes.data ?? []) as RevenueTrendRow[];
      setRevenueTrend(bucketRevenueByMonth(trendRows, months));
      setThisMonthRevenue(summarizeRevenue(trendRows.filter((r) => r.invoiced_at && r.invoiced_at >= thisMonthStart && r.invoiced_at < thisMonthEnd)));
      setLastMonthRevenue(summarizeRevenue(trendRows.filter((r) => r.invoiced_at && r.invoiced_at >= lastMonthStart && r.invoiced_at < thisMonthStart)));

      const completedDates = ((completedActivityRes.data ?? []) as { created_at: string }[]).map((r) => r.created_at);
      setJobVolume(bucketCountByMonth(completedDates, months));

      setAgingBuckets(bucketInvoiceAging((agingRes.data ?? []) as { price: number | null; invoiced_at: string | null }[]));

      const statusRows = ((statusRes.data ?? []) as { payment_status: string }[]).map((r) => ({ status: r.payment_status }));
      setPaymentStatusCounts(countByStatus(statusRows));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Financials</h2>
      {error && (
        <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
          <RevenueSnapshot thisMonth={thisMonthRevenue} lastMonth={lastMonthRevenue} />
          <RevenueTrendChart data={revenueTrend} />
          <div style={{ display: 'flex', gap: spacing.xl, flexWrap: 'wrap' }}>
            <InvoiceAgingChart buckets={agingBuckets} />
            <JobVolumeChart data={jobVolume} />
            <InvoiceStatusDonut counts={paymentStatusCounts} />
          </div>
        </div>
      )}
    </div>
  );
}
