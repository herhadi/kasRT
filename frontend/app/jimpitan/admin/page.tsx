'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { JimpitanScheduleData } from '@/types';

type WargaOption = { id: string; nama: string; no_hp?: string };

export default function JimpitanAdminPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
  const [scheduleData, setScheduleData] = useState<JimpitanScheduleData | null>(null);
  const [selectedPetugasId, setSelectedPetugasId] = useState('');
  const [selectedShiftDay, setSelectedShiftDay] = useState('');
  const [topupWargaId, setTopupWargaId] = useState('');
  const [topupNominal, setTopupNominal] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [setShiftLoading, setSetShiftLoading] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: 'success' | 'error' | 'warning' }>>([]);

  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);

  const pushToast = useCallback((message: string, kind: 'success' | 'error' | 'warning' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const loadWargaOptions = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: WargaOption[] }>('/auth/warga-options');
    const rows = result.data || [];
    setWargaOptions(rows);
    setTopupWargaId((previous) => {
      if (previous && rows.some((row) => String(row.id) === String(previous))) return previous;
      return rows[0]?.id ? String(rows[0].id) : '';
    });
  }, []);

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; data: JimpitanScheduleData }>('/jimpitan/schedule');
      setScheduleData(result.data);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAdminJimpitan) {
      router.replace('/jimpitan');
      return;
    }
    void Promise.all([loadWargaOptions(), loadSchedule()]).catch((error) => {
      pushToast(error instanceof Error ? error.message : 'Gagal memuat data admin jimpitan', 'error');
    });
  }, [loading, user, isAdminJimpitan, router, loadWargaOptions, loadSchedule, pushToast]);

  const weeklyGroups = useMemo(() => {
    const days = scheduleData?.shift_days || [];
    const petugas = scheduleData?.petugas || [];
    return days.map((day) => ({
      ...day,
      members: petugas.filter((person) => person.jimpitan_shift_hari === day.id)
    }));
  }, [scheduleData]);

  useEffect(() => {
    if (!selectedPetugasId || !scheduleData?.petugas) return;
    const selected = scheduleData.petugas.find((petugas) => String(petugas.id) === String(selectedPetugasId));
    setSelectedShiftDay(selected?.jimpitan_shift_hari ? String(selected.jimpitan_shift_hari) : '');
  }, [selectedPetugasId, scheduleData]);

  useEffect(() => {
    if (!wargaOptions.length) {
      setSelectedPetugasId('');
      return;
    }
    setSelectedPetugasId((prev) => {
      if (prev && wargaOptions.some((warga) => String(warga.id) === String(prev))) return prev;
      return String(wargaOptions[0].id);
    });
  }, [wargaOptions]);

  async function handleTopup() {
    const wargaId = String(topupWargaId || '').trim();
    const nominal = Number(topupNominal);

    if (!wargaId) {
      pushToast('Pilih warga yang valid terlebih dahulu.', 'warning');
      return;
    }
    if (!Number.isFinite(nominal) || nominal <= 0) {
      pushToast('Nominal top up harus lebih dari 0.', 'warning');
      return;
    }

    try {
      setTopupLoading(true);
      await apiFetch('/jimpitan/topup', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wargaId, nominal })
      });
      setTopupNominal('');
      await loadWargaOptions();
      pushToast('Top up saldo berhasil.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Top up gagal', 'error');
    } finally {
      setTopupLoading(false);
    }
  }

  async function handleSetPetugasShift() {
    const userId = String(selectedPetugasId || '').trim();
    const shiftHari = selectedShiftDay === '' ? null : Number(selectedShiftDay);
    if (!userId) {
      pushToast('Pilih warga terlebih dahulu.', 'warning');
      return;
    }
    try {
      setSetShiftLoading(true);
      await apiFetch('/jimpitan/set-petugas-shift', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, shift_hari: shiftHari })
      });
      await loadSchedule();
      pushToast('Jadwal petugas berhasil diperbarui.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal update jadwal petugas', 'error');
    } finally {
      setSetShiftLoading(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
              toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : toast.kind === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <Navbar />

      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-5 md:px-6">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Admin Jimpitan</p>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Menu Khusus Admin</h2>
          </div>
          <Link
            href="/jimpitan"
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:opacity-90"
          >
            Kembali ke Input
          </Link>
        </div>

        <Card title="Top Up Saldo Warga" subtitle="Kelola top up tanpa mengganggu alur input harian">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Warga</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                value={topupWargaId}
                onChange={(event) => setTopupWargaId(event.target.value)}
              >
                {wargaOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nama}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Nominal"
              type="number"
              min={1}
              value={topupNominal}
              onChange={(event) => setTopupNominal(event.target.value)}
            />
            <div className="flex items-end">
              <Button className="w-full" onClick={handleTopup} disabled={topupLoading}>
                {topupLoading ? 'Menyimpan...' : 'Simpan Top Up'}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Atur Shift Petugas" subtitle="Pilih warga/petugas lalu tentukan hari shift, hasilnya langsung masuk tabel mingguan">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Warga</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                value={selectedPetugasId}
                onChange={(event) => setSelectedPetugasId(event.target.value)}
              >
                <option value="">Pilih warga</option>
                {wargaOptions.map((warga) => (
                  <option key={warga.id} value={String(warga.id)}>
                    {warga.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Hari</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                value={selectedShiftDay}
                onChange={(event) => setSelectedShiftDay(event.target.value)}
              >
                <option value="">Belum diatur</option>
                {(scheduleData?.shift_days || []).map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={handleSetPetugasShift}
                disabled={setShiftLoading || scheduleLoading || !selectedPetugasId}
              >
                {setShiftLoading ? 'Menyimpan...' : 'Simpan Jadwal'}
              </Button>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
            {scheduleLoading ? 'Memuat referensi jadwal...' : 'Pilih user lalu set hari. Jika ingin mengosongkan shift, pilih "Belum diatur".'}
          </div>
        </Card>

        <Card title="Tabel Jadwal Mingguan" subtitle="Referensi petugas jimpitan per hari (Ahad - Sabtu)">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Hari</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Petugas Terjadwal</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {weeklyGroups.map((day) => (
                  <tr key={day.id} className="bg-[var(--surface)]">
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{day.label}</td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                      {day.members.length > 0 ? day.members.map((person) => person.nama).join(', ') : 'Belum ada petugas'}
                    </td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">{day.members.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
