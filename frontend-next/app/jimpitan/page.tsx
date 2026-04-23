'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import FormJimpitan from './FormJimpitan';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { JimpitanListItem } from '@/types';

export default function JimpitanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<JimpitanListItem[]>([]);
  const [selected, setSelected] = useState<JimpitanListItem | null>(null);
  const [error, setError] = useState('');
  const [setorLoading, setSetorLoading] = useState(false);

  const [topupWargaId, setTopupWargaId] = useState('');
  const [topupNominal, setTopupNominal] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: 'success' | 'error' | 'warning' }>>([]);
  const [editTarget, setEditTarget] = useState<JimpitanListItem | null>(null);
  const [editNominal, setEditNominal] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);

  const pushToast = useCallback((message: string, kind: 'success' | 'error' | 'warning' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadList = useCallback(async () => {
    try {
      setError('');
      const result = await apiFetch<{ success: boolean; data: JimpitanListItem[] }>('/jimpitan/list');
      setItems(result.data || []);
      setTopupWargaId((previous) => {
        const rows = result.data || [];
        if (previous && rows.some((row) => String(row.id) === String(previous))) {
          return previous;
        }
        return rows[0]?.id ? String(rows[0].id) : '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data jimpitan');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadList]);

  const stats = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        if (row.isLunas && row.nominalTerbayar > 0) acc.lunas += 1;
        else if (row.isLunas) acc.kosong += 1;
        else acc.belum += 1;

        const isDepositMarker = ['deposit', 'sistem (saldo)'].includes(String(row.namaPetugas || '').toLowerCase());
        const isTunai = row.isLunas && Number(row.nominalTerbayar || 0) > 0 && !isDepositMarker;

        // Samakan perilaku frontend lama: total setor hanya uang tunai yang diinput oleh petugas login.
        if (isTunai && String(row.namaPetugas || '') === String(user?.nama || '')) {
          acc.total += Number(row.nominalTerbayar || 0);
        }

        return acc;
      },
      { lunas: 0, kosong: 0, belum: 0, total: 0 }
    );
  }, [items, user?.nama]);

  const hasTunaiData = useMemo(() => {
    return items.some((row) => {
      const marker = String(row.namaPetugas || '').toLowerCase();
      return row.isLunas && Number(row.nominalTerbayar || 0) > 0 && marker !== 'deposit' && marker !== 'sistem (saldo)';
    });
  }, [items]);

  async function submitInput(nominal: number) {
    if (!selected) return;
    try {
      await apiFetch('/jimpitan/input', {
        method: 'POST',
        body: JSON.stringify({ warga_id: selected.id, nominal })
      });
      await loadList();
      setSelected(null);
      pushToast('Input jimpitan berhasil disimpan.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal input jimpitan';
      pushToast(message, 'error');
    }
  }

  async function handleSetor() {
    if (stats.total <= 0) {
      pushToast('Belum ada uang tunai yang bisa disetor.', 'warning');
      return;
    }

    if (!window.confirm(`Setorkan dana ${formatRupiah(stats.total)} ke Admin Jimpitan?`)) {
      return;
    }

    try {
      setSetorLoading(true);
      await apiFetch('/jimpitan/setor', { method: 'POST', body: JSON.stringify({}) });
      await loadList();
      pushToast('Setor jimpitan berhasil diajukan. Menunggu approval.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Setor gagal', 'error');
    } finally {
      setSetorLoading(false);
    }
  }

  function handleKirimRekapWA() {
    if (!items.length) {
      pushToast('Data warga tidak ditemukan.', 'warning');
      return;
    }

    const d = new Date();
    if (d.getHours() < 18) d.setDate(d.getDate() - 1);
    const tglHeader = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(d);

    let totalTunai = 0;
    let wargaTunai = 0;
    let wargaBelum = 0;
    let wargaKosong = 0;
    let wargaDeposit = 0;

    let pesan = '📝 *REKAP JIMPITAN WARGA*\\n';
    pesan += `📅 *${tglHeader}*\\n`;
    pesan += '━━━━━━━━━━━━━━━\\n';

    items.forEach((w, index) => {
      const marker = String(w.namaPetugas || '').toLowerCase();
      const isDeposit = marker === 'deposit' || marker === 'sistem (saldo)';

      pesan += `${index + 1}. *${w.nama.toUpperCase()}*\\n`;
      if (w.isLunas) {
        if (isDeposit) {
          pesan += '      └─ 🏦 _Lunas (Deposit)_\\n';
          wargaDeposit += 1;
        } else if (Number(w.nominalTerbayar || 0) > 0) {
          pesan += `      └─ ✅ ${formatRupiah(w.nominalTerbayar)}\\n`;
          totalTunai += Number(w.nominalTerbayar || 0);
          wargaTunai += 1;
        } else {
          pesan += '      └─ ⚪ _Kosong_\\n';
          wargaKosong += 1;
        }
      } else {
        pesan += '      └─ 🔴 _Belum_\\n';
        wargaBelum += 1;
      }
    });

    pesan += '\\n━━━━━━━━━━━━━━━\\n';
    pesan += `💰 *TOTAL TUNAI: ${formatRupiah(totalTunai)}*\\n`;
    pesan += '📊 *STATISTIK:*\\n';
    pesan += `   ✅ Lunas (Tunai): ${wargaTunai}\\n`;
    pesan += `   🏦 Lunas (Deposit): ${wargaDeposit}\\n`;
    pesan += `   ⚪ Kosong: ${wargaKosong}\\n`;
    pesan += `   🔴 Belum: ${wargaBelum}\\n`;
    pesan += '━━━━━━━━━━━━━━━\\n';
    pesan += `_Dilaporkan oleh: ${user?.nama || 'Petugas'}_\\n`;

    if (navigator.share) {
      navigator
        .share({
          title: 'Rekap Jimpitan',
          text: pesan
        })
        .catch(() => {
          /* user cancelled share */
        });
      return;
    }

    const nomorAdmin = process.env.NEXT_PUBLIC_WA_ADMIN || '628561186917';
    const urlWA = `https://api.whatsapp.com/send?phone=${nomorAdmin}&text=${encodeURIComponent(pesan)}`;
    window.open(urlWA, '_blank');
    pushToast('Browser tidak mendukung share. Dialihkan ke WA Admin.', 'success');
  }

  async function handleTopup() {
    const selectedWarga = items.find((row) => String(row.id) === String(topupWargaId));
    const wargaId = selectedWarga?.id;
    const nominal = Number(topupNominal);

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
        body: JSON.stringify({
          warga_id: wargaId,
          nominal
        })
      });
      setTopupNominal('');
      await loadList();
      pushToast('Top up saldo berhasil.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Top up gagal', 'error');
    } finally {
      setTopupLoading(false);
    }
  }

  async function handleSaveEditNominal() {
    if (!editTarget) return;
    const nominal = Number(editNominal);
    if (!Number.isFinite(nominal) || nominal < 0) {
      pushToast('Nominal edit tidak valid.', 'warning');
      return;
    }

    try {
      setEditLoading(true);
      await apiFetch('/jimpitan/edit-nominal', {
        method: 'POST',
        body: JSON.stringify({
          warga_id: editTarget.id,
          nominal
        })
      });
      await loadList();
      pushToast(`Nominal jimpitan ${editTarget.nama} berhasil diperbarui.`, 'success');
      setEditTarget(null);
      setEditNominal('');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Gagal edit nominal', 'error');
    } finally {
      setEditLoading(false);
    }
  }

  function handleCardClick(row: JimpitanListItem) {
    if (row.isLunas) return;
    const roles = (user?.roles || []).map((role) => String(role).trim().toLowerCase());
    const isRoot = roles.includes('root');
    const hour = new Date().getHours();
    const isOperationalHour = hour >= 21 || hour < 6;

    if (!isRoot && !isOperationalHour) {
      pushToast('JAM OPERASIONAL TUTUP: input hanya jam 21.00 - 06.00 untuk non-admin.', 'warning');
      return;
    }

    setSelected(row);
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
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Stat title="Lunas" value={String(stats.lunas)} />
          <Stat title="Kosong" value={String(stats.kosong)} />
          <Stat title="Belum" value={String(stats.belum)} />
          <Stat title="Pendapatan" value={formatRupiah(stats.total)} />
        </section>

        <Card title="Aksi Setor" subtitle="Setor uang tunai ke Admin Jimpitan">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSetor} disabled={setorLoading || stats.total <= 0}>
              {setorLoading ? 'Memproses Setor...' : 'Setor ke Admin Jimpitan'}
            </Button>
            {hasTunaiData ? (
              <Button variant="ghost" onClick={handleKirimRekapWA}>
                Kirim Rekap WA
              </Button>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">Total tunai siap setor: {formatRupiah(stats.total)}</p>
        </Card>

        {isAdminJimpitan ? (
          <Card title="Top Up Saldo Warga" subtitle="Khusus Admin Jimpitan / root">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm font-semibold">
                <span>Pilih Warga</span>
                <select
                  className="w-full rounded-2xl border border-[var(--line)] bg-white/80 px-3 py-3"
                  value={topupWargaId}
                  onChange={(event) => setTopupWargaId(event.target.value)}
                >
                  {items.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.nama}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Nominal"
                type="number"
                min={1}
                value={topupNominal}
                onChange={(event) => setTopupNominal(event.target.value)}
              />
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handleTopup}
                  disabled={topupLoading}
                >
                  {topupLoading ? 'Menyimpan...' : 'Simpan Top Up'}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card title="Daftar Warga" subtitle="Klik warga yang belum lunas untuk input jimpitan">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((row) => {
              const marker = String(row.namaPetugas || '').toLowerCase();
              const canEditByAdmin =
                isAdminJimpitan &&
                row.isLunas &&
                marker !== 'deposit' &&
                marker !== 'sistem (saldo)' &&
                row.namaPetugas &&
                row.canEditNominal === true;
              const statusTag = row.detailStatus || row.batchStatus || '';
              const statusLabel =
                statusTag === 'APPROVED'
                  ? 'APPROVED'
                  : row.batchStatus === 'PENDING'
                    ? 'PENDING APPROVAL'
                    : row.detailStatus === 'SUBMITTED'
                      ? 'SUBMITTED'
                      : row.detailStatus === 'DRAFT'
                        ? 'DRAFT'
                        : '';

              return (
                <article
                  key={row.id}
                  onClick={!row.isLunas ? () => handleCardClick(row) : undefined}
                  className={`rounded-2xl border p-4 text-left transition ${
                    row.isLunas && Number(row.nominalTerbayar || 0) > 0
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : row.isLunas
                        ? 'border-slate-300 bg-slate-100/80'
                        : 'cursor-pointer border-[var(--line)] bg-white/75 hover:border-[var(--accent)] hover:shadow-lg'
                  }`}
                >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{row.nama}</p>
                  {statusLabel ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                        statusLabel === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : statusLabel === 'PENDING APPROVAL'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Status:{' '}
                  {row.isLunas
                    ? Number(row.nominalTerbayar || 0) > 0
                      ? 'LUNAS'
                      : 'KOSONG'
                    : 'BELUM'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Saran: {formatRupiah(row.nominalSaran)}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Saldo: {formatRupiah(row.saldo)}</p>
                {canEditByAdmin ? (
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditTarget(row);
                        setEditNominal(String(Number(row.nominalTerbayar || 0)));
                      }}
                    >
                      Edit Nominal
                    </Button>
                  </div>
                ) : isAdminJimpitan && row.isLunas && row.namaPetugas ? (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Nominal tidak bisa diedit karena status sudah APPROVED.
                  </p>
                ) : null}
                </article>
              );
            })}
          </div>
        </Card>
      </div>

      <FormJimpitan selected={selected} onSubmit={submitInput} onClose={() => setSelected(null)} />

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md rounded-3xl p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Admin Jimpitan</p>
            <h3 className="mt-2 font-[var(--font-space-grotesk)] text-2xl font-bold">Edit Nominal</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{editTarget.nama}</p>

            <div className="mt-4">
              <Input
                label="Nominal Baru"
                type="number"
                min={0}
                value={editNominal}
                onChange={(event) => setEditNominal(event.target.value)}
              />
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                className="flex-1"
                onClick={() => void handleSaveEditNominal()}
                disabled={editLoading || editNominal.trim() === ''}
              >
                {editLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  if (editLoading) return;
                  setEditTarget(null);
                  setEditNominal('');
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <article className="glass-card rounded-3xl p-5">
      <p className="text-sm text-[var(--text-muted)]">{title}</p>
      <p className="metric-value mt-2 text-2xl font-bold text-[var(--accent)]">{value}</p>
    </article>
  );
}
