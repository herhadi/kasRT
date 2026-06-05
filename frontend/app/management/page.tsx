'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

type CronHealthStatus = {
  job_name: string;
  latest: {
    id: string;
    job_name: string;
    source: string;
    status: string;
    message: string | null;
    payload: unknown;
    created_at: string;
  } | null;
  age_seconds: number | null;
  checked_at: string;
};

export default function ManagementHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cronStatus, setCronStatus] = useState<CronHealthStatus | null>(null);
  const [cronError, setCronError] = useState('');
  const [loadingCron, setLoadingCron] = useState(false);
  const [testingCron, setTestingCron] = useState(false);
  const [cronTestMessage, setCronTestMessage] = useState('');

  const canManage = hasAnyRole(user, ['Ketua', 'Sekretaris', 'root']);
  const isRoot = hasAnyRole(user, ['root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function loadCronStatus() {
    if (!isRoot) return;
    setCronError('');
    setLoadingCron(true);
    try {
      const res = await apiFetch<{ success: boolean; data: CronHealthStatus }>('/management/cron/status');
      setCronStatus(res.data);
    } catch (error) {
      setCronError(error instanceof Error ? error.message : 'Gagal memuat status cron');
    } finally {
      setLoadingCron(false);
    }
  }

  async function testCronHealthEndpoint() {
    setTestingCron(true);
    setCronTestMessage('');
    try {
      const response = await fetch('/api/cron-health');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.ping_result?.message || 'Cron health test gagal');
      }
      setCronTestMessage('Endpoint cron-health berhasil terpanggil.');
    } catch (error) {
      setCronTestMessage(error instanceof Error ? error.message : 'Cron health test gagal');
    } finally {
      setTestingCron(false);
    }
  }

  useEffect(() => {
    if (!loading && user && isRoot) {
      void loadCronStatus();
    }
  }, [loading, user?.id, isRoot]);

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
            {hasAnyRole(user, ['root']) ? (
              <Link
                href="/management/telegram"
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition hover:bg-[var(--surface-strong)]"
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">Telegram Webhook</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Cek status, set, dan hapus webhook bot Telegram.</p>
              </Link>
            ) : null}
          </div>
        </Card>
        {isRoot ? (
          <Card
            title="Status Cron Vercel"
            subtitle="Pantau kapan endpoint cron frontend terakhir terpanggil"
            headerRight={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="ghost" onClick={testCronHealthEndpoint} disabled={testingCron}>
                  {testingCron ? 'Test...' : 'Test Endpoint'}
                </Button>
                <Button variant="ghost" onClick={loadCronStatus} disabled={loadingCron}>
                  {loadingCron ? 'Memuat...' : 'Refresh'}
                </Button>
              </div>
            }
          >
            {cronTestMessage ? <p className="mb-3 text-sm text-[var(--text-muted)]">{cronTestMessage}</p> : null}
            {cronError ? (
              <p className="text-sm text-red-600">{cronError}</p>
            ) : cronStatus?.latest ? (
              <div className="grid gap-3 md:grid-cols-2">
                <InfoLine label="Job" value={cronStatus.job_name} />
                <InfoLine label="Status" value={cronStatus.latest.status} />
                <InfoLine label="Source" value={cronStatus.latest.source} />
                <InfoLine label="Terakhir Run" value={formatDateTimeWib(cronStatus.latest.created_at)} />
                <InfoLine label="Umur" value={formatAge(cronStatus.age_seconds)} />
                <InfoLine label="Pesan" value={cronStatus.latest.message || '-'} />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Belum ada catatan cron. Tunggu Vercel Cron berjalan, atau panggil endpoint frontend /api/cron secara manual.
              </p>
            )}
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function formatDateTimeWib(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatAge(seconds: number | null) {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
