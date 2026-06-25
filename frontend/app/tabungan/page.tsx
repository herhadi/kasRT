'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import FeedbackToast from '@/components/ui/FeedbackToast';
import MemberActionButtons from '@/components/ui/MemberActionButtons';
import WargaContributionModal from '@/components/contribution/WargaContributionModal';
import PaginationControls from '@/components/pagination/PaginationControls';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import usePagination from '@/lib/hooks/usePagination';

type TabunganWargaItem = {
  warga_id: string;
  nama: string;
  total_balance: number;
};

type TabunganMember = { warga_id: string; nama: string; is_active: boolean };
type TabunganTariff = { id: string; effective_month: string; monthly_fee: number };

type TabunganHistoryItem = {
  id: string;
  warga_id: string;
  nama: string;
  tx_type: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  status: string;
  created_at: string;
};

export default function TabunganPage() {
  const { user, token, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const inputPageMode = pathname === '/operasional/tabungan/input';
  const settingMode = pathname === '/operasional/tabungan/setting';
  const canWrite = hasAnyRole(user, ['Admin Pembangunan', 'root']);
  const [rows, setRows] = useState<TabunganWargaItem[]>([]);
  const [historyRows, setHistoryRows] = useState<TabunganHistoryItem[]>([]);
  const [selected, setSelected] = useState<TabunganWargaItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [historyMonth, setHistoryMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [statusFilter, setStatusFilter] = useState<'semua' | 'sudah' | 'belum'>('semua');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePerWargaAmount, setExpensePerWargaAmount] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [minimumFee, setMinimumFee] = useState(5000);
  const [members, setMembers] = useState<TabunganMember[]>([]);
  const [tariffs, setTariffs] = useState<TabunganTariff[]>([]);
  const [tariffMonth, setTariffMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tariffValue, setTariffValue] = useState('');
  const PAGE_SIZE = 20;
  const [tabunganTotals, setTabunganTotals] = useState({
    total_saldo_warga: 0,
    sisa_kas_kegiatan: 0,
    total_kas_dana: 0
  });

  const loadSummary = useCallback(async () => {
    const result = await apiFetch<{
      success: boolean;
      data: TabunganWargaItem[];
      minimum_fee?: number;
      total_saldo_warga?: number;
      sisa_kas_kegiatan?: number;
      total_kas_dana?: number;
    }>('/tabungan/summary');
    setRows(result.data || []);
    setMinimumFee(Number(result.minimum_fee || 5000));
    setTabunganTotals({
      total_saldo_warga: Number(result.total_saldo_warga || 0),
      sisa_kas_kegiatan: Number(result.sisa_kas_kegiatan || 0),
      total_kas_dana: Number(result.total_kas_dana || 0)
    });
  }, []);

  const loadSettings = useCallback(async () => {
    const [memberResult, tariffResult] = await Promise.all([
      apiFetch<{ success: boolean; data: TabunganMember[] }>('/tabungan/members'),
      apiFetch<{ success: boolean; data: TabunganTariff[] }>('/tabungan/tariffs')
    ]);
    setMembers(memberResult.data || []);
    setTariffs(tariffResult.data || []);
  }, []);

  const loadHistory = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: TabunganHistoryItem[] }>(
      `/tabungan/history?month=${encodeURIComponent(historyMonth)}`
    );
    setHistoryRows(result.data || []);
  }, [historyMonth]);

  useEffect(() => {
    if (authLoading || !user || !token) return;
    setLoading(true);
    Promise.all([loadSummary(), loadHistory(), ...(settingMode ? [loadSettings()] : [])])
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat tabungan'))
      .finally(() => setLoading(false));
  }, [authLoading, user, token, loadSummary, loadHistory, loadSettings, settingMode]);

  const totalTabungan = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.total_balance || 0), 0),
    [rows]
  );
  const totalMutasiBulan = useMemo(
    () =>
      historyRows.reduce((sum, row) => {
        const nominal = Number(row.amount || 0);
        return sum + (row.direction === 'CREDIT' ? nominal : -nominal);
      }, 0),
    [historyRows]
  );
  const expenseActualAmount = useMemo(() => parseRupiahInput(expenseAmount), [expenseAmount]);
  const expenseActiveWargaCount = rows.length;
  const expenseSuggestedPerWarga = expenseActiveWargaCount > 0 ? expenseActualAmount / expenseActiveWargaCount : 0;
  const expenseFinalPerWarga = parseRupiahInput(expensePerWargaAmount);
  const expenseChargedTotal = expenseFinalPerWarga * expenseActiveWargaCount;
  const expenseSurplus = expenseChargedTotal - expenseActualAmount;
  const monthlyCreditByWarga = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of historyRows) {
      if (row.direction !== 'CREDIT') continue;
      const key = String(row.warga_id);
      map[key] = (map[key] || 0) + Number(row.amount || 0);
    }
    return map;
  }, [historyRows]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter === 'semua') return true;
        if (statusFilter === 'sudah') return Number(monthlyCreditByWarga[String(row.warga_id)] || 0) > 0;
        return Number(monthlyCreditByWarga[String(row.warga_id)] || 0) <= 0;
      }),
    [rows, statusFilter, monthlyCreditByWarga]
  );
  const inputRows = useMemo(() => rows, [rows]);
  const debitRows = useMemo(() => historyRows.filter((r) => r.direction === 'DEBIT'), [historyRows]);
  const historyPager = usePagination(historyRows, PAGE_SIZE);
  const expensePager = usePagination(debitRows, PAGE_SIZE);
  const selectedLive = useMemo(
    () => (selected ? rows.find((r) => String(r.warga_id) === String(selected.warga_id)) || selected : null),
    [rows, selected]
  );
  const filterCounts = useMemo(() => {
    const sudah = rows.filter((row) => Number(monthlyCreditByWarga[String(row.warga_id)] || 0) > 0).length;
    const belum = rows.length - sudah;
    return { semua: rows.length, sudah, belum };
  }, [rows, monthlyCreditByWarga]);
  useEffect(() => {
    historyPager.reset();
    expensePager.reset();
  }, [historyMonth]);

  async function submitSetoran(amount: number) {
    if (!selected || !user || !token) return;
    if (!Number.isFinite(amount) || amount < minimumFee) {
      setError(`Nominal minimal ${formatRupiah(minimumFee)}`);
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/tabungan/setor', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          warga_id: selected.warga_id,
          amount,
          description: `Setoran tabungan ${selected.nama}`
        })
      });
      setSelected(null);
      setMessage('Setoran tabungan berhasil dicatat.');
      await Promise.all([loadSummary(), loadHistory()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan setoran tabungan');
    } finally {
      setBusy(false);
    }
  }

  async function setMemberActive(wargaId: string, isActive: boolean) {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/tabungan/members/set-active', { method: 'POST', body: JSON.stringify({ warga_id: wargaId, is_active: isActive }) });
      setMessage(isActive ? 'Warga diaktifkan sebagai anggota tabungan.' : 'Warga dinonaktifkan dari anggota tabungan.');
      await Promise.all([loadSettings(), loadSummary()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah keanggotaan tabungan');
    } finally { setBusy(false); }
  }

  async function submitTariff() {
    const monthlyFee = parseRupiahInput(tariffValue);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(tariffMonth) || monthlyFee <= 0) {
      setError('Periode dan nominal tarif wajib valid.'); return;
    }
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/tabungan/tariff', { method: 'POST', body: JSON.stringify({ effective_month: tariffMonth, monthly_fee: monthlyFee }) });
      setTariffValue('');
      setMessage('Tarif minimum tabungan berhasil disimpan.');
      await Promise.all([loadSettings(), loadSummary()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan tarif tabungan');
    } finally { setBusy(false); }
  }

  const memberPager = usePagination(members, PAGE_SIZE);
  useEffect(() => { memberPager.reset(); }, [members.length]);

  if (settingMode) {
    return (
      <main className="min-h-screen pb-10">
        <FeedbackToast error={error} message={message} /><Navbar />
        <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
          <OperationalSubmenuHeader backHref="/operasional/tabungan" title="Kembali ke Operasional Pembangunan" />
          <div className="surface-muted rounded-xl border border-[var(--line)] px-4 py-3 text-sm">Anggota aktif: <b>{members.filter((member) => member.is_active).length}</b></div>
          <Card title="Pengaturan Tabungan" subtitle="Atur minimum setoran dan warga yang menjadi anggota tabungan.">
            <div className="grid gap-3 md:grid-cols-3">
              <Input label="Tarif Berlaku Mulai" type="month" value={tariffMonth} onChange={(e) => setTariffMonth(e.target.value)} />
              <Input label="Minimum Setoran" type="text" inputMode="numeric" value={formatRupiahInput(tariffValue)} onChange={(e) => setTariffValue(e.target.value)} placeholder={formatRupiah(minimumFee)} />
              <div className="flex items-end"><button type="button" className="btn-action-blue w-full rounded-xl px-4 py-2 text-sm font-semibold" onClick={submitTariff} disabled={busy}>Simpan Tarif</button></div>
            </div>
            {tariffs.length ? <p className="mt-3 text-xs text-[var(--text-muted)]">Tarif aktif: {formatRupiah(minimumFee)}. Riwayat terbaru: {tariffs.slice(0, 3).map((t) => `${t.effective_month} ${formatRupiah(t.monthly_fee)}`).join(' · ')}</p> : null}
          </Card>
          <Card title="Keanggotaan Tabungan" subtitle="Semua user eligible ditampilkan. Hanya anggota aktif yang muncul di form input.">
            <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]"><thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Aksi</th></tr></thead><tbody>
              {memberPager.pagedItems.map((member) => <tr key={member.warga_id} className="bg-[var(--surface)]"><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{member.nama}</td><td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${member.is_active ? 'text-emerald-700' : 'text-[var(--text-muted)]'}`}>{member.is_active ? 'Aktif' : 'Nonaktif'}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right"><MemberActionButtons isActive={member.is_active} disabled={busy} onToggle={() => void setMemberActive(member.warga_id, !member.is_active)} /></td></tr>)}
              {!members.length ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada user eligible.</td></tr> : null}
            </tbody></table></div>
            <PaginationControls page={memberPager.page} totalPages={memberPager.totalPages} onPrev={memberPager.prev} onNext={memberPager.next} />
          </Card>
        </div>
      </main>
    );
  }

  async function submitPengeluaranTabungan() {
    if (!user || !token) return;
    const total = parseRupiahInput(expenseAmount);
    const perWargaAmount = parseRupiahInput(expensePerWargaAmount);
    if (!expenseTitle.trim()) {
      setError('Judul pengeluaran wajib diisi');
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(expenseDate)) {
      setError('Tanggal pengeluaran wajib format YYYY-MM-DD');
      return;
    }
    if (!Number.isFinite(total) || total < 5000) {
      setError('Nominal pengeluaran minimal Rp 5.000');
      return;
    }
    if (!Number.isFinite(perWargaAmount) || perWargaAmount <= 0) {
      setError('Nominal final per warga wajib diisi.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/tabungan/kebutuhan-khusus', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: expenseTitle.trim(),
          event_date: expenseDate,
          total_amount: total,
          per_warga_amount: perWargaAmount,
          notes: expenseNotes.trim() || null
        })
      });
      setExpenseTitle('');
      setExpenseAmount('');
      setExpensePerWargaAmount('');
      setExpenseNotes('');
      setMessage('Potongan saldo tabungan berhasil dicatat. Jika ada surplus, pos sisa kegiatan otomatis dibuat.');
      await Promise.all([loadSummary(), loadHistory()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencatat pengeluaran tabungan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        {inputPageMode ? <OperationalSubmenuHeader backHref="/operasional/tabungan" title="Kembali ke Operasional Pembangunan" /> : null}
        <Card
          title="Tabungan Pembangunan"
          subtitle={`Setoran sukarela warga (minimal ${formatRupiah(minimumFee)})`}
          headerRight={(
            <div className="w-full max-w-[220px]">
              <Input label="Periode Riwayat" type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} />
            </div>
          )}
        >
          {!inputPageMode && canWrite ? (
            <div className="mb-3 flex items-center justify-between gap-2">
              <Link
                href="/operasional/tabungan/input"
                className="btn-action-blue inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Input Tabungan
              </Link>
              <Link href="/operasional/tabungan/setting" className="btn-action-blue ml-auto inline-flex rounded-xl px-4 py-2 text-sm font-semibold">⚙️ Pengaturan</Link>
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3">
            <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Warga</p>
              <p className="mt-1 text-xl font-bold text-[var(--accent)]">{formatRupiah(tabunganTotals.total_saldo_warga || totalTabungan)}</p>
            </div>
            <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Sisa Kas Kegiatan</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{formatRupiah(tabunganTotals.sisa_kas_kegiatan)}</p>
            </div>
            <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Total Kas Dana</p>
              <p className="mt-1 text-xl font-bold text-[var(--accent)]">{formatRupiah(tabunganTotals.total_kas_dana || totalTabungan)}</p>
            </div>
          </div>
          <div className="mt-2 surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Warga Aktif</p>
            <p className="mt-1 text-xl font-bold text-[var(--accent)]">{rows.length}</p>
          </div>
          <div
            className="mt-2 surface-muted sticky z-40 rounded-2xl border border-[var(--line)] px-4 py-3"
            style={{ top: 'var(--sticky-nav-offset)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Mutasi Bulan {historyMonth}</p>
            <p className={`mt-1 text-lg font-bold ${totalMutasiBulan >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {totalMutasiBulan >= 0 ? '+' : '-'} {formatRupiah(Math.abs(totalMutasiBulan))}
            </p>
          </div>
          {inputPageMode ? (
            <div className="mt-3 mb-1 grid w-full grid-cols-3 gap-2 md:max-w-md">
              <button
                type="button"
                onClick={() => setStatusFilter('semua')}
                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-center transition ${
                  statusFilter === 'semua'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]'
                }`}
              >
                Semua ({filterCounts.semua})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('belum')}
                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-center transition ${
                  statusFilter === 'belum'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]'
                }`}
              >
                Belum ({filterCounts.belum})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('sudah')}
                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-center transition ${
                  statusFilter === 'sudah'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-muted)]'
                }`}
              >
                Sudah ({filterCounts.sudah})
              </button>
            </div>
          ) : null}
          {inputPageMode ? (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {inputRows
                .filter((row) => {
                  if (statusFilter === 'semua') return true;
                  if (statusFilter === 'sudah') return Number(monthlyCreditByWarga[String(row.warga_id)] || 0) > 0;
                  return Number(monthlyCreditByWarga[String(row.warga_id)] || 0) <= 0;
                })
                .map((row) => (
                <article
                  key={row.warga_id}
                  className={`cursor-pointer rounded-2xl border p-4 ${
                    Number(monthlyCreditByWarga[String(row.warga_id)] || 0) > 0 ? 'card-status-paid' : 'card-status-empty'
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{row.nama}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Saldo Tabungan</p>
                  <p className={`mt-1 text-lg font-bold ${Number(row.total_balance || 0) < 0 ? 'text-rose-600' : 'text-[var(--accent)]'}`}>
                    {formatRupiah(Number(row.total_balance || 0))}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </Card>

        {!inputPageMode ? (
          <>
            <Card title="Input Kegiatan Pembangunan" subtitle="Potong saldo tabungan warga aktif sesuai nominal final per warga">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Nama Kegiatan"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="Contoh: Perbaikan drainase"
                />
                <Input
                  label="Tanggal"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
                <Input
                  label="Biaya Riil"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(expenseAmount)}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="Minimal 5000"
                />
                <Input
                  label="Nominal Final per Warga"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(expensePerWargaAmount)}
                  onChange={(e) => setExpensePerWargaAmount(e.target.value)}
                  placeholder="Contoh: 15.000"
                />
                <Input
                  label="Catatan"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  Warga aktif<br /><b>{expenseActiveWargaCount}</b>
                </div>
                <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  Hitungan/warga<br /><b>{formatRupiah(Math.ceil(expenseSuggestedPerWarga))}</b>
                </div>
                <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  Total potong<br /><b>{formatRupiah(expenseChargedTotal)}</b>
                </div>
                <div className={`rounded-xl border px-3 py-2 text-sm ${expenseSurplus >= 0 ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-rose-200 bg-rose-50/80 text-rose-900'}`}>
                  Selisih<br /><b>{expenseSurplus >= 0 ? '+' : '-'} {formatRupiah(Math.abs(expenseSurplus))}</b>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Jika selisih positif, sistem otomatis membuat pos sisa kegiatan. Jika negatif, tampil sebagai kekurangan biaya kegiatan.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-action-blue rounded-xl px-4 py-2 text-sm font-semibold"
                  onClick={submitPengeluaranTabungan}
                  disabled={busy}
                >
                  {busy ? 'Menyimpan...' : 'Proses Potong Saldo'}
                </button>
              </div>
            </Card>
            <Card title="Riwayat Tabungan" subtitle={`Mutasi periode ${historyMonth}`}>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Warga</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.length === 0 ? (
                      <tr className="bg-[var(--surface)]">
                        <td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada riwayat pada periode ini.</td>
                      </tr>
                    ) : (
                      historyPager.pagedItems.map((row) => (
                        <tr key={row.id} className="bg-[var(--surface)]">
                          <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                          <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.nama}</td>
                          <td className="border-b border-[var(--line)] px-3 py-2 text-sm break-words whitespace-normal">{row.description || '-'}</td>
                          <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">{row.direction === 'CREDIT' ? '+' : '-'} {formatRupiah(Number(row.amount || 0))}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={historyPager.page} totalPages={historyPager.totalPages} onPrev={historyPager.prev} onNext={historyPager.next} />
            </Card>
            <Card title="Riwayat Pengeluaran Tabungan" subtitle={`Pengeluaran periode ${historyMonth}`}>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Warga</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debitRows.length === 0 ? (
                      <tr className="bg-[var(--surface)]">
                        <td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada pengeluaran pada periode ini.</td>
                      </tr>
                    ) : (
                      expensePager.pagedItems.map((row) => (
                          <tr key={`debit-${row.id}`} className="bg-[var(--surface)]">
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.nama}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm break-words whitespace-normal">{row.description || '-'}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">- {formatRupiah(Number(row.amount || 0))}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={expensePager.page} totalPages={expensePager.totalPages} onPrev={expensePager.prev} onNext={expensePager.next} />
            </Card>
          </>
        ) : null}

        {loading ? <div className="text-sm text-[var(--text-muted)]">Memuat...</div> : null}
      </div>

      <WargaContributionModal
        open={Boolean(selectedLive)}
        wargaNama={selectedLive?.nama || '-'}
        currentBalance={selectedLive ? Number(selectedLive.total_balance || 0) : null}
        presets={[
          { label: '5rb', amount: 5000 },
          { label: '10rb', amount: 10000 },
          { label: '20rb', amount: 20000 },
          { label: '50rb', amount: 50000 },
          { label: '100rb', amount: 100000 },
          { label: '200rb', amount: 200000 }
        ]}
        loading={busy}
        onClose={() => setSelected(null)}
        onSubmit={submitSetoran}
      />
    </main>
  );
}
