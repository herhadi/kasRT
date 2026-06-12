'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatTanggalIndonesia } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { ApprovalHistoryItem, PendingApprovalItem, PendingApprovalSection } from '@/types';

const BENDAHARA_KINDS = new Set(['JIMPITAN_HANDOVER', 'ASSET_RENTAL_PAYMENT']);

export default function BendaharaApprovalPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const jimpitanItems = items.filter((item) => item.kind === 'JIMPITAN_HANDOVER');
  const assetRentalItems = items.filter((item) => item.kind === 'ASSET_RENTAL_PAYMENT');
  const [historyItems, setHistoryItems] = useState<ApprovalHistoryItem[]>([]);
  const [message, setMessage] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [approvingKey, setApprovingKey] = useState('');

  const canApproveBendahara = hasAnyRole(user, ['Bendahara', 'root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadData = useCallback(async () => {
    if (!canApproveBendahara) return;
    setLoadingList(true);
    try {
      const [pending, history] = await Promise.all([
        apiFetch<{ success: boolean; data: { sections: PendingApprovalSection[] } }>('/approval/pending'),
        apiFetch<{ success: boolean; data: { items: ApprovalHistoryItem[] } }>('/approval/history?page=1&limit=20')
      ]);
      const sectionItems = (pending.data?.sections || [])
        .filter((section) => section.key === 'bendahara_receipt' || section.key === 'jimpitan_handover')
        .flatMap((section) => section.items || [])
        .filter((item) => BENDAHARA_KINDS.has(item.kind));
      setItems(sectionItems);
      setHistoryItems((history.data?.items || []).filter((item) => BENDAHARA_KINDS.has(item.kind)).slice(0, 10));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat approval bendahara');
    } finally {
      setLoadingList(false);
    }
  }, [canApproveBendahara]);

  useEffect(() => {
    if (!loading && user && canApproveBendahara) {
      void loadData();
      const interval = window.setInterval(() => void loadData(), 20000);
      return () => window.clearInterval(interval);
    }
  }, [loading, user, canApproveBendahara, loadData]);

  async function approveItem(item: PendingApprovalItem) {
    const actionKey = `${item.kind}-${item.id}`;
    setApprovingKey(actionKey);
    setMessage('');
    try {
      if (item.kind === 'JIMPITAN_HANDOVER') {
        await apiFetch('/jimpitan/approve-setor-bendahara', {
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

      setMessage(`${item.title} berhasil diterima Bendahara.`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Approval Bendahara gagal diproses');
    } finally {
      setApprovingKey('');
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={message && !message.includes('berhasil') ? message : ''} message={message && message.includes('berhasil') ? message : ''} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card
          title="Approval Bendahara"
          subtitle="Penerimaan uang fisik: setor jimpitan dan sewa aset"
          headerRight={
            <Button variant="ghost" onClick={() => void loadData()} disabled={loadingList}>
              {loadingList ? 'Memuat...' : 'Refresh'}
            </Button>
          }
        >
          <p className="text-sm text-[var(--text-muted)]">
            Total pending penerimaan Bendahara: <b className="text-[var(--text-primary)]">{items.length}</b>
          </p>
        </Card>

        {!canApproveBendahara ? (
          <Card title="Tidak Ada Akses" subtitle="Khusus Bendahara atau root">
            <p className="text-sm text-[var(--text-muted)]">Halaman ini hanya untuk konfirmasi uang yang diterima Bendahara.</p>
          </Card>
        ) : null}

        {canApproveBendahara ? (
          <ApprovalGroup
            title="Terima Setor Jimpitan"
            subtitle="Setoran kas jimpitan dari Admin Jimpitan"
            emptyText="Belum ada setor jimpitan yang menunggu Bendahara."
            items={jimpitanItems}
            approvingKey={approvingKey}
            onApprove={approveItem}
            loading={loadingList}
          />
        ) : null}

        {canApproveBendahara ? (
          <ApprovalGroup
            title="Penerimaan Sewa Aset"
            subtitle="Pembayaran sewa aset yang baru masuk kas setelah Bendahara menerima uang"
            emptyText="Belum ada sewa aset yang menunggu Bendahara."
            items={assetRentalItems}
            approvingKey={approvingKey}
            onApprove={approveItem}
            loading={loadingList}
          />
        ) : null}

        {canApproveBendahara ? (
          <Card title="Riwayat Penerimaan" subtitle="10 penerimaan Bendahara terakhir">
            <div className="space-y-2">
              {historyItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Belum ada riwayat penerimaan Bendahara.</p>
              ) : null}
              {historyItems.map((item) => (
                <article key={`history-${item.kind}-${item.id}-${item.approved_at}`} className="surface-muted flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatTanggalIndonesia(item.approved_at)} • {item.approved_by_nama || '-'}</p>
                  </div>
                  <p className="metric-value text-base font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                </article>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function ApprovalGroup({
  title,
  subtitle,
  emptyText,
  items,
  approvingKey,
  onApprove,
  loading
}: {
  title: string;
  subtitle: string;
  emptyText: string;
  items: PendingApprovalItem[];
  approvingKey: string;
  onApprove: (item: PendingApprovalItem) => Promise<void>;
  loading: boolean;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      {items.length === 0 && !loading ? (
        <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>
      ) : null}
      <div className="space-y-2">
        {items.map((item) => {
          const actionKey = `${item.kind}-${item.id}`;
          const isApproving = approvingKey === actionKey;
          return (
            <article key={actionKey} className="surface-muted flex flex-col gap-3 rounded-xl border border-[var(--line)] p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{item.description}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatTanggalIndonesia(item.created_at)}</p>
              </div>
              <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                <p className="metric-value text-base font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                <Button className="whitespace-nowrap text-sm px-3 py-1.5" onClick={() => void onApprove(item)} disabled={isApproving}>
                  {isApproving ? '...' : 'Terima Uang'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
