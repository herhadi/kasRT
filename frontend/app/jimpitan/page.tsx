'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import FeedbackToast from '@/components/ui/FeedbackToast';
import FormJimpitan from './FormJimpitan';
import OperationalStickySummary from '@/components/operational/OperationalStickySummary';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { JimpitanListItem } from '@/types';

type FilterStatus = 'semua' | 'belum' | 'lunas' | 'kosong';

export default function JimpitanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<JimpitanListItem[]>([]);
  const [selected, setSelected] = useState<JimpitanListItem | null>(null);
  const [error, setError] = useState('');
  const [setorLoading, setSetorLoading] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('semua');
  const [canOperateToday, setCanOperateToday] = useState(true);

  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: 'success' | 'error' | 'warning' }>>([]);
  const [editTarget, setEditTarget] = useState<JimpitanListItem | null>(null);
  const [editNominal, setEditNominal] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [routeOrder, setRouteOrder] = useState<string[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
  const [activeMoveId, setActiveMoveId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingRoute, setSavingRoute] = useState(false);
  const pressTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

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
      const result = await apiFetch<{ success: boolean; data: JimpitanListItem[]; can_operate_today?: boolean }>('/jimpitan/list');
      setItems(result.data || []);
      setCanOperateToday(Boolean(result.can_operate_today ?? true));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data jimpitan');
    }
  }, []);

  const normalizeRouteOrder = useCallback((rawOrder: string[], rows: JimpitanListItem[]) => {
    const allIds = rows.map((row) => String(row.id));
    const uniqueValid = rawOrder.filter((id, idx) => allIds.includes(id) && rawOrder.indexOf(id) === idx);
    const missing = allIds.filter((id) => !uniqueValid.includes(id));
    return [...uniqueValid, ...missing];
  }, []);

  const loadRouteOrder = useCallback(async (rows: JimpitanListItem[]) => {
    try {
      const result = await apiFetch<{ success: boolean; data: { ordered_warga_ids: string[] } }>('/jimpitan/route-order');
      const ordered = normalizeRouteOrder((result.data?.ordered_warga_ids || []).map((id) => String(id)), rows);
      setRouteOrder(ordered);
    } catch {
      const fallback = rows.map((row) => String(row.id));
      setRouteOrder(fallback);
    }
  }, [normalizeRouteOrder]);

  const saveRouteOrder = useCallback(async (orderedIds: string[]) => {
    try {
      setSavingRoute(true);
      await apiFetch('/jimpitan/route-order', {
        method: 'POST',
        body: JSON.stringify({ ordered_warga_ids: orderedIds })
      });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal menyimpan urutan rute', 'error');
    } finally {
      setSavingRoute(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await apiFetch<{ success: boolean; data: JimpitanListItem[]; can_operate_today?: boolean }>('/jimpitan/list');
          const rows = result.data || [];
          setItems(rows);
          setCanOperateToday(Boolean(result.can_operate_today ?? true));
          await loadRouteOrder(rows);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Gagal memuat data jimpitan');
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadRouteOrder]);

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

  const orderedItems = useMemo(() => {
    const orderMap = new Map(routeOrder.map((id, idx) => [String(id), idx]));
    return [...filteredItems].sort((a, b) => {
      const ai = orderMap.has(String(a.id)) ? (orderMap.get(String(a.id)) as number) : Number.MAX_SAFE_INTEGER;
      const bi = orderMap.has(String(b.id)) ? (orderMap.get(String(b.id)) as number) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return String(a.nama).localeCompare(String(b.nama), 'id');
    });
  }, [filteredItems, routeOrder]);

  async function submitInput(nominal: number) {
    if (!selected) return;
    try {
      await apiFetch('/jimpitan/input', {
        method: 'POST',
        body: JSON.stringify(
          selected.target_type === 'DONATUR' && selected.external_participant_id
            ? { target_type: 'DONATUR', external_participant_id: selected.external_participant_id || String(selected.id).replace(/^DONATUR:/, ''), nominal }
            : { target_type: 'WARGA', warga_id: selected.id, nominal }
        )
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

  async function handleKirimRekapBulananWA() {
    if (!isAdminJimpitan) {
      pushToast('Fitur ini khusus Admin Jimpitan.', 'warning');
      return;
    }
    const month = new Date().toISOString().slice(0, 7);
    try {
      const res = await apiFetch<{
        success: boolean;
        month: string;
        data: {
          days: Array<{ tanggal: string; total_nominal: number; total_rumah: number; total_petugas: number }>;
        };
      }>(`/jimpitan/daily-recap?month=${encodeURIComponent(month)}`);

      const rows = res.data?.days || [];
      if (rows.length === 0) {
        pushToast(`Belum ada rekap harian untuk ${month}.`, 'warning');
        return;
      }

      const [yearStr, monthStr] = month.split('-');
      const yearNum = Number(yearStr);
      const monthNum = Number(monthStr);
      const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric'
      });

      const rawDayLines = rows.map((r) => {
        const date = new Date(`${r.tanggal}T00:00:00`);
        const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
        const dayNum = date.getDate();
        const nominalOnly = Number(r.total_nominal || 0).toLocaleString('id-ID');
        return {
          left: `• ${dayName}, ${dayNum}`,
          right: nominalOnly
        };
      });
      const maxLeft = rawDayLines.reduce((max, line) => Math.max(max, line.left.length), 0);
      const maxRight = rawDayLines.reduce((max, line) => Math.max(max, line.right.length), 0);
      const dayLines = rawDayLines.map((line) => `${line.left.padEnd(maxLeft, ' ')} : Rp ${line.right.padStart(maxRight, ' ')}`);

      let pesan = `🗓️ *REKAP JIMPITAN ${monthLabel}*\n`;
      pesan += '━━━━━━━━━━━━━━━\n';
      let grandTotal = 0;
      rows.forEach((r) => {
        grandTotal += Number(r.total_nominal || 0);
      });
      pesan += '```\n';
      pesan += `${dayLines.join('\n')}\n`;
      pesan += '```\n';
      pesan += '━━━━━━━━━━━━━━━\n';
      pesan += `💰 *TOTAL BULANAN: ${formatRupiah(grandTotal)}*`;

      if (navigator.share) {
        navigator.share({ title: `Rekap Jimpitan ${month}`, text: pesan }).catch(() => {});
        return;
      }
      const nomorAdmin = process.env.NEXT_PUBLIC_WA_ADMIN || '628561186917';
      window.open(`https://api.whatsapp.com/send?phone=${nomorAdmin}&text=${encodeURIComponent(pesan)}`, '_blank');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal menyiapkan rekap bulanan', 'error');
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

    let pesan = '📝 *REKAP JIMPITAN WARGA*\n';
    pesan += `📅 *${tglHeader}*\n`;
    pesan += '━━━━━━━━━━━━━━━\n';

    items.forEach((w, index) => {
      const marker = String(w.namaPetugas || '').toLowerCase();
      const isDeposit = marker === 'deposit' || marker === 'sistem (saldo)';

      pesan += `${index + 1}. *${w.nama.toUpperCase()}*\n`;
      if (w.isLunas) {
        if (isDeposit) {
          pesan += '      └─ 🏦 _Lunas (Deposit)_\n';
          wargaDeposit += 1;
        } else if (Number(w.nominalTerbayar || 0) > 0) {
          pesan += `      └─ ✅ ${formatRupiah(w.nominalTerbayar)}\n`;
          totalTunai += Number(w.nominalTerbayar || 0);
          wargaTunai += 1;
        } else {
          pesan += '      └─ ⚪ _Kosong_\n';
          wargaKosong += 1;
        }
      } else {
        pesan += '      └─ 🔴 _Belum_\n';
        wargaBelum += 1;
      }
    });

    pesan += '\n━━━━━━━━━━━━━━━\n';
    pesan += `💰 *TOTAL TUNAI: ${formatRupiah(totalTunai)}*\n`;
    pesan += '👥 *DETAIL PETUGAS:*\n';
    Object.entries(recapData.petugasBreakdown)
      .sort((a, b) => a[0].localeCompare(b[0], 'id'))
      .forEach(([namaPetugas, subtotal]) => {
        pesan += `   • ${namaPetugas}: ${formatRupiah(subtotal)}\n`;
      });
    pesan += '📊 *STATISTIK:*\n';
    pesan += `   ✅ Lunas (Tunai): ${wargaTunai}\n`;
    pesan += `   🏦 Lunas (Deposit): ${wargaDeposit}\n`;
    pesan += `   ⚪ Kosong: ${wargaKosong}\n`;
    pesan += `   🔴 Belum: ${wargaBelum}\n`;
    pesan += '━━━━━━━━━━━━━━━\n';
    pesan += `_Dilaporkan oleh: ${user?.nama || 'Petugas'}_\n`;

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

  async function handleSaveEditNominal() {
    if (!editTarget) return;
    const nominal = parseRupiahInput(editNominal);
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

  useEffect(() => {
    if (!items.length) {
      setRouteOrder([]);
      return;
    }
    setRouteOrder((prev) => normalizeRouteOrder(prev, items));
  }, [items, normalizeRouteOrder]);

  function clearPressTimer() {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function startPressToReorder(rowId: string) {
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      setReorderMode(true);
      setActiveMoveId(rowId);
      pushToast('Mode atur rute aktif. Ketuk kartu lain untuk memindahkan urutan.', 'success');
    }, 3000);
  }

  function moveActiveCardToTarget(targetId: string) {
    if (!activeMoveId || activeMoveId === targetId) return;
    const current = normalizeRouteOrder(routeOrder, items);
    const fromIndex = current.indexOf(activeMoveId);
    const toIndex = current.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setRouteOrder(next);
    void saveRouteOrder(next);
    setActiveMoveId(targetId);
  }

  function moveCard(dragId: string, targetId: string) {
    if (!dragId || !targetId || dragId === targetId) return;
    const current = normalizeRouteOrder(routeOrder, items);
    const fromIndex = current.indexOf(dragId);
    const toIndex = current.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setRouteOrder(next);
    void saveRouteOrder(next);
    setActiveMoveId(targetId);
  }

  function stopReorderMode() {
    setReorderMode(false);
    setActiveMoveId(null);
    setDraggingId(null);
  }

  function handleCardClick(row: JimpitanListItem) {
    if (reorderMode) {
      moveActiveCardToTarget(String(row.id));
      return;
    }
    if (row.isLunas) return;
    const roles = (user?.roles || []).map((role) => String(role).trim().toLowerCase());
    const isRoot = roles.includes('root');
    
    // Input only allowed between 21:00 - 06:00
    const hour = new Date().getHours();
    const isOperationalHour = hour >= 21 || hour < 6;

    if (!isRoot && !isOperationalHour) {
      pushToast('JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00', 'warning');
      return;
    }
    if (!isRoot && !canOperateToday) {
      pushToast('Bukan jadwal Anda hari ini.', 'warning');
      return;
    }

    setSelected(row);
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-20 md:pb-10">
      <FeedbackToast error={error} />
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

      <Navbar sticky={false} />

      <div className="mx-auto mt-4 w-full max-w-6xl px-4 md:px-6">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">Operasional</p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{operationalDate}</p>
        </div>
      </div>

      <OperationalStickySummary
        className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-6xl md:w-[calc(100%-3rem)]"
        items={[
          { label: 'Masuk', value: formatRupiah(recapData.totalSemuaTunai), tone: 'sky' },
          { label: 'Setor Saya', value: formatRupiah(recapData.totalTunaiSaya), tone: 'emerald' },
          { label: 'Belum', value: `${recapData.belum} warga`, tone: 'rose' }
        ]}
      />

      <div className="mx-auto mt-3 w-full max-w-6xl px-4 md:px-6">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
            {(['semua', 'belum', 'lunas', 'kosong'] as FilterStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-center transition ${
                  filter === f
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]'
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
        <div className="flex flex-wrap gap-3 pt-4">
          <Button
            variant="ghost"
            className="btn-action-green min-w-[170px] flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleKirimRekapWA}
            disabled={!canKirimRekap}
          >
            <span className="mr-2">📤</span>
            Kirim Rekap WA
          </Button>
          {isAdminJimpitan ? (
            <Button
              variant="ghost"
              className="btn-action-blue min-w-[170px] flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition hover:shadow-md"
              onClick={() => void handleKirimRekapBulananWA()}
            >
              <span className="mr-2">🗓️</span>
              Kirim Rekap Bulanan WA
            </Button>
          ) : null}
          
          <Button
            variant="ghost"
            onClick={handleSetor}
            disabled={setorLoading || !canSetor}
            className="btn-action-blue min-w-[170px] flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Tips rute: tahan kartu warga 3 detik untuk aktifkan mode atur rute. Kartu akan bergoyang, lalu seret (drag) kartu ke posisi tujuan.
          </p>
          {reorderMode ? (
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                className="rounded-xl px-3 py-1.5 text-xs"
                onClick={stopReorderMode}
              >
                Selesai Atur Rute
              </Button>
              <span className="text-[11px] text-[var(--text-muted)]">
                {savingRoute ? 'Menyimpan urutan...' : 'Urutan rute tersimpan otomatis'}
              </span>
            </div>
          ) : null}
        </div>

      </div>

      <div className="mx-auto mt-4 w-full max-w-6xl space-y-4 px-4 md:px-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
            Daftar Warga ({orderedItems.length})
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orderedItems.map((row) => {
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
                  onPointerDown={() => startPressToReorder(String(row.id))}
                  onPointerUp={clearPressTimer}
                  onPointerLeave={clearPressTimer}
                  draggable={reorderMode}
                  onDragStart={(event) => {
                    if (!reorderMode) return;
                    const id = String(row.id);
                    setDraggingId(id);
                    setActiveMoveId(id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', id);
                  }}
                  onDragOver={(event) => {
                    if (!reorderMode || !draggingId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    if (!reorderMode) return;
                    event.preventDefault();
                    const dragId = event.dataTransfer.getData('text/plain') || draggingId;
                    moveCard(String(dragId), String(row.id));
                    setDraggingId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    row.isLunas && Number(row.nominalTerbayar || 0) > 0
                      ? 'card-status-paid'
                      : row.isLunas
                        ? 'card-status-empty'
                        : 'card-status-unpaid cursor-pointer hover:shadow-lg'
                  } ${reorderMode ? 'wiggle-card' : ''} ${activeMoveId === String(row.id) ? 'ring-2 ring-[var(--accent)]' : ''} ${draggingId === String(row.id) ? 'opacity-60' : ''}`}
                >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm leading-tight">{row.nama}</p>
                    {row.target_type === 'DONATUR' ? (
                      <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        Donatur
                      </span>
                    ) : null}
                  </div>
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
                <p className="mt-2 text-xs text-[var(--text-muted)]">Saran: {formatRupiah(row.nominalSaran)}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Input Hari Ini:{' '}
                  {row.isLunas
                    ? `${formatRupiah(Number(row.nominalTerbayar || 0))} • ${
                        row.namaPetugas ? `oleh ${row.namaPetugas}` : 'petugas tidak tercatat'
                      }`
                    : 'Belum diinput'}
                </p>
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
                type="text"
                inputMode="numeric"
                value={formatRupiahInput(editNominal)}
                onChange={(event) => setEditNominal(event.target.value)}
                placeholder="Contoh: 1.500"
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
