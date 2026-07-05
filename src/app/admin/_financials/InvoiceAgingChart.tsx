'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { color, spacing, radius, font } from '@/lib/theme';
import type { AgingBucket } from '@/lib/revenue';

function formatGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

// Escalating severity, not a categorical identity set -- deliberately not run
// through the categorical CVD validator. Green -> amber -> red reads as a
// universal severity ramp; the 61-90 step is `error` at reduced opacity so
// the two most-overdue buckets stay visually distinct from each other.
const AGING_COLORS = [color.success, color.warning, 'rgba(185,28,28,0.55)', color.error];

export default function InvoiceAgingChart({ buckets }: { buckets: AgingBucket[] }) {
  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Invoice aging</h3>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={color.gray200} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: color.textSecondary, fontSize: font.size.sm }} axisLine={{ stroke: color.gray200 }} tickLine={false} />
            <YAxis
              tick={{ fill: color.textSecondary, fontSize: font.size.sm }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatGBP(v)}
              width={72}
            />
            <Tooltip
              formatter={(value, _name, item: any) => [formatGBP(Number(value ?? 0)), `${item.payload.count} invoice${item.payload.count === 1 ? '' : 's'}`]}
              contentStyle={{ borderRadius: radius.sm, borderColor: color.border }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={64}>
              {buckets.map((b, i) => (
                <Cell key={b.label} fill={AGING_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  flex: 1,
  minWidth: 320,
};
