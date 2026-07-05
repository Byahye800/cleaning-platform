import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import { color, spacing, radius, font } from '@/lib/theme';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 260,
          padding: spacing.lg,
          borderRight: `1px solid ${color.border}`,
          background: color.gray50,
        }}
      >
        <div style={{ fontWeight: font.weight.bold, marginBottom: spacing.md }}>Yahye Admin</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <Link href="/admin" style={navStyle}>
            Dashboard
          </Link>
          <Link href="/admin/clients" style={navStyle}>
            Clients
          </Link>
          <Link href="/admin/cleaners" style={navStyle}>
            Cleaners
          </Link>
          <Link href="/admin/jobs" style={navStyle}>
            Jobs
          </Link>
          <LogoutButton style={navStyle} />
        </nav>
        <div style={{ height: spacing.lg }} />
        <div style={{ fontSize: font.size.sm, color: color.gray600 }}>
          Uses Supabase client-side auth + RLS enforced at the DB.
        </div>
      </aside>
      <main style={{ flex: 1, padding: spacing.xl }}>{children}</main>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.white,
};
