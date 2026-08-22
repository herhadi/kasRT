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
import ApprovalItemCard from '@/components/approval/ApprovalItemCard';

type InboxModuleKey = 'internet' | 'lingkungan' | 'koperasi';
type MembershipQueueKey = InboxModuleKey | 'tabungan';

const INBOX_MODULES: Array<{
  key: InboxModuleKey;
  title: string;
  adminLabel: string;
}> = [
  { key: 'internet', title: 'Internet', adminLabel: 'Admin Internet' },
  { key: 'lingkungan', title: 'Lingkungan', adminLabel: 'Admin Lingkungan' },
  { key: 'koperasi', title: 'Koperasi', adminLabel: 'Admin Koperasi' }
];

const MEMBERSHIP_QUEUE_MODULES: Array<{
  key: MembershipQueueKey;
  title: string;
  label: string;
  roles: string[];
  href: string;
}> = [
  { key: 'internet', title: 'Keanggotaan Internet', label: 'internet', roles: ['Admin Internet', 'root'], href: '/approval/internet' },
  { key: 'lingkungan', title: 'Keanggotaan Lingkungan', label: 'lingkungan', roles: ['Admin Lingkungan', 'root'], href: '/approval/lingkungan' },
  { key: 'koperasi', title: 'Keanggotaan Koperasi', label: 'koperasi', roles: ['Admin Koperasi', 'root'], href: '/approval/koperasi' },
  { key: 'tabungan', title: 'Keanggotaan Tabungan', label: 'tabungan', roles: ['Admin Pembangunan', 'root'], href: '/approval/tabungan' }
];

type MembershipQueueItem = (typeof MEMBERSHIP_QUEUE_MODULES)[number] & {
  count: number;
};

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
  const [message, setMessage] = useState('');
  const [approvingKey, setApprovingKey] = useState<string>('');
  const [historyItems, setHistoryItems] = useState<ApprovalHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [membershipQueues, setMembershipQueues] = useState<MembershipQueueItem[]>([]);
  const [loadingMembershipQueues, setLoadingMembershipQueues] = useState(false);
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
  const canSeeTransactionApprovals = hasAnyRole(user, [
    'Ketua',
    'Plt Ketua',
    'Sekretaris',
    'Bendahara',
    'Admin Jimpitan',
    'Admin Sosial',
    'root'
  ]);
  const canManagePinReset = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadPending = useCallback(async () => {
    if (!canSeeApproval) return;
    if (!canSeeTransactionApprovals) {
      setSections([]);
      return;
    }

    try {
      const result = await apiFetch<{
        success: boolean;
        data: { total_pending: number; sections: PendingApprovalSection[] };
      }>('/approval/pending');

      setSections(result.data?.sections || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat daftar approval');
    }
  }, [canSeeApproval, canSeeTransactionApprovals]);

  const loadHistory = useCallback(
    async (page: number) => {
      if (!canSeeApproval) return;
      if (!canSeeTransactionApprovals) {
        setHistoryItems([]);
        setHistoryPage(1);
        setHistoryTotalPages(1);
        setHistoryTotal(0);
        return;
      }

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
    [canSeeApproval, canSeeTransactionApprovals]
  );

  const loadMembershipQueues = useCallback(async () => {
    if (!canSeeApproval || !user) return;
    const visibleModules = MEMBERSHIP_QUEUE_MODULES.filter((item) => hasAnyRole(user, item.roles));

    if (visibleModules.length === 0) {
      setMembershipQueues([]);
      return;
    }

    try {
      setLoadingMembershipQueues(true);
      const counts = await Promise.all(
        visibleModules.map((item) =>
          apiFetch<{ success: boolean; data: unknown[] }>(`/membership/requests?module_key=${item.key}`)
            .then((result) => Number(result.data?.length || 0))
            .catch(() => 0)
        )
      );

      setMembershipQueues(visibleModules.map((item, index) => ({ ...item, count: counts[index] || 0 })));
    } finally {
      setLoadingMembershipQueues(false);
    }
  }, [canSeeApproval, user]);

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
        setHistoryItems([]);
        setHistoryPage(1);
        setHistoryTotalPages(1);
        setHistoryTotal(0);
        setMembershipQueues([]);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const refreshInbox = () => {
      void loadPending();
      void loadHistory(1);
      void loadMembershipQueues();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshInbox();
    };
    const handleFocus = () => {
      refreshInbox();
    };

    refreshInbox();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [canSeeApproval, loadPending, loadHistory, loadMembershipQueues]);

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

      if (item.kind === 'SPECIAL_BILL_BATCH') {
        await apiFetch('/special-bills/approve-batch', {
          method: 'POST',
          body: JSON.stringify({ batch_id: item.meta.batch_id ?? item.id })
        });
      }

      if (item.kind === 'PIN_RESET') {
        await apiFetch(`/management/pin-reset-requests/${encodeURIComponent(String(item.meta.request_id ?? item.id))}/reset`, {
          method: 'POST',
          body: JSON.stringify({})
        });
      }

      setMessage(item.kind === 'PIN_RESET' ? `${item.title} berhasil diproses.` : `${item.title} berhasil di-approve.`);
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

          <InboxPlaceholderCards />
        </div>
      </main>
    );
  }

  const approvalSections = sections.filter((section) => section.key !== 'pin_reset' && section.items.length > 0);
  const pinResetSections = sections.filter((section) => section.key === 'pin_reset' && section.items.length > 0);

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={message && !message.includes('berhasil') ? message : ''} message={message && message.includes('berhasil') ? message : ''} />
      <Navbar />

      <div className="page-container mt-6 space-y-5">
        {canSeeTransactionApprovals ? (
          <Card title="Approval" subtitle={`${approvalSections.reduce((total, section) => total + section.items.length, 0)} item approval transaksi`}>
            {approvalSections.length > 0 ? (
              <div className="space-y-4">
                {approvalSections.map((section) => (
                  <SectionWithPagination
                    key={section.key}
                    section={section}
                    approvingKey={approvingKey}
                    approveItem={approveItem}
                    embedded
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Belum ada approval transaksi yang perlu diproses.</p>
            )}
          </Card>
        ) : null}

        {canManagePinReset ? (
          <Card title="Permintaan Reset PIN" subtitle={`${pinResetSections.reduce((total, section) => total + section.items.length, 0)} permintaan perlu ditindaklanjuti`}>
            {pinResetSections.length > 0 ? (
              pinResetSections.map((section) => (
                <SectionWithPagination
                  key={section.key}
                  section={section}
                  approvingKey={approvingKey}
                  approveItem={approveItem}
                />
              ))
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Belum ada permintaan reset PIN.</p>
            )}
          </Card>
        ) : null}

        {membershipQueues.length > 0 ? (
          <Card title="Antrean Keanggotaan" subtitle="List request aktif/nonaktif per modul">
            <div className="space-y-2">
              {membershipQueues.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="surface-muted flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 transition hover:border-[var(--accent)] hover:bg-[var(--surface)]"
                >
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-bold lowercase text-[var(--text-primary)]">
                      {item.label}
                    </span>
                    <p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    item.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {loadingMembershipQueues ? '...' : `${item.count} request`}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

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

        <InboxPlaceholderCards />

      </div>
    </main>
  );
}

function SectionWithPagination({
  section,
  approvingKey,
  approveItem,
  embedded = false
}: {
  section: PendingApprovalSection;
  approvingKey: string;
  approveItem: (item: PendingApprovalItem) => Promise<void>;
  embedded?: boolean;
}) {
  const pager = usePagination(section.items, 10);
  const content = (
    <>
      <div className="space-y-2">
        {embedded ? (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{section.label}</h3>
            <span className="text-xs text-[var(--text-muted)]">{section.items.length} item</span>
          </div>
        ) : null}
        <div className="space-y-2">
              {pager.pagedItems.map((item) => {
                const actionKey = `${item.kind}-${item.id}`;
                const isApproving = approvingKey === actionKey;

                return (
                  <ApprovalItemCard
                    key={actionKey}
                    item={item}
                    busy={isApproving}
                    actionLabel={item.kind === 'PIN_RESET' ? 'Proses Reset PIN' : 'Approve'}
                    onAction={(selectedItem) => void approveItem(selectedItem)}
                  />
                );
              })}
        </div>
      </div>
      <PaginationControls page={pager.page} totalPages={pager.totalPages} onPrev={pager.prev} onNext={pager.next} />
    </>
  );
  return embedded ? content : <Card title={section.label} subtitle={`${section.items.length} item`}>{content}</Card>;
}

function InboxPlaceholderCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Pembayaran" subtitle="Riwayat notifikasi iuran dan setoran">
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--text-muted)]">
          Belum ada pesan pembayaran. Nantinya bagian ini akan berisi info seperti iuran diterima, setoran tabungan tercatat, atau pembayaran koperasi.
        </div>
      </Card>

      <Card title="Pengingat" subtitle="Info penting yang perlu ditindaklanjuti">
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--text-muted)]">
          Belum ada pengingat. Nantinya bagian ini bisa menampilkan tunggakan aktif, saldo minus, atau informasi jatuh tempo.
        </div>
      </Card>
    </div>
  );
}
