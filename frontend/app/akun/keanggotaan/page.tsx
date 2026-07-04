'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FeedbackToast from '@/components/ui/FeedbackToast';
import ToastStack from '@/components/ui/ToastStack';
import { apiFetch } from '@/lib/api';
import type { DashboardWargaData, MembershipRequestStatus } from '@/types';
import useToast from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/useAuth';

type MembershipModuleKey = 'internet' | 'lingkungan' | 'koperasi';

type MembershipCard = {
  key: MembershipModuleKey;
  title: string;
  description: string;
  adminLabel: string;
  isMember: boolean;
  request?: MembershipRequestStatus | null;
};

function requestStatusLabel(request?: MembershipRequestStatus | null) {
  if (!request) return 'Belum ada pengajuan';
  const action = request.request_type === 'DEACTIVATE' ? 'nonaktif' : 'aktif';
  if (request.status === 'PENDING') return 'Menunggu approval';
  if (request.status === 'APPROVED') return `Pengajuan ${action} disetujui`;
  if (request.status === 'REJECTED') return `Pengajuan ${action} ditolak`;
  return 'Dibatalkan';
}

function requestStatusClass(request?: MembershipRequestStatus | null) {
  if (!request) return 'border-slate-200 bg-slate-50 text-slate-700';
  if (request.status === 'PENDING') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (request.status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (request.status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function AkunKeanggotaanPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toasts, pushToast } = useToast();
  const [data, setData] = useState<DashboardWargaData | null>(null);
  const [error, setError] = useState('');
  const [busyModule, setBusyModule] = useState('');
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingData(true);
      setError('');
      const result = await apiFetch<{ success: boolean; data: DashboardWargaData }>('/report/dashboard?refresh=1');
      setData(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat status keanggotaan');
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const modules = useMemo<MembershipCard[]>(() => {
    if (!data) return [];
    return [
      {
        key: 'internet',
        title: 'Internet',
        description: 'Akses iuran dan status pembayaran internet warga.',
        adminLabel: 'Admin Internet',
        isMember: Boolean(data.internet_is_member),
        request: data.internet_membership_request
      },
      {
        key: 'lingkungan',
        title: 'Lingkungan',
        description: 'Akses iuran lingkungan/sampah dan status tunggakan.',
        adminLabel: 'Admin Lingkungan',
        isMember: Boolean(data.lingkungan_is_member),
        request: data.lingkungan_membership_request
      },
      {
        key: 'koperasi',
        title: 'Koperasi',
        description: 'Akses informasi koperasi dan pinjaman bila tersedia.',
        adminLabel: 'Admin Koperasi',
        isMember: Boolean(data.koperasi_is_member),
        request: data.koperasi_membership_request
      }
    ];
  }, [data]);

  async function requestMembership(moduleKey: MembershipModuleKey, requestType: 'ACTIVATE' | 'DEACTIVATE') {
    try {
      setBusyModule(moduleKey);
      const res = await apiFetch<{ success: boolean; message?: string }>('/membership/request', {
        method: 'POST',
        body: JSON.stringify({ module_key: moduleKey, request_type: requestType })
      });
      pushToast(res.message || 'Permintaan keanggotaan dikirim.', 'success');
      await loadData();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal mengirim permintaan keanggotaan', 'error');
    } finally {
      setBusyModule('');
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar sticky={false} />
      <FeedbackToast error={error} />
      <ToastStack toasts={toasts} />

      <div className="mx-auto mt-6 w-full max-w-4xl space-y-5 px-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Akun</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">Keanggotaan Saya</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Atur pengajuan aktif untuk modul tambahan tanpa memenuhi dashboard utama.
            </p>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
            Kembali
          </Link>
        </div>

        <Card title="Status Keanggotaan" subtitle="Jika belum aktif, kirim permintaan ke admin modul terkait.">
          {loadingData ? <p className="text-sm text-[var(--text-muted)]">Memuat status...</p> : null}

          <div className="grid gap-3">
            {modules.map((item) => {
              const pending = item.request?.status === 'PENDING';
              const rejected = item.request?.status === 'REJECTED';
              const pendingDeactivate = pending && item.request?.request_type === 'DEACTIVATE';
              const pendingActivate = pending && item.request?.request_type !== 'DEACTIVATE';
              return (
                <article key={item.key} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-[var(--text-primary)]">{item.title}</h2>
                        {item.isMember ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">Aktif</span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">Belum Aktif</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{item.description}</p>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">Approval oleh {item.adminLabel}.</p>
                    </div>

                    <div className="w-full md:w-56">
                      <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${requestStatusClass(item.request)}`}>
                        {requestStatusLabel(item.request)}
                      </div>
                      {item.isMember ? (
                        <Button
                          variant="ghost"
                          className="mt-2 w-full"
                          disabled={busyModule === item.key || pendingDeactivate}
                          onClick={() => void requestMembership(item.key, 'DEACTIVATE')}
                        >
                          {busyModule === item.key
                            ? 'Mengirim...'
                            : pendingDeactivate
                              ? 'Menunggu Nonaktif'
                              : 'Ajukan Nonaktif'}
                        </Button>
                      ) : (
                        <Button
                          className="mt-2 w-full"
                          disabled={busyModule === item.key || pendingActivate}
                          onClick={() => void requestMembership(item.key, 'ACTIVATE')}
                        >
                          {busyModule === item.key
                            ? 'Mengirim...'
                            : pendingActivate
                              ? 'Menunggu Approval'
                              : rejected
                                ? 'Ajukan Ulang'
                                : 'Minta Aktif'}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      </div>
    </main>
  );
}
