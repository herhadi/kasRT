'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';
import WargaContributionSection from '@/components/contribution/WargaContributionSection';
import { WargaContributionRow } from '@/components/contribution/WargaContributionGrid';

type Row = { warga_id: string; nama: string; paid_amount: number; target_amount: number; arrears: number; total_arrears: number };
type Summary = { month: string; monthly_fee: number; pemasukan: number; pengeluaran: number; rows: Row[] };
type Yearly = { year: string; recap: Array<{ month: string; pemasukan: number; pengeluaran: number }> };
type LingkunganMember = { warga_id: string; nama: string; is_active?: boolean };

export default function LingkunganPage() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [yearly, setYearly] = useState<Yearly | null>(null);
  const [historyYear, setHistoryYear] = useState(() => String(new Date().getFullYear()));
  const [historyYearMonth, setHistoryYearMonth] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedWargaId, setSelectedWargaId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tariffMonth, setTariffMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tariffValue, setTariffValue] = useState('');
  const [showTariffSetting, setShowTariffSetting] = useState(false);
  const [filter, setFilter] = useState<'semua' | 'belum' | 'sudah'>('semua');
  const [selectedRow, setSelectedRow] = useState<WargaContributionRow | null>(null);
  const [members, setMembers] = useState<LingkunganMember[]>([]);
  const [showMemberSection, setShowMemberSection] = useState(false);
  const iuranOnlyMode = pathname === '/operasional/lingkungan/iuran';

  const canAccess = hasAnyRole(user, ['Admin Lingkungan', 'Ketua']);
  const canWrite = hasAnyRole(user, ['Admin Lingkungan', 'root']);

  const loadAll = useCallback(async () => {
    if (!canAccess) return;
    const [s, y, m] = await Promise.all([
      apiFetch<{ success: boolean; data: Summary }>(`/lingkungan/summary?month=${encodeURIComponent(month)}`),
      apiFetch<{ success: boolean; data: Yearly }>(`/lingkungan/history?year=${encodeURIComponent(historyYear)}`),
      apiFetch<{ success: boolean; data: LingkunganMember[] }>(`/lingkungan/members`)
    ]);
    setSummary(s.data || null);
    setYearly(y.data || null);
    setMembers(m.data || []);
  }, [canAccess, month, historyYear]);

  useEffect(() => { void loadAll().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat data lingkungan')); }, [loadAll]);
  useEffect(() => {
    if (!summary?.rows?.length) return;
    setSelectedWargaId((p) => (p && summary.rows.some((r) => r.warga_id === p) ? p : summary.rows[0].warga_id));
    if (!tariffValue) setTariffValue(String(Math.round(Number(summary.monthly_fee || 0))));
  }, [summary]);

  const filteredRows = useMemo(() => {
    const rows = summary?.rows || [];
    if (filter === 'belum') return rows.filter((r) => Number(r.arrears || 0) > 0);
    if (filter === 'sudah') return rows.filter((r) => Number(r.arrears || 0) <= 0);
    return rows;
  }, [summary, filter]);
  const pager = usePagination(filteredRows, 20);
  const memberPager = usePagination(members, 10);
  const rowsForInput = useMemo<WargaContributionRow[]>(
    () => (summary?.rows || []).map((r) => ({ id: r.warga_id, nama: r.nama, paidAmount: r.paid_amount, targetAmount: Number(summary?.monthly_fee || 0), canInput: true, suggestionText: `Total tunggakan: ${formatRupiah(r.total_arrears)}` })),
    [summary]
  );
  useEffect(() => {
    memberPager.reset();
  }, [members.length]);

  async function submitPayment(amount: number) {
    if (!selectedWargaId || amount <= 0) return setError('Pilih warga & nominal valid');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/lingkungan/payment', { method: 'POST', body: JSON.stringify({ warga_id: selectedWargaId, month, amount, paid_at: expenseDate, note: '' }) });
      setMessage('Iuran lingkungan berhasil dicatat.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal input iuran lingkungan');
    } finally { setBusy(false); }
  }

  async function submitExpense() {
    const amount = parseRupiahInput(expenseAmount);
    if (amount <= 0 || !expenseDesc.trim()) return setError('Nominal & keterangan wajib');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/lingkungan/expense', { method: 'POST', body: JSON.stringify({ expense_date: expenseDate, amount, description: expenseDesc.trim() }) });
      setExpenseAmount(''); setExpenseDesc('');
      setMessage('Pengeluaran lingkungan berhasil dicatat.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal input pengeluaran lingkungan');
    } finally { setBusy(false); }
  }

  async function submitTariff() {
    const monthly_fee = parseRupiahInput(tariffValue);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(tariffMonth) || monthly_fee <= 0) return setError('Tarif tidak valid');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/lingkungan/tariff', { method: 'POST', body: JSON.stringify({ effective_month: tariffMonth, monthly_fee }) });
      setMessage('Tarif lingkungan berhasil disimpan.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal simpan tarif');
    } finally { setBusy(false); }
  }
  async function setMemberActive(wid: string, next: boolean) {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/lingkungan/members/set-active', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wid, is_active: next })
      });
      setMessage(next ? 'Warga diaktifkan sebagai anggota lingkungan.' : 'Warga dinonaktifkan dari anggota lingkungan.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal update anggota lingkungan');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;
  if (iuranOnlyMode) {
    return (
      <main className="min-h-screen pb-10"><Navbar /><div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <OperationalSubmenuHeader backHref="/operasional/lingkungan" title="Kembali ke Operasional Lingkungan" />
        <Card title="Input Iuran Lingkungan" subtitle={`Tarif bulan ${month}: ${formatRupiah(Number(summary?.monthly_fee || 0))}`} headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}>
          <WargaContributionSection rows={rowsForInput} selectedRow={selectedRow} loading={busy} presets={[{ label: '20rb', amount: 20000 }, { label: '40rb', amount: 40000 }, { label: '60rb', amount: 60000 }, { label: '80rb', amount: 80000 }, { label: '100rb', amount: 100000 }, { label: '120rb', amount: 120000 }]} onOpen={(r) => { setSelectedWargaId(String(r.id)); setSelectedRow(r); }} onClose={() => setSelectedRow(null)} onSubmit={async (a) => { await submitPayment(a); setSelectedRow(null); }} />
        </Card>
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div></main>
    );
  }

  return (
    <main className="min-h-screen pb-10"><Navbar /><div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
      <Card title="Operasional Lingkungan" subtitle="Iuran lingkungan bulanan, tunggakan, dan pengeluaran" headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Tarif Aktif: <b>{formatRupiah(Number(summary?.monthly_fee || 0))}</b></div>
          <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Pemasukan Bulan: <b>{formatRupiah(Number(summary?.pemasukan || 0))}</b></div>
          <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Pengeluaran Bulan: <b>{formatRupiah(Number(summary?.pengeluaran || 0))}</b></div>
        </div>
        {canWrite ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            <Link href="/operasional/lingkungan/iuran" className="btn-action-blue link-action px-3 py-1.5 text-xs">Input Iuran</Link>
            <Button variant="ghost" className="btn-action-blue" onClick={() => setShowTariffSetting((v) => !v)}>⚙️ Pengaturan Tarif</Button>
          </div>
        ) : null}
        {canWrite && showTariffSetting ? (
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Input label="Tarif Berlaku Mulai" type="month" value={tariffMonth} onChange={(e) => setTariffMonth(e.target.value)} />
            <Input label="Nominal Tarif Baru" type="text" inputMode="numeric" value={formatRupiahInput(tariffValue)} onChange={(e) => setTariffValue(e.target.value)} />
            <div className="md:col-span-2 flex items-end"><Button className="w-full" onClick={submitTariff} disabled={busy}>Simpan Tarif</Button></div>
          </div>
        ) : null}
      </Card>
      {canWrite ? (
        <Card title="Keanggotaan Lingkungan" subtitle="Master warga global, aktifkan yang ikut iuran lingkungan">
          <div className="mb-3">
            <button type="button" className="btn-action-blue link-action px-3 py-1.5 text-xs" onClick={() => setShowMemberSection((v) => !v)}>
              {showMemberSection ? 'Sembunyikan Keanggotaan' : 'Tampilkan Keanggotaan'}
            </button>
          </div>
          {showMemberSection ? (
            <>
              <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Aksi</th></tr></thead>
                <tbody>
                  {memberPager.pagedItems.map((m) => (
                    <tr key={m.warga_id}>
                      <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{m.nama}</td>
                      <td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${m.is_active ? 'text-emerald-700' : 'text-[var(--text-muted)]'}`}>{m.is_active ? 'Aktif' : 'Nonaktif'}</td>
                      <td className="border-t border-[var(--line)] px-3 py-2 text-right">
                        <button type="button" className="btn-action-blue rounded-xl px-3 py-1.5 text-xs" onClick={() => void setMemberActive(m.warga_id, !Boolean(m.is_active))} disabled={busy}>
                          {m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!members.length ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada data warga.</td></tr> : null}
                </tbody>
              </table></div>
              <PaginationControls page={memberPager.page} totalPages={memberPager.totalPages} onPrev={memberPager.prev} onNext={memberPager.next} />
            </>
          ) : null}
        </Card>
      ) : null}
      {canWrite ? (
        <Card title="Pengeluaran Lingkungan" subtitle="Riwayat biaya lingkungan">
          <div className="grid gap-3 md:grid-cols-4">
            <Input label="Tanggal" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            <Input label="Nominal" type="text" inputMode="numeric" value={formatRupiahInput(expenseAmount)} onChange={(e) => setExpenseAmount(e.target.value)} />
            <Input label="Keterangan" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
            <div className="flex items-end"><Button className="w-full" onClick={submitExpense} disabled={busy}>Catat Pengeluaran</Button></div>
          </div>
        </Card>
      ) : null}
      <Card title="Status Iuran Warga" subtitle="Hitungan tunggakan mengikuti tarif efektif per bulan">
        <div className="mb-3 flex w-full gap-2">
          {(['semua', 'belum', 'sudah'] as const).map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f); pager.reset(); }} className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${filter === f ? 'opacity-100' : 'opacity-70'}`}>
              {f === 'semua' ? `Semua (${summary?.rows?.length || 0})` : f === 'belum' ? `Belum (${(summary?.rows || []).filter((r) => r.arrears > 0).length})` : `Sudah (${(summary?.rows || []).filter((r) => r.arrears <= 0).length})`}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
          <thead><tr className="bg-[var(--surface-strong)]">
            <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Warga</th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Bayar/Target</th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tunggakan Bulan</th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Total Tunggakan</th>
          </tr></thead>
          <tbody>{pager.pagedItems.map((row) => (
            <tr key={row.warga_id} className="bg-[var(--surface)]">
              <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">{row.nama}</td>
              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(row.paid_amount)} / {formatRupiah(row.target_amount)}</td>
              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-600">{formatRupiah(row.arrears)}</td>
              <td className={`border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold ${row.total_arrears > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatRupiah(row.total_arrears)}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <PaginationControls page={pager.page} totalPages={pager.totalPages} onPrev={pager.prev} onNext={pager.next} />
      </Card>
      <Card
        title="Riwayat Lingkungan"
        subtitle="Total pemasukan dan pengeluaran per bulan"
        headerRight={
          <div className="w-full max-w-[220px]">
            <Input
              label="Tahun"
              type="month"
              value={historyYearMonth}
              onChange={(e) => {
                const v = String(e.target.value || '');
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
                  setHistoryYearMonth(v);
                  setHistoryYear(v.slice(0, 4));
                }
              }}
            />
          </div>
        }
      >
        <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
          <thead><tr className="bg-[var(--surface-strong)]">
            <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Bulan</th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pemasukan</th>
            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pengeluaran</th>
          </tr></thead>
          <tbody>{(yearly?.recap || []).map((row) => (
            <tr key={row.month} className="bg-[var(--surface)]">
              <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.month}</td>
              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-emerald-700">{formatRupiah(row.pemasukan)}</td>
              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-600">{formatRupiah(row.pengeluaran)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
    </div></main>
  );
}
