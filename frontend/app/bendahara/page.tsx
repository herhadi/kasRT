'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';

type WargaItem = { id: string | number; nama: string };
type WalletItem = { id: number; name: string };
type PengeluaranItem = {
  id: string | number;
  amount: number;
  description: string;
  created_at: string;
  wallet_name: string;
  created_by_nama: string;
};
type TopPenunggakItem = {
  warga_id: string;
  nama: string;
  no_hp?: string;
  iuran_bulan_ini: number;
  tunggakan_bulan_ini: number;
  iuran_tahun_ini: number;
  tunggakan_akumulatif: number;
};
type TrenIuranItem = {
  bulan: string;
  total_warga: number;
  target: number;
  pemasukan: number;
  tunggakan: number;
};
type BendaharaReport = {
  iuran_wajib_target_bulanan: number;
  total_warga: number;
  target_bulan_ini: number;
  pemasukan_bulan_ini: number;
  total_menunggak_bulan_ini: number;
  nominal_tunggakan_bulan_ini: number;
  nominal_tunggakan_akumulatif_tahun_berjalan: number;
  top_10_penunggak?: TopPenunggakItem[];
  tren_6_bulan?: TrenIuranItem[];
};
type YearlyWalletRow = {
  wallet_id: number;
  wallet_name: string;
  opening_balance: number;
  closing_balance: number;
};
type YearlyBookSummary = {
  year: number;
  period: {
    year: number;
    status: string;
    opened_at?: string;
    opened_by?: string;
    closed_at?: string;
    closed_by?: string;
  } | null;
  wallets: YearlyWalletRow[];
  arrears: {
    total_warga: number;
    total_opening_arrears: number;
    total_closing_arrears: number;
    top10: Array<{ warga_id: string; nama: string; no_hp?: string; closing_arrears: number }>;
  };
};

export default function BendaharaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const canSeeOps = hasAnyRole(user, [
    'Bendahara',
    'Admin Jimpitan',
    'Admin Pembangunan',
    'Admin Lingkungan',
    'Admin Sosial',
    'Admin Internet',
    'Admin Koperasi',
    'Admin Keamanan',
    'root'
  ]);
  const isBendahara = hasAnyRole(user, ['Bendahara', 'root']);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [warga, setWarga] = useState<WargaItem[]>([]);
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [pengeluaran, setPengeluaran] = useState<PengeluaranItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedMonthOnly, setSelectedMonthOnly] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYearOnly, setSelectedYearOnly] = useState(() => String(new Date().getFullYear()));

  const [selectedWarga, setSelectedWarga] = useState('');
  const [iuranPreset, setIuranPreset] = useState('30000');
  const [iuranManualAmount, setIuranManualAmount] = useState('');
  const [expenseWalletId, setExpenseWalletId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BendaharaReport | null>(null);
  const [yearlyYear, setYearlyYear] = useState(() => new Date().getFullYear());
  const [yearlyBook, setYearlyBook] = useState<YearlyBookSummary | null>(null);

  const loadMaster = useCallback(async () => {
    const result = await apiFetch<{
      success: boolean;
      data: { wallets: WalletItem[]; pengeluaran: PengeluaranItem[] };
    }>(`/bendahara/master?month=${encodeURIComponent(selectedMonth)}`);
    const ws = result.data?.wallets || [];
    const outs = result.data?.pengeluaran || [];
    setWallets(ws);
    setPengeluaran(outs);
    setExpenseWalletId((prev) => (prev && ws.some((w) => String(w.id) === String(prev)) ? prev : String(ws[0]?.id || '')));
  }, [selectedMonth]);

  const loadWargaOptions = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: WargaItem[] }>('/auth/warga-options');
    const rows = result.data || [];
    setWarga(rows);
    setSelectedWarga((prev) => (prev && rows.some((r) => String(r.id) === String(prev)) ? prev : String(rows[0]?.id || '')));
  }, []);

  const loadReport = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: BendaharaReport }>('/report/dashboard-admin-bendahara');
    setReport(result.data || null);
  }, []);

  const loadYearlyBook = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: YearlyBookSummary }>(
      `/bendahara/yearly-book?year=${encodeURIComponent(String(yearlyYear))}`
    );
    setYearlyBook(result.data || null);
  }, [yearlyYear]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (loading) return;
    if (!canSeeOps) {
      router.replace('/dashboard');
      return;
    }
    if (!isBendahara) return;
    void Promise.all([loadMaster(), loadReport(), loadWargaOptions(), loadYearlyBook()]).catch((e) =>
      setError(e instanceof Error ? e.message : 'Gagal memuat menu bendahara')
    );
  }, [loading, canSeeOps, isBendahara, router, loadMaster, loadReport, loadWargaOptions, loadYearlyBook]);

  const title = useMemo(() => (isBendahara ? 'Menu Bendahara' : 'Menu Keuangan'), [isBendahara]);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 2, current - 1, current, current + 1];
  }, []);

  useEffect(() => {
    setSelectedMonth(`${selectedYearOnly}-${selectedMonthOnly}`);
  }, [selectedMonthOnly, selectedYearOnly]);

  async function submitSetorIuran() {
    const amount = iuranPreset === 'manual' ? parseRupiahInput(iuranManualAmount) : Number(iuranPreset || 0);
    if (!selectedWarga || !Number.isFinite(amount) || amount <= 0) {
      setError('Pilih warga dan isi nominal setoran iuran yang valid.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/setor-iuran-wajib', {
        method: 'POST',
        body: JSON.stringify({ warga_id: selectedWarga, amount })
      });
      setMessage('Setoran iuran wajib berhasil dicatat.');
      await loadReport();
      await loadMaster();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan setoran iuran wajib');
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense() {
    const wallet_id = Number(expenseWalletId || 0);
    const amount = parseRupiahInput(expenseAmount);
    if (!wallet_id || !Number.isFinite(amount) || amount <= 0 || !expenseDesc.trim() || !expenseDate) {
      setError('Isi wallet, tanggal keluar, nominal, dan keterangan pengeluaran dengan benar.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/pengeluaran', {
        method: 'POST',
        body: JSON.stringify({
          wallet_id,
          amount,
          description: expenseDesc.trim(),
          tanggal_keluar: expenseDate
        })
      });
      setExpenseAmount('');
      setExpenseDesc('');
      setMessage('Pengeluaran bulanan berhasil dicatat.');
      await loadReport();
      await loadMaster();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencatat pengeluaran');
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseYear() {
    if (!window.confirm(`Tutup buku tahun ${yearlyYear}? Proses ini menyimpan saldo akhir & tunggakan tahunan.`)) return;
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/yearly-book/close', {
        method: 'POST',
        body: JSON.stringify({ year: yearlyYear })
      });
      setMessage(`Closing tahun ${yearlyYear} berhasil.`);
      await Promise.all([loadYearlyBook(), loadReport()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal closing tahunan');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenNextYear() {
    const nextYear = yearlyYear + 1;
    if (!window.confirm(`Buka periode ${nextYear} dengan saldo awal dari closing ${yearlyYear}?`)) return;
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/yearly-book/open', {
        method: 'POST',
        body: JSON.stringify({ year: nextYear })
      });
      setYearlyYear(nextYear);
      setMessage(`Opening periode ${nextYear} berhasil dibuat.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal opening tahun berikutnya');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  if (!canSeeOps) {
    return (
      <main className="min-h-screen pb-10">
        <Navbar />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title={title} subtitle="Operasional keuangan untuk Bendahara dan admin terkait">
          {!isBendahara ? (
            <p className="text-sm text-[var(--text-muted)]">
              Anda memiliki akses menu bendahara. Fitur input keuangan penuh khusus untuk role Bendahara.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm font-semibold">
                  <span>Nominal Iuran Wajib</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={iuranPreset}
                    onChange={(e) => setIuranPreset(e.target.value)}
                  >
                    <option value="30000">Rp30.000</option>
                    <option value="60000">Rp60.000</option>
                    <option value="90000">Rp90.000</option>
                    <option value="120000">Rp120.000</option>
                    <option value="150000">Rp150.000</option>
                    <option value="manual">Input manual</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>Pilih Warga</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={selectedWarga}
                    onChange={(e) => setSelectedWarga(e.target.value)}
                  >
                    {warga.map((w) => (
                      <option key={String(w.id)} value={String(w.id)}>
                        {w.nama}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button className="w-full" onClick={submitSetorIuran} disabled={busy}>Catat Iuran Wajib</Button>
                </div>
              </div>
              {iuranPreset === 'manual' ? (
                <div className="mt-4 max-w-sm">
                  <Input
                    label="Nominal Manual"
                    type="text"
                    inputMode="numeric"
                    value={formatRupiahInput(iuranManualAmount)}
                    onChange={(e) => setIuranManualAmount(e.target.value)}
                    placeholder="Contoh: 30.000"
                  />
                </div>
              ) : null}
            </>
          )}
        </Card>

        {isBendahara ? (
          <>
            <Card title="Pengeluaran Bulanan" subtitle="Pencatatan pengeluaran operasional bulanan">
              <div className="grid gap-4 md:grid-cols-4">
                <Input
                  label="Tanggal Keluar"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
                <label className="space-y-2 text-sm font-semibold">
                  <span>Wallet</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={expenseWalletId}
                    onChange={(e) => setExpenseWalletId(e.target.value)}
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Nominal"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(expenseAmount)}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="Contoh: 150.000"
                />
                <Input label="Keterangan" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} placeholder="Contoh: listrik balai RT" />
                <div className="flex items-end">
                  <Button className="w-full" onClick={submitExpense} disabled={busy}>Catat Pengeluaran</Button>
                </div>
              </div>
            </Card>

            <Card title="List Pengeluaran" subtitle={`Riwayat pengeluaran untuk ${selectedMonth}`}>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <label className="space-y-2 text-sm font-semibold">
                  <span>Filter Bulan</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={selectedMonthOnly}
                    onChange={(e) => setSelectedMonthOnly(e.target.value)}
                  >
                    <option value="01">Januari</option>
                    <option value="02">Februari</option>
                    <option value="03">Maret</option>
                    <option value="04">April</option>
                    <option value="05">Mei</option>
                    <option value="06">Juni</option>
                    <option value="07">Juli</option>
                    <option value="08">Agustus</option>
                    <option value="09">September</option>
                    <option value="10">Oktober</option>
                    <option value="11">November</option>
                    <option value="12">Desember</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>Filter Tahun</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={selectedYearOnly}
                    onChange={(e) => setSelectedYearOnly(e.target.value)}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tanggal</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Wallet</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Keterangan</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pengeluaran.length === 0 ? (
                      <tr className="bg-[var(--surface)]">
                        <td colSpan={4} className="px-4 py-3 text-sm text-[var(--text-muted)]">Belum ada pengeluaran bulan ini.</td>
                      </tr>
                    ) : (
                      pengeluaran.map((row) => (
                        <tr key={String(row.id)} className="bg-[var(--surface)]">
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                            {new Date(row.created_at).toLocaleDateString('id-ID')}
                          </td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.wallet_name || '-'}</td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.description || '-'}</td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">
                            {formatRupiah(Number(row.amount || 0))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Closing Tahunan" subtitle="Tutup buku tahunan untuk migrasi saldo akhir, saldo awal, dan carry forward tunggakan">
              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  label="Tahun Buku"
                  type="number"
                  min={2000}
                  max={2100}
                  value={String(yearlyYear)}
                  onChange={(e) => setYearlyYear(Number(e.target.value || new Date().getFullYear()))}
                />
                <div className="flex items-end">
                  <Button className="w-full" onClick={loadYearlyBook} disabled={busy}>Muat Data Tahun</Button>
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={handleCloseYear} disabled={busy}>Close Tahun</Button>
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={handleOpenNextYear} disabled={busy}>Open Tahun Berikutnya</Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <Line label="Status Periode" value={yearlyBook?.period?.status || 'BELUM ADA'} />
                <Line label="Total Warga (Snapshot)" value={String(yearlyBook?.arrears?.total_warga || 0)} />
                <Line label="Total Tunggakan Awal" value={formatRupiah(Number(yearlyBook?.arrears?.total_opening_arrears || 0))} />
                <Line label="Total Tunggakan Akhir" value={formatRupiah(Number(yearlyBook?.arrears?.total_closing_arrears || 0))} />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-[var(--surface-strong)]">
                        <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Kas</th>
                        <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Awal</th>
                        <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Akhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(yearlyBook?.wallets || []).length === 0 ? (
                        <tr className="bg-[var(--surface)]">
                          <td colSpan={3} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada snapshot saldo kas.</td>
                        </tr>
                      ) : (
                        (yearlyBook?.wallets || []).map((row) => (
                          <tr key={row.wallet_id} className="bg-[var(--surface)]">
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.wallet_name || '-'}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-[var(--text-primary)]">{formatRupiah(Number(row.opening_balance || 0))}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.closing_balance || 0))}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-[var(--surface-strong)]">
                        <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Top Tunggakan Akhir Tahun</th>
                        <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(yearlyBook?.arrears?.top10 || []).length === 0 ? (
                        <tr className="bg-[var(--surface)]">
                          <td colSpan={2} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada data tunggakan akhir tahun.</td>
                        </tr>
                      ) : (
                        (yearlyBook?.arrears?.top10 || []).map((row) => (
                          <tr key={String(row.warga_id)} className="bg-[var(--surface)]">
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.nama || '-'}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-500">{formatRupiah(Number(row.closing_arrears || 0))}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {report ? (
              <Card title="Report Bendahara" subtitle="Ringkasan iuran wajib dan tunggakan">
                <div className="grid gap-2 md:grid-cols-2">
                  <Line label="Target Iuran Wajib / Bulan" value={formatRupiah(Number(report.iuran_wajib_target_bulanan || 0))} />
                  <Line label="Target Bulan Ini" value={formatRupiah(Number(report.target_bulan_ini || 0))} />
                  <Line label="Pemasukan Bulan Ini" value={formatRupiah(Number(report.pemasukan_bulan_ini || 0))} />
                  <Line label="Total Warga" value={String(report.total_warga || 0)} />
                  <Line label="Menunggak Bulan Ini" value={String(report.total_menunggak_bulan_ini || 0)} />
                  <Line label="Nominal Tunggakan Bulan Ini" value={formatRupiah(Number(report.nominal_tunggakan_bulan_ini || 0))} />
                  <Line label="Tunggakan Akumulatif Tahun Berjalan" value={formatRupiah(Number(report.nominal_tunggakan_akumulatif_tahun_berjalan || 0))} />
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[var(--surface-strong)]">
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Top 10 Penunggak</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tunggakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.top_10_penunggak || []).length === 0 ? (
                          <tr className="bg-[var(--surface)]">
                            <td colSpan={2} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada data penunggak.</td>
                          </tr>
                        ) : (
                          (report.top_10_penunggak || []).map((row) => (
                            <tr key={String(row.warga_id)} className="bg-[var(--surface)]">
                              <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.nama}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.tunggakan_akumulatif || 0))}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[var(--surface-strong)]">
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tren 6 Bulan</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Target</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Masuk</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tunggakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.tren_6_bulan || []).map((row) => (
                          <tr key={row.bulan} className="bg-[var(--surface)]">
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.bulan}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-[var(--text-primary)]">{formatRupiah(Number(row.target || 0))}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.pemasukan || 0))}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-500">{formatRupiah(Number(row.tunggakan || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Grafik Tren 6 Bulan
                  </p>
                  <div className="space-y-2">
                    {(report.tren_6_bulan || []).map((row) => {
                      const target = Number(row.target || 0);
                      const pemasukan = Number(row.pemasukan || 0);
                      const ratio = target > 0 ? Math.min((pemasukan / target) * 100, 100) : 0;
                      return (
                        <div key={`bar-${row.bulan}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-[var(--text-primary)]">{row.bulan}</span>
                            <span className="text-[var(--text-muted)]">{formatRupiah(pemasukan)} / {formatRupiah(target)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)] transition-all"
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ) : null}
          </>
        ) : null}

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <strong className="text-right text-[var(--text-primary)]">{value}</strong>
    </div>
  );
}
