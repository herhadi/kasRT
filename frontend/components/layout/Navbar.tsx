'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';

function hasExactRole(user: { roles?: string[] } | null, roleName: string) {
  return (user?.roles || []).some((role) => String(role).trim().toLowerCase() === roleName.toLowerCase());
}

export default function Navbar({ sticky = true }: { sticky?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const navScrollerRef = useRef<HTMLDivElement | null>(null);
  const navScrollPosRef = useRef(0);
  
  // Disable browser scroll restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);
  
  const canSeeApproval = hasAnyRole(user, [
    'Ketua', 'Sekretaris', 'Bendahara', 'Admin Jimpitan',
    'Admin Pembangunan', 'Admin Lingkungan', 'Admin Sosial',
    'Admin Internet', 'Admin Koperasi', 'Admin Keamanan', 'root'
  ]);
  const canManageUsers = hasAnyRole(user, ['Ketua', 'Sekretaris', 'root']);
  const canSeeOps = hasAnyRole(user, [
    'Bendahara', 'Ketua', 'Sekretaris', 'Admin Jimpitan',
    'Admin Pembangunan', 'Admin Lingkungan', 'Admin Sosial',
    'Admin Internet', 'Admin Koperasi', 'Admin Keamanan', 'root'
  ]);
  const isBendahara = hasExactRole(user, 'Bendahara');
  const isAdminJimpitan = hasExactRole(user, 'Admin Jimpitan');
  const isAdminPembangunan = hasExactRole(user, 'Admin Pembangunan');
  const isAdminLingkungan = hasExactRole(user, 'Admin Lingkungan');
  const isAdminSosial = hasExactRole(user, 'Admin Sosial');
  const isAdminInternet = hasExactRole(user, 'Admin Internet');
  const isAdminKoperasi = hasExactRole(user, 'Admin Koperasi');
  const isAdminKeamanan = hasExactRole(user, 'Admin Keamanan');
  const isSekretaris = hasExactRole(user, 'Sekretaris');
  const jimpitanMenuHref = '/jimpitan';
  const approvalMenuHref = isBendahara ? '/approval/bendahara' : '/approval';
  const opsMenu = isBendahara
    ? { href: '/operasional/bendahara', label: 'Operasional', icon: '🧾' }
    : isSekretaris
      ? { href: '/operasional/sekretaris', label: 'Operasional', icon: '🧾' }
    : isAdminPembangunan
      ? { href: '/operasional/tabungan', label: 'Operasional', icon: '🧾' }
    : isAdminLingkungan
      ? { href: '/operasional/lingkungan', label: 'Operasional', icon: '🧾' }
    : isAdminSosial
      ? { href: '/operasional/sosial', label: 'Operasional', icon: '🧾' }
    : isAdminInternet
      ? { href: '/operasional/internet', label: 'Operasional', icon: '🌐' }
    : isAdminKoperasi
      ? { href: '/operasional/koperasi', label: 'Operasional', icon: '🧾' }
    : isAdminKeamanan
      ? { href: '/operasional/keamanan', label: 'Operasional', icon: '🧾' }
    : isAdminJimpitan
      ? { href: '/operasional/jimpitan', label: 'Operasional', icon: '🧺' }
      : { href: '/operasional', label: 'Operasional', icon: '🧾' };

  useEffect(() => {
    if (!canSeeApproval) {
      const resetTimer = window.setTimeout(() => { setPendingCount(0); }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    if (!user) return;
    
    const loadPendingCount = async () => {
      try {
        const result = await apiFetch<{ success: boolean; data: { total_pending: number } }>('/approval/pending');
        setPendingCount(Number(result.data?.total_pending || 0));
      } catch { setPendingCount(0); }
    };
    
    const kickoff = window.setTimeout(() => { void loadPendingCount(); }, 0);
    const interval = window.setInterval(() => { void loadPendingCount(); }, 30000);
    return () => { window.clearTimeout(kickoff); window.clearInterval(interval); };
  }, [canSeeApproval, user]);

  useEffect(() => {
    const scroller = navScrollerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      navScrollPosRef.current = scroller.scrollLeft;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('kasrt_nav_scroll_left', String(scroller.scrollLeft));
      }
    };

    const saved = typeof window !== 'undefined'
      ? Number(window.sessionStorage.getItem('kasrt_nav_scroll_left') || 0)
      : 0;
    if (Number.isFinite(saved) && saved > 0) {
      scroller.scrollLeft = saved;
      navScrollPosRef.current = saved;
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const scroller = navScrollerRef.current;
    if (!scroller) return;
    const saved = typeof window !== 'undefined'
      ? Number(window.sessionStorage.getItem('kasrt_nav_scroll_left') || navScrollPosRef.current || 0)
      : navScrollPosRef.current;
    const target = Number.isFinite(saved) ? saved : 0;
    window.requestAnimationFrame(() => {
      scroller.scrollLeft = target;
    });
  }, [pathname]);

  if (!user) return null;

  const menus = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: jimpitanMenuHref, label: 'Jimpitan', icon: '💰' },
    { ...opsMenu, opsOnly: true },
    { href: approvalMenuHref, label: 'Approval', icon: '✅', gated: true },
    { href: '/management', label: 'Manajemen', icon: '🛠️', managerOnly: true }
  ];

  return (
    <header className={`${sticky ? 'sticky top-0 z-50' : 'relative z-30'} border-b border-[var(--line)] bg-[var(--surface-strong)] shadow-sm backdrop-blur`}>
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
            <Button variant="danger" onClick={() => { logout(); router.push('/login'); }}>
              Keluar
            </Button>
          </div>
        </div>

        <div ref={navScrollerRef} className="w-full overflow-x-auto md:overflow-visible">
          <nav className="flex w-full min-w-max items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 md:min-w-0 md:gap-2 md:p-1.5">
            {menus
              .filter(menu => 
                (!menu.gated || canSeeApproval) &&
                (!menu.managerOnly || canManageUsers) &&
                (!(menu as { opsOnly?: boolean }).opsOnly || canSeeOps)
              )
              .map(menu => {
                const isOpsMenu = Boolean((menu as { opsOnly?: boolean }).opsOnly);
                const active =
                  pathname === menu.href ||
                  (menu.href.startsWith('/approval') && pathname?.startsWith('/approval')) ||
                  (menu.href === '/management' && pathname?.startsWith('/management')) ||
                  (isOpsMenu && pathname?.startsWith('/operasional'));
                return (
                  <Link
                    key={menu.href}
                    href={menu.href}
                    data-active={active ? 'true' : 'false'}
                    className={`inline-flex min-w-[118px] flex-none items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors md:min-w-0 md:flex-1 ${
                      active
                        ? 'border bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] border-[var(--nav-active-border)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span>{menu.icon}</span>
                    <span>{menu.label}</span>
                    {menu.href.startsWith('/approval') && pendingCount > 0 ? (
                      <span
                        className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          active ? 'bg-amber-400/0 text-transparent' : 'bg-amber-400 text-slate-900'
                        }`}
                        aria-hidden={active ? 'true' : 'false'}
                      >
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
