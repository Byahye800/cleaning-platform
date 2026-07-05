import { AlertCircle, ArrowDown, ArrowUp, Receipt, TrendingUp, type LucideIcon } from 'lucide-react';
import { color, spacing, radius, font } from '@/lib/theme';
import type { RevenueTotals } from '@/lib/revenue';

export type { RevenueTotals };

const ROWS: Array<{ label: string; key: keyof RevenueTotals; icon: LucideIcon; accent: string }> = [
  { label: 'Invoiced', key: 'invoiced', icon: Receipt, accent: color.navy },
  { label: 'Collected', key: 'collected', icon: TrendingUp, accent: color.success },
  { label: 'Outstanding', key: 'outstanding', icon: AlertCircle, accent: color.warning },
];

function formatGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function withAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Guards divide-by-zero: pct is null when lastMonth is 0, meaning "no
// percentage" rather than a misleading +/-Infinity or 0%.
function deltaPct(thisMonth: number, lastMonth: number): number | null {
  if (lastMonth === 0) return null;
  return ((thisMonth - lastMonth) / lastMonth) * 100;
}

export default function RevenueSnapshot({ thisMonth, lastMonth }: { thisMonth: RevenueTotals; lastMonth: RevenueTotals }) {
  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Revenue this month</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {ROWS.map(({ label, key, icon: Icon, accent }) => {
          const pct = deltaPct(thisMonth[key], lastMonth[key]);
          // Distinguishes "went from £0 to something" (notable) from a
          // genuine 0-to-0 (nothing happened) -- both give pct === null,
          // but only the former should draw the eye.
          const isNew = lastMonth[key] === 0 && thisMonth[key] > 0;
          return (
            <div key={key} style={cardStyle}>
              <div style={{ ...badgeStyle, background: withAlpha(accent, 0.15) }}>
                <Icon size={20} color={accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: color.textSecondary, fontSize: font.size.base }}>{label}</div>
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: font.size.lg }}>{formatGBP(thisMonth[key])}</strong>
                  {isNew && (
                    <span
                      style={{
                        fontSize: font.size.sm,
                        fontWeight: font.weight.medium,
                        color: color.success,
                        background: withAlpha(color.success, 0.15),
                        padding: '2px 8px',
                        borderRadius: radius.full,
                      }}
                    >
                      New
                    </span>
                  )}
                  {!isNew && pct !== null && pct !== 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        color: pct > 0 ? color.success : color.error,
                        fontWeight: font.weight.medium,
                        fontSize: font.size.sm,
                      }}
                    >
                      {pct > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {Math.abs(pct).toFixed(1)}%
                    </span>
                  )}
                  {!isNew && pct === 0 && <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>0%</span>}
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>vs {formatGBP(lastMonth[key])} last month</span>
                </div>
              </div>
            </div>
          );
        })}
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

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.md,
  padding: spacing.sm,
  borderRadius: radius.md,
};

const badgeStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  minWidth: 40,
  borderRadius: radius.full,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
