'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import FormJimpitan from './FormJimpitan';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { JimpitanListItem, JimpitanScheduleData } from '@/types';

type FilterStatus = 'semua' | 'belum' | 'lunas' | 'kosong';

const WEEKLY_SCHEDULE_DAYS = [
  { key: 'ahad', label: 'Ahad' },
  { key: 'senin', label: 'Senin' },
  { key: 'selasa', label: 'Selasa' },
  { key: 'rabu', label: 'Rabu' },
  { key: 'kamis', label: 'Kamis' },
  { key: 'jumat', label: "Jum'at" },
  { key: 'sabtu', label: 'Sabtu' }
] as const;

export default function JimpitanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<JimpitanListItem[]>([]);
  const [selected, setSelected] = useState<JimpitanListItem | null>(null);
  const [error, setError] = useState('');
  const [setorLoading, setSetorLoading] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('semua');

  const [topupWargaId, setTopupWargaId] = useState('');
  const [topupNominal, setTopupNominal] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: 'success' | 'error' | 'warning' }>>([]);
  const [editTarget, setEditTarget] = useState<JimpitanListItem | null>(null);
  const [editNominal, setEditNominal] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [scheduleData, setScheduleData] = useState<JimpitanScheduleData | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);

  const pushToast = useCallback((message: string, kind: 'success' | 'error' | 'warning' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const operationalDate = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const date = new Date(now);
    // Operational day ends at 12:00 (noon) the next day
    if (hour < 12) {
      date.setDate(date.getDate() - 1);
    }
    return date.toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }, []);

  const loadList = useCallback(async () => {
    try {
      setError('');
      const result = await apiFetch<{ success: boolean; data: JimpitanListItem[] }>('/jimpitan/list');
      setItems(result.data || []);
      setTopupWargaId((previous) => {
        const rows = result.data || [];
        if (previous && rows.some((row) => String(row.id) === String(previous))) {
          return previous;
        }
        return rows[0]?.id ? String(rows[0].id) : '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data jimpitan');
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      setScheduleLoading(true);
      const result = await apiFetch<{ success: boolean; data: JimpitanScheduleData }>('/jimpitan/schedule');
      setScheduleData(result.data);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal memuat jadwal jimpitan', 'error');
    } finally {
      setScheduleLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadList();
      void loadSchedule();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadList, loadSchedule]);

  const recapData = useMemo(() => {
    const normalizedUserName = String(user?.nama || '').trim().toLowerCase();
    const stats = { lunas: 0, kosong: 0, belum: 0 };
    const petugasBreakdown: Record<string, number> = {};
    let totalSemuaTunai = 0;
    let totalTunaiSaya = 0;
    let sayaPernahInputHariIni = false;

    items.forEach((row) => {
      if (row.isLunas && row.nominalTerbayar > 0) stats.lunas += 1;
      else if (row.isLunas) stats.kosong += 1;
      else stats.belum += 1;

      const marker = String(row.namaPetugas || '').toLowerCase();
      const isDeposit = marker === 'deposit' || marker === 'sistem (saldo)';
      const namaPetugas = String(row.namaPetugas || '').trim();
      const nominal = Number(row.nominalTerbayar || 0);
      const isTunai = row.isLunas && nominal > 0 && !isDeposit && namaPetugas !== '';

      if (namaPetugas && !isDeposit && marker === normalizedUserName) {
        sayaPernahInputHariIni = true;
      }

      if (!isTunai) return;

      totalSemuaTunai += nominal;
      petugasBreakdown[namaPetugas] = (petugasBreakdown[namaPetugas] || 0) + nominal;
      if (marker === normalizedUserName) {
        totalTunaiSaya += nominal;
      }
    });

    return {
      ...stats,
      totalSemuaTunai,
      totalTunaiSaya,
      sayaPernahInputHariIni,
      petugasBreakdown
    };
  }, [items, user?.nama]);

  const canKirimRekap = recapData.sayaPernahInputHariIni;
  const canSetor = recapData.totalTunaiSaya > 0;

  const filteredItems = useMemo(() => {
    switch (filter) {
      case 'belum':
        return items.filter((row) => !row.isLunas);
      case 'lunas':
        return items.filter((row) => row.isLunas && row.nominalTerbayar > 0);
      case 'kosong':
        return items.filter((row) => row.isLunas && row.nominalTerbayar === 0);
      default:
        return items;
    }
  }, [items, filter]);

  async function submitInput(nominal: number) {
    if (!selected) return;
    try {
      await apiFetch('/jimpitan/input', {
        method: 'POST',
        body: JSON.stringify({ warga_id: selected.id, nominal })
      });
      await loadList();
      setSelected(null);
      pushToast('Input jimpitan berhasil disimpan.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal input jimpitan';
      pushToast(message, 'error');
    }
  }

  async function handleSetor() {
    if (!canSetor) {
      pushToast('Belum ada uang tunai yang bisa disetor.', 'warning');
      return;
    }

    if (!window.confirm(`Setorkan dana ${formatRupiah(recapData.totalTunaiSaya)} ke Admin Jimpitan?`)) {
      return;
    }

    try {
      setSetorLoading(true);
      await apiFetch('/jimpitan/setor', { method: 'POST', body: JSON.stringify({}) });
      await loadList();
      pushToast('Setor jimpitan berhasil diajukan. Menunggu approval.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Setor gagal', 'error');
    } finally {
      setSetorLoading(false);
    }
  }

  function handleKirimRekapWA() {
    if (!canKirimRekap) {
      pushToast('Hanya petugas yang input pada hari operasional ini yang bisa kirim rekap WA.', 'warning');
      return;
    }

    if (!items.length) {
      pushToast('Data warga tidak ditemukan.', 'warning');
      return;
    }

    const d = new Date();
    if (d.getHours() < 18) d.setDate(d.getDate() - 1);
    const tglHeader = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(d);

    let totalTunai = 0;
    let wargaTunai = 0;
    let wargaBelum = 0;
    let wargaKosong = 0;
    let wargaDeposit = 0;

    let pesan = '📝 *REKAP JIMPITAN WARGA*\\n';
    pesan += `📅 *${tglHeader}*\\n`;
    pesan += '━━━━━━━━━━━━━━━\\n';

    items.forEach((w, index) => {
      const marker = String(w.namaPetugas || '').toLowerCase();
      const isDeposit = marker === 'deposit' || marker === 'sistem (saldo)';

      pesan += `${index + 1}. *${w.nama.toUpperCase()}*\\n`;
      if (w.isLunas) {
        if (isDeposit) {
          pesan += '      └─ 🏦 _Lunas (Deposit)_\\n';
          wargaDeposit += 1;
        } else if (Number(w.nominalTerbayar || 0) > 0) {
          pesan += `      └─ ✅ ${formatRupiah(w.nominalTerbayar)}\\n`;
          totalTunai += Number(w.nominalTerbayar || 0);
          wargaTunai += 1;
        } else {
          pesan += '      └─ ⚪ _Kosong_\\n';
          wargaKosong += 1;
        }
      } else {
        pesan += '      └─ 🔴 _Belum_\\n';
        wargaBelum += 1;
      }
    });

    pesan += '\\n━━━━━━━━━━━━━━━\\n';
    pesan += `💰 *TOTAL TUNAI: ${formatRupiah(totalTunai)}*\\n`;
    pesan += '👥 *DETAIL PETUGAS:*\\n';
    Object.entries(recapData.petugasBreakdown)
      .sort((a, b) => a[0].localeCompare(b[0], 'id'))
      .forEach(([namaPetugas, subtotal]) => {
        pesan += `   • ${namaPetugas}: ${formatRupiah(subtotal)}\\n`;
      });
    pesan += '📊 *STATISTIK:*\\n';
    pesan += `   ✅ Lunas (Tunai): ${wargaTunai}\\n`;
    pesan += `   🏦 Lunas (Deposit): ${wargaDeposit}\\n`;
    pesan += `   ⚪ Kosong: ${wargaKosong}\\n`;
    pesan += `   🔴 Belum: ${wargaBelum}\\n`;
    pesan += '━━━━━━━━━━━━━━━\\n';
    pesan += `_Dilaporkan oleh: ${user?.nama || 'Petugas'}_\\n`;

    if (navigator.share) {
      navigator
        .share({
          title: 'Rekap Jimpitan',
          text: pesan
        })
        .catch(() => {
          /* user cancelled share */
        });
      return;
    }

    const nomorAdmin = process.env.NEXT_PUBLIC_WA_ADMIN || '628561186917';
    const urlWA = `https://api.whatsapp.com/send?phone=${nomorAdmin}&text=${encodeURIComponent(pesan)}`;
    window.open(urlWA, '_blank');
    pushToast('Browser tidak mendukung share. Dialihkan ke WA Admin.', 'success');
  }

  async function handleTopup() {
    const selectedWarga = items.find((row) => String(row.id) === String(topupWargaId));
    const wargaId = selectedWarga?.id;
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
        body: JSON.stringify({
          warga_id: wargaId,
          nominal
        })
      });
      setTopupNominal('');
      await loadList();
      pushToast('Top up saldo berhasil.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Top up gagal', 'error');
    } finally {
      setTopupLoading(false);
    }
  }

  async function handleSaveEditNominal() {
    if (!editTarget) return;
    const nominal = Number(editNominal);
    if (!Number.isFinite(nominal) || nominal < 0) {
      pushToast('Nominal edit tidak valid.', 'warning');
      return;
    }

    try {
      setEditLoading(true);
      await apiFetch('/jimpitan/edit-nominal', {
        method: 'POST',
        body: JSON.stringify({
          warga_id: editTarget.id,
          nominal
        })
      });
      await loadList();
      pushToast(`Nominal jimpitan ${editTarget.nama} berhasil diperbarui.`, 'success');
      setEditTarget(null);
      setEditNominal('');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal edit nominal', 'error');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleSetPetugasShift(userId: number, value: string) {
    const shiftHari = value === '' ? null : Number(value);
    try {
      await apiFetch('/jimpitan/set-petugas-shift', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          shift_hari: shiftHari
        })
      });
      await loadSchedule();
      pushToast('Jadwal petugas berhasil diperbarui.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal update jadwal petugas', 'error');
    }
  }

  function handleCardClick(row: JimpitanListItem) {
    if (row.isLunas) return;
    const roles = (user?.roles || []).map((role) => String(role).trim().toLowerCase());
    const isRoot = roles.includes('root');
    
    // Input only allowed between 21:00 - 06:00
    const hour = new Date().getHours();
    const isOperationalHour = hour >= 21 || hour < 6;

    if (!isRoot && !isOperationalHour) {
      pushToast('JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00 untuk non-admin.', 'warning');
      return;
    }

    setSelected(row);
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-20 md:pb-10">
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

      <div className="sticky top-[73px] z-40 border-b border-[var(--line)] bg-[var(--surface-strong)]/95 backdrop-blur-lg px-4 py-3 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Operasional</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{operationalDate}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-[10px] font-medium text-[var(--text-muted)]">Belum</p>
                <p className="text-lg font-bold text-red-600">{recapData.belum}</p>
              </div>
              <div className="h-8 w-px bg-[var(--line)]" />
              <div className="text-center">
                <p className="text-[10px] font-medium text-[var(--text-muted)]">Lunas</p>
                <p className="text-lg font-bold text-emerald-600">{recapData.lunas}</p>
              </div>
              <div className="h-8 w-px bg-[var(--line)]" />
              <div className="text-center">
                <p className="text-[10px] font-medium text-[var(--text-muted)]">Kosong</p>
                <p className="text-lg font-bold text-[var(--text-muted)]">{recapData.kosong}</p>
              </div>
              <div className="h-8 w-px bg-[var(--line)]" />
              <div className="text-center">
                <p className="text-[10px] font-medium text-[var(--text-muted)]">Pendapatan</p>
                <p className="text-lg font-bold text-blue-600">{formatRupiah(recapData.totalSemuaTunai)}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['semua', 'belum', 'lunas', 'kosong'] as FilterStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 min-w-[80px] rounded-full px-3 py-1.5 text-xs font-semibold text-center transition ${
                  filter === f
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:shadow-sm'
                }`}
              >
                {f === 'semua' ? `Semua (${items.length})` :
                 f === 'belum' ? `Belum (${recapData.belum})` :
                 f === 'lunas' ? `Lunas (${recapData.lunas})` :
                 `Kosong (${recapData.kosong})`}
              </button>
            ))}
          </div>
      </div>
    </div>

      {/* Buttons placed above the card warga list */}
      <div className="mx-auto mt-4 w-full max-w-6xl space-y-4 px-4 md:px-6">
        <div className="flex gap-3 pt-4">
          <Button
            variant="ghost"
            className="flex-1 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 transition hover:bg-green-100 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleKirimRekapWA}
            disabled={!canKirimRekap}
          >
            <span className="mr-2">📤</span>
            Kirim Rekap WA
          </Button>
          
          <Button
            onClick={handleSetor}
            disabled={setorLoading || !canSetor}
            className="flex-1 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {setorLoading ? (
              <span>Memproses...</span>
            ) : (
              <span>
                <span className="mr-2">💰</span>
                {canSetor ? `Setor ${formatRupiah(recapData.totalTunaiSaya)}` : 'Setor'}
              </span>
            )}
          </Button>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-primary)]">
          <p>Total pendapatan tunai semua petugas hari ini: <b>{formatRupiah(recapData.totalSemuaTunai)}</b></p>
          <p className="mt-1">
            Porsi setor Anda: <b>{formatRupiah(recapData.totalTunaiSaya)}</b> {canKirimRekap ? '' : '(Anda belum input pada hari operasional ini)'}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-6xl space-y-4 px-4 md:px-6">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {isAdminJimpitan ? (
          <Card title="Top Up Saldo Warga" subtitle="Khusus Admin Jimpitan / root">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm font-semibold">
                <span>Pilih Warga</span>
                <select
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                  value={topupWargaId}
                  onChange={(event) => setTopupWargaId(event.target.value)}
                >
                  {items.map((row) => (
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
                <Button
                  className="w-full"
                  onClick={handleTopup}
                  disabled={topupLoading}
                >
                  {topupLoading ? 'Menyimpan...' : 'Simpan Top Up'}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card
          title="Jadwal Petugas 1 Minggu"
          subtitle={isAdminJimpitan ? 'Atur shift mingguan petugas dari database' : 'Jadwal operasional mingguan'}
        >
          <div className="space-y-3">
            {scheduleLoading ? <p className="text-sm text-[var(--text-muted)]">Memuat jadwal...</p> : null}
            {scheduleData?.petugas?.map((petugas) => (
              <div key={petugas.id} className="grid items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 md:grid-cols-[1fr,180px]">
                <p className="text-sm font-semibold">{petugas.nama}</p>
                <select
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm"
                  value={petugas.jimpitan_shift_hari ?? ''}
                  disabled={!isAdminJimpitan}
                  onChange={(event) => void handleSetPetugasShift(petugas.id, event.target.value)}
                >
                  <option value="">Belum diatur</option>
                  {WEEKLY_SCHEDULE_DAYS.map((day, index) => (
                    <option key={day.key} value={index + 1}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
            Daftar Warga ({filteredItems.length})
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((row) => {
              const marker = String(row.namaPetugas || '').toLowerCase();
              const canEditByAdmin =
                isAdminJimpitan &&
                row.isLunas &&
                marker !== 'deposit' &&
                marker !== 'sistem (saldo)' &&
                row.namaPetugas &&
                row.canEditNominal === true;
              const statusTag = row.detailStatus || row.batchStatus || '';
              const statusLabel =
                statusTag === 'APPROVED'
                  ? 'APPROVED'
                  : row.batchStatus === 'PENDING'
                    ? 'PENDING APPROVAL'
                    : row.detailStatus === 'SUBMITTED'
                      ? 'SUBMITTED'
                      : row.detailStatus === 'DRAFT'
                        ? 'DRAFT'
                        : '';

              return (
                <article
                  key={row.id}
                  onClick={!row.isLunas ? () => handleCardClick(row) : undefined}
                  className={`rounded-2xl border p-3 text-left transition ${
                    row.isLunas && Number(row.nominalTerbayar || 0) > 0
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : row.isLunas
                        ? 'border-slate-300 bg-slate-100/80'
                        : 'cursor-pointer border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)] hover:shadow-lg'
                  }`}
                >
                <div className="flex items-start justify-between gap-1">
                  <p className="font-semibold text-sm leading-tight">{row.nama}</p>
                  {statusLabel ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide whitespace-nowrap ${
                        statusLabel === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : statusLabel === 'PENDING APPROVAL'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Saran: {formatRupiah(row.nominalSaran)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Saldo Bulan Ini: {formatRupiah(row.saldo)}</p>
                {canEditByAdmin ? (
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      className="w-full text-xs py-1"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditTarget(row);
                        setEditNominal(String(Number(row.nominalTerbayar || 0)));
                      }}
                    >
                      Edit Nominal
                    </Button>
                  </div>
                ) : isAdminJimpitan && row.isLunas && row.namaPetugas ? (
                  <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                    APPROVED
                  </p>
                ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <FormJimpitan selected={selected} onSubmit={submitInput} onClose={() => setSelected(null)} />

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md rounded-3xl p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Admin Jimpitan</p>
            <h3 className="mt-2 font-[var(--font-space-grotesk)] text-2xl font-bold">Edit Nominal</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{editTarget.nama}</p>

            <div className="mt-4">
              <Input
                label="Nominal Baru"
                type="number"
                min={0}
                value={editNominal}
                onChange={(event) => setEditNominal(event.target.value)}
              />
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                className="flex-1"
                onClick={() => void handleSaveEditNominal()}
                disabled={editLoading || editNominal.trim() === ''}
              >
                {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  if (editLoading) return;
                  setEditTarget(null);
                  setEditNominal('');
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
