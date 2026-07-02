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
  latest: CronHealthLog | null;
  logs?: CronHealthLog[];
  age_seconds: number | null;
  checked_at: string;
};

type CronHealthLog = {
    id: string;
    job_name: string;
    source: string;
    status: string;
    message: string | null;
    payload: {
      reminder_result?: {
        success?: boolean;
        skipped?: boolean;
        message?: string;
        shift_day?: number;
        total_target?: number;
        total_recipients?: number;
        telegram_recipients?: number;
        telegram_sent?: number;
        telegram_failed?: number;
        telegram_errors?: Array<{ nama?: string | null; message?: string }>;
        wa_recipients?: number;
        wa_sent?: number;
        wa_failed?: number;
        wa_errors?: Array<{ nama?: string | null; no_hp?: string | null; message?: string }>;
        wa_enabled?: boolean;
        wa_provider?: string;
        wa_queue_enabled?: boolean;
        current_time_wib?: string;
        reminder_date?: string;
        reminder_type?: string;
      };
      timestamp?: string;
    } | null;
    created_at: string;
};

type WaReminderConfig = {
  provider: 'off' | 'fonnte' | 'http';
  enabled: boolean;
  queue_enabled: boolean;
  delay: {
    min: number;
    max: number;
  };
  updated_at?: string | null;
  env: {
    fonnte_configured: boolean;
    gateway_configured: boolean;
    gateway_send_configured?: boolean;
    gateway_base_configured?: boolean;
  };
};

type WaGatewayStatus = {
  configured: boolean;
  success: boolean;
  message?: string;
  data?: {
    connected: boolean;
    state: string;
    number?: string | null;
    has_qr: boolean;
    last_qr_at?: string | null;
    last_connected_at?: string | null;
    last_disconnect_reason?: string | number | null;
    limits?: {
      date: string;
      sent_count: number;
      unique_targets: number;
      unique_limit: number;
      remaining_unique_targets: number;
      min_interval_ms: number;
      last_sent_at?: string | null;
    };
  };
};

type WaGatewayQr = {
  configured: boolean;
  success: boolean;
  message?: string;
  data?: {
    qr?: string | null;
    qr_data_url?: string | null;
    last_qr_at?: string | null;
    status?: WaGatewayStatus['data'];
  };
};

export default function ManagementHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cronStatus, setCronStatus] = useState<CronHealthStatus | null>(null);
  const [cronError, setCronError] = useState('');
  const [loadingCron, setLoadingCron] = useState(false);
  const [testingReminder, setTestingReminder] = useState(false);
  const [cronTestMessage, setCronTestMessage] = useState('');
  const [testShiftDay, setTestShiftDay] = useState('3');
  const [waConfig, setWaConfig] = useState<WaReminderConfig | null>(null);
  const [waProvider, setWaProvider] = useState<WaReminderConfig['provider']>('off');
  const [loadingWaConfig, setLoadingWaConfig] = useState(false);
  const [savingWaConfig, setSavingWaConfig] = useState(false);
  const [waConfigMessage, setWaConfigMessage] = useState('');
  const [waGatewayStatus, setWaGatewayStatus] = useState<WaGatewayStatus | null>(null);
  const [waGatewayQr, setWaGatewayQr] = useState<WaGatewayQr | null>(null);
  const [loadingWaGateway, setLoadingWaGateway] = useState(false);

  const canManage = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara', 'root']);
  const isRoot = hasAnyRole(user, ['root']);
  const latestReminderLog = cronStatus?.logs?.find((log) => Boolean(log.payload?.reminder_result));
  const reminderResult = latestReminderLog?.payload?.reminder_result;

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

  async function loadWaReminderConfig() {
    if (!isRoot) return;
    setLoadingWaConfig(true);
    setWaConfigMessage('');
    try {
      const res = await apiFetch<{ success: boolean; data: WaReminderConfig }>('/management/wa-reminder');
      setWaConfig(res.data);
      setWaProvider(res.data.provider);
    } catch (error) {
      setWaConfigMessage(error instanceof Error ? error.message : 'Gagal memuat setting WA reminder');
    } finally {
      setLoadingWaConfig(false);
    }
  }

  async function saveWaReminderConfig() {
    setSavingWaConfig(true);
    setWaConfigMessage('');
    try {
      const res = await apiFetch<{ success: boolean; data: WaReminderConfig }>('/management/wa-reminder', {
        method: 'POST',
        body: JSON.stringify({ provider: waProvider })
      });
      setWaConfig(res.data);
      setWaProvider(res.data.provider);
      setWaConfigMessage('Setting WA reminder tersimpan.');
      await loadCronStatus();
    } catch (error) {
      setWaConfigMessage(error instanceof Error ? error.message : 'Gagal menyimpan setting WA reminder');
    } finally {
      setSavingWaConfig(false);
    }
  }

  async function loadWaGateway() {
    if (!isRoot) return;
    setLoadingWaGateway(true);
    try {
      const [statusResult, qrResult] = await Promise.allSettled([
        apiFetch<WaGatewayStatus>('/management/wa-gateway/status'),
        apiFetch<WaGatewayQr>('/management/wa-gateway/qr')
      ]);
      if (statusResult.status === 'fulfilled') {
        setWaGatewayStatus(statusResult.value);
      } else {
        setWaGatewayStatus({ configured: false, success: false, message: statusResult.reason?.message || 'Gagal memuat status gateway' });
      }
      if (qrResult.status === 'fulfilled') {
        setWaGatewayQr(qrResult.value);
      } else {
        setWaGatewayQr({ configured: false, success: false, message: qrResult.reason?.message || 'Gagal memuat QR gateway' });
      }
    } finally {
      setLoadingWaGateway(false);
    }
  }

  async function testReminderEndpoint() {
    setTestingReminder(true);
    setCronTestMessage('');
    try {
      const response = await fetch(`/api/cron-test-reminder?shift_day=${encodeURIComponent(testShiftDay)}`);
      const payload = await response.json().catch(() => ({}));
      const reminder = payload?.reminder_result;
      if (!response.ok || payload?.ok === false || reminder?.success === false) {
        throw new Error(reminder?.message || payload?.message || 'Test reminder gagal');
      }
      setCronTestMessage(
        `Test reminder ${getShiftDayLabel(testShiftDay)} diproses. Petugas: ${reminder?.total_target ?? '-'}, Telegram: ${reminder?.telegram_recipients ?? '-'}, WA: ${reminder?.wa_sent ?? '-'}/${reminder?.wa_recipients ?? '-'}`
      );
    } catch (error) {
      setCronTestMessage(error instanceof Error ? error.message : 'Test reminder gagal');
    } finally {
      setTestingReminder(false);
    }
  }

  useEffect(() => {
    if (!loading && user && isRoot) {
      void loadCronStatus();
      void loadWaReminderConfig();
      void loadWaGateway();
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
            <Link
              href="/management/aset"
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition hover:bg-[var(--surface-strong)]"
            >
              <p className="text-sm font-semibold text-[var(--text-primary)]">Aset RT</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Kelola inventaris dan catat pendapatan sewa aset.</p>
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
            title="WA Reminder Jimpitan"
            subtitle="Pilih kanal WA untuk reminder harian. Telegram tetap berjalan terpisah."
            headerRight={
              <Button variant="ghost" onClick={loadWaReminderConfig} disabled={loadingWaConfig}>
                {loadingWaConfig ? 'Memuat...' : 'Refresh'}
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className={`cursor-pointer rounded-2xl border px-4 py-4 transition ${waProvider === 'off' ? 'border-[var(--accent)] bg-[var(--surface-strong)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}>
                  <input
                    type="radio"
                    name="wa_provider"
                    value="off"
                    checked={waProvider === 'off'}
                    onChange={() => setWaProvider('off')}
                    className="sr-only"
                  />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Nonaktif</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">WA tidak dikirim. Aman saat nomor/device bermasalah.</p>
                </label>
                <label className={`cursor-pointer rounded-2xl border px-4 py-4 transition ${waProvider === 'fonnte' ? 'border-[var(--accent)] bg-[var(--surface-strong)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}>
                  <input
                    type="radio"
                    name="wa_provider"
                    value="fonnte"
                    checked={waProvider === 'fonnte'}
                    onChange={() => setWaProvider('fonnte')}
                    className="sr-only"
                  />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Fonnte</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Pakai token Fonnte lama dari env backend.</p>
                </label>
                <label className={`cursor-pointer rounded-2xl border px-4 py-4 transition ${waProvider === 'http' ? 'border-[var(--accent)] bg-[var(--surface-strong)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}>
                  <input
                    type="radio"
                    name="wa_provider"
                    value="http"
                    checked={waProvider === 'http'}
                    onChange={() => setWaProvider('http')}
                    className="sr-only"
                  />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Gateway Mandiri</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Kirim ke service WA terpisah dengan queue dan jeda acak.</p>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoLine label="Provider Aktif" value={waConfig ? formatWaConfigProvider(waConfig) : '-'} />
                <InfoLine label="Fonnte Token" value={waConfig?.env.fonnte_configured ? 'Tersedia di env' : 'Belum diset'} />
                <InfoLine label="Gateway Kirim" value={waConfig?.env.gateway_send_configured ? 'WA_GATEWAY_URL tersedia' : 'Belum diset'} />
                <InfoLine label="Gateway Status" value={waConfig?.env.gateway_base_configured ? 'WA_GATEWAY_BASE_URL tersedia' : 'Belum diset'} />
                <InfoLine label="Jeda Gateway" value={waConfig ? `${waConfig.delay.min / 1000}-${waConfig.delay.max / 1000} detik` : '-'} />
              </div>

              <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Status Gateway Mandiri</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{formatGatewayStatus(waGatewayStatus)}</p>
                  </div>
                  <Button variant="ghost" onClick={loadWaGateway} disabled={loadingWaGateway}>
                    {loadingWaGateway ? 'Memuat...' : 'Refresh Gateway'}
                  </Button>
                </div>
                {waGatewayQr?.data?.qr_data_url ? (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={waGatewayQr.data.qr_data_url}
                      alt="QR login WhatsApp gateway"
                      className="h-44 w-44 rounded-2xl border border-[var(--line)] bg-white p-2"
                    />
                    <div className="text-sm text-[var(--text-muted)]">
                      <p className="font-semibold text-[var(--text-primary)]">Scan QR dari WhatsApp</p>
                      <p className="mt-1">Buka WhatsApp, pilih Perangkat Tertaut, lalu scan QR ini.</p>
                      <p className="mt-1">Setelah connected, pilih provider `Gateway Mandiri` dan simpan.</p>
                    </div>
                  </div>
                ) : null}
                {waGatewayStatus?.data?.limits ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <InfoLine label="Kuota Nomor Hari Ini" value={`${waGatewayStatus.data.limits.unique_targets}/${waGatewayStatus.data.limits.unique_limit}`} />
                    <InfoLine label="Sisa Nomor Unik" value={String(waGatewayStatus.data.limits.remaining_unique_targets)} />
                    <InfoLine label="Jeda Minimum" value={`${Math.round(waGatewayStatus.data.limits.min_interval_ms / 1000)} detik`} />
                  </div>
                ) : null}
              </div>

              {waProvider === 'fonnte' && waConfig?.env.fonnte_configured === false ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Fonnte dipilih, tapi `FONNTE_TOKEN` belum tersedia di env backend.
                </p>
              ) : null}
              {waProvider === 'http' && waConfig?.env.gateway_send_configured === false ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Gateway mandiri dipilih, tapi `WA_GATEWAY_URL` untuk kirim pesan belum tersedia di env backend.
                </p>
              ) : null}
              {waConfigMessage ? <p className="text-sm text-[var(--text-muted)]">{waConfigMessage}</p> : null}

              <div className="flex justify-end">
                <Button onClick={saveWaReminderConfig} disabled={savingWaConfig || loadingWaConfig}>
                  {savingWaConfig ? 'Menyimpan...' : 'Simpan Setting WA'}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
        {isRoot ? (
          <Card
            title="Status Reminder Jimpitan"
            subtitle="Pantau eksekusi cron Debian dan log reminder backend"
            headerRight={
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={testShiftDay}
                  onChange={(event) => setTestShiftDay(event.target.value)}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none"
                  aria-label="Pilih hari shift untuk test reminder"
                >
                  <option value="1">Ahad</option>
                  <option value="2">Senin</option>
                  <option value="3">Selasa</option>
                  <option value="4">Rabu</option>
                  <option value="5">Kamis</option>
                  <option value="6">Jum&apos;at</option>
                  <option value="7">Sabtu</option>
                </select>
                <Button variant="ghost" onClick={testReminderEndpoint} disabled={testingReminder}>
                  {testingReminder ? 'Kirim...' : 'Test Reminder'}
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
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoLine label="Job" value={cronStatus.job_name} />
                  <InfoLine label="Status Terakhir" value={cronStatus.latest.status} />
                  <InfoLine label="Source" value={cronStatus.latest.source} />
                  <InfoLine label="Terakhir Run" value={formatDateTimeWib(cronStatus.latest.created_at)} />
                  <InfoLine label="Umur" value={formatAge(cronStatus.age_seconds)} />
                  <InfoLine label="Pesan" value={cronStatus.latest.message || '-'} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Hasil Reminder Terakhir</p>
                  {reminderResult ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoLine label="Reminder" value={formatReminderStatus(reminderResult)} />
                      <InfoLine label="Petugas Shift" value={String(reminderResult.total_target ?? '-')} />
                      <InfoLine label="Telegram Terkirim" value={`${String(reminderResult.telegram_sent ?? reminderResult.telegram_recipients ?? '-')}/${String(reminderResult.telegram_recipients ?? '-')} (gagal ${String(reminderResult.telegram_failed ?? 0)})`} />
                      <InfoLine label="Error Telegram" value={formatTelegramError(reminderResult)} />
                      <InfoLine label="Provider WA" value={formatWaProvider(reminderResult)} />
                      <InfoLine label="WA Terkirim" value={`${String(reminderResult.wa_sent ?? '-')}/${String(reminderResult.wa_recipients ?? '-')} (gagal ${String(reminderResult.wa_failed ?? 0)})`} />
                      <InfoLine label="Error WA" value={formatWaError(reminderResult)} />
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">Belum ada log cron yang membawa hasil reminder.</p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Riwayat Reminder</p>
                  <div className="space-y-2">
                    {(cronStatus.logs || []).slice(0, 6).map((log) => (
                      <div key={log.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-semibold text-[var(--text-primary)]">{log.status} - {log.message || '-'}</p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDateTimeWib(log.created_at)}</p>
                        </div>
                        {log.payload?.reminder_result ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Reminder: {formatReminderStatus(log.payload.reminder_result)} | Petugas: {log.payload.reminder_result.total_target ?? '-'} | Telegram: {log.payload.reminder_result.telegram_sent ?? log.payload.reminder_result.telegram_recipients ?? '-'}/{log.payload.reminder_result.telegram_recipients ?? '-'} | Error Telegram: {formatTelegramError(log.payload.reminder_result)} | Provider WA: {formatWaProvider(log.payload.reminder_result)} | WA: {log.payload.reminder_result.wa_sent ?? '-'}/{log.payload.reminder_result.wa_recipients ?? '-'} | Error WA: {formatWaError(log.payload.reminder_result)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Belum ada catatan reminder. Tunggu cron Debian berjalan, atau pakai Test Reminder.
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

function formatReminderStatus(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result) return '-';
  if (result.skipped) {
    return result.current_time_wib ? `${result.message || 'Skipped'} (${result.current_time_wib} WIB)` : result.message || 'Skipped';
  }
  if (result.success === false) return result.message || 'Gagal';
  if (result.reminder_type) return `${result.message || 'Tercatat'} (${result.reminder_type})`;
  return 'Diproses';
}

function formatWaError(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result) return '-';
  if (result.wa_enabled === false) return 'WA reminder nonaktif';
  if (!result.wa_errors?.length) return '-';
  const first = result.wa_errors[0];
  return `${first.nama || first.no_hp || 'WA'}: ${first.message || 'WA gagal'}`;
}

function formatTelegramError(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result) return '-';
  if (!result.telegram_errors?.length) return '-';
  const first = result.telegram_errors[0];
  return `${first.nama || 'Telegram'}: ${first.message || 'Telegram gagal'}`;
}

function formatWaProvider(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result) return '-';
  const provider = result.wa_provider || (result.wa_enabled === false ? 'off' : 'fonnte');
  return result.wa_queue_enabled ? `${provider} + queue` : provider;
}

function formatWaConfigProvider(config: WaReminderConfig) {
  if (config.provider === 'off') return 'Nonaktif';
  if (config.provider === 'fonnte') return 'Fonnte';
  if (config.provider === 'http') return config.queue_enabled ? 'Gateway Mandiri + queue' : 'Gateway Mandiri';
  return config.provider;
}

function formatGatewayStatus(status: WaGatewayStatus | null) {
  if (!status) return 'Belum dicek';
  if (!status.configured) return status.message || 'WA_GATEWAY_BASE_URL belum diset di backend';
  if (!status.success) return status.message || 'Gateway belum bisa diakses';
  if (status.data?.connected) return `Connected (${status.data.number || 'nomor belum terbaca'})`;
  if (status.data?.has_qr) return 'Menunggu scan QR';
  return `Belum connected (${status.data?.state || 'unknown'})`;
}

function getShiftDayLabel(value: string) {
  const labels: Record<string, string> = {
    '1': 'Ahad',
    '2': 'Senin',
    '3': 'Selasa',
    '4': 'Rabu',
    '5': 'Kamis',
    '6': "Jum'at",
    '7': 'Sabtu'
  };
  return labels[value] || 'shift';
}
