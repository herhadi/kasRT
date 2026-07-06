'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Link from 'next/link';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatTanggalIndonesia } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { ApprovalHistoryItem, DashboardWargaData, MembershipRequestStatus, PendingApprovalItem, PendingApprovalSection } from '@/types';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type InboxModuleKey = 'internet' | 'lingkungan' | 'koperasi';

const INBOX_MODULES: Array<{
  key: InboxModuleKey;
  title: string;
  adminLabel: string;
}> = [
  { key: 'internet', title: 'Internet', adminLabel: 'Admin Internet' },
  { key: 'lingkungan', title: 'Lingkungan', adminLabel: 'Admin Lingkungan' },
  { key: 'koperasi', title: 'Koperasi', adminLabel: 'Admin Koperasi' }
];

function inboxRequestLabel(request?: MembershipRequestStatus | null) {
  if (!request) return 'Belum ada pengajuan';
  const action = request.request_type === 'DEACTIVATE' ? 'nonaktif' : 'aktif';
  if (request.status === 'PENDING') return `Menunggu persetujuan ${action}`;
  if (request.status === 'APPROVED') return `Pengajuan ${action} disetujui`;
  if (request.status === 'REJECTED') return `Pengajuan ${action} ditolak`;
  return `Pengajuan ${action} dibatalkan`;
}

function inboxRequestClass(request?: MembershipRequestStatus | null) {
  if (!request) return 'border-slate-200 bg-slate-50 text-slate-700';
  if (request.status === 'PENDING') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (request.status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (request.status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

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
  const [wargaInboxData, setWargaInboxData] = useState<DashboardWargaData | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(false);

  const canSeeApproval = hasAnyRole(user, [
    'Ketua',
    'Plt Ketua',
    'Sekretaris',
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

  const loadWargaInbox = useCallback(async () => {
    if (canSeeApproval || !user) return;
    try {
      setLoadingInbox(true);
      setMessage('');
      const result = await apiFetch<{ success: boolean; data: DashboardWargaData }>('/report/dashboard?refresh=1');
      setWargaInboxData(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat inbox');
    } finally {
      setLoadingInbox(false);
    }
  }, [canSeeApproval, user]);

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

  useEffect(() => {
    if (!loading && user && !canSeeApproval) {
      void loadWargaInbox();
    }
  }, [loading, user, canSeeApproval, loadWargaInbox]);

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

      if (item.kind === 'JIMPITAN_HANDOVER') {
        await apiFetch('/jimpitan/approve-setor-bendahara', {
          method: 'POST',
          body: JSON.stringify({ transaction_id: item.meta.transaction_id ?? item.id })
        });
      }

      if (item.kind === 'SOCIAL_RECEIPT') {
        await apiFetch('/transaction/approve-sosial-receipt', {
          method: 'POST',
          body: JSON.stringify({ transaction_id: item.meta.transaction_id ?? item.id })
        });
      }

      if (item.kind === 'ASSET_RENTAL_PAYMENT') {
        await apiFetch(`/management/assets/rentals/${encodeURIComponent(String(item.meta.rental_id ?? item.id))}/confirm-payment`, {
          method: 'POST',
          body: JSON.stringify({})
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

  if (!canSeeApproval) {
    const inboxItems = INBOX_MODULES.map((item) => {
      const isMember = Boolean(wargaInboxData?.[`${item.key}_is_member` as keyof DashboardWargaData]);
      const request = wargaInboxData?.[`${item.key}_membership_request` as keyof DashboardWargaData] as MembershipRequestStatus | null | undefined;
      return { ...item, isMember, request };
    });
    const pendingCount = inboxItems.filter((item) => item.request?.status === 'PENDING').length;

    return (
      <main className="min-h-screen pb-10">
        <FeedbackToast error={message} />
        <Navbar />

        <div className="mx-auto mt-6 w-full max-w-4xl space-y-5 px-4 md:px-6">
          <Card
            title="Inbox"
            subtitle={`${pendingCount} pengajuan menunggu persetujuan`}
            headerRight={
              <Button variant="ghost" className="text-sm px-3 py-1.5" onClick={() => void loadWargaInbox()} disabled={loadingInbox}>
                {loadingInbox ? 'Memuat...' : 'Refresh'}
              </Button>
            }
          >
            <p className="text-sm text-[var(--text-muted)]">
              Pantau status pengajuan aktif/nonaktif keanggotaan. Jika ingin mengajukan baru, buka halaman Keanggotaan Saya.
            </p>
            <Link href="/akun/keanggotaan" className="btn-action-blue link-action mt-3 inline-flex px-3 py-2 text-sm">
              Buka Keanggotaan Saya
            </Link>
          </Card>

          <Card title="Status Pengajuan" subtitle="Ringkasan inbox pribadi warga">
            <div className="grid gap-3">
              {inboxItems.map((item) => (
                <article key={item.key} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-[var(--text-primary)]">{item.title}</h2>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                          item.isMember
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}>
                          {item.isMember ? 'Aktif' : 'Belum Aktif'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Diproses oleh {item.adminLabel}.</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${inboxRequestClass(item.request)}`}>
                      {inboxRequestLabel(item.request)}
                      {item.request?.created_at ? (
                        <span className="mt-1 block font-normal opacity-80">{formatTanggalIndonesia(item.request.created_at)}</span>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={message && !message.includes('berhasil') ? message : ''} message={message && message.includes('berhasil') ? message : ''} />
      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card title="Inbox Persetujuan" subtitle={`${totalPending} transaksi menunggu persetujuan`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--text-muted)]">
                Total transaksi menunggu: <strong className="text-[var(--text-primary)]">{totalPending}</strong>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {hasAnyRole(user, ['Admin Internet', 'root']) ? <Link href="/approval/internet" className="btn-action-blue link-action px-3 py-1.5 text-xs">Keanggotaan Internet</Link> : null}
                {hasAnyRole(user, ['Admin Lingkungan', 'root']) ? <Link href="/approval/lingkungan" className="btn-action-blue link-action px-3 py-1.5 text-xs">Keanggotaan Lingkungan</Link> : null}
                {hasAnyRole(user, ['Admin Koperasi', 'root']) ? <Link href="/approval/koperasi" className="btn-action-blue link-action px-3 py-1.5 text-xs">Keanggotaan Koperasi</Link> : null}
              </div>
            </div>
            <Button variant="ghost" className="text-sm px-3 py-1.5" onClick={() => void loadPending()} disabled={loadingList}>
              {loadingList ? 'Memuat...' : 'Refresh'}
            </Button>
          </div>
        </Card>

        {canSeeApproval && sections.length === 0 && !loadingList ? (
          <Card title="Tidak Ada Pending" subtitle="Semua transaksi yang bisa Anda approve sudah selesai">
            <p className="text-sm text-[var(--text-muted)]">Belum ada transaksi baru yang membutuhkan persetujuan.</p>
          </Card>
        ) : null}

        {sections.map((section) => (
          <SectionWithPagination
            key={section.key}
            section={section}
            approvingKey={approvingKey}
            approveItem={approveItem}
          />
        ))}

        <Card title="Riwayat Persetujuan" subtitle={`Total ${historyTotal} transaksi`}>
          <div className="space-y-2">
            {loadingHistory ? <p className="text-sm text-[var(--text-muted)]">Memuat riwayat...</p> : null}

            {!loadingHistory && historyItems.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Belum ada riwayat persetujuan untuk role Anda.</p>
            ) : null}

            {historyItems.map((item) => (
              <article key={`history-${item.kind}-${item.id}-${item.approved_at}`} className="surface-muted flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatTanggalIndonesia(item.approved_at)} • {item.approved_by_nama || item.approved_by || '-'}
                  </p>
                </div>
                <p className="metric-value text-base font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="ghost"
              className="text-sm px-3 py-1.5"
              disabled={historyPage <= 1 || loadingHistory}
              onClick={() => void loadHistory(Math.max(1, historyPage - 1))}
            >
              Sebelumnya
            </Button>
            <p className="text-sm text-[var(--text-muted)]">
              {historyPage} / {historyTotalPages}
            </p>
            <Button
              variant="ghost"
              className="text-sm px-3 py-1.5"
              disabled={historyPage >= historyTotalPages || loadingHistory}
              onClick={() => void loadHistory(Math.min(historyTotalPages, historyPage + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </Card>

      </div>
    </main>
  );
}

function SectionWithPagination({
  section,
  approvingKey,
  approveItem
}: {
  section: PendingApprovalSection;
  approvingKey: string;
  approveItem: (item: PendingApprovalItem) => Promise<void>;
}) {
  const pager = usePagination(section.items, 10);
  return (
    <Card title={section.label} subtitle={`${section.items.length} item`}>
            <div className="space-y-2">
              {pager.pagedItems.map((item) => {
                const actionKey = `${item.kind}-${item.id}`;
                const isApproving = approvingKey === actionKey;

                return (
                  <article key={actionKey} className="surface-muted flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">{formatTanggalIndonesia(item.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="metric-value text-base font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                    </div>
                    <Button
                      className="whitespace-nowrap text-sm px-3 py-1.5"
                      onClick={() => void approveItem(item)}
                      disabled={isApproving}
                    >
                      {isApproving ? '...' : 'Approve'}
                    </Button>
                  </article>
                );
              })}
            </div>
      <PaginationControls page={pager.page} totalPages={pager.totalPages} onPrev={pager.prev} onNext={pager.next} />
    </Card>
  );
}
