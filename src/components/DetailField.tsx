import { color, font, spacing } from '@/lib/theme';

export default function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>{label}</span>
      <span style={{ fontSize: font.size.base, color: color.textPrimary }}>{value ?? '—'}</span>
    </div>
  );
}
