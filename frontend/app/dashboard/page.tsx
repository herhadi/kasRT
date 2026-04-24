'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { DashboardWargaData } from '@/types';

type AdminPanelData = Record<string, number | string>;

export default function DashboardPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();

  const [wargaData, setWargaData] = useState<DashboardWargaData | null>(null);
  const [adminData, setAdminData] = useState<AdminPanelData | null>(null);
  const [error, setError] = useState('');

  const adminEndpoint = useMemo(() => {
    if (!user) return null;
    if (hasAnyRole(user, ['Admin Jimpitan', 'root'])) return '/report/dashboard-admin-jimpitan';
    if (hasAnyRole(user, ['Admin Pembangunan'])) return '/report/dashboard-admin-pembangunan';
    if (hasAnyRole(user, ['Admin Internet'])) return '/report/dashboard-admin-internet';
    if (hasAnyRole(user, ['Admin Lingkungan'])) return '/report/dashboard-admin-lingkungan';
    if (hasAnyRole(user, ['Admin Koperasi'])) return '/report/dashboard-admin-koperasi';
    return null;
  }, [user]);

  const operationalDate = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const date = new Date(now);
    // Operational day ends at 12:00 (noon) the next day
    // So if it's before 12:00, we're still in previous day's operational period
    if (hour < 12) {
      date.setDate(date.getDate() - 1);
    }
    return date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    async function loadDashboard() {
      if (!user) return;
      setError('');

      try {
        const [meResult, wargaResult] = await Promise.all([
          apiFetch<{ success: boolean; user: { id: number; nama: string; roles: string[]; telegram_connected?: boolean } }>('/auth/me'),
          apiFetch<{ success: boolean; data: DashboardWargaData }>('/report/dashboard')
        ]);

        refreshUser(meResult.user);
        setWargaData(wargaResult.data);

        if (adminEndpoint) {
          const adminResult = await apiFetch<{ success: boolean; data: AdminPanelData }>(adminEndpoint);
          setAdminData(adminResult.data);
        } else {
          setAdminData(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat dashboard');
      }
    }

    loadDashboard();
  }, [user, adminEndpoint, refreshUser]);

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <section className="glass-card rounded-3xl p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">Operasional</p>
            <p className="text-xs text-gray-600">{operationalDate}</p>
          </div>
          <h1 className="mt-3 font-[var(--font-space-grotesk)] text-3xl font-bold">Halo, {user.nama}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Role: {user.roles.join(', ') || 'Warga'}</p>
        </section>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {wargaData ? (
          <>
            <section className="grid gap-4 grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
              <Metric title="Jimpitan Bulan Ini" value={formatRupiah(wargaData.jimpitan_bulan_ini)} />
              <Metric title="Iuran Wajib" value={formatRupiah(wargaData.iuran_wajib_bulan_ini)} />
              <Metric title="Opsional" value={formatRupiah(wargaData.total_optional_bulan_ini)} />
              <Metric title="Total Kontribusi" value={formatRupiah(wargaData.total_kontribusi_bulan_ini)} />
            </section>

            <section className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card title="Kontribusi Dasar" subtitle="Jimpitan + iuran wajib">
                <div className="space-y-2 text-sm">
                  <Line label="Target Jimpitan" value={formatRupiah(wargaData.target_jimpitan_bulanan)} />
                  <Line label="Target Iuran Wajib" value={formatRupiah(wargaData.target_iuran_wajib)} />
                  <Line label="Target Dasar" value={formatRupiah(wargaData.target_kontribusi_dasar)} />
                </div>
              </Card>

              <Card title="Status Internet & Lingkungan" subtitle="Monitoring iuran layanan bulanan">
                <div className="space-y-2 text-sm">
                  <Line label="Internet" value={`${formatRupiah(wargaData.internet_bulan_ini)} (${wargaData.internet_status})`} />
                  <Line label="Lingkungan" value={`${formatRupiah(wargaData.lingkungan_bulan_ini)} (${wargaData.lingkungan_status})`} />
                </div>
              </Card>
            </section>

            <Card title="Iuran Opsional" subtitle="Kontribusi di luar iuran dasar">
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {wargaData.optional_contributions.filter((item) => item.is_mandatory === false).length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Belum ada kontribusi opsional bulan ini.</p>
                ) : (
                  wargaData.optional_contributions
                    .filter((item) => item.is_mandatory === false)
                    .map((item) => (
                      <div key={item.name} className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="metric-value mt-1 text-xl font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p>
                      </div>
                    ))
                )}
              </div>
            </Card>

            {adminData ? (
              <Card title="Panel Admin" subtitle="Ringkasan sesuai role Anda">
                <pre className="overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(adminData, null, 2)}</pre>
              </Card>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--text-muted)]">
            Memuat dashboard...
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="glass-card rounded-3xl p-5">
      <p className="text-sm text-[var(--text-muted)]">{title}</p>
      <p className="metric-value mt-2 text-2xl font-bold text-[var(--accent)]">{value}</p>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}
