'use client';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

export default function LogoutButton({ style }: { style?: React.CSSProperties }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
  }

  return (
    <button onClick={handleLogout} style={{ cursor: 'pointer', fontFamily: 'inherit', ...style }}>
      Log out
    </button>
  );
}
