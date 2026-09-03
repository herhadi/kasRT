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
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

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
        wa_provider?: string | null;
        wa_recipients?: number;
        wa_sent?: number;
        wa_failed?: number;
        wa_target?: { nama?: string | null; no_hp?: string | null } | Array<{ nama?: string | null; no_hp?: string | null }> | null;
        wa_errors?: Array<{ nama?: string | null; no_hp?: string | null; message?: string }>;
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

type LoginAuditItem = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_phone: string | null;
  roles: string[];
  ip_address: string | null;
  forwarded_for: string | null;
  country_code: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  platform: string | null;
  platform_version: string | null;
  device_model: string | null;
  architecture: string | null;
  bitness: string | null;
  language: string | null;
  timezone: string | null;
  origin: string | null;
  login_at: string;
};

type WaJimpitanReminderSettings = {
  enabled: boolean;
  max_recipients: number;
  min_connected_age_minutes: number;
  source: 'env' | 'management';
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
  const [loginAudits, setLoginAudits] = useState<LoginAuditItem[]>([]);
  const [loginAuditError, setLoginAuditError] = useState('');
  const [loadingLoginAudits, setLoadingLoginAudits] = useState(false);
  const [waSettings, setWaSettings] = useState<WaJimpitanReminderSettings | null>(null);
  const [waSettingsMessage, setWaSettingsMessage] = useState('');
  const [loadingWaSettings, setLoadingWaSettings] = useState(false);
  const [savingWaSettings, setSavingWaSettings] = useState(false);
  const [waGatewayStatus, setWaGatewayStatus] = useState<any>(null);
  const [waGatewayQr, setWaGatewayQr] = useState<any>(null);
  const [loadingWaQr, setLoadingWaQr] = useState(false);

  const canManage = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara', 'root']);
  const isRoot = hasAnyRole(user, ['root']);
  const latestReminderLog = cronStatus?.logs?.find((log) => Boolean(log.payload?.reminder_result));
  const reminderResult = latestReminderLog?.payload?.reminder_result;
  const loginAuditPager = usePagination(loginAudits, 10);

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

  async function loadLoginAudits() {
    if (!isRoot) return;
    setLoginAuditError('');
    setLoadingLoginAudits(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data: { items: LoginAuditItem[]; total: number; limit: number };
      }>('/management/login-audits');
      setLoginAudits(res.data?.items || []);
    } catch (error) {
      setLoginAuditError(error instanceof Error ? error.message : 'Gagal memuat audit login');
    } finally {
      setLoadingLoginAudits(false);
    }
  }

  async function loadWaSettings() {
    if (!isRoot) return;
    setLoadingWaSettings(true);
    setWaSettingsMessage('');
    try {
      const res = await apiFetch<{ success: boolean; data: WaJimpitanReminderSettings }>('/management/wa-jimpitan-reminder');
      setWaSettings(res.data);
    } catch (error) {
      setWaSettingsMessage(error instanceof Error ? error.message : 'Gagal memuat pengaturan WA Gateway');
    } finally {
      setLoadingWaSettings(false);
    }
  }

  async function saveWaSettings() {
    if (!waSettings) return;
    setSavingWaSettings(true);
    setWaSettingsMessage('');
    try {
      const res = await apiFetch<{ success: boolean; data: WaJimpitanReminderSettings }>('/management/wa-jimpitan-reminder', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: waSettings.enabled,
          max_recipients: Number(waSettings.max_recipients),
          min_connected_age_minutes: Number(waSettings.min_connected_age_minutes)
        })
      });
      setWaSettings(res.data);
      setWaSettingsMessage('Pengaturan WA Gateway tersimpan dan langsung dipakai pada reminder berikutnya.');
    } catch (error) {
      setWaSettingsMessage(error instanceof Error ? error.message : 'Gagal menyimpan pengaturan WA Gateway');
    } finally {
      setSavingWaSettings(false);
    }
  }

  async function loadWaGatewayStatus() {
    try {
      const res = await apiFetch<{ success: boolean; data: any }>('/management/wa-gateway/status');
      setWaGatewayStatus(res.data);
    } catch (error) { setWaSettingsMessage(error instanceof Error ? error.message : 'Gagal memuat status WA Gateway'); }
  }

  async function loadWaGatewayQr() {
    setLoadingWaQr(true);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>('/management/wa-gateway/qr');
      setWaGatewayQr(res.data);
      await loadWaGatewayStatus();
    } catch (error) { setWaSettingsMessage(error instanceof Error ? error.message : 'Gagal memuat QR WA Gateway'); }
    finally { setLoadingWaQr(false); }
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
      void loadLoginAudits();
      void loadWaSettings();
      void loadWaGatewayStatus();
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
            {hasAnyRole(user, ['root']) ? (
              <button
                type="button"
                onClick={() => window.open('/management?wa_gateway=1', '_blank', 'noopener,noreferrer')}
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-left transition hover:bg-[var(--surface-strong)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">WA Gateway — Reminder Jimpitan</p>
                  <span className="text-xs font-bold text-[var(--accent)]">Buka ↗</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Atur reminder, jumlah penerima, status nomor, dan QR koneksi.</p>
              </button>
            ) : null}
          </div>
        </Card>
        {isRoot && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('wa_gateway') === '1' ? (
          <Card
            title="WA Gateway — Reminder Jimpitan"
            subtitle="Khusus root. Pengaturan ini mengalahkan fallback env backend. URL gateway dan secret tetap dikelola melalui env."
            headerRight={
              <Button variant="ghost" onClick={loadWaSettings} disabled={loadingWaSettings}>
                {loadingWaSettings ? 'Memuat...' : 'Refresh'}
              </Button>
            }
          >
            {waSettings ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Koneksi nomor WA</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{waGatewayStatus?.connected ? `Connected: ${waGatewayStatus.linked_number || '-'}` : `Status: ${waGatewayStatus?.state || 'belum diperiksa'}`}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={loadWaGatewayQr} disabled={loadingWaQr}>
                    {loadingWaQr ? 'Memuat QR...' : waGatewayStatus?.connected ? 'Refresh Status / QR' : 'Ambil QR'}
                    </Button>
                    <Button variant="ghost" onClick={async () => {
                      if (!window.confirm('Ganti nomor akan memutus session WA saat ini. Lanjutkan?')) return;
                      setLoadingWaQr(true);
                      try {
                        await apiFetch('/management/wa-gateway/reset', { method: 'POST' });
                        setWaGatewayQr(null);
                        for (let attempt = 0; attempt < 8; attempt += 1) {
                          await new Promise((resolve) => window.setTimeout(resolve, 1000));
                          await loadWaGatewayQr();
                          const nextQr = await apiFetch<{ success: boolean; data: any }>('/management/wa-gateway/qr');
                          setWaGatewayQr(nextQr.data);
                          if (nextQr.data?.qr_data_url) break;
                        }
                      } catch (error) { setWaSettingsMessage(error instanceof Error ? error.message : 'Gagal mengganti nomor WA'); }
                      finally { setLoadingWaQr(false); }
                    }} disabled={loadingWaQr}>
                      Ganti Nomor
                    </Button>
                  </div>
                </div>
                {waGatewayQr?.qr_data_url ? <div className="flex justify-center rounded-2xl border border-[var(--line)] bg-white p-4"><img src={waGatewayQr.qr_data_url} alt="QR koneksi WhatsApp Gateway" className="h-64 w-64" /></div> : null}
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">Aktifkan reminder WhatsApp</span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">Kirim reminder jimpitan terbatas melalui WA Gateway.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={waSettings.enabled}
                    onChange={(event) => setWaSettings({ ...waSettings, enabled: event.target.checked })}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Maksimum penerima per reminder"
                    type="number"
                    min="1"
                    max="20"
                    value={String(waSettings.max_recipients)}
                    onChange={(event) => setWaSettings({ ...waSettings, max_recipients: Number(event.target.value) })}
                  />
                  <Input
                    label="Minimum umur koneksi gateway (menit)"
                    type="number"
                    min="0"
                    max="1440"
                    value={String(waSettings.min_connected_age_minutes)}
                    onChange={(event) => setWaSettings({ ...waSettings, min_connected_age_minutes: Number(event.target.value) })}
                  />
                </div>
                <p className="-mt-1 text-xs text-[var(--text-muted)]">Penerima WA dapat diatur 1–20 nomor valid dan mendapat giliran secara bergantian. Batas 20 mengikuti limit harian gateway saat ini. Minimum umur koneksi `0` berarti tanpa masa tunggu; rekomendasi untuk nomor baru adalah 180 menit.</p>
                <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[var(--text-muted)]">Sumber saat ini: {waSettings.source === 'management' ? 'Pengaturan Manajemen' : 'Fallback env backend'}.</p>
                  <Button onClick={saveWaSettings} disabled={savingWaSettings}>
                    {savingWaSettings ? 'Menyimpan...' : 'Simpan Pengaturan WA'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{loadingWaSettings ? 'Memuat pengaturan WA Gateway...' : 'Pengaturan belum dapat dimuat.'}</p>
            )}
            {waSettingsMessage ? <p className="mt-3 text-sm text-[var(--text-muted)]">{waSettingsMessage}</p> : null}
          </Card>
        ) : null}
        {isRoot ? (
          <Card
            title="30 Login Terakhir"
            subtitle="Audit login berhasil terbaru • 10 data per halaman • khusus root"
            headerRight={
              <Button variant="ghost" onClick={loadLoginAudits} disabled={loadingLoginAudits}>
                {loadingLoginAudits ? 'Memuat...' : 'Refresh'}
              </Button>
            }
          >
            {loginAuditError ? <p className="mb-3 text-sm text-red-600">{loginAuditError}</p> : null}
            {!loadingLoginAudits && loginAudits.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Belum ada audit login. Data akan tercatat mulai login berhasil berikutnya setelah backend ini dideploy.
              </p>
            ) : null}

            <div className="space-y-3">
              {loginAuditPager.pagedItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{item.user_name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {item.user_phone || '-'} • {(item.roles || []).join(', ') || 'Tanpa role'}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <time className="block text-sm font-semibold text-[var(--accent)]" dateTime={item.login_at}>
                        {formatLoginDateTime(item.login_at)}
                      </time>
                    </div>
                  </div>
                  <details className="mt-1 w-full">
                    <summary className="cursor-pointer text-right text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]">
                      Lihat detail login
                    </summary>
                    <dl className="mt-3 grid w-full gap-x-5 gap-y-2 border-t border-[var(--line)] pt-3 text-left text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <LoginAuditDetail label="Model Perangkat" value={item.device_model || 'Tidak diberikan browser'} />
                      <LoginAuditDetail label="Jenis Perangkat" value={item.device_type || '-'} />
                      <LoginAuditDetail label="Sistem Operasi" value={item.operating_system || '-'} />
                      <LoginAuditDetail label="Platform" value={item.platform || '-'} />
                      <LoginAuditDetail label="Detail Platform" value={formatPlatformDetail(item)} />
                      <LoginAuditDetail label="Browser" value={item.browser || '-'} />
                      <LoginAuditDetail label="Zona Waktu" value={item.timezone || '-'} />
                      <LoginAuditDetail label="Bahasa" value={item.language || '-'} />
                      <LoginAuditDetail label="Origin Aplikasi" value={item.origin || '-'} />
                      <LoginAuditDetail label="IP Publik/Client" value={item.ip_address || '-'} />
                      <LoginAuditDetail label="Forwarded IP" value={item.forwarded_for || '-'} />
                      <LoginAuditDetail label="Negara Jaringan" value={item.country_code || 'Tidak tersedia'} />
                      <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                        <dt className="text-xs font-semibold text-[var(--text-muted)]">User Agent lengkap</dt>
                        <dd className="break-all text-xs text-[var(--text-primary)]">{item.user_agent || '-'}</dd>
                      </div>
                    </dl>
                  </details>
                </article>
              ))}
            </div>

            {loginAudits.length > 0 ? (
              <PaginationControls
                page={loginAuditPager.page}
                totalPages={loginAuditPager.totalPages}
                onPrev={loginAuditPager.prev}
                onNext={loginAuditPager.next}
              />
            ) : null}
          </Card>
        ) : null}
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
                      <InfoLine label="WA Lab" value={`${String(reminderResult.wa_sent ?? 0)}/${String(reminderResult.wa_recipients ?? 0)} (gagal ${String(reminderResult.wa_failed ?? 0)})`} />
                      <InfoLine label="Target WA Lab" value={formatWaTarget(reminderResult)} />
                      <InfoLine label="Error WA Lab" value={formatWaError(reminderResult)} />
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
                            Reminder: {formatReminderStatus(log.payload.reminder_result)} | Petugas: {log.payload.reminder_result.total_target ?? '-'} | Telegram: {log.payload.reminder_result.telegram_sent ?? log.payload.reminder_result.telegram_recipients ?? '-'}/{log.payload.reminder_result.telegram_recipients ?? '-'} | WA Lab: {log.payload.reminder_result.wa_sent ?? 0}/{log.payload.reminder_result.wa_recipients ?? 0}
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

function LoginAuditDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--text-muted)]">{label}</dt>
      <dd className="break-words font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function formatLoginDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });
}

function formatPlatformDetail(item: LoginAuditItem) {
  const parts = [
    item.platform_version ? `versi ${item.platform_version}` : '',
    item.architecture || '',
    item.bitness ? `${item.bitness}-bit` : ''
  ].filter(Boolean);
  return parts.join(' • ') || 'Tidak diberikan browser';
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

function formatWaError(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result) return '-';
  if (!result.wa_errors?.length) return '-';
  const first = result.wa_errors[0];
  return `${first.nama || first.no_hp || 'WA'}: ${first.message || 'WA gagal'}`;
}

function formatWaTarget(result: NonNullable<CronHealthLog['payload']>['reminder_result']) {
  if (!result?.wa_target) return '-';
  const targets = Array.isArray(result.wa_target) ? result.wa_target : [result.wa_target];
  return targets
    .map((target) => `${target.nama || 'WA'} (${target.no_hp || '-'})`)
    .join(', ');
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
