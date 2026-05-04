'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

export default function OperasionalHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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
  const isAdminSosial = hasAnyRole(user, ['Admin Sosial', 'root']);
  const isAdminPembangunan = hasAnyRole(user, ['Admin Pembangunan', 'root']);
  const isSekretaris = hasAnyRole(user, ['Sekretaris']);
  const isKetua = hasAnyRole(user, ['Ketua']);
  const canOpenBendaharaModule = hasAnyRole(user, ['Bendahara', 'Sekretaris', 'Ketua', 'root']);
  const canOpenSosialModule = hasAnyRole(user, ['Admin Sosial', 'Sekretaris', 'Ketua', 'root']);
  const canOpenTabunganModule = hasAnyRole(user, ['Admin Pembangunan', 'Sekretaris', 'Ketua', 'root']);
  const canOpenJimpitanModule = hasAnyRole(user, ['Admin Jimpitan', 'Sekretaris', 'Ketua', 'root']);
  const canOpenLingkunganModule = hasAnyRole(user, ['Admin Lingkungan', 'Sekretaris', 'Ketua', 'root']);
  const canOpenInternetModule = hasAnyRole(user, ['Admin Internet', 'Sekretaris', 'Ketua', 'root']);
  const canOpenKoperasiModule = hasAnyRole(user, ['Admin Koperasi', 'Sekretaris', 'Ketua', 'root']);
  const canOpenKeamananModule = hasAnyRole(user, ['Admin Keamanan', 'Sekretaris', 'Ketua', 'root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user || !canSeeOps) return;
    // keep operasional menu visible for all roles
  }, [loading, user, canSeeOps]);

  if (loading || !user) return <main className="min-h-screen" />;

  if (!canSeeOps) {
    return (
      <main className="min-h-screen pb-10">
        <Navbar />
        <div className="mx-auto mt-6 w-full max-w-5xl px-4 md:px-6">
          <Card title="Tidak Ada Akses" subtitle="Menu operasional hanya untuk role terkait">
            <p className="text-sm text-[var(--text-muted)]">Akun Anda tidak memiliki akses ke menu operasional.</p>
          </Card>
        </div>
      </main>
    );
  }

  if (isKetua) {
    return (
      <main className="min-h-screen pb-10">
        <Navbar />
        <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
          <Card title="Operasional Ketua" subtitle="Monitoring lintas modul (view-only selain root)">
            <div className="grid gap-3 md:grid-cols-2">
              <Link href="/operasional/bendahara" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Bendahara</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Iuran wajib, pengeluaran, transfer, dan laporan bendahara.</p>
              </Link>
              <Link href="/operasional/sosial" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sosial</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pengeluaran sosial, approval masuk, dan riwayat sosial.</p>
              </Link>
              <Link href="/operasional/tabungan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tabungan Pembangunan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Tabungan warga untuk kebutuhan khusus pembangunan.</p>
              </Link>
              <Link href="/operasional/sekretaris" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sekretaris</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Rekap bulanan, notulen, dan monitoring organisasi.</p>
              </Link>
              <Link href="/operasional/jimpitan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Jimpitan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Jadwal petugas, top up, dan setor ke bendahara.</p>
              </Link>
              <Link href="/operasional/internet" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Internet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Iuran wajib internet, tunggakan, pengeluaran, dan riwayat.</p>
              </Link>
              <Link href="/operasional/koperasi" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Koperasi</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pinjaman koperasi, simulasi bunga flat/menurun, dan draft pembiayaan.</p>
              </Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card title="Operasional">
          <div className="grid gap-3 md:grid-cols-2">
            {isKetua && canOpenJimpitanModule ? (
              <Link href="/operasional/jimpitan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Jimpitan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Jadwal petugas, top up, dan setor ke bendahara.</p>
              </Link>
            ) : null}
            {hasAnyRole(user, ['Admin Jimpitan']) && !isKetua ? (
              <Link href="/operasional/jimpitan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Jimpitan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Jadwal petugas, top up, dan setor ke bendahara.</p>
              </Link>
            ) : null}

            {isKetua && canOpenBendaharaModule ? (
              <Link href="/operasional/bendahara" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Bendahara</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Iuran wajib, pengeluaran, transfer, dan laporan bendahara.</p>
              </Link>
            ) : null}

            {isKetua && canOpenSosialModule ? (
              <Link href="/operasional/sosial" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sosial</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pengeluaran sosial, approval masuk, dan riwayat sosial.</p>
              </Link>
            ) : null}
            {isAdminSosial && !isKetua ? (
              <Link href="/operasional/sosial" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sosial</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pengeluaran sosial, approval masuk, dan riwayat sosial.</p>
              </Link>
            ) : null}

            {isKetua && canOpenTabunganModule ? (
              <Link href="/operasional/tabungan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tabungan Pembangunan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Tabungan warga untuk kebutuhan khusus pembangunan.</p>
              </Link>
            ) : null}
            {isAdminPembangunan && !isKetua ? (
              <Link href="/operasional/tabungan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tabungan Pembangunan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Tabungan warga untuk kebutuhan khusus pembangunan.</p>
              </Link>
            ) : null}

            {isKetua ? (
              <Link href="/operasional/sekretaris" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sekretaris</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Rekap bulanan, notulen, dan monitoring organisasi.</p>
              </Link>
            ) : null}

            {isBendahara && !isKetua ? (
              <Link href="/operasional/bendahara" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Bendahara</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Input iuran, pengeluaran, transfer, dan rekap bendahara.</p>
              </Link>
            ) : null}

            {isSekretaris && !isKetua ? (
              <Link href="/operasional/sekretaris" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sekretaris</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Rekap keuangan bulanan dan notulen rapat.</p>
              </Link>
            ) : null}

            {(isKetua || canOpenLingkunganModule) ? (
              <Link href="/operasional/lingkungan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Lingkungan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Iuran lingkungan, tunggakan, pengeluaran, dan riwayat.</p>
              </Link>
            ) : null}

            {(isKetua || canOpenInternetModule) ? (
              <Link href="/operasional/internet" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Internet</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Iuran wajib internet, tunggakan, pengeluaran, dan riwayat.</p>
              </Link>
            ) : null}

            {(isKetua || canOpenKoperasiModule) ? (
              <Link href="/operasional/koperasi" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Koperasi</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pinjaman koperasi, simulasi bunga flat/menurun, dan draft pembiayaan.</p>
              </Link>
            ) : null}

            {(isKetua || canOpenKeamananModule) ? (
              <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Keamanan</p>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">Segera</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Akan dipisah jadi modul mandiri sesuai role.</p>
              </div>
            ) : null}

            {!isKetua && !isSekretaris && !canOpenBendaharaModule && !canOpenSosialModule && !canOpenTabunganModule ? (
              <p className="text-sm text-[var(--text-muted)]">Modul khusus role Anda akan ditambahkan bertahap.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
