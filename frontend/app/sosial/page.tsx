'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type SosialSummary = {
  saldo_total: number;
  pemasukan_bulan: number;
  pengeluaran_bulan: number;
  expenses: Array<{ id: string | number; amount: number; status: string; description: string; created_at: string }>;
};
type PendingApprovalSection = {
  key: string;
  title: string;
  count: number;
};

export default function SosialPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<SosialSummary | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const canAccess = hasAnyRole(user, ['Admin Sosial', 'Ketua', 'Sekretaris', 'root']);
  const canSubmit = hasAnyRole(user, ['Admin Sosial', 'Ketua', 'root']);
  const expensesPager = usePagination(data?.expenses || [], 20);

  const load = useCallback(async () => {
    if (!canAccess) return;
    try {
      setError('');
      const result = await apiFetch<{ success: boolean; data: SosialSummary }>(
        `/report/dashboard-admin-sosial?month=${encodeURIComponent(month)}`
      );
      setData(result.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat operasional sosial');
    }
  }, [canAccess, month]);

  const loadPending = useCallback(async () => {
    if (!canAccess) return;
    try {
      const result = await apiFetch<{
        success: boolean;
        data: { sections: PendingApprovalSection[] };
      }>('/approval/pending');
      const sections = result.data?.sections || [];
      setPendingCount(
        sections.reduce((sum, section) => sum + Number(section.count || 0), 0)
      );
    } catch {
      setPendingCount(0);
    }
  }, [canAccess]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadPending();
  }, [loadPending]);
  useEffect(() => {
    expensesPager.reset();
  }, [month, (data?.expenses || []).length]);

  async function submit() {
    const nominal = parseRupiahInput(amount);
    if (!nominal || nominal <= 0 || !description.trim()) {
      setError('Nominal dan keterangan wajib diisi.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/transaction/expense-sosial', {
        method: 'POST',
        body: JSON.stringify({
          amount: nominal,
          description: description.trim(),
          tanggal_keluar: date
        })
      });
      setAmount('');
      setDescription('');
      setMessage('Pengeluaran sosial diajukan.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengajukan pengeluaran sosial');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;
  if (!canAccess) return <main className="min-h-screen"><Navbar /></main>;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card
          title="Operasional Sosial"
          subtitle="Ringkasan dan riwayat pengeluaran sosial"
          headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
        >
          {canSubmit ? (
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <Input label="Nominal" type="text" inputMode="numeric" value={formatRupiahInput(amount)} onChange={(e) => setAmount(e.target.value)} />
              <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input label="Keterangan" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="flex items-end"><Button className="w-full" onClick={submit} disabled={busy}>Ajukan Pengeluaran</Button></div>
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
            <p className="text-sm text-[var(--text-primary)]">
              Approval masuk: <b>{pendingCount}</b>
            </p>
            <a href="/approval" className="btn-action-blue link-action px-3 py-1.5 text-xs">
              Buka Approval
            </a>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Saldo: <b>{formatRupiah(Number(data?.saldo_total || 0))}</b></div>
            <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Pemasukan: <b>{formatRupiah(Number(data?.pemasukan_bulan || 0))}</b></div>
            <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Pengeluaran: <b>{formatRupiah(Number(data?.pengeluaran_bulan || 0))}</b></div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Status</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {(data?.expenses || []).length === 0 ? (
                  <tr className="bg-[var(--surface)]">
                    <td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada riwayat pengeluaran sosial pada bulan ini.</td>
                  </tr>
                ) : (
                  expensesPager.pagedItems.map((row) => (
                    <tr key={String(row.id)} className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)] break-words whitespace-normal">{row.description || '-'}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.status}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.amount || 0))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <PaginationControls
              page={expensesPager.page}
              totalPages={expensesPager.totalPages}
              onPrev={expensesPager.prev}
              onNext={expensesPager.next}
            />
          </div>
        </Card>
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div>
    </main>
  );
}
