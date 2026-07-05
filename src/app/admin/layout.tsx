'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, HardHat, LayoutDashboard, PoundSterling, Users, type LucideIcon } from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';
import { color, spacing, radius, font } from '@/lib/theme';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string | null; items: NavItem[] };

// "Rota" is deliberately not listed here yet -- /admin/rota doesn't exist as
// a route. Add it to the Operations group in the same pass that builds it.
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Operations', items: [{ href: '/admin/jobs', label: 'Jobs', icon: ClipboardList }] },
  {
    label: 'Team & Clients',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Users },
      { href: '/admin/cleaners', label: 'Cleaners', icon: HardHat },
    ],
  },
  { label: 'Finance', items: [{ href: '/admin/financials', label: 'Financials', icon: PoundSterling }] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const linkStyle = (href: string): React.CSSProperties => ({
    ...(pathname === href ? activeNavStyle : navStyle),
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  });

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
          FM Pro Cleaning
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label ?? `top-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {group.label && <div style={sectionLabelStyle}>{group.label}</div>}
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} style={linkStyle(href)}>
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ height: spacing.lg }} />
        <LogoutButton style={navStyle} />
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: font.size.sm,
  fontWeight: font.weight.medium,
  color: color.gray400,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: `0 ${spacing.md}px`,
};
