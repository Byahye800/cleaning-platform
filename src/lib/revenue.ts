// Shared revenue summarization for the admin dashboard's Revenue Snapshot
// widget and /admin/financials, so "this month's revenue" can't drift
// between the two. Rows must be selected bucketed by invoiced_at (when the
// job was actually invoiced) -- never scheduled_date, which was the bug
// fixed by supabase/0013_invoiced_at.sql.
export type RevenueTotals = { invoiced: number; collected: number; outstanding: number };

export type RevenueRow = { price: number | null; payment_status: string; stripe_invoice_id: string | null };

export const ZERO_REVENUE_TOTALS: RevenueTotals = { invoiced: 0, collected: 0, outstanding: 0 };

export function summarizeRevenue(rows: RevenueRow[]): RevenueTotals {
  return rows.reduce(
    (totals, row) => {
      const amount = row.price ?? 0;
      if (row.stripe_invoice_id) totals.invoiced += amount;
      if (row.payment_status === 'paid') totals.collected += amount;
      if (row.payment_status === 'invoiced' || row.payment_status === 'failed') totals.outstanding += amount;
      return totals;
    },
    { ...ZERO_REVENUE_TOTALS }
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Plain YYYY-MM-DD in the browser's local time zone.
export function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthBounds(d: Date) {
  return {
    start: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 1)),
  };
}

export function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// The last `count` calendar months, oldest first, including the current month.
export function lastMonths(count: number, from: Date = new Date()): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  return Array.from({ length: count }, (_, i) => addMonths(start, i - (count - 1)));
}

export type RevenueTrendRow = RevenueRow & { invoiced_at: string | null };

export type MonthlyRevenue = RevenueTotals & { month: Date };

// Buckets rows by the calendar month of invoiced_at (never scheduled_date --
// see supabase/0013_invoiced_at.sql). Rows with no invoiced_at are excluded
// from every bucket rather than guessed into one.
export function bucketRevenueByMonth(rows: RevenueTrendRow[], months: Date[]): MonthlyRevenue[] {
  return months.map((month) => {
    const rowsInMonth = rows.filter((r) => {
      if (!r.invoiced_at) return false;
      const d = new Date(r.invoiced_at);
      return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
    });
    return { month, ...summarizeRevenue(rowsInMonth) };
  });
}

export type MonthlyCount = { month: Date; count: number };

export function bucketCountByMonth(isoDates: string[], months: Date[]): MonthlyCount[] {
  return months.map((month) => ({
    month,
    count: isoDates.filter((iso) => {
      const d = new Date(iso);
      return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
    }).length,
  }));
}

export type AgingBucket = { label: string; amount: number; count: number };

const AGING_BUCKET_LABELS = ['0-30 days', '31-60 days', '61-90 days', '90+ days'];

// Buckets currently-outstanding invoices (payment_status invoiced/failed) by
// days elapsed since invoiced_at. Rows with no invoiced_at are excluded --
// see supabase/0013_invoiced_at.sql for why pre-migration invoices have none.
export function bucketInvoiceAging(rows: { price: number | null; invoiced_at: string | null }[], now: Date = new Date()): AgingBucket[] {
  const buckets: AgingBucket[] = AGING_BUCKET_LABELS.map((label) => ({ label, amount: 0, count: 0 }));
  for (const row of rows) {
    if (!row.invoiced_at) continue;
    const ageDays = Math.floor((now.getTime() - new Date(row.invoiced_at).getTime()) / 86_400_000);
    const idx = ageDays <= 30 ? 0 : ageDays <= 60 ? 1 : ageDays <= 90 ? 2 : 3;
    buckets[idx].amount += row.price ?? 0;
    buckets[idx].count += 1;
  }
  return buckets;
}
