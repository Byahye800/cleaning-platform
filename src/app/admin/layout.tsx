import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 260,
          padding: 16,
          borderRight: '1px solid #e5e7eb',
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Yahye Admin</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link href="/admin/rls-sanity" style={navStyle}>
            RLS Sanity Test
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
        </nav>
        <div style={{ height: 16 }} />
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Uses Supabase client-side auth + RLS enforced at the DB.
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: 'white',
};
