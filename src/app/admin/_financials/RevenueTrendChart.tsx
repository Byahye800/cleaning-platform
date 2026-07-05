'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { color, spacing, radius, font } from '@/lib/theme';
import { monthLabel, type MonthlyRevenue } from '@/lib/revenue';

function formatGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

// Chart-safe colors validated with the dataviz skill's palette validator
// (CVD separation + lightness/chroma floor) -- `color.navy` itself fails
// those checks at data-mark size, hence `color.chartBlue`.
const SERIES = [
  { key: 'invoiced' as const, name: 'Invoiced', stroke: color.chartBlue },
  { key: 'collected' as const, name: 'Collected', stroke: color.success },
  { key: 'outstanding' as const, name: 'Outstanding', stroke: color.warning },
];

export default function RevenueTrendChart({ data }: { data: MonthlyRevenue[] }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));

  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Revenue trend (6 months)</h3>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={color.gray200} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: color.textSecondary, fontSize: font.size.sm }} axisLine={{ stroke: color.gray200 }} tickLine={false} />
            <YAxis
              tick={{ fill: color.textSecondary, fontSize: font.size.sm }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatGBP(v)}
              width={72}
            />
            <Tooltip formatter={(value) => formatGBP(Number(value ?? 0))} contentStyle={{ borderRadius: radius.sm, borderColor: color.border }} />
            <Legend wrapperStyle={{ fontSize: font.size.sm, color: color.textSecondary }} />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.stroke} strokeWidth={2} dot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
};
