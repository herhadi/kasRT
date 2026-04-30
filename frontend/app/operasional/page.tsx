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

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user || !canSeeOps) return;
    if (isBendahara) {
      router.replace('/operasional/bendahara');
      return;
    }
    if (isAdminSosial) {
      router.replace('/sosial');
      return;
    }
    if (isAdminPembangunan) {
      router.replace('/tabungan');
      return;
    }
  }, [loading, user, canSeeOps, isBendahara, isAdminSosial, isAdminPembangunan, router]);

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

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card title="Operasional" subtitle="Mengarahkan ke modul sesuai role...">
          <div className="grid gap-3 md:grid-cols-2">
            {isBendahara ? (
              <Link href="/operasional/bendahara" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Bendahara</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Iuran wajib, pengeluaran, transfer, dan laporan bendahara.</p>
              </Link>
            ) : null}

            {isAdminSosial ? (
              <Link href="/sosial" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Operasional Sosial</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pengeluaran sosial, approval masuk, dan riwayat sosial.</p>
              </Link>
            ) : null}

            {isAdminPembangunan ? (
              <Link href="/tabungan" className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tabungan Pembangunan</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Tabungan warga untuk kebutuhan khusus pembangunan.</p>
              </Link>
            ) : null}

            {!isBendahara && !isAdminSosial && !isAdminPembangunan ? (
              <p className="text-sm text-[var(--text-muted)]">Modul khusus role Anda akan ditambahkan bertahap.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
