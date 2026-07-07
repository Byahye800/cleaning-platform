'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, radius, font } from '@/lib/theme';

export default function NotificationBadge({ href, style }: { href: string; style?: React.CSSProperties }) {
  const [count, setCount] = useState(0);

  async function loadCount() {
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;
    const { count: unread } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setCount(unread ?? 0);
  }

  useEffect(() => { loadCount().catch(() => {}); }, []); // eslint-disable-line

  async function markAllRead() {
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    setCount(0);
  }

  return (
    <Link
      href={href}
      onClick={() => markAllRead()}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}
    >
      <Bell size={18} />
      {count > 0 && <span style={badgeStyle}>{count > 9 ? '9+' : count}</span>}
    </Link>
  );
}

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  background: color.error,
  color: color.textInverse,
  fontSize: 10,
  fontWeight: font.weight.bold,
  borderRadius: radius.full,
  minWidth: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
};
