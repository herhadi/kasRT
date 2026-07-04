'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

function hasExactRole(user: { roles?: string[] } | null, roleName: string) {
  return (user?.roles || []).some((role) => String(role).trim().toLowerCase() === roleName.toLowerCase());
}

const moduleLinks = [
  {
    href: '/operasional/sekretaris',
    title: 'Operasional Sekretaris',
    description: 'Rekap bulanan, notulen, dan monitoring organisasi.',
    roles: ['Sekretaris']
  },
  {
    href: '/operasional/bendahara',
    title: 'Operasional Bendahara',
    description: 'Iuran wajib, pengeluaran, transfer, dan laporan bendahara.',
    roles: ['Bendahara']
  },
  {
    href: '/operasional/sosial',
    title: 'Operasional Sosial',
    description: 'Pengeluaran sosial, approval masuk, dan riwayat sosial.',
    roles: ['Admin Sosial']
  },
  {
    href: '/operasional/lingkungan',
    title: 'Operasional Lingkungan',
    description: 'Iuran lingkungan, tunggakan, pengeluaran, dan riwayat.',
    roles: ['Admin Lingkungan']
  },
  {
    href: '/operasional/internet',
    title: 'Operasional Internet',
    description: 'Iuran wajib internet, tunggakan, pengeluaran, dan riwayat.',
    roles: ['Admin Internet']
  },
  {
    href: '/operasional/tabungan',
    title: 'Operasional Pembangunan',
    description: 'Tabungan warga untuk kebutuhan khusus pembangunan.',
    roles: ['Admin Pembangunan']
  },
  {
    href: '/operasional/jimpitan',
    title: 'Operasional Jimpitan',
    description: 'Jadwal petugas, top up, dan setor ke bendahara.',
    roles: ['Admin Jimpitan']
  },
  {
    href: '/jimpitan',
    title: 'Jimpitan',
    description: 'Input dan pantau jimpitan warga.',
    roles: [
      'Ketua',
      'Plt Ketua',
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
    ]
  },
  {
    href: '/operasional/koperasi',
    title: 'Operasional Koperasi',
    description: 'Pinjaman koperasi, simulasi bunga flat/menurun, dan draft pembiayaan.',
    roles: ['Admin Koperasi']
  },
  {
    href: '/operasional/keamanan',
    title: 'Operasional Keamanan',
    description: 'Laporan kondisi lingkungan, isu keamanan, dan tindak lanjut status.',
    roles: ['Admin Keamanan']
  },
  {
    href: '/management',
    title: 'Manajemen',
    description: 'Pengaturan user, struktur, Telegram, aset, dan migrasi data.',
    roles: ['Ketua', 'Plt Ketua', 'Sekretaris', 'root']
  }
];

export default function OperasionalHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const canSeeOps = hasAnyRole(user, [
    'Bendahara',
    'Ketua',
    'Plt Ketua',
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

  const isRoot = hasExactRole(user, 'root');
  const isKetua = hasExactRole(user, 'Ketua');
  const visibleModules = isRoot || isKetua
    ? moduleLinks
    : moduleLinks.filter((module) => module.roles.some((role) => hasExactRole(user, role)));

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

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
        <Card
          title={isRoot ? 'Operasional Root' : isKetua ? 'Operasional Ketua' : 'Operasional'}
          subtitle={isRoot ? 'Akses CRUD semua modul' : isKetua ? 'Monitoring lintas modul' : 'Pilih menu operasional sesuai akses role'}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {visibleModules.map((module) => (
              <Link key={module.href} href={module.href} className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{module.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{module.description}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
