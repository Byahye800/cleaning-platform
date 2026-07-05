import { color, spacing, radius, font } from '@/lib/theme';

export type RevenueTotals = { invoiced: number; collected: number; outstanding: number };

const ROWS: Array<{ label: string; key: keyof RevenueTotals }> = [
  { label: 'Invoiced', key: 'invoiced' },
  { label: 'Collected', key: 'collected' },
  { label: 'Outstanding', key: 'outstanding' },
];

function formatGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

export default function RevenueSnapshot({ thisMonth, lastMonth }: { thisMonth: RevenueTotals; lastMonth: RevenueTotals }) {
  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Revenue this month</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {ROWS.map(({ label, key }) => (
          <div key={key} style={rowStyle}>
            <span style={{ color: color.textSecondary, fontSize: font.size.base }}>{label}</span>
            <span style={{ display: 'flex', gap: spacing.sm, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: font.size.lg }}>{formatGBP(thisMonth[key])}</strong>
              <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>vs {formatGBP(lastMonth[key])} last month</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  flex: 1,
  minWidth: 280,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
  flexWrap: 'wrap',
  padding: `${spacing.sm}px 0`,
  borderBottom: `1px solid ${color.border}`,
};
