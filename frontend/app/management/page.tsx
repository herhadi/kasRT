'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatTanggalIndonesia } from '@/lib/helpers';
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
        current_time_wib?: string;
        reminder_date?: string;
        reminder_type?: string;
      };
      timestamp?: string;
    } | null;
    created_at: string;
};

type JimpitanMode = 'PER_WARGA' | 'SHIFT_TOTAL';
type JimpitanModeHistoryItem = {
  id: string;
  effective_date: string;
  mode: JimpitanMode;
  note?: string | null;
  created_at?: string;
  created_by_name?: string | null;
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
  const [modeDate, setModeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [modeValue, setModeValue] = useState<JimpitanMode>('PER_WARGA');
  const [modeNote, setModeNote] = useState('');
  const [modeHistory, setModeHistory] = useState<JimpitanModeHistoryItem[]>([]);
  const [savingMode, setSavingMode] = useState(false);
  const [modeMessage, setModeMessage] = useState('');

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

  async function loadJimpitanMode() {
    if (!isRoot) return;
    setModeMessage('');
    try {
      const res = await apiFetch<{
        success: boolean;
        data: { effective?: JimpitanModeHistoryItem; history?: JimpitanModeHistoryItem[] };
      }>(`/jimpitan/mode?date=${encodeURIComponent(modeDate)}`);
      setModeHistory(res.data?.history || []);
      if (res.data?.effective?.mode) {
        setModeValue(res.data.effective.mode);
      }
    } catch (error) {
      setModeMessage(error instanceof Error ? error.message : 'Gagal memuat mode Jimpitan');
    }
  }

  async function saveJimpitanMode() {
    setSavingMode(true);
    setModeMessage('');
    try {
      await apiFetch('/jimpitan/mode', {
        method: 'POST',
        body: JSON.stringify({
          effective_date: modeDate,
          mode: modeValue,
          note: modeNote.trim()
        })
      });
      setModeNote('');
      setModeMessage(`Mode Jimpitan tersimpan mulai ${modeDate}.`);
      await loadJimpitanMode();
    } catch (error) {
      setModeMessage(error instanceof Error ? error.message : 'Gagal menyimpan mode Jimpitan');
    } finally {
      setSavingMode(false);
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
        `Test reminder ${getShiftDayLabel(testShiftDay)} diproses. Petugas: ${reminder?.total_target ?? '-'}, Telegram: ${reminder?.telegram_recipients ?? '-'}`
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
      void loadJimpitanMode();
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
            title="Mode Operasional Jimpitan"
            subtitle="Khusus root. Tanggal berlaku menentukan kapan Jimpitan tampil sebagai info pribadi warga atau memakai setoran total shift."
            headerRight={
              <Button variant="ghost" onClick={loadJimpitanMode}>
                Refresh
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-[170px_230px_1fr_auto] md:items-end">
              <Input
                label="Berlaku mulai tanggal"
                type="date"
                value={modeDate}
                onChange={(event) => setModeDate(event.target.value)}
              />
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Mode
                <select
                  value={modeValue}
                  onChange={(event) => setModeValue(event.target.value as JimpitanMode)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                >
                  <option value="PER_WARGA">V1 - Input per warga</option>
                  <option value="SHIFT_TOTAL">V2 - Setor total shift</option>
                </select>
              </label>
              <Input
                label="Catatan"
                value={modeNote}
                onChange={(event) => setModeNote(event.target.value)}
                placeholder="Contoh: mulai uji coba setoran shift"
              />
              <Button
                onClick={saveJimpitanMode}
                disabled={savingMode}
                className="btn-action-blue rounded-xl px-4 py-2 font-semibold"
              >
                {savingMode ? 'Menyimpan...' : 'Simpan Mode'}
              </Button>
            </div>
            {modeMessage ? <p className="mt-3 text-sm text-[var(--text-muted)]">{modeMessage}</p> : null}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal Berlaku</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Mode</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Catatan</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Diubah</th>
                  </tr>
                </thead>
                <tbody>
                  {modeHistory.length === 0 ? (
                    <tr className="bg-[var(--surface)]">
                      <td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada histori mode.</td>
                    </tr>
                  ) : modeHistory.map((item) => (
                    <tr key={item.id} className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                        {item.effective_date}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">
                        {item.mode === 'SHIFT_TOTAL' ? 'V2 - Setor Shift' : 'V1 - Per Warga'}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-muted)]">{item.note || '-'}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-muted)]">
                        {item.created_by_name || '-'}
                        {item.created_at ? <span className="block text-xs">{formatTanggalIndonesia(item.created_at)}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                            Reminder: {formatReminderStatus(log.payload.reminder_result)} | Petugas: {log.payload.reminder_result.total_target ?? '-'} | Telegram: {log.payload.reminder_result.telegram_sent ?? log.payload.reminder_result.telegram_recipients ?? '-'}/{log.payload.reminder_result.telegram_recipients ?? '-'} | Error Telegram: {formatTelegramError(log.payload.reminder_result)}
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

function formatTelegramError(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result) return '-';
  if (!result.telegram_errors?.length) return '-';
  const first = result.telegram_errors[0];
  return `${first.nama || 'Telegram'}: ${first.message || 'Telegram gagal'}`;
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
