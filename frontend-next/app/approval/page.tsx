'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatTanggalIndonesia } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { ApprovalHistoryItem, PendingApprovalItem, PendingApprovalSection } from '@/types';

export default function ApprovalPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [sections, setSections] = useState<PendingApprovalSection[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [message, setMessage] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [approvingKey, setApprovingKey] = useState<string>('');
  const [historyItems, setHistoryItems] = useState<ApprovalHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const canSeeApproval = hasAnyRole(user, ['Ketua', 'Sekretaris', 'Admin Jimpitan', 'root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadPending = useCallback(async () => {
    if (!canSeeApproval) return;

    try {
      setLoadingList(true);
      const result = await apiFetch<{
        success: boolean;
        data: { total_pending: number; sections: PendingApprovalSection[] };
      }>('/approval/pending');

      setSections(result.data?.sections || []);
      setTotalPending(Number(result.data?.total_pending || 0));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat daftar approval');
    } finally {
      setLoadingList(false);
    }
  }, [canSeeApproval]);

  const loadHistory = useCallback(
    async (page: number) => {
      if (!canSeeApproval) return;

      try {
        setLoadingHistory(true);
        const result = await apiFetch<{
          success: boolean;
          data: {
            items: ApprovalHistoryItem[];
            pagination: {
              page: number;
              limit: number;
              total: number;
              total_pages: number;
              has_prev: boolean;
              has_next: boolean;
            };
          };
        }>(`/approval/history?page=${page}&limit=10`);

        setHistoryItems(result.data?.items || []);
        setHistoryPage(Number(result.data?.pagination?.page || 1));
        setHistoryTotalPages(Number(result.data?.pagination?.total_pages || 1));
        setHistoryTotal(Number(result.data?.pagination?.total || 0));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Gagal memuat riwayat approval');
      } finally {
        setLoadingHistory(false);
      }
    },
    [canSeeApproval]
  );

  useEffect(() => {
    if (!canSeeApproval) {
      const resetTimer = window.setTimeout(() => {
        setSections([]);
        setTotalPending(0);
        setHistoryItems([]);
        setHistoryPage(1);
        setHistoryTotalPages(1);
        setHistoryTotal(0);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const kickoff = window.setTimeout(() => {
      void loadPending();
      void loadHistory(1);
    }, 0);

    const interval = window.setInterval(() => {
      void loadPending();
    }, 20000);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [canSeeApproval, loadPending, loadHistory]);

  async function approveItem(item: PendingApprovalItem) {
    const actionKey = `${item.kind}-${item.id}`;
    setApprovingKey(actionKey);
    setMessage('');

    try {
      if (item.kind === 'JIMPITAN_BATCH') {
        await apiFetch('/jimpitan/approve', {
          method: 'POST',
          body: JSON.stringify({ batch_id: item.meta.batch_id ?? item.id })
        });
      }

      if (item.kind === 'TRANSFER') {
        await apiFetch('/transaction/approve-transfer', {
          method: 'POST',
          body: JSON.stringify({ transaction_id: item.meta.transaction_id ?? item.id })
        });
      }

      if (item.kind === 'EXPENSE') {
        await apiFetch('/transaction/approve-expense', {
          method: 'POST',
          body: JSON.stringify({ transaction_id: item.meta.transaction_id ?? item.id })
        });
      }

      setMessage(`${item.title} berhasil di-approve.`);
      await loadPending();
      await loadHistory(historyPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Approval gagal diproses');
    } finally {
      setApprovingKey('');
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card title="Approval Center" subtitle="Daftar transaksi pending muncul otomatis sesuai role Anda">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-muted)]">
              Pending sekarang: <strong className="text-[var(--text-primary)]">{totalPending}</strong>
            </p>
            <Button variant="ghost" onClick={() => void loadPending()} disabled={loadingList}>
              {loadingList ? 'Memuat...' : 'Refresh'}
            </Button>
          </div>
        </Card>

        {!canSeeApproval ? (
          <Card title="Tidak Ada Akses" subtitle="Role Anda tidak termasuk approver saat ini">
            <p className="text-sm text-[var(--text-muted)]">Approval hanya untuk Admin Jimpitan, Ketua, Sekretaris, atau root.</p>
          </Card>
        ) : null}

        {canSeeApproval && sections.length === 0 && !loadingList ? (
          <Card title="Tidak Ada Pending" subtitle="Semua transaksi yang bisa Anda approve sudah selesai">
            <p className="text-sm text-[var(--text-muted)]">Belum ada transaksi baru yang membutuhkan approval.</p>
          </Card>
        ) : null}

        {sections.map((section) => (
          <Card key={section.key} title={section.label} subtitle={`${section.items.length} item pending`}>
            <div className="space-y-3">
              {section.items.map((item) => {
                const actionKey = `${item.kind}-${item.id}`;
                const isApproving = approvingKey === actionKey;

                return (
                  <article key={actionKey} className="rounded-2xl border border-[var(--line)] bg-white/75 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-[var(--text-primary)]">{item.title}</h4>
                        <p className="text-sm text-[var(--text-muted)]">{item.description}</p>
                        <p className="text-sm text-[var(--text-muted)]">Dibuat: {formatTanggalIndonesia(item.created_at)}</p>
                        <p className="metric-value text-lg font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                      </div>

                      <Button onClick={() => void approveItem(item)} disabled={isApproving}>
                        {isApproving ? 'Memproses...' : 'Approve'}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </Card>
        ))}

        <Card title="Riwayat Approval" subtitle={`Latest first, 10 data per halaman (total ${historyTotal})`}>
          <div className="space-y-3">
            {loadingHistory ? <p className="text-sm text-[var(--text-muted)]">Memuat riwayat...</p> : null}

            {!loadingHistory && historyItems.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Belum ada riwayat approval untuk role Anda.</p>
            ) : null}

            {historyItems.map((item) => (
              <article key={`history-${item.kind}-${item.id}-${item.approved_at}`} className="rounded-2xl border border-[var(--line)] bg-white/75 p-4">
                <div className="space-y-1">
                  <h4 className="font-semibold text-[var(--text-primary)]">{item.title}</h4>
                  <p className="text-sm text-[var(--text-muted)]">{item.description}</p>
                  <p className="text-sm text-[var(--text-muted)]">Disetujui: {formatTanggalIndonesia(item.approved_at)}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Approver: {item.approved_by_nama || item.approved_by || '-'}
                  </p>
                  <p className="metric-value text-lg font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="ghost"
              disabled={historyPage <= 1 || loadingHistory}
              onClick={() => void loadHistory(Math.max(1, historyPage - 1))}
            >
              Sebelumnya
            </Button>
            <p className="text-sm text-[var(--text-muted)]">
              Halaman {historyPage} / {historyTotalPages}
            </p>
            <Button
              variant="ghost"
              disabled={historyPage >= historyTotalPages || loadingHistory}
              onClick={() => void loadHistory(Math.min(historyTotalPages, historyPage + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </Card>

        {message ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--text-primary)]">{message}</div>
        ) : null}
      </div>
    </main>
  );
}
