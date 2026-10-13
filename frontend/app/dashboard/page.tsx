'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import ToastStack from '@/components/ui/ToastStack';
import PeriodPickerCompact from '@/components/contribution/PeriodPickerCompact';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, isValidPin, normalizePinInput } from '@/lib/helpers';
import useToast from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/useAuth';
import { DashboardWargaData, JimpitanScheduleData, UserSession } from '@/types';

type AdminPanelData = Record<string, number | string>;
type ContributionDetailModule = 'tabungan' | 'internet' | 'lingkungan';
type ContributionDetailRow = {
  kind: 'OPENING' | 'MONTH';
  period: string;
  description: string;
  target: number;
  paid: number;
  debit: number;
  credit: number;
  balance: number;
  status: string;
  arrears: number;
};
type ContributionDetailData = {
  module_key: ContributionDetailModule;
  label: string;
  is_member: boolean;
  start_month: string;
  until_month: string;
  opening_rows: ContributionDetailRow[];
  rows: ContributionDetailRow[];
  summary: {
    total_target?: number;
    total_paid?: number;
    total_debit?: number;
    ending_balance?: number;
    total_arrears?: number;
    arrears_months?: number;
  };
};

function formatDashboardDate(value: string) {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DashboardPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const { toasts, pushToast } = useToast();

  const [wargaData, setWargaData] = useState<DashboardWargaData | null>(null);
  const [internetData, setInternetData] = useState<Partial<DashboardWargaData> | null>(null);
  const [financeData, setFinanceData] = useState<Partial<DashboardWargaData> | null>(null);
  const [internetLoadError, setInternetLoadError] = useState(false);
  const [financeLoadError, setFinanceLoadError] = useState(false);
  const [dashboardLoadError, setDashboardLoadError] = useState('');
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);
  const [adminData, setAdminData] = useState<AdminPanelData | null>(null);
  const [scheduleData, setScheduleData] = useState<JimpitanScheduleData | null>(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [profileNama, setProfileNama] = useState('');
  const [profileNoHp, setProfileNoHp] = useState('');
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [pinBaru2, setPinBaru2] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [activatingTelegram, setActivatingTelegram] = useState(false);
  const [switchingTelegram, setSwitchingTelegram] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ContributionDetailData | null>(null);
  const [detailError, setDetailError] = useState('');

  const adminEndpoint = useMemo(() => {
    if (!user) return null;
    if (hasAnyRole(user, ['Admin Jimpitan', 'root'])) return '/report/dashboard-admin-jimpitan';
    if (hasAnyRole(user, ['Bendahara'])) return '/report/dashboard-admin-bendahara';
    if (hasAnyRole(user, ['Admin Pembangunan'])) return '/report/dashboard-admin-pembangunan';
    if (hasAnyRole(user, ['Admin Internet'])) return '/report/dashboard-admin-internet';
    if (hasAnyRole(user, ['Admin Lingkungan'])) return '/report/dashboard-admin-lingkungan';
    if (hasAnyRole(user, ['Admin Koperasi'])) return '/report/dashboard-admin-koperasi';
    return null;
  }, [user]);

  const operationalDate = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const date = new Date(now);
    // Operational day ends at 12:00 (noon) the next day
    // So if it's before 12:00, we're still in previous day's operational period
    if (hour < 12) {
      date.setDate(date.getDate() - 1);
    }
    return date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user?.must_change_pin) {
      router.replace('/akun/ganti-pin');
    }
  }, [loading, user, router]);

  useEffect(() => {
    setProfileNama(String(user?.nama || ''));
    setProfileNoHp(String(user?.no_hp || ''));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setError('');
    setDashboardLoadError('');
    setWargaData(null);
    setInternetData(null);
    setFinanceData(null);
    setInternetLoadError(false);
    setFinanceLoadError(false);

    // Load the main dashboard and its slower Internet/finance groups independently.
    void apiFetch<{ success: boolean; data: Partial<DashboardWargaData> }>(
      `/report/dashboard-internet?month=${encodeURIComponent(selectedMonth)}`
    ).then((result) => {
      if (active) setInternetData(result.data);
    }).catch(() => {
      if (active) setInternetLoadError(true);
    });

    void apiFetch<{ success: boolean; data: Partial<DashboardWargaData> }>('/report/dashboard-finance')
      .then((result) => {
        if (active) setFinanceData(result.data);
      }).catch(() => {
        if (active) setFinanceLoadError(true);
      });

    // Each panel updates as soon as its own request finishes. A slow schedule,
    // profile refresh, or role-specific admin report no longer blocks the main
    // personal dashboard from appearing.
    void apiFetch<{ success: boolean; data: DashboardWargaData }>(
      `/report/dashboard?month=${encodeURIComponent(selectedMonth)}`
    ).then((result) => {
      if (active) setWargaData(result.data);
    }).catch((e) => {
      if (active) {
        const message = e instanceof Error ? e.message : 'Gagal memuat ringkasan dashboard';
        setDashboardLoadError(message);
        setError(message);
      }
    });

    void apiFetch<{ success: boolean; data: JimpitanScheduleData }>('/jimpitan/schedule')
      .then((result) => {
        if (active) setScheduleData(result.data);
      })
      .catch(() => {
        // Keep the rest of the dashboard usable if the schedule is unavailable.
      });

    void apiFetch<{ success: boolean; user: UserSession }>('/auth/me')
      .then((result) => {
        if (active) refreshUser(result.user);
      })
      .catch(() => {
        // useAuth already has the current session; profile refresh is auxiliary.
      });

    if (adminEndpoint) {
      void apiFetch<{ success: boolean; data: AdminPanelData }>(adminEndpoint)
        .then((result) => {
          if (active) setAdminData(result.data);
        })
        .catch(() => {
          if (active) setAdminData(null);
        });
    } else {
      setAdminData(null);
    }

    return () => {
      active = false;
    };
  }, [user?.id, adminEndpoint, refreshUser, selectedMonth, dashboardReloadKey]);

  const dashboardData = useMemo<DashboardWargaData | null>(() => {
    if (!wargaData) return null;
    return { ...wargaData, ...(internetData || {}), ...(financeData || {}) };
  }, [wargaData, internetData, financeData]);

  const weeklyGroups = useMemo(() => {
    const days = scheduleData?.shift_days || [];
    const petugas = scheduleData?.petugas || [];
    return days.map((day) => ({
      ...day,
      members: petugas.filter((person) => person.jimpitan_shift_hari === day.id)
    }));
  }, [scheduleData]);

  const optionalRows = useMemo(
    () => (wargaData?.optional_contributions || []).filter((item) => item.is_mandatory === false && Number(item.amount || 0) > 0),
    [wargaData]
  );
  const formatSignedRupiah = useCallback((value: number) => {
    const numeric = Number(value || 0);
    if (numeric > 0) return `+${formatRupiah(numeric)}`;
    if (numeric < 0) return `-${formatRupiah(Math.abs(numeric))}`;
    return formatRupiah(0);
  }, []);
  const obligationTone = useCallback((value: number): 'accent' | 'success' | 'danger' => {
    const numeric = Number(value || 0);
    if (numeric < 0) return 'danger';
    if (numeric > 0) return 'success';
    return 'accent';
  }, []);
  const personalObligations = useMemo(() => {
    if (!dashboardData) {
      return {
        iuranWajib: 0,
        internet: 0,
        lingkungan: 0,
        koperasi: 0
      };
    }
    const iuranWajibTarget = Number(dashboardData.target_iuran_wajib || 0);
    const internetTarget = Number(dashboardData.internet_target_bulanan || 0);
    const lingkunganTarget = Number(dashboardData.lingkungan_target_bulanan || 0);
    const koperasiTarget = dashboardData.koperasi_has_loan
      ? Number(dashboardData.koperasi_loan_monthly_installment || 0)
      : 0;
    // These cards represent the selected month's payment progress. Lifetime
    // arrears remain in the separate "Tunggakan Anda" section below.
    return {
      iuranWajib: Number(dashboardData.iuran_wajib_bulan_ini || 0) - iuranWajibTarget,
      internet: Number(dashboardData.internet_bulan_ini || 0) - internetTarget,
      lingkungan: Number(dashboardData.lingkungan_bulan_ini || 0) - lingkunganTarget,
      koperasi: Number(dashboardData.koperasi_bulan_ini || 0) - koperasiTarget
    };
  }, [dashboardData]);

  if (loading || !user) return <main className="min-h-screen" />;

  async function saveProfile() {
    if (!profileNama.trim() || !profileNoHp.trim()) {
      pushToast('Nama dan nomor HP wajib diisi.', 'warning');
      return;
    }
    try {
      setSavingProfile(true);
      const res = await apiFetch<{ success: boolean; user: UserSession; message?: string }>('/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ nama: profileNama.trim(), no_hp: profileNoHp.trim() })
      });
      refreshUser(res.user);
      pushToast(res.message || 'Profil berhasil diperbarui.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal menyimpan profil', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePin() {
    if (!pinLama || !pinBaru || !pinBaru2) {
      pushToast('PIN lama dan PIN baru wajib diisi.', 'warning');
      return;
    }
    if (!isValidPin(pinBaru, 6, 6)) {
      pushToast('PIN baru harus minimal 6 digit angka dan maksimal 6 digit.', 'warning');
      return;
    }
    if (pinBaru !== pinBaru2) {
      pushToast('Ulangi PIN baru tidak sama.', 'warning');
      return;
    }
    try {
      setSavingPin(true);
      await apiFetch('/auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({ old_pin: pinLama, new_pin: pinBaru, repeat_new_pin: pinBaru2 })
      });
      setPinLama('');
      setPinBaru('');
      setPinBaru2('');
      pushToast('PIN berhasil diperbarui.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal mengganti PIN', 'error');
    } finally {
      setSavingPin(false);
    }
  }

  async function activateTelegram() {
    try {
      setActivatingTelegram(true);
      const res = await apiFetch<{ success: boolean; activation_link: string; expires_in_minutes?: number }>(
        '/auth/telegram-activation-link',
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (!res.activation_link) {
        pushToast('Link aktivasi Telegram tidak tersedia.', 'error');
        return;
      }
      window.open(res.activation_link, '_blank', 'noopener,noreferrer');
      pushToast(`Link aktivasi Telegram dibuka. Berlaku ${res.expires_in_minutes || 15} menit.`, 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal membuat link aktivasi Telegram', 'error');
    } finally {
      setActivatingTelegram(false);
    }
  }

  async function openContributionDetail(moduleKey: ContributionDetailModule) {
    if (moduleKey === 'tabungan') {
      router.push('/tabungan/detail');
      return;
    }
    try {
      setDetailLoading(true);
      setDetailError('');
      setDetailData(null);
      const res = await apiFetch<{ success: boolean; data: ContributionDetailData }>(
        `/report/my-contribution-detail?module=${encodeURIComponent(moduleKey)}&month=${encodeURIComponent(selectedMonth)}`
      );
      setDetailData(res.data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Gagal memuat detail iuran');
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshTelegramStatus() {
    try {
      const meResult = await apiFetch<{ success: boolean; user: UserSession }>('/auth/me');
      refreshUser(meResult.user);
      pushToast(meResult.user.telegram_connected ? 'Telegram sudah terhubung.' : 'Telegram belum terhubung.', meResult.user.telegram_connected ? 'success' : 'warning');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal memperbarui status Telegram', 'error');
    }
  }

  async function switchTelegramAccount() {
    try {
      setSwitchingTelegram(true);
      await apiFetch<{ success: boolean; message?: string }>('/auth/telegram-disconnect', {
        method: 'POST',
        body: JSON.stringify({})
      });
      await activateTelegram();
      const meResult = await apiFetch<{ success: boolean; user: UserSession }>('/auth/me');
      refreshUser(meResult.user);
      pushToast('Akun Telegram lama dilepas. Lanjutkan aktivasi akun Telegram baru.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal mengganti akun Telegram', 'error');
    } finally {
      setSwitchingTelegram(false);
    }
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} />
      <ToastStack toasts={toasts} />
      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <section className="glass-card rounded-3xl p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-[var(--font-space-grotesk)] text-2xl font-bold md:text-3xl">Halo, {user.nama}</h1>
              <p className="mt-1 text-xs text-[var(--text-muted)] md:text-sm">Role: {user.roles.join(', ') || 'Warga'}</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Operasional</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{operationalDate}</p>
            </div>
          </div>
        </section>
        {!user.telegram_connected ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-900">Hubungkan Telegram</p>
                <p className="mt-1 text-xs text-amber-800">
                  Dapatkan pengingat jimpitan, info iuran, dan pemberitahuan penting langsung di Telegram.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="w-full sm:w-auto" onClick={activateTelegram} disabled={activatingTelegram}>
                  {activatingTelegram ? 'Membuat Link...' : 'Aktifkan Telegram'}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {dashboardData ? (
          <>
            <Card
              title="Informasi Pribadi"
              subtitle="Ringkasan iuran dan saldo pribadi"
              headerRight={
                <PeriodPickerCompact label="Periode" value={selectedMonth} onChange={setSelectedMonth} />
              }
            >
              <section className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                {dashboardData.jimpitan_is_member ? <Metric title="Jimpitan Bulan Ini" value={formatRupiah(dashboardData.jimpitan_bulan_ini)} /> : null}
                <Metric
                  title="Kewajiban Iuran Wajib"
                  value={formatRupiah(personalObligations.iuranWajib)}
                  tone={personalObligations.iuranWajib < 0 ? 'danger' : 'accent'}
                />
                {dashboardData.tabungan_is_member ? (financeData ? (
                  <Metric
                    title="Saldo Tabungan Pembangunan"
                    value={formatRupiah(dashboardData.tabungan_saldo)}
                    tone={Number(dashboardData.tabungan_saldo || 0) < 0 ? 'danger' : 'accent'}
                    onClick={() => void openContributionDetail('tabungan')}
                  />
                ) : <LoadingMetric title="Saldo Tabungan Pembangunan" failed={financeLoadError} />) : null}
                {dashboardData.internet_is_member ? (internetData ? (
                  <Metric
                    title="Kewajiban Internet"
                    value={formatSignedRupiah(personalObligations.internet)}
                    tone={obligationTone(personalObligations.internet)}
                    onClick={() => void openContributionDetail('internet')}
                  />
                ) : <LoadingMetric title="Kewajiban Internet" failed={internetLoadError} />) : null}
                {dashboardData.lingkungan_is_member ? (
                  <Metric
                    title="Kewajiban Lingkungan"
                    value={formatSignedRupiah(personalObligations.lingkungan)}
                    tone={obligationTone(personalObligations.lingkungan)}
                    onClick={() => void openContributionDetail('lingkungan')}
                  />
                ) : null}
                {dashboardData.koperasi_is_member ? (
                  <Metric
                    title="Kewajiban Koperasi"
                    value={formatRupiah(personalObligations.koperasi)}
                    tone={personalObligations.koperasi < 0 ? 'danger' : 'accent'}
                  />
                ) : null}
              </section>
              {((dashboardData.internet_is_member && internetLoadError) || financeLoadError) ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>{dashboardData.internet_is_member && internetLoadError && financeLoadError ? 'Sebagian ringkasan belum tersedia.' : dashboardData.internet_is_member && internetLoadError ? 'Ringkasan Internet belum tersedia.' : 'Ringkasan kas dan saldo belum tersedia.'}</span>
                  <button type="button" className="font-semibold text-[var(--accent)] underline" onClick={() => setDashboardReloadKey((key) => key + 1)}>Coba lagi</button>
                </div>
              ) : null}
            </Card>

            {dashboardData.special_bills?.length ? (
              <Card title="Tagihan Khusus Aktif" subtitle="Tagihan temporer yang ditunjuk oleh pengurus RT">
                <div className="grid gap-3 md:grid-cols-2">
                  {dashboardData.special_bills.map((bill) => (
                    <div key={bill.id} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{bill.title}</p>
                          <p className="mt-1 text-xs opacity-80">PIC: {bill.pic_name}</p>
                        </div>
                        <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800 dark:bg-amber-400/10 dark:text-amber-100">
                          {bill.display_status === 'TERLAMBAT' ? 'Terlambat' :
                           bill.display_status === 'LUNAS' ? 'Lunas' :
                           bill.display_status === 'MENUNGGU_APPROVAL' ? 'Menunggu Approval' :
                           bill.display_status === 'TERKUMPUL' ? 'Terkumpul di PIC' :
                           bill.display_status === 'SEBAGIAN' ? 'Sebagian' :
                           bill.display_status === 'BELUM_MULAI' ? 'Belum Mulai' : 'Belum'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <Line label="Target" value={formatRupiah(Number(bill.target_amount || 0))} />
                        <Line label="Sisa" value={formatRupiah(Number(bill.remaining_amount || 0))} />
                        <Line label="Mulai" value={formatDashboardDate(bill.start_date)} />
                        <Line label="Batas" value={formatDashboardDate(bill.end_date)} />
                      </div>
                      {bill.description ? <p className="mt-3 text-xs opacity-80">{bill.description}</p> : null}
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card title="Kas Umum" subtitle="Ringkasan kas bersama lintas modul">
              <section className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                {financeData ? <>
                  <Metric title="Kas Bendahara" value={formatRupiah(dashboardData.kas_umum.kas_bendahara)} tone={dashboardData.kas_umum.kas_bendahara < 0 ? 'danger' : 'accent'} />
                  <Metric title="Kas Sosial" value={formatRupiah(dashboardData.kas_umum.kas_sosial)} tone={dashboardData.kas_umum.kas_sosial < 0 ? 'danger' : 'accent'} />
                  <Metric title="Kas Tab Pembangunan" value={formatRupiah(dashboardData.kas_umum.kas_tabungan_pembangunan)} tone={dashboardData.kas_umum.kas_tabungan_pembangunan < 0 ? 'danger' : 'accent'} />
                  <Metric title="Kas Lingkungan" value={formatRupiah(dashboardData.kas_umum.kas_lingkungan)} tone={dashboardData.kas_umum.kas_lingkungan < 0 ? 'danger' : 'accent'} />
                  <Metric title="Kas Internet" value={formatRupiah(dashboardData.kas_umum.kas_internet)} tone={dashboardData.kas_umum.kas_internet < 0 ? 'danger' : 'accent'} />
                  <Metric title="Kas Koperasi" value={formatRupiah(dashboardData.kas_umum.kas_koperasi)} tone={dashboardData.kas_umum.kas_koperasi < 0 ? 'danger' : 'accent'} />
                </> : <>
                  <LoadingMetric title="Kas Bendahara" failed={financeLoadError} />
                  <LoadingMetric title="Kas Sosial" failed={financeLoadError} />
                  <LoadingMetric title="Kas Tab Pembangunan" failed={financeLoadError} />
                  <LoadingMetric title="Kas Lingkungan" failed={financeLoadError} />
                  <LoadingMetric title="Kas Internet" failed={financeLoadError} />
                  <LoadingMetric title="Kas Koperasi" failed={financeLoadError} />
                </>}
              </section>
            </Card>

            <CompactPanel title="Tunggakan Anda" subtitle="Jumlah bulan dan nominal per kas">
              <div className="space-y-2 text-sm">
                <Line label="Iuran Wajib" value={`0 bulan • ${formatRupiah(0)}`} />
                {dashboardData.internet_is_member ? (financeData ? <Line label="Internet" value={`${dashboardData.internet_tunggakan_bulan_count} bulan • ${formatRupiah(dashboardData.internet_tunggakan_total)}`} /> : <LoadingLine label="Internet" failed={financeLoadError} />) : null}
                {dashboardData.lingkungan_is_member ? (financeData ? <Line label="Lingkungan" value={`${dashboardData.lingkungan_tunggakan_bulan_count} bulan • ${formatRupiah(dashboardData.lingkungan_tunggakan_total)}`} /> : <LoadingLine label="Lingkungan" failed={financeLoadError} />) : null}
              </div>
            </CompactPanel>

            <section className="grid gap-3 lg:grid-cols-1">
              <CompactPanel title="Kontribusi Dasar" subtitle="Jimpitan + iuran wajib">
                <div className="space-y-2 text-sm">
                  {dashboardData.jimpitan_is_member ? <Line label="Target Jimpitan" value={formatRupiah(dashboardData.target_jimpitan_bulanan)} /> : null}
                  <Line label="Target Iuran Wajib" value={formatRupiah(dashboardData.target_iuran_wajib)} />
                  <Line
                    label="Target Dasar"
                    value={formatRupiah(
                      Number(dashboardData.target_iuran_wajib || 0) +
                        (dashboardData.jimpitan_is_member ? Number(dashboardData.target_jimpitan_bulanan || 0) : 0)
                    )}
                  />
                </div>
              </CompactPanel>
            </section>

            {dashboardData.koperasi_has_loan ? (
              <CompactPanel title="Pinjaman Koperasi" subtitle="Angsuran pinjaman aktif">
                <div className="space-y-2 text-sm">
                  <Line label="Angsuran / Bulan" value={formatRupiah(Number(dashboardData.koperasi_loan_monthly_installment || 0))} />
                  <Line
                    label="Progress Angsuran"
                    value={`Angsuran ke-${Math.min(Number(dashboardData.koperasi_loan_current_installment_no || 1), Number(dashboardData.koperasi_loan_tenor_months || 0))}/${Number(dashboardData.koperasi_loan_tenor_months || 0)}`}
                  />
                </div>
              </CompactPanel>
            ) : null}

            {optionalRows.length ? (
              <CompactPanel title="Iuran Opsional" subtitle="Kontribusi di luar iuran dasar">
                <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {optionalRows.map((item) => (
                    <div key={item.name} className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="metric-value mt-1 text-lg font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                    </div>
                  ))}
                </div>
              </CompactPanel>
            ) : null}

            <Card title="Jadwal Petugas Ronda/Jimpitan" subtitle="Pengambilan jimpitan mulai jam 21:00">
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Hari</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Petugas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyGroups.map((day) => (
                      <tr key={day.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{day.label}</td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {day.members.length > 0 ? day.members.map((person) => person.nama).join(', ') : 'Belum dijadwalkan'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {adminData ? (
              <Card title="Panel Admin" subtitle="Ringkasan sesuai role Anda">
                {hasAnyRole(user, ['Bendahara']) ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Line label="Target Iuran Wajib / Bulan" value={formatRupiah(Number(adminData.iuran_wajib_target_bulanan || 0))} />
                    <Line label="Target Bulan Ini" value={formatRupiah(Number(adminData.target_bulan_ini || 0))} />
                    <Line label="Pemasukan Bulan Ini" value={formatRupiah(Number(adminData.pemasukan_bulan_ini || 0))} />
                    <Line label="Total Warga" value={String(adminData.total_warga || 0)} />
                    <Line label="Menunggak Bulan Ini" value={String(adminData.total_menunggak_bulan_ini || 0)} />
                    <Line label="Pas Bulan Ini" value={String(adminData.total_pas_bulan_ini || 0)} />
                    <Line label="Lebih Bulan Ini" value={String(adminData.total_lebih_bulan_ini || 0)} />
                    <Line label="Nominal Tunggakan Bulan Ini" value={formatRupiah(Number(adminData.nominal_tunggakan_bulan_ini || 0))} />
                    <Line
                      label="Tunggakan Akumulatif Tahun Berjalan"
                      value={formatRupiah(Number(adminData.nominal_tunggakan_akumulatif_tahun_berjalan || 0))}
                    />
                  </div>
                ) : (
                  <pre className="overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(adminData, null, 2)}</pre>
                )}
              </Card>
            ) : null}
          </>
        ) : (
          <div className="space-y-5" aria-busy={!dashboardLoadError} aria-live="polite">
            {dashboardLoadError ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100 sm:flex-row sm:items-center sm:justify-between">
                <span>Ringkasan belum berhasil dimuat. Bagian lain tetap bisa digunakan. {dashboardLoadError}</span>
                <Button className="shrink-0" onClick={() => setDashboardReloadKey((key) => key + 1)}>Coba Lagi</Button>
              </div>
            ) : null}

            <Card
              title="Informasi Pribadi"
              subtitle="Ringkasan iuran dan saldo pribadi"
              headerRight={<PeriodPickerCompact label="Periode" value={selectedMonth} onChange={setSelectedMonth} />}
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {wargaData?.jimpitan_is_member ? <LoadingMetric title="Jimpitan Bulan Ini" failed={Boolean(dashboardLoadError)} /> : null}
                <LoadingMetric title="Kewajiban Iuran Wajib" failed={Boolean(dashboardLoadError)} />
                {wargaData?.tabungan_is_member ? (financeData ? <Metric title="Saldo Tabungan Pembangunan" value={formatRupiah(Number(financeData.tabungan_saldo || 0))} onClick={() => void openContributionDetail('tabungan')} /> : <LoadingMetric title="Saldo Tabungan Pembangunan" failed={financeLoadError || Boolean(dashboardLoadError)} />) : null}
                {internetData?.internet_is_member ? <Metric title="Kewajiban Internet" value={formatSignedRupiah(Number(financeData?.internet_tunggakan_total || 0) > 0 ? -Number(financeData?.internet_tunggakan_total || 0) : Number(internetData.internet_bulan_ini || 0) - Number(internetData.internet_target_bulanan || 60000))} onClick={() => void openContributionDetail('internet')} /> : null}
                {wargaData?.lingkungan_is_member ? <LoadingMetric title="Kewajiban Lingkungan" failed={Boolean(dashboardLoadError)} /> : null}
                {wargaData?.koperasi_is_member ? <LoadingMetric title="Kewajiban Koperasi" failed={Boolean(dashboardLoadError)} /> : null}
              </div>
            </Card>

            <Card title="Kas Umum" subtitle="Ringkasan kas bersama lintas modul">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {financeData ? <>
                  <Metric title="Kas Bendahara" value={formatRupiah(Number(financeData.kas_umum?.kas_bendahara || 0))} />
                  <Metric title="Kas Sosial" value={formatRupiah(Number(financeData.kas_umum?.kas_sosial || 0))} />
                  <Metric title="Kas Tab Pembangunan" value={formatRupiah(Number(financeData.kas_umum?.kas_tabungan_pembangunan || 0))} />
                  <Metric title="Kas Lingkungan" value={formatRupiah(Number(financeData.kas_umum?.kas_lingkungan || 0))} />
                  <Metric title="Kas Internet" value={formatRupiah(Number(financeData.kas_umum?.kas_internet || 0))} />
                  <Metric title="Kas Koperasi" value={formatRupiah(Number(financeData.kas_umum?.kas_koperasi || 0))} />
                </> : <>
                  <LoadingMetric title="Kas Bendahara" failed={financeLoadError || Boolean(dashboardLoadError)} />
                  <LoadingMetric title="Kas Sosial" failed={financeLoadError || Boolean(dashboardLoadError)} />
                  <LoadingMetric title="Kas Tab Pembangunan" failed={financeLoadError || Boolean(dashboardLoadError)} />
                  <LoadingMetric title="Kas Lingkungan" failed={financeLoadError || Boolean(dashboardLoadError)} />
                  <LoadingMetric title="Kas Internet" failed={financeLoadError || Boolean(dashboardLoadError)} />
                  <LoadingMetric title="Kas Koperasi" failed={financeLoadError || Boolean(dashboardLoadError)} />
                </>}
              </div>
            </Card>

            <CompactPanel title="Tunggakan Anda" subtitle="Jumlah bulan dan nominal per kas">
              <div className="space-y-3 text-sm">
                <LoadingLine label="Iuran Wajib" failed={Boolean(dashboardLoadError)} />

              </div>
            </CompactPanel>

            <CompactPanel title="Kontribusi Dasar" subtitle="Jimpitan + iuran wajib">
              <div className="space-y-3 text-sm">
                {wargaData?.jimpitan_is_member ? <LoadingLine label="Target Jimpitan" failed={Boolean(dashboardLoadError)} /> : null}
                <LoadingLine label="Target Iuran Wajib" failed={Boolean(dashboardLoadError)} />
                <LoadingLine label="Target Dasar" failed={Boolean(dashboardLoadError)} />
              </div>
            </CompactPanel>

            <Card title="Jadwal Petugas Ronda/Jimpitan" subtitle="Pengambilan jimpitan mulai jam 21:00">
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead><tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Hari</th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Petugas</th>
                  </tr></thead>
                  <tbody>
                    {weeklyGroups.length ? weeklyGroups.map((day) => (
                      <tr key={day.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{day.label}</td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{day.members.length ? day.members.map((person) => person.nama).join(', ') : 'Belum dijadwalkan'}</td>
                      </tr>
                    )) : Array.from({ length: 7 }, (_, index) => (
                      <tr key={index} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-4 py-3"><LoadingValue failed={Boolean(dashboardLoadError)} /></td>
                        <td className="border-b border-[var(--line)] px-4 py-3"><LoadingValue failed={Boolean(dashboardLoadError)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {adminEndpoint ? (
              <Card title="Panel Admin" subtitle="Ringkasan sesuai role Anda">
                <div className="grid gap-3 md:grid-cols-2">
                  <LoadingLine label="Ringkasan operasional" failed={!adminData && Boolean(dashboardLoadError)} />
                  <LoadingLine label="Statistik periode ini" failed={!adminData && Boolean(dashboardLoadError)} />
                </div>
              </Card>
            ) : null}

            {!dashboardLoadError ? <p className="text-center text-xs text-[var(--text-muted)]">Angka sedang dimuat. Bagian yang sudah tersedia akan langsung ditampilkan.</p> : null}
          </div>
        )}
      </div>

      {(detailLoading || detailData || detailError) ? (
        <div className="dashboard-detail-modal fixed inset-0 z-[70] flex justify-center bg-black/45 p-3">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Detail Informasi Pribadi</p>
                <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                  {detailData?.label || 'Memuat detail'}
                </h2>
                {detailData ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Periode {formatMonthKey(detailData.start_month)} sampai {formatMonthKey(detailData.until_month)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                onClick={() => {
                  setDetailData(null);
                  setDetailError('');
                  setDetailLoading(false);
                }}
              >
                Tutup
              </button>
            </div>
            <div className="dashboard-detail-modal-body overflow-y-auto p-4">
              {detailLoading ? <p className="text-sm text-[var(--text-muted)]">Memuat detail...</p> : null}
              {detailError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{detailError}</p> : null}
              {detailData ? <ContributionDetailView data={detailData} /> : null}
            </div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/75 p-4" onClick={() => setShowSettings(false)}>
          <div
            className="mx-auto mt-4 mb-4 w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 md:mt-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Pengaturan Akun</h3>
              <button type="button" className="text-sm text-[var(--text-muted)]" onClick={() => setShowSettings(false)}>Tutup</button>
            </div>
            <div className="max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto pr-1">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Edit Profil</p>
                <Input label="Nama" value={profileNama} onChange={(e) => setProfileNama(e.target.value)} />
                <Input label="Nomor HP" value={profileNoHp} onChange={(e) => setProfileNoHp(e.target.value)} />
                <Button className="w-full md:w-auto" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
                </Button>
              </div>
              <div className="space-y-2 border-t border-[var(--line)] pt-4">
                <p className="text-sm font-semibold">Telegram</p>
                <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {user.telegram_connected ? 'Telegram Terhubung' : 'Telegram Belum Terhubung'}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {user.telegram_connected
                          ? 'Akun ini bisa menerima notifikasi approval.'
                          : 'Aktifkan agar notifikasi approval masuk ke Telegram Anda.'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {!user.telegram_connected ? (
                        <Button className="w-full sm:w-auto" onClick={activateTelegram} disabled={activatingTelegram}>
                          {activatingTelegram ? 'Membuat Link...' : 'Aktifkan Telegram'}
                        </Button>
                      ) : (
                        <Button
                          className="w-full sm:w-auto"
                          onClick={switchTelegramAccount}
                          disabled={switchingTelegram || activatingTelegram}
                        >
                          {switchingTelegram ? 'Memproses...' : 'Ganti Akun Telegram'}
                        </Button>
                      )}
                      <Button variant="ghost" className="w-full sm:w-auto" onClick={refreshTelegramStatus}>
                        Refresh Status
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 border-t border-[var(--line)] pt-4">
                <p className="text-sm font-semibold">Keanggotaan</p>
                <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Keanggotaan Saya</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Lihat status Internet, Lingkungan, dan Koperasi. Ajukan aktif dari halaman khusus agar dashboard tetap ringkas.
                      </p>
                    </div>
                    <Link
                      href="/akun/keanggotaan"
                      className="btn-action-blue inline-flex min-h-[2.5rem] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
                      onClick={() => setShowSettings(false)}
                    >
                      Buka Keanggotaan
                    </Link>
                  </div>
                </div>
              </div>
              <div className="space-y-2 border-t border-[var(--line)] pt-4">
                <p className="text-sm font-semibold">Ganti PIN</p>
                <Input
                  label="PIN Lama"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinLama}
                  onChange={(e) => setPinLama(normalizePinInput(e.target.value))}
                />
                <Input
                  label="PIN Baru"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinBaru}
                  onChange={(e) => setPinBaru(normalizePinInput(e.target.value))}
                />
                <Input
                  label="Ulangi PIN Baru"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinBaru2}
                  onChange={(e) => setPinBaru2(normalizePinInput(e.target.value))}
                />
                <Button className="w-full md:w-auto" onClick={savePin} disabled={savingPin}>
                  {savingPin ? 'Menyimpan...' : 'Simpan PIN'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function LoadingValue({ failed = false }: { failed?: boolean }) {
  if (failed) return <span className="text-sm text-[var(--text-muted)]">Belum tersedia</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]" role="status" aria-label="Memuat data">
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      <span className="sr-only">Memuat data</span>
    </span>
  );
}

function LoadingMetric({ title, failed = false }: { title: string; failed?: boolean }) {
  return (
    <div className="glass-card min-h-[108px] rounded-2xl border border-[var(--line)] p-4">
      <p className="text-xs font-semibold text-[var(--text-muted)]">{title}</p>
      <div className="metric-value mt-3 flex min-h-7 items-center text-xl font-bold text-[var(--accent)]">
        <LoadingValue failed={failed} />
      </div>
    </div>
  );
}

function LoadingLine({ label, failed = false }: { label: string; failed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <LoadingValue failed={failed} />
    </div>
  );
}

function Metric({ title, value, tone = 'accent', onClick }: { title: string; value: string; tone?: 'accent' | 'success' | 'danger'; onClick?: () => void }) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-[var(--accent)]';

  const className = onClick
    ? 'glass-card group relative overflow-hidden rounded-2xl border border-[var(--accent)]/35 p-4 text-left ring-1 ring-[var(--accent)]/10 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/60 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 active:translate-y-0'
    : 'glass-card rounded-2xl p-4 text-left';
  const content = (
    <>
      {onClick ? (
        <span className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent)] transition group-hover:bg-[var(--accent)] group-hover:text-white">
          ›
        </span>
      ) : null}
      <p className={`text-xs font-semibold text-[var(--text-muted)] ${onClick ? 'pr-8' : ''}`}>{title}</p>
      <p className={`metric-value mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      {onClick ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-1 text-[11px] font-bold text-[var(--accent)]">
          Lihat detail
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <article className={className}>
      {content}
    </article>
  );
}

function formatMonthKey(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ''))) return monthKey || '-';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function ContributionDetailView({ data }: { data: ContributionDetailData }) {
  const isTabungan = data.module_key === 'tabungan';
  const allRows = [...(data.opening_rows || []), ...(data.rows || [])]
    .sort((left, right) => isTabungan ? String(right.period).localeCompare(String(left.period)) : 0);
  const arrearsRows = (data.rows || []).filter((row) => row.status === 'TUNGGAK');

  return (
    <div className="space-y-4">
      {isTabungan ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text-primary)]">
          <p className="font-bold">Ringkasan Tabungan</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Total setoran {formatRupiah(Number(data.summary.total_paid || 0))} · Saldo akhir {formatRupiah(Number(data.summary.ending_balance || 0))}
          </p>
          <Link href="/tabungan/penarikan" className="btn-action-blue mt-3 inline-flex rounded-xl px-3 py-2 text-xs font-semibold">
            Ajukan Penarikan Tabungan
          </Link>
        </div>
      ) : arrearsRows.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-bold">Periode yang masih tunggak</p>
          <p className="mt-1 text-xs leading-5">
            {arrearsRows.map((row) => `${formatMonthKey(row.period)} (${formatRupiah(row.arrears)})`).join(' · ')}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
          Tidak ada periode tunggakan sampai {formatMonthKey(data.until_month)}.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
          <thead>
            <tr className="bg-[var(--surface-strong)]">
              <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Periode</th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Target</th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Masuk</th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Status</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row) => (
              <tr key={`${row.kind}-${row.period}`} className="bg-[var(--surface)]">
                <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">{formatMonthKey(row.period)}</td>
                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm">{row.target ? formatRupiah(row.target) : '-'}</td>
                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm">{row.credit ? formatRupiah(row.credit) : '-'}</td>
                <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">
                  {isTabungan && row.kind === 'OPENING' ? 'Saldo awal' : formatContributionStatus(row.status, isTabungan, row.period === data.until_month)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatContributionStatus(status: string, isTabungan = false, isLatestPeriod = false) {
  if (isTabungan) {
    if (status === 'BELUM_SETOR' || status === 'TUNGGAK') return isLatestPeriod ? 'Belum setor' : 'Tidak setor';
    if (status === 'LUNAS') return 'Sudah setor';
    if (status === 'LEBIH') return 'Setoran lebih';
  }
  if (status === 'TUNGGAK') return 'Tunggak';
  if (status === 'LUNAS') return 'Lunas';
  if (status === 'LEBIH') return 'Lebih';
  if (status === 'MIGRASI') return 'Migrasi';
  return status || '-';
}

function CompactPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-muted flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <strong className="text-right text-sm">{value}</strong>
    </div>
  );
}

function formatStatus(status: string) {
  if (status === 'ACTIVE_MEMBER') return 'Aktif';
  if (status === 'NON_MEMBER') return 'Tidak ikut';
  if (status === 'MENUNGGAK') return 'Menunggak';
  if (status === 'PAS') return 'Lunas';
  if (status === 'LEBIH') return 'Lebih';
  return status;
}
