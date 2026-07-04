'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import MembershipRequestPanel, { MembershipRequestItem } from '@/components/membership/MembershipRequestPanel';

type ModuleKey = 'internet' | 'lingkungan' | 'koperasi';

const META: Record<ModuleKey, { label: string; roles: string[]; backHref: string }> = {
  internet: { label: 'Internet', roles: ['Admin Internet', 'root'], backHref: '/operasional/internet' },
  lingkungan: { label: 'Lingkungan', roles: ['Admin Lingkungan', 'root'], backHref: '/operasional/lingkungan' },
  koperasi: { label: 'Koperasi', roles: ['Admin Koperasi', 'root'], backHref: '/operasional/koperasi' }
};

export default function MembershipApprovalPage({ moduleKey }: { moduleKey: ModuleKey }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const meta = META[moduleKey];
  const [requests, setRequests] = useState<MembershipRequestItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const canApprove = hasAnyRole(user, meta.roles);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadRequests = useCallback(async () => {
    if (!canApprove) return;
    try {
      setLoadingList(true);
      setMessage('');
      const res = await apiFetch<{ success: boolean; data: MembershipRequestItem[] }>(`/membership/requests?module_key=${moduleKey}`);
      setRequests(res.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat request keanggotaan');
    } finally {
      setLoadingList(false);
    }
  }, [canApprove, moduleKey]);

  useEffect(() => {
    if (!loading && user && canApprove) {
      void loadRequests();
      const interval = window.setInterval(() => void loadRequests(), 20000);
      return () => window.clearInterval(interval);
    }
  }, [loading, user, canApprove, loadRequests]);

  async function reviewMembershipRequest(requestId: string, status: 'APPROVED' | 'REJECTED') {
    try {
      setBusy(true);
      setMessage('');
      const res = await apiFetch<{ success: boolean; message?: string }>('/membership/review', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId, status })
      });
      setMessage(res.message || 'Request keanggotaan diproses.');
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memproses request keanggotaan');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={message && !message.includes('berhasil') ? message : ''} message={message && message.includes('berhasil') ? message : ''} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card
          title={`Approval Keanggotaan ${meta.label}`}
          subtitle="Approve request warga untuk aktif atau nonaktif dari anggota modul ini"
          headerRight={
            <Button variant="ghost" onClick={() => void loadRequests()} disabled={loadingList || busy}>
              {loadingList ? 'Memuat...' : 'Refresh'}
            </Button>
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              Pending: <b className="text-[var(--text-primary)]">{requests.length}</b>
            </p>
            <Link href={meta.backHref} className="btn-action-blue link-action px-3 py-1.5 text-xs">
              Kembali ke Operasional
            </Link>
          </div>
        </Card>

        {!canApprove ? (
          <Card title="Tidak Ada Akses" subtitle={`Khusus ${meta.roles.join(' / ')}`}>
            <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses approval keanggotaan {meta.label}.</p>
          </Card>
        ) : (
          <MembershipRequestPanel
            title={`Request Keanggotaan ${meta.label}`}
            requests={requests}
            busy={busy}
            onApprove={(requestId) => void reviewMembershipRequest(requestId, 'APPROVED')}
            onReject={(requestId) => void reviewMembershipRequest(requestId, 'REJECTED')}
          />
        )}
      </div>
    </main>
  );
}
