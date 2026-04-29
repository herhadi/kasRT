'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const navScrollerRef = useRef<HTMLDivElement | null>(null);
  const canSeeApproval = hasAnyRole(user, [
    'Ketua',
    'Sekretaris',
    'Bendahara',
    'Admin Jimpitan',
    'Admin Pembangunan',
    'Admin Lingkungan',
    'Admin Sosial',
    'Admin Internet',
    'Admin Koperasi',
    'Admin Keamanan',
    'root'
  ]);
  const canManageUsers = hasAnyRole(user, ['Ketua', 'Sekretaris', 'root']);
  const canSeeOps = hasAnyRole(user, [
    'Bendahara',
    'Ketua',
    'Sekretaris',
    'Admin Jimpitan',
    'Admin Pembangunan',
    'Admin Lingkungan',
    'Admin Sosial',
    'Admin Internet',
    'Admin Koperasi',
    'Admin Keamanan',
    'root'
  ]);
  const isBendahara = hasAnyRole(user, ['Bendahara', 'root']);
  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);
  const opsMenu = isBendahara
    ? { href: '/operasional', label: 'Operasional', icon: '🧾' }
    : isAdminJimpitan
      ? { href: '/jimpitan/admin', label: 'Admin Jimpitan', icon: '🧺' }
      : { href: '/operasional', label: 'Operasional', icon: '🧾' };

  useEffect(() => {
    if (!canSeeApproval) {
      const resetTimer = window.setTimeout(() => {
        setPendingCount(0);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    if (!user) {
      return;
    }

    const loadPendingCount = async () => {
      try {
        const result = await apiFetch<{ success: boolean; data: { total_pending: number } }>('/approval/pending');
        setPendingCount(Number(result.data?.total_pending || 0));
      } catch {
        setPendingCount(0);
      }
    };

    const kickoff = window.setTimeout(() => {
      void loadPendingCount();
    }, 0);
    const interval = window.setInterval(() => {
      void loadPendingCount();
    }, 30000);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [canSeeApproval, user]);

  useEffect(() => {
    const scroller = navScrollerRef.current;
    if (!scroller) return;
    const activeEl = scroller.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeEl) return;
    const raf = window.requestAnimationFrame(() => {
      const scrollerRect = scroller.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      const margin = 12;
      const leftOverflow = scrollerRect.left - activeRect.left;
      const rightOverflow = activeRect.right - scrollerRect.right;

      let targetLeft = scroller.scrollLeft;
      if (leftOverflow > 0) {
        targetLeft = Math.max(0, scroller.scrollLeft - leftOverflow - margin);
      } else if (rightOverflow > 0) {
        targetLeft = scroller.scrollLeft + rightOverflow + margin;
      }

      if (Math.abs(targetLeft - scroller.scrollLeft) > 1) {
        scroller.scrollTo({ left: targetLeft, behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pathname, canSeeApproval, canManageUsers, canSeeOps]);

  if (!user) return null;

  const menus = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/jimpitan', label: 'Jimpitan', icon: '💰' },
    { ...opsMenu, opsOnly: true },
    { href: '/approval', label: 'Approval', icon: '✅', gated: true },
    { href: '/management', label: 'Manajemen', icon: '🛠️', managerOnly: true }
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--surface-strong)] shadow-sm backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-[var(--font-space-grotesk)] text-xl font-bold text-[var(--text-primary)]">KasRT</h1>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{user.nama}</span>
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-primary)]">
                {user.roles}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canSeeApproval && pendingCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                <span>⏳</span>
                <span>{pendingCount} menunggu approval</span>
              </div>
            )}
            <Button
              variant="danger"
              onClick={() => {
                logout();
                router.push('/login');
              }}
            >
              Keluar
            </Button>
          </div>
        </div>

        <div ref={navScrollerRef} className="w-full overflow-x-auto md:overflow-visible">
          <nav className="flex w-full min-w-max items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
            {menus
              .filter(
                (menu) =>
                  (!menu.gated || canSeeApproval) &&
                  (!menu.managerOnly || canManageUsers) &&
                  (!(menu as { opsOnly?: boolean }).opsOnly || canSeeOps)
              )
              .map((menu) => {
                const active = pathname === menu.href;
                return (
                  <Link
                    key={menu.href}
                    href={menu.href}
                    data-active={active ? 'true' : 'false'}
                    className={`inline-flex min-w-[118px] flex-none items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                      active
                        ? 'border bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] shadow-[0_8px_20px_rgba(29,78,216,0.2)] border-[var(--nav-active-border)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span>{menu.icon}</span>
                    <span>{menu.label}</span>
                    {menu.href === '/approval' && pendingCount > 0 && !active ? (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">
                        {pendingCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
          </nav>
        </div>
      </div>
    </header>
  );
}
