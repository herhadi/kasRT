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
import WargaContributionModal from '@/components/contribution/WargaContributionModal';
import PaginationControls from '@/components/pagination/PaginationControls';
import { apiFetch } from '@/lib/api';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import usePagination from '@/lib/hooks/usePagination';

type TabunganWargaItem = {
  warga_id: string;
  nama: string;
  total_balance: number;
};

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
  const [expenseNotes, setExpenseNotes] = useState('');
  const PAGE_SIZE = 20;

  const loadSummary = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: TabunganWargaItem[] }>('/tabungan/summary');
    setRows(result.data || []);
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
    Promise.all([loadSummary(), loadHistory()])
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat tabungan'))
      .finally(() => setLoading(false));
  }, [authLoading, user, token, loadSummary, loadHistory]);

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
    if (!Number.isFinite(amount) || amount < 5000) {
      setError('Nominal minimal Rp 5.000');
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

  async function submitPengeluaranTabungan() {
    if (!user || !token) return;
    const total = parseRupiahInput(expenseAmount);
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
          notes: expenseNotes.trim() || null
        })
      });
      setExpenseTitle('');
      setExpenseAmount('');
      setExpenseNotes('');
      setMessage('Pengeluaran tabungan berhasil dicatat.');
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
          subtitle="Setoran sukarela warga (minimal Rp 5.000)"
          headerRight={(
            <div className="w-full max-w-[220px]">
              <Input label="Periode Riwayat" type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} />
            </div>
          )}
        >
          {!inputPageMode ? (
            <div className="mb-3">
              <Link
                href="/operasional/tabungan/input"
                className="btn-action-blue inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Input Tabungan
              </Link>
            </div>
          ) : null}
          <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Total Saldo Berjalan (Semua Warga)</p>
            <p className="mt-1 text-xl font-bold text-[var(--accent)]">{formatRupiah(totalTabungan)}</p>
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
            <Card title="Input Pengeluaran Tabungan" subtitle="Gunakan untuk kebutuhan khusus (rehab, perbaikan, dll)">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Judul Pengeluaran"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="Contoh: Rehab balai RT"
                />
                <Input
                  label="Tanggal"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
                <Input
                  label="Nominal"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(expenseAmount)}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="Minimal 5000"
                />
                <Input
                  label="Catatan"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-action-blue rounded-xl px-4 py-2 text-sm font-semibold"
                  onClick={submitPengeluaranTabungan}
                  disabled={busy}
                >
                  {busy ? 'Menyimpan...' : 'Catat Pengeluaran'}
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
