'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import OperationalIuranGuide from '@/components/contribution/OperationalIuranGuide';
import PeriodPickerCompact from '@/components/contribution/PeriodPickerCompact';

type InternetRow = {
  warga_id: string;
  nama: string;
  paid_amount: number;
  target_amount: number;
  arrears: number;
  total_arrears: number;
  surplus_amount: number;
  arrears_months: number;
  chargeable_months: number;
  last_payment?: { id: string; amount: number; paid_at?: string; note?: string } | null;
};
type InternetSummary = {
  month: string;
  monthly_fee: number;
  pemasukan: number;
  pengeluaran: number;
  total_kas: number;
  rows: InternetRow[];
  tariffs: Array<{ id: string; effective_month: string; monthly_fee: number }>;
  opening_balances?: Array<{ id: string; tanggal: string; closing_year: number; opening_year: number; amount: number; description: string }>;
  expenses?: Array<{ id: string; expense_date: string; expense_month: string; amount: number; description: string }>;
};
type DashboardKasSnapshot = { kas_umum?: { kas_internet?: number } };
type InternetYearlyHistory = {
  year: string;
  recap: Array<{ month: string; pemasukan: number; pengeluaran: number }>;
};
type InternetMember = { warga_id: string; nama: string; is_active?: boolean; active_from_month?: string };
const MEMBER_START_MONTH = '2026-01';

function formatTanggalDdMmYyyy(dateValue: Date | string) {
  const raw = typeof dateValue === 'string' ? dateValue.slice(0, 10) : '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (Number.isNaN(date.getTime())) return raw || '-';
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function stickyValueClass(value: number) {
  return Number(value || 0) < 0 ? 'text-rose-600' : 'text-[var(--accent)]';
}

export default function OperasionalInternetPage() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<InternetSummary | null>(null);
  const [internetKas, setInternetKas] = useState(0);
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
  const [editContributionMode, setEditContributionMode] = useState(false);
  const [members, setMembers] = useState<InternetMember[]>([]);
  const [memberFilter, setMemberFilter] = useState<'aktif' | 'nonaktif'>('aktif');
  const [memberMonthDrafts, setMemberMonthDrafts] = useState<Record<string, string>>({});
  const loadSequenceRef = useRef(0);
  const paymentSyncRef = useRef(Promise.resolve());

  const canAccess = hasAnyRole(user, ['Admin Internet', 'Ketua']);
  const canWrite = hasAnyRole(user, ['Admin Internet', 'root']);
  const canResetMemberStartMonths = hasAnyRole(user, ['root']);
  const iuranOnlyMode = pathname === '/operasional/internet/iuran';
  const settingMode = pathname === '/operasional/internet/setting';
  const guideMode = pathname === '/operasional/internet/panduan';

  const loadAll = useCallback(async () => {
    if (!canAccess) return;
    const requestSequence = ++loadSequenceRef.current;
    setError('');
    const [sumRes, memberRes, dashboardRes] = await Promise.all([
      apiFetch<{ success: boolean; data: InternetSummary }>(`/internet/summary?month=${encodeURIComponent(month)}`),
      apiFetch<{ success: boolean; data: InternetMember[] }>(`/internet/members`),
      apiFetch<{ success: boolean; data: DashboardKasSnapshot }>('/report/dashboard')
    ]);
    if (requestSequence !== loadSequenceRef.current) return;
    setSummary(sumRes.data || null);
    setInternetKas(Number(dashboardRes.data?.kas_umum?.kas_internet || 0));
    setMembers(memberRes.data || []);
    setMemberMonthDrafts(Object.fromEntries((memberRes.data || []).map((member) => [member.warga_id, member.active_from_month || MEMBER_START_MONTH])));
    const yRes = await apiFetch<{ success: boolean; data: InternetYearlyHistory }>(`/internet/history?year=${encodeURIComponent(historyYear)}`);
    if (requestSequence !== loadSequenceRef.current) return;
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
  const pager = usePagination(filteredRows, 10);
  const filteredMembers = useMemo(
    () => members.filter((member) => (memberFilter === 'aktif' ? Boolean(member.is_active) : !member.is_active)),
    [members, memberFilter]
  );
  const memberPager = usePagination(filteredMembers, 10);
  const openingPager = usePagination(summary?.opening_balances || [], 10);
  const expensePager = usePagination(summary?.expenses || [], 10);
  const contributionRows = useMemo<WargaContributionRow[]>(
    () =>
      (summary?.rows || []).map((r) => ({
        id: r.warga_id,
        nama: r.nama,
        paidAmount: Number(r.paid_amount || 0),
        targetAmount: Number(summary?.monthly_fee || 0),
        canInput: true,
        suggestionText: Number(r.surplus_amount || 0) > 0
          ? `Surplus: ${formatRupiah(Number(r.surplus_amount || 0))}`
          : Number(r.total_arrears || 0) > 0
            ? `Kurang: ${formatRupiah(Number(r.total_arrears || 0))}`
            : 'Lunas sampai periode ini',
        canEdit: Boolean(r.last_payment?.id),
        editId: r.last_payment?.id,
        editAmount: Number(r.last_payment?.amount || 0)
      })),
    [summary]
  );
  useEffect(() => {
    memberPager.reset();
  }, [filteredMembers.length, memberFilter]);
  useEffect(() => {
    openingPager.reset();
    expensePager.reset();
  }, [summary?.opening_balances?.length, summary?.expenses?.length]);

  function submitPayment(forcedAmount?: number) {
    const amount = Number.isFinite(forcedAmount as number) ? Number(forcedAmount) : parseRupiahInput(payAmount);
    if (!selectedWargaId || amount <= 0) return setError('Pilih warga dan nominal valid.');
    const wargaId = selectedWargaId;
    const paidAt = expenseDate;
    const note = payNote;
    setError('');
    setPayAmount('');
    setPayNote('');
    setSummary((current) => {
      if (!current) return current;
      return {
        ...current,
        pemasukan: Number(current.pemasukan || 0) + amount,
        total_kas: Number(current.total_kas || 0) + amount,
        rows: current.rows.map((row) => {
          if (row.warga_id !== wargaId) return row;
          const nextPaid = Number(row.paid_amount || 0) + amount;
          const nextArrears = Math.max(Number(row.target_amount || 0) - nextPaid, 0);
          const resolvedArrears = Math.max(Number(row.arrears || 0) - nextArrears, 0);
          return {
            ...row,
            paid_amount: nextPaid,
            arrears: nextArrears,
            total_arrears: Math.max(Number(row.total_arrears || 0) - resolvedArrears, 0),
            arrears_months: Number(row.arrears || 0) > 0 && nextArrears === 0 ? Math.max(Number(row.arrears_months || 0) - 1, 0) : Number(row.arrears_months || 0)
          };
        })
      };
    });
    setInternetKas((current) => current + amount);
    setMessage('Iuran disimpan lokal. Menyinkronkan di latar belakang…');
    paymentSyncRef.current = paymentSyncRef.current
      .catch(() => undefined)
      .then(async () => {
        await apiFetch('/internet/payment', {
        method: 'POST',
        body: JSON.stringify({
          warga_id: wargaId,
          month,
          amount,
          paid_at: paidAt,
          note
        })
        });
        setMessage('Iuran internet berhasil disinkronkan.');
        void loadAll().catch(() => undefined);
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Gagal menyinkronkan iuran internet');
        void loadAll().catch(() => undefined);
      });
  }

  async function submitPaymentCorrection(amount: number) {
    const paymentId = selectedRow?.editId;
    if (!paymentId || amount <= 0) return setError('Data koreksi tidak valid.');
    try {
      setBusy(true);
      setError('');
      await apiFetch('/internet/payment', {
        method: 'PATCH',
        body: JSON.stringify({
          payment_id: paymentId,
          amount,
          paid_at: expenseDate,
          note: payNote
        })
      });
      setMessage('Input iuran internet berhasil dikoreksi.');
      setSelectedRow(null);
      setEditContributionMode(false);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal koreksi iuran internet');
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
      const result = await apiFetch<{ success: boolean; data?: InternetMember }>('/internet/members/set-active', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wid, is_active: next, active_from_month: activeFromMonth })
      });
      const savedMonth = String(result.data?.active_from_month || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(savedMonth)) {
        throw new Error('Backend belum mendukung penyimpanan bulan mulai iuran. Deploy backend terbaru terlebih dahulu.');
      }
      setMemberMonthDrafts((previous) => ({ ...previous, [wid]: savedMonth }));
      setMembers((previous) => previous.map((member) => (
        member.warga_id === wid ? { ...member, is_active: next, active_from_month: savedMonth } : member
      )));
      setMessage(
        next
          ? `Keanggotaan internet aktif. Mulai iuran tersimpan: ${savedMonth}.`
          : `Warga dinonaktifkan. Mulai iuran tersimpan: ${savedMonth}.`
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal update anggota internet');
    } finally {
      setBusy(false);
    }
  }

  async function resetAllMemberStartMonths() {
    if (!window.confirm('Atur bulan mulai iuran semua anggota Internet menjadi Januari 2026?')) return;
    try {
      setBusy(true);
      setError('');
      setMessage('');
      const result = await apiFetch<{ success: boolean; data: { active_from_month: string; affected_count: number } }>('/internet/members/reset-start-month', {
        method: 'POST'
      });
      const savedMonth = result.data?.active_from_month || MEMBER_START_MONTH;
      setMembers((previous) => previous.map((member) => ({ ...member, active_from_month: savedMonth })));
      setMemberMonthDrafts((previous) => Object.fromEntries(Object.keys(previous).map((id) => [id, savedMonth])));
      setMessage(`${result.data?.affected_count || 0} anggota Internet diatur mulai iuran ${savedMonth}.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mereset bulan mulai iuran Internet');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  if (guideMode) {
    return <><Navbar sticky={false} /><OperationalIuranGuide module="internet" /></>;
  }

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
            headerRight={<PeriodPickerCompact label="Periode" value={month} onChange={setMonth} />}
          >
            <WargaContributionSection
              rows={contributionRows}
              selectedRow={selectedRow}
              loading={busy}
              editMode={editContributionMode}
              initialAmount={selectedRow?.editAmount}
              presets={[
                { label: '60rb', amount: 60000 },
                { label: '120rb', amount: 120000 },
                { label: '180rb', amount: 180000 },
                { label: '240rb', amount: 240000 }
              ]}
              onOpen={(row) => {
                setEditContributionMode(false);
                setSelectedWargaId(String(row.id));
                setSelectedRow(row);
              }}
              onEdit={(row) => {
                setEditContributionMode(true);
                setSelectedWargaId(String(row.id));
                setSelectedRow(row);
              }}
              onClose={() => {
                setSelectedRow(null);
                setEditContributionMode(false);
              }}
              onSubmit={async (amount) => {
                if (editContributionMode) {
                  await submitPaymentCorrection(amount);
                } else {
                  submitPayment(amount);
                  setSelectedRow(null);
                }
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
          <div className="sticky top-0 z-40 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-sm backdrop-blur md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">Anggota aktif: <b className="text-emerald-800">{members.filter((member) => member.is_active).length}</b></div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">Tarif aktif: <b className="text-sky-800">{formatRupiah(Number(summary?.monthly_fee || 0))}</b></div>
          </div>
          <Card title="Pengaturan Internet" subtitle="Tarif dan keanggotaan iuran internet.">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Tarif Berlaku Mulai" type="month" value={tariffMonth} onChange={(e) => setTariffMonth(e.target.value)} />
              <Input label="Nominal Tarif Baru" type="text" inputMode="numeric" value={formatRupiahInput(tariffValue)} onChange={(e) => setTariffValue(e.target.value)} />
              <div className="md:col-span-2 flex items-end"><Button className="w-full" onClick={submitTariff} disabled={busy}>Simpan Tarif</Button></div>
            </div>
          </Card>
          {canResetMemberStartMonths ? (
            <div className="flex justify-end">
              <Button variant="ghost" className="btn-action-blue" onClick={() => void resetAllMemberStartMonths()} disabled={busy}>
                Reset Semua Mulai Januari 2026
              </Button>
            </div>
          ) : null}
          <Card title="Keanggotaan Internet" subtitle="Daftar warga dari master global. Tandai Aktif hanya untuk peserta iuran internet.">
            <div className="mb-3 flex w-full gap-2">
              {(['aktif', 'nonaktif'] as const).map((filter) => (
                <button key={filter} type="button" onClick={() => setMemberFilter(filter)} className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${memberFilter === filter ? 'opacity-100' : 'opacity-70'}`}>
                  {filter === 'aktif' ? `Aktif (${members.filter((member) => member.is_active).length})` : `Nonaktif (${members.filter((member) => !member.is_active).length})`}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]"><thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Mulai Iuran</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Aksi</th></tr></thead><tbody>
              {memberPager.pagedItems.map((member) => <tr key={member.warga_id} className="bg-[var(--surface)]"><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{member.nama}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm"><input type="month" className="w-full min-w-[140px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" value={memberMonthDrafts[member.warga_id] || member.active_from_month || MEMBER_START_MONTH} onChange={(event) => setMemberMonthDrafts((prev) => ({ ...prev, [member.warga_id]: event.target.value }))} /></td><td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${member.is_active ? 'text-emerald-700' : 'text-[var(--text-muted)]'}`}>{member.is_active ? 'Aktif' : 'Nonaktif'}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right"><MemberActionButtons isActive={Boolean(member.is_active)} disabled={busy} onSaveStart={() => void setMemberActive(member.warga_id, Boolean(member.is_active))} onToggle={() => void setMemberActive(member.warga_id, !Boolean(member.is_active))} /></td></tr>)}
              {!filteredMembers.length ? <tr><td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Tidak ada anggota {memberFilter}.</td></tr> : null}
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
          subtitle="Iuran wajib internet bulanan"
          headerRight={<PeriodPickerCompact label="Periode" value={month} onChange={setMonth} />}
        >
          {canWrite ? (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Link href="/operasional/internet/iuran" className="btn-action-blue link-action px-3 py-1.5 text-xs">Input Iuran</Link>
              <div className="flex gap-2">
                <Link href="/operasional/internet/panduan" className="btn-action-blue link-action px-3 py-1.5 text-xs">📖 Panduan</Link>
                <Link href="/operasional/internet/setting" className="btn-action-blue link-action px-3 py-1.5 text-xs">⚙️ Pengaturan</Link>
              </div>
            </div>
          ) : null}
        </Card>
        <div className="ops-sticky-summary">
          <div className="ops-sticky-item ops-sticky-item-sky">Kas<br /><b className={stickyValueClass(internetKas)}>{formatRupiah(internetKas)}</b></div>
          <div className="ops-sticky-item ops-sticky-item-emerald">Masuk<br /><b className={stickyValueClass(Number(summary?.pemasukan || 0))}>{formatRupiah(Number(summary?.pemasukan || 0))}</b></div>
          <div className="ops-sticky-item ops-sticky-item-rose">Keluar<br /><b className={stickyValueClass(Number(summary?.pengeluaran || 0))}>{formatRupiah(Number(summary?.pengeluaran || 0))}</b></div>
        </div>

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
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--text-primary)]">
                        {row.arrears_months} dari {row.chargeable_months} bulan
                      </td>
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

        {canWrite && !iuranOnlyMode ? (
          <Card title="Pengeluaran Internet" subtitle="Riwayat biaya internet RT">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Tanggal" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              <Input label="Nominal" type="text" inputMode="numeric" value={formatRupiahInput(expenseAmount)} onChange={(e) => setExpenseAmount(e.target.value)} />
              <Input label="Keterangan" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
              <div className="flex items-end"><Button className="w-full" onClick={submitExpense} disabled={busy}>Catat Pengeluaran</Button></div>
            </div>
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Riwayat Pengeluaran</p>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Periode</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expensePager.pagedItems.length === 0 ? (
                      <tr className="bg-[var(--surface)]"><td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada riwayat pengeluaran.</td></tr>
                    ) : expensePager.pagedItems.map((expense) => (
                      <tr key={expense.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{formatTanggalDdMmYyyy(expense.expense_date)}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{expense.expense_month || '-'}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{expense.description || '-'}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-600">{formatRupiah(Number(expense.amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={expensePager.page} totalPages={expensePager.totalPages} onPrev={expensePager.prev} onNext={expensePager.next} />
            </div>
          </Card>
        ) : null}

        {!iuranOnlyMode ? (
          <Card
            title="Riwayat Internet"
            subtitle="Total pemasukan dan pengeluaran per bulan"
            headerRight={
              <PeriodPickerCompact
                label="Tahun"
                value={historyYearMonth}
                onChange={(value) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
                    setHistoryYearMonth(value);
                    setHistoryYear(value.slice(0, 4));
                  }
                }}
              />
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

        {!iuranOnlyMode ? (
          <Card title="Saldo Awal Migrasi Internet" subtitle="Riwayat dana awal dari input migrasi, dipisah dari pemasukan iuran bulanan">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Periode</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {openingPager.pagedItems.length === 0 ? (
                    <tr className="bg-[var(--surface)]"><td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada saldo awal migrasi.</td></tr>
                  ) : openingPager.pagedItems.map((row) => (
                    <tr key={row.id} className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{formatTanggalDdMmYyyy(row.tanggal)}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.opening_year}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.description || '-'}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-emerald-700">{formatRupiah(Number(row.amount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls page={openingPager.page} totalPages={openingPager.totalPages} onPrev={openingPager.prev} onNext={openingPager.next} />
          </Card>
        ) : null}

      </div>
    </main>
  );
}
