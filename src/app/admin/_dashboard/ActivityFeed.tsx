import { color, spacing, radius, font } from '@/lib/theme';

export type ActivityItem = { id: string; description: string; createdAt: string };

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Recent activity</h3>
      {items.length === 0 ? (
        <div style={{ color: color.textSecondary, fontSize: font.size.base }}>No activity yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {items.map((item) => (
            <div key={item.id} style={rowStyle}>
              <span style={{ fontSize: font.size.base }}>{item.description}</span>
              <span style={{ fontSize: font.size.sm, color: color.textSecondary, whiteSpace: 'nowrap' }}>
                {new Date(item.createdAt).toLocaleString('en-GB')}
              </span>
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
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.md,
  padding: `${spacing.sm}px 0`,
  borderBottom: `1px solid ${color.border}`,
  flexWrap: 'wrap',
};
