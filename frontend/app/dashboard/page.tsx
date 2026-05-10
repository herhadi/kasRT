'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ToastStack from '@/components/ui/ToastStack';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, isValidPin, normalizePinInput } from '@/lib/helpers';
import useToast from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/useAuth';
import { DashboardWargaData, JimpitanScheduleData, UserSession } from '@/types';

type AdminPanelData = Record<string, number | string>;

export default function DashboardPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const { toasts, pushToast } = useToast();

  const [wargaData, setWargaData] = useState<DashboardWargaData | null>(null);
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
    async function loadDashboard() {
      if (!user) return;
      setError('');

      try {
        const [meResult, wargaResult, scheduleResult] = await Promise.all([
          apiFetch<{ success: boolean; user: UserSession }>('/auth/me'),
          apiFetch<{ success: boolean; data: DashboardWargaData }>('/report/dashboard'),
          apiFetch<{ success: boolean; data: JimpitanScheduleData }>('/jimpitan/schedule')
        ]);

        refreshUser(meResult.user);
        setWargaData(wargaResult.data);
        setScheduleData(scheduleResult.data);

        if (adminEndpoint) {
          const adminResult = await apiFetch<{ success: boolean; data: AdminPanelData }>(adminEndpoint);
          setAdminData(adminResult.data);
        } else {
          setAdminData(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat dashboard');
      }
    }

    loadDashboard();
  }, [user, adminEndpoint, refreshUser]);

  const weeklyGroups = useMemo(() => {
    const days = scheduleData?.shift_days || [];
    const petugas = scheduleData?.petugas || [];
    return days.map((day) => ({
      ...day,
      members: petugas.filter((person) => person.jimpitan_shift_hari === day.id)
    }));
  }, [scheduleData]);

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
    if (!isValidPin(pinBaru)) {
      pushToast('PIN baru harus 4 sampai 6 digit angka.', 'warning');
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

  return (
    <main className="min-h-screen pb-10">
      <ToastStack toasts={toasts} />
      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <section className="glass-card rounded-3xl p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Operasional</p>
              <p className="text-xs text-gray-600">{operationalDate}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-strong)]"
              aria-label="Pengaturan akun"
              title="Pengaturan akun"
            >
              <span className="text-xl leading-none">&#9881;</span>
              <span>Pengaturan Akun</span>
            </button>
          </div>
          <h1 className="mt-3 font-[var(--font-space-grotesk)] text-3xl font-bold">Halo, {user.nama}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Role: {user.roles.join(', ') || 'Warga'}</p>
        </section>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {wargaData ? (
          <>
            <section className="grid gap-4 grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
              <Metric title="Jimpitan Bulan Ini" value={formatRupiah(wargaData.jimpitan_bulan_ini)} />
              <Metric title="Iuran Wajib" value={formatRupiah(wargaData.iuran_wajib_bulan_ini)} />
              <Metric title="Opsional" value={formatRupiah(wargaData.total_optional_bulan_ini)} />
              <Metric title="Total Kontribusi" value={formatRupiah(wargaData.total_kontribusi_bulan_ini)} />
            </section>

            <section className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card title="Kontribusi Dasar" subtitle="Jimpitan + iuran wajib">
                <div className="space-y-2 text-sm">
                  <Line label="Target Jimpitan" value={formatRupiah(wargaData.target_jimpitan_bulanan)} />
                  <Line label="Target Iuran Wajib" value={formatRupiah(wargaData.target_iuran_wajib)} />
                  <Line label="Target Dasar" value={formatRupiah(wargaData.target_kontribusi_dasar)} />
                </div>
              </Card>

              <Card title="Status Internet & Lingkungan" subtitle="Monitoring iuran layanan bulanan">
                <div className="space-y-2 text-sm">
                  <Line label="Internet" value={`${formatRupiah(wargaData.internet_bulan_ini)} (${wargaData.internet_status})`} />
                  <Line label="Lingkungan" value={`${formatRupiah(wargaData.lingkungan_bulan_ini)} (${wargaData.lingkungan_status})`} />
                </div>
              </Card>
            </section>

            {wargaData.koperasi_has_loan ? (
              <Card title="Pinjaman Koperasi" subtitle="Informasi angsuran pinjaman aktif">
                <div className="space-y-2 text-sm">
                  <Line label="Angsuran / Bulan" value={formatRupiah(Number(wargaData.koperasi_loan_monthly_installment || 0))} />
                  <Line
                    label="Progress Angsuran"
                    value={`Angsuran ke-${Math.min(Number(wargaData.koperasi_loan_current_installment_no || 1), Number(wargaData.koperasi_loan_tenor_months || 0))}/${Number(wargaData.koperasi_loan_tenor_months || 0)}`}
                  />
                </div>
              </Card>
            ) : null}

            <Card title="Iuran Opsional" subtitle="Kontribusi di luar iuran dasar">
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {wargaData.optional_contributions.filter((item) => item.is_mandatory === false).length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Belum ada kontribusi opsional bulan ini.</p>
                ) : (
                  wargaData.optional_contributions
                    .filter((item) => item.is_mandatory === false)
                    .map((item) => (
                      <div key={item.name} className="surface-muted rounded-2xl border border-[var(--line)] p-4">
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="metric-value mt-1 text-xl font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                      </div>
                    ))
                )}
              </div>
            </Card>

            <Card title="Jadwal Petugas Jimpitan" subtitle="Akses bersama untuk seluruh warga (Ahad - Sabtu)">
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
          <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3 text-sm text-[var(--text-muted)]">
            Memuat dashboard...
          </div>
        )}
      </div>

      {showSettings ? (
        <div className="fixed inset-0 z-[80] bg-black/35 p-4" onClick={() => setShowSettings(false)}>
          <div
            className="mx-auto mt-8 w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Pengaturan Akun</h3>
              <button type="button" className="text-sm text-[var(--text-muted)]" onClick={() => setShowSettings(false)}>Tutup</button>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Edit Profil</p>
                <Input label="Nama" value={profileNama} onChange={(e) => setProfileNama(e.target.value)} />
                <Input label="Nomor HP" value={profileNoHp} onChange={(e) => setProfileNoHp(e.target.value)} />
                <Button className="w-full md:w-auto" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
                </Button>
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="glass-card rounded-3xl p-5">
      <p className="text-sm text-[var(--text-muted)]">{title}</p>
      <p className="metric-value mt-2 text-2xl font-bold text-[var(--accent)]">{value}</p>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-muted flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}

