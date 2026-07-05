import { color, spacing, radius, font } from '@/lib/theme';
import type { StatusCount } from '@/lib/counts';

export type { StatusCount };

// Cosmetic labels only, for the statuses that show up in practice today.
// Any other status string still renders fine via the `?? status` fallback --
// see the "show both + other" call on the pending/scheduled naming question.
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function JobPipeline({ counts }: { counts: StatusCount[] }) {
  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Job pipeline this week</h3>
      {counts.length === 0 ? (
        <div style={{ color: color.textSecondary, fontSize: font.size.base }}>No jobs scheduled this week.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {counts.map(({ status, count }) => (
            <div key={status} style={rowStyle}>
              <span style={{ color: color.textSecondary, fontSize: font.size.base }}>{STATUS_LABELS[status] ?? status}</span>
              <strong style={{ fontSize: font.size.lg }}>{count}</strong>
            </div>
          ))}
        </div>
      )}
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
  padding: `${spacing.sm}px 0`,
  borderBottom: `1px solid ${color.border}`,
};
