'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import { color, spacing, radius, font } from '@/lib/theme';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const linkStyle = (href: string) => (pathname === href ? activeNavStyle : navStyle);

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
        <div style={{ fontWeight: font.weight.bold, marginBottom: spacing.md, color: color.gray900 }}>
          Yahye Admin
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <Link href="/admin" style={linkStyle('/admin')}>
            Dashboard
          </Link>
          <Link href="/admin/clients" style={linkStyle('/admin/clients')}>
            Clients
          </Link>
          <Link href="/admin/cleaners" style={linkStyle('/admin/cleaners')}>
            Cleaners
          </Link>
          <Link href="/admin/jobs" style={linkStyle('/admin/jobs')}>
            Jobs
          </Link>
          <Link href="/admin/financials" style={linkStyle('/admin/financials')}>
            Financials
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
  color: color.gray900,
};

const activeNavStyle: React.CSSProperties = {
  ...navStyle,
  background: color.navy,
  color: color.textInverse,
  border: `1px solid ${color.navy}`,
};
