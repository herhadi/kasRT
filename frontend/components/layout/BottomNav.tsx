'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

type NavIconName = 'home' | 'ops' | 'inbox' | 'profile';

function hasExactRole(user: { roles?: string[] } | null, roleName: string) {
  return (user?.roles || []).some((role) => String(role).trim().toLowerCase() === roleName.toLowerCase());
}

function NavIcon({ name }: { name: NavIconName }) {
  if (name === 'home') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.8 12 4l8 6.8v8.7a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.4H9.7V21H5.5A1.5 1.5 0 0 1 4 19.5v-8.7Z" /></svg>;
  }
  if (name === 'ops') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h10a2 2 0 0 1 2 2V20l-3-1.6-2.7 1.6-2.7-1.6L8 20l-3-1.6V5.8a2 2 0 0 1 2-2Zm2 4.1h6v1.8H9V7.9Zm0 4h6v1.8H9v-1.8Zm0 4h4v1.8H9v-1.8Z" /></svg>;
  }
  if (name === 'inbox') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.7 5h12.6A2.7 2.7 0 0 1 21 7.7v8.6a2.7 2.7 0 0 1-2.7 2.7H5.7A2.7 2.7 0 0 1 3 16.3V7.7A2.7 2.7 0 0 1 5.7 5Zm.5 3.2 5.3 4.1a.8.8 0 0 0 1 0l5.3-4.1-.9-1.2L12 10.8 7.1 7l-.9 1.2Z" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.2a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0 2.1c-4.1 0-7.5 2.2-7.5 4.9 0 .8.7 1.4 1.5 1.4h12c.8 0 1.5-.6 1.5-1.4 0-2.7-3.4-4.9-7.5-4.9Z" /></svg>;
}

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const isAdminInternet = hasExactRole(user, 'Admin Internet');
  const isAdminLingkungan = hasExactRole(user, 'Admin Lingkungan');
  const isAdminKoperasi = hasExactRole(user, 'Admin Koperasi');
  const isAdminPembangunan = hasExactRole(user, 'Admin Pembangunan');
  const isRoot = hasExactRole(user, 'root');
  const canSeeOps = hasAnyRole(user, [
    'Bendahara', 'Ketua', 'Plt Ketua', 'Sekretaris', 'Admin Jimpitan',
    'Admin Pembangunan', 'Admin Lingkungan', 'Admin Sosial',
    'Admin Internet', 'Admin Koperasi', 'Admin Keamanan', 'root'
  ]);
  const canSeeInbox = hasAnyRole(user, [
    'Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara', 'Admin Jimpitan',
    'Admin Pembangunan', 'Admin Lingkungan', 'Admin Sosial',
    'Admin Internet', 'Admin Koperasi', 'Admin Keamanan', 'root'
  ]);

  useEffect(() => {
    if (!user || !canSeeInbox) {
      setPendingCount(0);
      return;
    }

    const loadPendingCount = async () => {
      try {
        const result = await apiFetch<{ success: boolean; data: { total_pending: number } }>('/approval/pending');
        const membershipModules = [
          ...(isAdminInternet || isRoot ? ['internet'] : []),
          ...(isAdminLingkungan || isRoot ? ['lingkungan'] : []),
          ...(isAdminKoperasi || isRoot ? ['koperasi'] : []),
          ...(isAdminPembangunan || isRoot ? ['tabungan'] : [])
        ];
        const membershipCounts = await Promise.all(
          membershipModules.map((moduleKey) =>
            apiFetch<{ success: boolean; data: unknown[] }>(`/membership/requests?module_key=${moduleKey}`)
              .then((res) => Number(res.data?.length || 0))
              .catch(() => 0)
          )
        );
        setPendingCount(Number(result.data?.total_pending || 0) + membershipCounts.reduce((sum, count) => sum + count, 0));
      } catch {
        setPendingCount(0);
      }
    };

    void loadPendingCount();
    const interval = window.setInterval(() => void loadPendingCount(), 30000);
    return () => window.clearInterval(interval);
  }, [canSeeInbox, isAdminInternet, isAdminLingkungan, isAdminKoperasi, isAdminPembangunan, isRoot, user]);

  const items = useMemo(
    () => [
      { href: '/dashboard', label: 'Home', icon: 'home' as const, tone: 'blue', active: pathname === '/dashboard' },
      {
        href: canSeeOps ? '/operasional' : '/jimpitan',
        label: canSeeOps ? 'Ops' : 'Jimpitan',
        icon: 'ops' as const,
        tone: 'emerald',
        active: canSeeOps ? pathname?.startsWith('/operasional') : pathname?.startsWith('/jimpitan')
      },
      { href: '/approval', label: 'Inbox', icon: 'inbox' as const, tone: 'amber', active: pathname?.startsWith('/approval'), badge: pendingCount },
      { href: '/akun', label: 'Profil', icon: 'profile' as const, tone: 'violet', active: pathname === '/akun' || pathname?.startsWith('/akun/') }
    ],
    [canSeeOps, pathname, pendingCount]
  );

  if (!user || pathname === '/login' || pathname === '/akun/ganti-pin' || user.must_change_pin) return null;

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Navigasi utama mobile">
      <div className="mobile-bottom-nav-inner">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-bottom-nav-item mobile-bottom-nav-tone-${item.tone} ${item.active ? 'mobile-bottom-nav-item-active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <span className="mobile-bottom-nav-icon">
              <NavIcon name={item.icon} />
              {item.badge ? <span className="mobile-bottom-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span> : null}
            </span>
            <span className="mobile-bottom-nav-label">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
