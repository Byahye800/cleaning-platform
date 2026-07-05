'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { color, spacing, radius, font } from '@/lib/theme';
import type { StatusCount } from '@/lib/counts';

const STATUS_COLORS: Record<string, string> = {
  paid: color.success,
  invoiced: color.chartBlue,
  failed: color.error,
  unpaid: color.gray400,
};

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  invoiced: 'Invoiced',
  failed: 'Failed',
  unpaid: 'Unpaid',
};

export default function InvoiceStatusDonut({ counts }: { counts: StatusCount[] }) {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const data = counts.map((c) => ({ name: STATUS_LABELS[c.status] ?? c.status, value: c.count, status: c.status }));

  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Invoice status breakdown</h3>
      <div style={{ position: 'relative', width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={2} stroke={color.white} strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? color.gray600} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => {
                const n = Number(value ?? 0);
                return [`${n} job${n === 1 ? '' : 's'}`, undefined];
              }}
              contentStyle={{ borderRadius: radius.sm, borderColor: color.border }}
            />
            <Legend wrapperStyle={{ fontSize: font.size.sm, color: color.textSecondary }} />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            top: '42%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.textPrimary }}>{total}</div>
          <div style={{ fontSize: font.size.sm, color: color.textSecondary }}>Total</div>
        </div>
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
