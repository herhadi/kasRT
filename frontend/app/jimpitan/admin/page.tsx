'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, formatTanggalIndonesia, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type WargaOption = { id: string; nama: string; no_hp?: string };
type ExternalParticipant = {
  id: string;
  nama: string;
  no_hp?: string | null;
  keterangan?: string | null;
  is_active: boolean;
};
type SetorHistoryItem = {
  id: number;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  description: string;
  created_at: string;
  approved_at?: string | null;
  target_wallet_name?: string | null;
};

export default function JimpitanAdminPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
  const [topupWargaId, setTopupWargaId] = useState('');
  const [topupNominal, setTopupNominal] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [setorPeriod, setSetorPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [setorLoading, setSetorLoading] = useState(false);
  const [setorHistoryLoading, setSetorHistoryLoading] = useState(false);
  const [setorHistory, setSetorHistory] = useState<SetorHistoryItem[]>([]);
  const [externalParticipants, setExternalParticipants] = useState<ExternalParticipant[]>([]);
  const [donaturNama, setDonaturNama] = useState('');
  const [donaturNoHp, setDonaturNoHp] = useState('');
  const [donaturKeterangan, setDonaturKeterangan] = useState('');
  const [savingDonatur, setSavingDonatur] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: 'success' | 'error' | 'warning' }>>([]);

  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);
  const isKetua = hasAnyRole(user, ['Ketua']);

  const pushToast = useCallback((message: string, kind: 'success' | 'error' | 'warning' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const loadWargaOptions = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: WargaOption[] }>('/auth/warga-options');
    const rows = result.data || [];
    setWargaOptions(rows);
    setTopupWargaId((previous) => {
      if (previous && rows.some((row) => String(row.id) === String(previous))) return previous;
      return rows[0]?.id ? String(rows[0].id) : '';
    });
  }, []);

  const loadSetorHistory = useCallback(async () => {
    setSetorHistoryLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; data: SetorHistoryItem[] }>('/jimpitan/setor-history?limit=20');
      setSetorHistory(result.data || []);
    } finally {
      setSetorHistoryLoading(false);
    }
  }, []);

  const loadExternalParticipants = useCallback(async () => {
    if (!isAdminJimpitan) return;
    const result = await apiFetch<{ success: boolean; data: ExternalParticipant[] }>('/jimpitan/external-participants');
    setExternalParticipants(result.data || []);
  }, [isAdminJimpitan]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAdminJimpitan && !isKetua) {
      router.replace('/jimpitan');
      return;
    }
    void Promise.all([loadWargaOptions(), loadSetorHistory(), loadExternalParticipants()]).catch((error) => {
      pushToast(error instanceof Error ? error.message : 'Gagal memuat data admin jimpitan', 'error');
    });
  }, [loading, user, isAdminJimpitan, isKetua, router, loadWargaOptions, loadSetorHistory, loadExternalParticipants, pushToast]);

  const setorHistoryPager = usePagination(setorHistory, 20);

  useEffect(() => {
    setorHistoryPager.reset();
  }, [setorHistory.length]);

  async function handleTopup() {
    const wargaId = String(topupWargaId || '').trim();
    const nominal = parseRupiahInput(topupNominal);

    if (!wargaId) {
      pushToast('Pilih warga yang valid terlebih dahulu.', 'warning');
      return;
    }
    if (!Number.isFinite(nominal) || nominal <= 0) {
      pushToast('Nominal top up harus lebih dari 0.', 'warning');
      return;
    }

    try {
      setTopupLoading(true);
      await apiFetch('/jimpitan/topup', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wargaId, nominal })
      });
      setTopupNominal('');
      await loadWargaOptions();
      pushToast('Top up saldo berhasil.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Top up gagal', 'error');
    } finally {
      setTopupLoading(false);
    }
  }

  async function handleAjukanSetorBendahara() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(setorPeriod)) {
      pushToast('Format periode harus YYYY-MM.', 'warning');
      return;
    }
    try {
      setSetorLoading(true);
      const result = await apiFetch<{
        success: boolean;
        data: { periode: string; total_batch: number; total_nominal: number };
      }>('/jimpitan/ajukan-setor-bendahara', {
        method: 'POST',
        body: JSON.stringify({ bulan: setorPeriod })
      });
      const data = result.data;
      pushToast(
        `Pengajuan setor dikirim • ${data.periode} • batch ${data.total_batch}`,
        'success'
      );
      await loadSetorHistory();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal ajukan setor ke Bendahara', 'error');
    } finally {
      setSetorLoading(false);
    }
  }

  async function handleAddDonatur() {
    if (!donaturNama.trim()) {
      pushToast('Nama donatur wajib diisi.', 'warning');
      return;
    }
    try {
      setSavingDonatur(true);
      await apiFetch('/jimpitan/external-participants', {
        method: 'POST',
        body: JSON.stringify({
          nama: donaturNama.trim(),
          no_hp: donaturNoHp.trim(),
          keterangan: donaturKeterangan.trim()
        })
      });
      setDonaturNama('');
      setDonaturNoHp('');
      setDonaturKeterangan('');
      await loadExternalParticipants();
      pushToast('Donatur jimpitan berhasil ditambahkan.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal menambah donatur', 'error');
    } finally {
      setSavingDonatur(false);
    }
  }

  async function toggleDonaturStatus(item: ExternalParticipant) {
    try {
      await apiFetch(`/jimpitan/external-participants/${encodeURIComponent(item.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ is_active: !item.is_active })
      });
      await loadExternalParticipants();
      pushToast(`${item.nama} ${item.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`, 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal mengubah status donatur', 'error');
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
              toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : toast.kind === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <Navbar />

      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-5 md:px-6">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Admin Jimpitan</p>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Menu Khusus Admin</h2>
          </div>
          <Link
            href="/jimpitan"
            className="btn-action-blue link-action px-3 py-2"
          >
            Kembali ke Input
          </Link>
        </div>

        <Card title="Top Up Saldo Warga" subtitle="Kelola top up tanpa mengganggu alur input harian">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Warga</span>
              <select
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                value={topupWargaId}
                onChange={(event) => setTopupWargaId(event.target.value)}
              >
                {wargaOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nama}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Nominal"
              type="text"
              inputMode="numeric"
              value={formatRupiahInput(topupNominal)}
              onChange={(event) => setTopupNominal(event.target.value)}
              placeholder="Contoh: 50.000"
            />
            <div className="flex items-end">
              <Button className="w-full" onClick={handleTopup} disabled={topupLoading}>
                {topupLoading ? 'Menyimpan...' : 'Simpan Top Up'}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Setor Kas ke Bendahara" subtitle="Ajukan serah-terima kas jimpitan. Bendahara akan approve saat uang fisik diterima.">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              label="Periode Rekap (YYYY-MM)"
              value={setorPeriod}
              onChange={(event) => setSetorPeriod(event.target.value)}
              placeholder="Contoh: 2026-03"
            />
            <div className="flex items-end md:col-span-2">
              <Button className="w-full md:w-auto" onClick={handleAjukanSetorBendahara} disabled={setorLoading}>
                {setorLoading ? 'Mengajukan...' : 'Ajukan Setor ke Bendahara'}
              </Button>
            </div>
          </div>
        </Card>

        {isAdminJimpitan ? (
          <Card title="Donatur Jimpitan" subtitle="Kelola donatur non-warga yang ikut daftar input jimpitan harian">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Nama Donatur" value={donaturNama} onChange={(event) => setDonaturNama(event.target.value)} />
              <Input label="No HP" value={donaturNoHp} onChange={(event) => setDonaturNoHp(event.target.value)} />
              <Input label="Keterangan" value={donaturKeterangan} onChange={(event) => setDonaturKeterangan(event.target.value)} />
              <div className="flex items-end">
                <Button className="w-full" onClick={handleAddDonatur} disabled={savingDonatur}>
                  {savingDonatur ? 'Menyimpan...' : 'Tambah Donatur'}
                </Button>
              </div>
            </div>
            {externalParticipants.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {externalParticipants.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void toggleDonaturStatus(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      item.is_active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-500'
                    }`}
                  >
                    {item.nama} {item.is_active ? 'Aktif' : 'Nonaktif'}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-muted)]">Belum ada donatur jimpitan.</p>
            )}
          </Card>
        ) : null}

        <Card title="Riwayat Setor ke Bendahara" subtitle="Jejak pengajuan setor kas jimpitan oleh Admin Jimpitan">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Waktu Ajukan</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tujuan</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Nominal</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {setorHistoryLoading ? (
                  <tr className="bg-[var(--surface)]">
                    <td colSpan={4} className="px-4 py-3 text-sm text-[var(--text-muted)]">Memuat riwayat setor...</td>
                  </tr>
                ) : setorHistory.length === 0 ? (
                  <tr className="bg-[var(--surface)]">
                    <td colSpan={4} className="px-4 py-3 text-sm text-[var(--text-muted)]">Belum ada riwayat setor.</td>
                  </tr>
                ) : (
                  setorHistoryPager.pagedItems.map((row) => (
                    <tr key={row.id} className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{formatTanggalIndonesia(row.created_at)}</td>
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.target_wallet_name || '-'}</td>
                      <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.amount || 0))}</td>
                      <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{row.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <PaginationControls
              page={setorHistoryPager.page}
              totalPages={setorHistoryPager.totalPages}
              onPrev={setorHistoryPager.prev}
              onNext={setorHistoryPager.next}
            />
          </div>
        </Card>
      </div>
    </main>
  );
}
