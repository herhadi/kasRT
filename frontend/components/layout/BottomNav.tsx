'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

function hasExactRole(user: { roles?: string[] } | null, roleName: string) {
  return (user?.roles || []).some((role) => String(role).trim().toLowerCase() === roleName.toLowerCase());
}

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const isAdminInternet = hasExactRole(user, 'Admin Internet');
  const isAdminLingkungan = hasExactRole(user, 'Admin Lingkungan');
  const isAdminKoperasi = hasExactRole(user, 'Admin Koperasi');
  const isRoot = hasExactRole(user, 'root');
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
          ...(isAdminKoperasi || isRoot ? ['koperasi'] : [])
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
  }, [canSeeInbox, isAdminInternet, isAdminLingkungan, isAdminKoperasi, isRoot, user]);

  const items = useMemo(
    () => [
      { href: '/dashboard', label: 'Home', icon: '⌂', active: pathname === '/dashboard' },
      { href: '/operasional', label: 'Ops', icon: '◇', active: pathname?.startsWith('/operasional') },
      { href: '/approval', label: 'Inbox', icon: '✉', active: pathname?.startsWith('/approval'), badge: pendingCount },
      { href: '/akun', label: 'Profil', icon: '👤', active: pathname === '/akun' || pathname?.startsWith('/akun/') }
    ],
    [pathname, pendingCount]
  );

  if (!user || pathname === '/login' || pathname === '/akun/ganti-pin' || user.must_change_pin) return null;

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Navigasi utama mobile">
      <div className="mobile-bottom-nav-inner">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-bottom-nav-item ${item.active ? 'mobile-bottom-nav-item-active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <span className="mobile-bottom-nav-icon">
              {item.icon}
              {item.badge ? <span className="mobile-bottom-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span> : null}
            </span>
            <span className="mobile-bottom-nav-label">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
