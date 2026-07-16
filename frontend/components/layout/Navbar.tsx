'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { apiFetch } from '@/lib/api';
import ThemeToggleButton from '@/components/theme/ThemeToggleButton';

function hasExactRole(user: { roles?: string[] } | null, roleName: string) {
  return (user?.roles || []).some((role) => String(role).trim().toLowerCase() === roleName.toLowerCase());
}

export default function Navbar({ sticky = true }: { sticky?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const navScrollerRef = useRef<HTMLDivElement | null>(null);
  const navScrollPosRef = useRef(0);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  
  // Disable browser scroll restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);
  
  const canSeeApproval = hasAnyRole(user, [
    'Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara', 'Admin Jimpitan',
    'Admin Pembangunan', 'Admin Lingkungan', 'Admin Sosial',
    'Admin Internet', 'Admin Koperasi', 'Admin Keamanan', 'root'
  ]);
  const canManageUsers = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'root']);
  const canSeeOps = hasAnyRole(user, [
    'Bendahara', 'Ketua', 'Plt Ketua', 'Sekretaris', 'Admin Jimpitan',
    'Admin Pembangunan', 'Admin Lingkungan', 'Admin Sosial',
    'Admin Internet', 'Admin Koperasi', 'Admin Keamanan', 'root'
  ]);
  const canSeeTransactionApprovals = hasAnyRole(user, [
    'Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara',
    'Admin Jimpitan', 'Admin Sosial', 'root'
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
  const isRoot = hasExactRole(user, 'root');
  const approvalMenuHref = isBendahara
    ? '/approval/bendahara'
    : isAdminInternet
      ? '/approval/internet'
      : isAdminLingkungan
        ? '/approval/lingkungan'
        : isAdminKoperasi
          ? '/approval/koperasi'
          : '/approval';
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

    let disposed = false;
    let loadingCount = false;

    const loadPendingCount = async () => {
      if (loadingCount || disposed) return;
      loadingCount = true;
      try {
        const approvalPending = canSeeTransactionApprovals
          ? apiFetch<{ success: boolean; data: { total_pending: number } }>('/approval/pending')
              .then((res) => Number(res.data?.total_pending || 0))
              .catch(() => 0)
          : Promise.resolve(0);
        const membershipModules = [
          ...(isAdminInternet || isRoot ? ['internet'] : []),
          ...(isAdminLingkungan || isRoot ? ['lingkungan'] : []),
          ...(isAdminKoperasi || isRoot ? ['koperasi'] : [])
        ];
        const [approvalCount, ...membershipCounts] = await Promise.all([
          approvalPending,
          ...membershipModules.map((moduleKey) =>
            apiFetch<{ success: boolean; data: unknown[] }>(`/membership/requests?module_key=${moduleKey}`)
              .then((res) => Number(res.data?.length || 0))
              .catch(() => 0)
          )
        ]);
        if (!disposed) setPendingCount(approvalCount + membershipCounts.reduce((sum, count) => sum + count, 0));
      } catch {
        if (!disposed) setPendingCount(0);
      } finally {
        loadingCount = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadPendingCount();
    };
    const handleFocus = () => {
      void loadPendingCount();
    };

    void loadPendingCount();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [canSeeApproval, canSeeTransactionApprovals, isAdminInternet, isAdminLingkungan, isAdminKoperasi, isRoot, user]);

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

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [profileMenuOpen]);

  if (!user) return null;

  const menus = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: jimpitanMenuHref, label: 'Jimpitan', icon: '💰' },
    { ...opsMenu, opsOnly: true },
    { href: '/panduan', label: 'Panduan', icon: '📖' },
    { href: approvalMenuHref, label: 'Inbox', icon: '✉️', gated: true },
    { href: '/management', label: 'Manajemen', icon: '🛠️', managerOnly: true }
  ];

  return (
    <header className={`${sticky ? 'sticky top-0 z-50' : 'relative z-30'} border-b border-[var(--line)] bg-[var(--surface-strong)] shadow-sm backdrop-blur`}>
      <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
        <div className="mb-0 flex items-center justify-between md:mb-3">
          <div>
            <h1 className="font-[var(--font-space-grotesk)] text-xl font-bold text-[var(--text-primary)]">KasRT</h1>
            <p className="text-xs font-medium text-[var(--text-muted)]">Kas warga RT 02 / RW 04</p>
          </div>
          <div className="flex items-center gap-3">
            {canSeeApproval && pendingCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                <span>⏳</span>
                <span>{pendingCount} menunggu persetujuan</span>
              </div>
            )}
            <ThemeToggleButton className="md:hidden" />
            <div ref={profileMenuRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-label="Menu profil"
                aria-expanded={profileMenuOpen}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-strong)]"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 12.2a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0 2.1c-4.1 0-7.5 2.2-7.5 4.9 0 .8.7 1.4 1.5 1.4h12c.8 0 1.5-.6 1.5-1.4 0-2.7-3.4-4.9-7.5-4.9Z" fill="currentColor" />
                </svg>
              </button>
              {profileMenuOpen ? (
                <div className="absolute right-0 top-12 z-[60] w-56 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-xl">
                  <div className="border-b border-[var(--line)] px-3 py-2">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">{user.nama || 'Profil'}</p>
                    <p className="text-xs text-[var(--text-muted)]">Pengaturan akun</p>
                  </div>
                  <ThemeToggleButton showLabel className="mt-2 w-full justify-start rounded-xl border-0 bg-transparent px-3 py-2 shadow-none hover:bg-[var(--surface-strong)] hover:scale-100" />
                  <Link
                    href="/akun"
                    onClick={() => setProfileMenuOpen(false)}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-strong)]"
                  >
                    <span aria-hidden="true">⚙️</span>
                    <span>Pengaturan</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                      router.push('/login');
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    <span aria-hidden="true">🚪</span>
                    <span>Keluar</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div ref={navScrollerRef} className="hidden w-full overflow-x-auto md:block md:overflow-visible">
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
                  (menu.href === '/panduan' && pathname?.startsWith('/panduan')) ||
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
