'use client';

import { useEffect, useState } from 'react';
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
  const canSeeApproval = hasAnyRole(user, ['Ketua', 'Sekretaris', 'Admin Jimpitan', 'root']);
  const canManageUsers = hasAnyRole(user, ['Ketua', 'Sekretaris', 'root']);

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

  if (!user) return null;

  const menus = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/jimpitan', label: 'Jimpitan', icon: '💰' },
    { href: '/approval', label: 'Approval', icon: '✅', gated: true },
    { href: '/management/users', label: 'Manajemen', icon: '🛠️', managerOnly: true }
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

        <nav className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
          {menus
            .filter((menu) => (!menu.gated || canSeeApproval) && (!menu.managerOnly || canManageUsers))
            .map((menu) => {
              const active = pathname === menu.href;
              return (
                <Link
                  key={menu.href}
                  href={menu.href}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[var(--surface-strong)] text-[var(--accent)] shadow-md'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{menu.icon}</span>
                  <span>{menu.label}</span>
                  {menu.href === '/approval' && pendingCount > 0 && !active ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900 min-w-[20px]">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
        </nav>
      </div>
    </header>
  );
}
