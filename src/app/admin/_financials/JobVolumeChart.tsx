'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { color, spacing, radius, font } from '@/lib/theme';
import { monthLabel, type MonthlyCount } from '@/lib/revenue';

export default function JobVolumeChart({ data }: { data: MonthlyCount[] }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));

  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Completed jobs per month</h3>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={color.gray200} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: color.textSecondary, fontSize: font.size.sm }} axisLine={{ stroke: color.gray200 }} tickLine={false} />
            <YAxis tick={{ fill: color.textSecondary, fontSize: font.size.sm }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
            <Tooltip
              formatter={(value) => {
                const n = Number(value ?? 0);
                return [`${n} job${n === 1 ? '' : 's'}`, 'Completed'];
              }}
              contentStyle={{ borderRadius: radius.sm, borderColor: color.border }}
            />
            <Bar dataKey="count" name="Completed" fill={color.chartBlue} radius={[4, 4, 0, 0]} maxBarSize={40} />
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
