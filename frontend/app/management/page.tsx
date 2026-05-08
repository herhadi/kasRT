'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

export default function ManagementHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const canManage = hasAnyRole(user, ['Ketua', 'Sekretaris', 'root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <main className="min-h-screen" />;

  if (!canManage) {
    return (
      <main className="min-h-screen pb-10">
        <Navbar />
        <div className="mx-auto mt-6 w-full max-w-4xl px-4 md:px-6">
          <Card title="Tidak Ada Akses" subtitle="Khusus Ketua, Sekretaris, atau root">
            <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses ke menu manajemen.</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title="Manajemen" subtitle="Pilih modul manajemen sesuai kebutuhan">
          <div className="grid gap-3 md:grid-cols-2">
            <Link
              href="/management/struktur"
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition hover:bg-[var(--surface-strong)]"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">Struktur RT</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Tambah warga dan atur jabatan organisasi.</p>
            </Link>
            {hasAnyRole(user, ['root']) ? (
              <Link
                href="/management/migrasi-2025"
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition hover:bg-[var(--surface-strong)]"
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">Migrasi 2025</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Input data historis sampai Desember 2025 (root only).</p>
              </Link>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
