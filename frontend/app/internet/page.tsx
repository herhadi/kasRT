'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import MemberActionButtons from '@/components/ui/MemberActionButtons';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';
import WargaContributionSection from '@/components/contribution/WargaContributionSection';
import { WargaContributionRow } from '@/components/contribution/WargaContributionGrid';

type InternetRow = {
  warga_id: string;
  nama: string;
  paid_amount: number;
  target_amount: number;
  arrears: number;
  total_arrears: number;
};
type InternetSummary = {
  month: string;
  monthly_fee: number;
  pemasukan: number;
  pengeluaran: number;
  rows: InternetRow[];
  tariffs: Array<{ id: string; effective_month: string; monthly_fee: number }>;
};
type InternetHistory = {
  month: string;
  payments: Array<{ id: string; tanggal: string; nama: string; amount: number; note?: string; kind: 'PAYMENT' }>;
  expenses: Array<{ id: string; tanggal: string; nama: string; amount: number; note?: string; kind: 'EXPENSE' }>;
};
type InternetYearlyHistory = {
  year: string;
  recap: Array<{ month: string; pemasukan: number; pengeluaran: number }>;
};
type InternetMember = { warga_id: string; nama: string; is_active?: boolean; active_from_month?: string };
const MEMBER_START_MONTH = '2026-01';

export default function OperasionalInternetPage() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<InternetSummary | null>(null);
  const [history, setHistory] = useState<InternetHistory | null>(null);
  const [yearlyHistory, setYearlyHistory] = useState<InternetYearlyHistory | null>(null);
  const [historyYear, setHistoryYear] = useState(() => String(new Date().getFullYear()));
  const [historyYearMonth, setHistoryYearMonth] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedWargaId, setSelectedWargaId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tariffMonth, setTariffMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tariffValue, setTariffValue] = useState('');
  const [filter, setFilter] = useState<'semua' | 'belum' | 'sudah'>('semua');
  const [selectedRow, setSelectedRow] = useState<WargaContributionRow | null>(null);
  const [members, setMembers] = useState<InternetMember[]>([]);
  const [memberMonthDrafts, setMemberMonthDrafts] = useState<Record<string, string>>({});

  const canAccess = hasAnyRole(user, ['Admin Internet', 'Ketua']);
  const canWrite = hasAnyRole(user, ['Admin Internet', 'root']);
  const iuranOnlyMode = pathname === '/operasional/internet/iuran';
  const settingMode = pathname === '/operasional/internet/setting';

  const loadAll = useCallback(async () => {
    if (!canAccess) return;
    setError('');
    const [sumRes, histRes, memberRes] = await Promise.all([
      apiFetch<{ success: boolean; data: InternetSummary }>(`/internet/summary?month=${encodeURIComponent(month)}`),
      apiFetch<{ success: boolean; data: InternetHistory }>(`/internet/history?month=${encodeURIComponent(month)}`),
      apiFetch<{ success: boolean; data: InternetMember[] }>(`/internet/members`)
    ]);
    setSummary(sumRes.data || null);
    setHistory(histRes.data || null);
    setMembers(memberRes.data || []);
    setMemberMonthDrafts(Object.fromEntries((memberRes.data || []).map((member) => [member.warga_id, member.active_from_month || MEMBER_START_MONTH])));
    const yRes = await apiFetch<{ success: boolean; data: InternetYearlyHistory }>(`/internet/history?year=${encodeURIComponent(historyYear)}`);
    setYearlyHistory(yRes.data || null);
  }, [canAccess, month, historyYear]);

  useEffect(() => {
    void loadAll().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat data internet'));
  }, [loadAll]);

  useEffect(() => {
    if (!summary?.rows?.length) return;
    setSelectedWargaId((prev) => (prev && summary.rows.some((r) => r.warga_id === prev) ? prev : summary.rows[0].warga_id));
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
  const expensePager = usePagination(history?.expenses || [], 10);
  const contributionRows = useMemo<WargaContributionRow[]>(
    () =>
      (summary?.rows || []).map((r) => ({
        id: r.warga_id,
        nama: r.nama,
        paidAmount: Number(r.paid_amount || 0),
        targetAmount: Number(summary?.monthly_fee || 0),
        canInput: true,
        suggestionText: `Total tunggakan: ${formatRupiah(Number(r.total_arrears || 0))}`
      })),
    [summary]
  );
  useEffect(() => {
    memberPager.reset();
  }, [members.length]);
  useEffect(() => {
    expensePager.reset();
  }, [month]);

  async function submitPayment(forcedAmount?: number) {
    const amount = Number.isFinite(forcedAmount as number) ? Number(forcedAmount) : parseRupiahInput(payAmount);
    if (!selectedWargaId || amount <= 0) return setError('Pilih warga dan nominal valid.');
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/internet/payment', {
        method: 'POST',
        body: JSON.stringify({
          warga_id: selectedWargaId,
          month,
          amount,
          paid_at: expenseDate,
          note: payNote
        })
      });
      setPayAmount('');
      setPayNote('');
      setMessage('Iuran internet berhasil dicatat.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal input iuran internet');
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense() {
    const amount = parseRupiahInput(expenseAmount);
    if (amount <= 0 || !expenseDesc.trim()) return setError('Nominal dan keterangan pengeluaran wajib.');
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/internet/expense', {
        method: 'POST',
        body: JSON.stringify({ expense_date: expenseDate, amount, description: expenseDesc.trim() })
      });
      setExpenseAmount('');
      setExpenseDesc('');
      setMessage('Pengeluaran internet berhasil dicatat.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal input pengeluaran internet');
    } finally {
      setBusy(false);
    }
  }

  async function submitTariff() {
    const monthly_fee = parseRupiahInput(tariffValue);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(tariffMonth) || monthly_fee <= 0) return setError('Periode tarif dan nominal wajib valid.');
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/internet/tariff', {
        method: 'POST',
        body: JSON.stringify({ effective_month: tariffMonth, monthly_fee })
      });
      setMessage('Tarif internet berhasil disimpan.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan tarif internet');
    } finally {
      setBusy(false);
    }
  }

  async function setMemberActive(wid: string, next: boolean, activeFromMonth = memberMonthDrafts[wid] || MEMBER_START_MONTH) {
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/internet/members/set-active', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wid, is_active: next, active_from_month: activeFromMonth })
      });
      setMessage(next ? 'Warga diaktifkan sebagai anggota internet.' : 'Warga dinonaktifkan dari anggota internet.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal update anggota internet');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  if (iuranOnlyMode) {
    return (
      <main className="min-h-screen pb-10">
        <FeedbackToast error={error} message={message} />
        <Navbar sticky={false} />
        <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
          <OperationalSubmenuHeader backHref="/operasional/internet" title="Kembali ke Operasional Internet" />
          <Card
            title="Input Iuran Internet"
            subtitle={`Tarif bulan ${month}: ${formatRupiah(Number(summary?.monthly_fee || 0))}`}
            headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
          >
            <WargaContributionSection
              rows={contributionRows}
              selectedRow={selectedRow}
              loading={busy}
              presets={[
                { label: '60rb', amount: 60000 },
                { label: '120rb', amount: 120000 },
                { label: '180rb', amount: 180000 },
                { label: '240rb', amount: 240000 },
                { label: '300rb', amount: 300000 },
                { label: '360rb', amount: 360000 }
              ]}
              onOpen={(row) => {
                setSelectedWargaId(String(row.id));
                setSelectedRow(row);
              }}
              onClose={() => setSelectedRow(null)}
              onSubmit={async (amount) => {
                await submitPayment(amount);
                setSelectedRow(null);
              }}
            />
          </Card>
        </div>
      </main>
    );
  }

  if (settingMode) {
    return (
      <main className="min-h-screen pb-10">
        <FeedbackToast error={error} message={message} />
        <Navbar sticky={false} />
        <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
          <OperationalSubmenuHeader backHref="/operasional/internet" title="Kembali ke Operasional Internet" />
          <Card title="Pengaturan Internet" subtitle="Tarif dan keanggotaan iuran internet.">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Tarif Berlaku Mulai" type="month" value={tariffMonth} onChange={(e) => setTariffMonth(e.target.value)} />
              <Input label="Nominal Tarif Baru" type="text" inputMode="numeric" value={formatRupiahInput(tariffValue)} onChange={(e) => setTariffValue(e.target.value)} />
              <div className="md:col-span-2 flex items-end"><Button className="w-full" onClick={submitTariff} disabled={busy}>Simpan Tarif</Button></div>
            </div>
          </Card>
          <div className="surface-muted rounded-xl border border-[var(--line)] px-4 py-3 text-sm">Anggota aktif: <b>{members.filter((member) => member.is_active).length}</b></div>
          <Card title="Keanggotaan Internet" subtitle="Daftar warga dari master global. Tandai Aktif hanya untuk peserta iuran internet.">
            <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]"><thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Mulai Iuran</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Aksi</th></tr></thead><tbody>
              {memberPager.pagedItems.map((member) => <tr key={member.warga_id} className="bg-[var(--surface)]"><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{member.nama}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm"><input type="month" className="w-full min-w-[140px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" value={memberMonthDrafts[member.warga_id] || member.active_from_month || MEMBER_START_MONTH} onChange={(event) => setMemberMonthDrafts((prev) => ({ ...prev, [member.warga_id]: event.target.value }))} /></td><td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${member.is_active ? 'text-emerald-700' : 'text-[var(--text-muted)]'}`}>{member.is_active ? 'Aktif' : 'Nonaktif'}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right"><MemberActionButtons isActive={Boolean(member.is_active)} disabled={busy} onSaveStart={() => void setMemberActive(member.warga_id, Boolean(member.is_active))} onToggle={() => void setMemberActive(member.warga_id, !Boolean(member.is_active))} /></td></tr>)}
              {!members.length ? <tr><td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada data warga.</td></tr> : null}
            </tbody></table></div>
            <PaginationControls page={memberPager.page} totalPages={memberPager.totalPages} onPrev={memberPager.prev} onNext={memberPager.next} />
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar sticky={false} />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card
          title="Operasional Internet"
          subtitle="Iuran wajib internet bulanan, tunggakan, dan pengeluaran"
          headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
        >
          {canWrite ? (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Link href="/operasional/internet/iuran" className="btn-action-blue link-action px-3 py-1.5 text-xs">Input Iuran</Link>
              <Link href="/operasional/internet/setting" className="btn-action-blue link-action px-3 py-1.5 text-xs">⚙️ Pengaturan</Link>
            </div>
          ) : null}
        </Card>
        <div
          className="sticky z-40 gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-sm backdrop-blur"
          style={{ top: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
        >
            <div className="surface-muted min-w-0 rounded-lg border border-[var(--line)] px-1.5 py-1.5 text-[10px] leading-[14px] md:px-3 md:py-2 md:text-sm">Tarif<br /><b>{formatRupiah(Number(summary?.monthly_fee || 0))}</b></div>
            <div className="surface-muted min-w-0 rounded-lg border border-[var(--line)] px-1.5 py-1.5 text-[10px] leading-[14px] md:px-3 md:py-2 md:text-sm">Masuk<br /><b>{formatRupiah(Number(summary?.pemasukan || 0))}</b></div>
            <div className="surface-muted min-w-0 rounded-lg border border-[var(--line)] px-1.5 py-1.5 text-[10px] leading-[14px] md:px-3 md:py-2 md:text-sm">Keluar<br /><b>{formatRupiah(Number(summary?.pengeluaran || 0))}</b></div>
        </div>

        {canWrite && !iuranOnlyMode ? (
          <Card title="Pengeluaran Internet" subtitle="Riwayat biaya internet RT">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Tanggal" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              <Input label="Nominal" type="text" inputMode="numeric" value={formatRupiahInput(expenseAmount)} onChange={(e) => setExpenseAmount(e.target.value)} />
              <Input label="Keterangan" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
              <div className="flex items-end"><Button className="w-full" onClick={submitExpense} disabled={busy}>Catat Pengeluaran</Button></div>
            </div>
          </Card>
        ) : null}

        <Card title="Riwayat Pengeluaran Internet" subtitle={`Pengeluaran periode ${month}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {expensePager.pagedItems.length === 0 ? (
                  <tr className="bg-[var(--surface)]"><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada pengeluaran pada periode ini.</td></tr>
                ) : expensePager.pagedItems.map((expense) => (
                  <tr key={expense.id} className="bg-[var(--surface)]">
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{new Date(expense.tanggal).toLocaleDateString('id-ID')}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{expense.note || '-'}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-600">{formatRupiah(Number(expense.amount || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls page={expensePager.page} totalPages={expensePager.totalPages} onPrev={expensePager.prev} onNext={expensePager.next} />
        </Card>

        <Card title="Status Iuran Warga" subtitle="Hitungan tunggakan mengikuti tarif efektif per bulan">
          <div className="mb-3 flex w-full gap-2">
            {(['semua', 'belum', 'sudah'] as const).map((f) => (
              <button key={f} type="button" onClick={() => { setFilter(f); pager.reset(); }} className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${filter === f ? 'opacity-100' : 'opacity-70'}`}>
                {f === 'semua' ? `Semua (${summary?.rows?.length || 0})` : f === 'belum' ? `Belum (${(summary?.rows || []).filter((r) => r.arrears > 0).length})` : `Sudah (${(summary?.rows || []).filter((r) => r.arrears <= 0).length})`}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Warga</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Bayar/Target</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tunggakan Bulan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Total Tunggakan</th>
                </tr>
              </thead>
              <tbody>
                {pager.pagedItems.length === 0 ? (
                  <tr className="bg-[var(--surface)]">
                    <td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Tidak ada data warga untuk filter ini.</td>
                  </tr>
                ) : (
                  pager.pagedItems.map((row) => (
                    <tr key={row.warga_id} className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">{row.nama}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-[var(--text-primary)]">
                        {formatRupiah(row.paid_amount)} / {formatRupiah(row.target_amount)}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-600">{formatRupiah(row.arrears)}</td>
                      <td className={`border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold ${row.total_arrears > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {formatRupiah(row.total_arrears)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={pager.page} totalPages={pager.totalPages} onPrev={pager.prev} onNext={pager.next} />
        </Card>

        {!iuranOnlyMode ? (
        <Card
          title="Riwayat Internet"
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
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Bulan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pemasukan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pengeluaran</th>
                </tr>
              </thead>
              <tbody>
                {(yearlyHistory?.recap || []).map((row) => (
                  <tr key={row.month} className="bg-[var(--surface)]">
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.month}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-emerald-700">{formatRupiah(Number(row.pemasukan || 0))}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-600">{formatRupiah(Number(row.pengeluaran || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        ) : null}

      </div>
    </main>
  );
}
