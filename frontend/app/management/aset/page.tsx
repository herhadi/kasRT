'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, formatTanggalIndonesia, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';

type AssetItem = {
  id: string;
  name: string;
  category?: string | null;
  quantity: number;
  condition: string;
  rental_rate: number;
  notes?: string | null;
  is_active: boolean;
  total_rental: number;
  total_amount: number;
};

type AssetRental = {
  id: string;
  asset_id: string;
  asset_name: string;
  renter_name: string;
  renter_phone?: string | null;
  rental_date: string;
  return_date?: string | null;
  quantity: number;
  amount: number;
  notes?: string | null;
  status: 'PENDING_PAYMENT' | 'PAID' | string;
  paid_at?: string | null;
  paid_by_nama?: string | null;
  created_by_nama?: string | null;
};

type AssetForm = {
  id: string;
  name: string;
  category: string;
  quantity: string;
  condition: string;
  rental_rate: string;
  notes: string;
  is_active: boolean;
};

const emptyAssetForm: AssetForm = {
  id: '',
  name: '',
  category: '',
  quantity: '1',
  condition: 'Baik',
  rental_rate: '',
  notes: '',
  is_active: true
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function AssetManagementPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [rentals, setRentals] = useState<AssetRental[]>([]);
  const [form, setForm] = useState<AssetForm>(emptyAssetForm);
  const [rentalAssetId, setRentalAssetId] = useState('');
  const [renterName, setRenterName] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [rentalDate, setRentalDate] = useState(todayValue);
  const [returnDate, setReturnDate] = useState('');
  const [rentalQuantity, setRentalQuantity] = useState('1');
  const [rentalAmount, setRentalAmount] = useState('');
  const [rentalNotes, setRentalNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingAsset, setSavingAsset] = useState(false);
  const [savingRental, setSavingRental] = useState(false);

  const canOpen = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'Bendahara', 'root']);
  const canManageAsset = hasAnyRole(user, ['Sekretaris', 'root']);
  const canRecordRental = hasAnyRole(user, ['Ketua', 'Plt Ketua', 'Sekretaris', 'root']);
  const activeAssets = useMemo(() => assets.filter((asset) => asset.is_active), [assets]);

  const loadData = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: { assets: AssetItem[]; rentals: AssetRental[] } }>('/management/assets');
    const nextAssets = result.data?.assets || [];
    setAssets(nextAssets);
    setRentals(result.data?.rentals || []);
    setRentalAssetId((prev) => (prev && nextAssets.some((asset) => asset.id === prev && asset.is_active) ? prev : nextAssets.find((asset) => asset.is_active)?.id || ''));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!canOpen) {
      router.replace('/management');
      return;
    }
    void loadData().catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat aset'));
  }, [loading, user, canOpen, router, loadData]);

  function updateForm(key: keyof AssetForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function editAsset(asset: AssetItem) {
    setForm({
      id: asset.id,
      name: asset.name || '',
      category: asset.category || '',
      quantity: String(asset.quantity || 0),
      condition: asset.condition || 'Baik',
      rental_rate: asset.rental_rate ? String(asset.rental_rate) : '',
      notes: asset.notes || '',
      is_active: Boolean(asset.is_active)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveAsset() {
    setError('');
    setMessage('');
    const quantity = Number(form.quantity || 0);
    const rentalRate = parseRupiahInput(form.rental_rate);
    if (!form.name.trim()) {
      setError('Nama aset wajib diisi.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Jumlah aset tidak valid.');
      return;
    }
    try {
      setSavingAsset(true);
      await apiFetch('/management/assets', {
        method: 'POST',
        body: JSON.stringify({
          id: form.id || undefined,
          name: form.name.trim(),
          category: form.category.trim(),
          quantity,
          condition: form.condition.trim() || 'Baik',
          rental_rate: rentalRate,
          notes: form.notes.trim(),
          is_active: form.is_active
        })
      });
      setForm(emptyAssetForm);
      await loadData();
      setMessage('Data aset berhasil disimpan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aset');
    } finally {
      setSavingAsset(false);
    }
  }

  async function toggleAsset(asset: AssetItem) {
    setError('');
    setMessage('');
    try {
      await apiFetch(`/management/assets/${encodeURIComponent(asset.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ is_active: !asset.is_active })
      });
      await loadData();
      setMessage(`${asset.name} ${asset.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status aset');
    }
  }

  async function recordRental() {
    setError('');
    setMessage('');
    const quantity = Number(rentalQuantity || 0);
    const amount = parseRupiahInput(rentalAmount);
    if (!rentalAssetId) {
      setError('Pilih aset yang disewa.');
      return;
    }
    if (!renterName.trim()) {
      setError('Nama penyewa wajib diisi.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Jumlah sewa harus lebih dari 0.');
      return;
    }
    if (!amount) {
      setError('Nominal sewa harus lebih dari 0.');
      return;
    }
    try {
      setSavingRental(true);
      await apiFetch('/management/assets/rentals', {
        method: 'POST',
        body: JSON.stringify({
          asset_id: rentalAssetId,
          renter_name: renterName.trim(),
          renter_phone: renterPhone.trim(),
          rental_date: rentalDate,
          return_date: returnDate || null,
          quantity,
          amount,
          notes: rentalNotes.trim()
        })
      });
      setRenterName('');
      setRenterPhone('');
      setReturnDate('');
      setRentalQuantity('1');
      setRentalAmount('');
      setRentalNotes('');
      await loadData();
      setMessage('Sewa aset tercatat. Kas baru bertambah setelah Bendahara konfirmasi uang diterima.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencatat sewa aset');
    } finally {
      setSavingRental(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Manajemen Aset</p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">Inventaris dan Sewa Aset RT</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Kelola barang milik RT seperti kursi, sound system, tenda, dan pantau pembayaran sewanya sampai diterima Bendahara.
          </p>
        </div>

        {message ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

        {canManageAsset ? (
          <Card title={form.id ? 'Edit Aset' : 'Tambah Aset'} subtitle="Master barang RT yang bisa dipantau dan disewakan">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Nama Aset" value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Contoh: Kursi plastik" />
              <Input label="Kategori" value={form.category} onChange={(event) => updateForm('category', event.target.value)} placeholder="Contoh: Peralatan" />
              <Input label="Jumlah" type="number" min="0" value={form.quantity} onChange={(event) => updateForm('quantity', event.target.value)} />
              <Input label="Kondisi" value={form.condition} onChange={(event) => updateForm('condition', event.target.value)} placeholder="Baik / Perlu servis" />
              <Input label="Tarif Sewa Default" inputMode="numeric" value={formatRupiahInput(form.rental_rate)} onChange={(event) => updateForm('rental_rate', event.target.value)} placeholder="Contoh: 50.000" />
              <Input label="Catatan" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Opsional" className="md:col-span-2" />
              <label className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] md:mt-7">
                <input type="checkbox" checked={form.is_active} onChange={(event) => updateForm('is_active', event.target.checked)} />
                Aktif
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button onClick={saveAsset} disabled={savingAsset}>{savingAsset ? 'Menyimpan...' : 'Simpan Aset'}</Button>
              {form.id ? <Button variant="ghost" onClick={() => setForm(emptyAssetForm)}>Batal Edit</Button> : null}
            </div>
          </Card>
        ) : null}

        {canRecordRental ? (
          <Card title="Catat Sewa Aset" subtitle="Catatan sewa belum masuk kas sampai Bendahara mengonfirmasi uang diterima">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Aset</span>
                <select
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none"
                  value={rentalAssetId}
                  onChange={(event) => {
                    const assetId = event.target.value;
                    const asset = assets.find((row) => row.id === assetId);
                    setRentalAssetId(assetId);
                    if (asset?.rental_rate) setRentalAmount(String(asset.rental_rate));
                  }}
                >
                  {activeAssets.length === 0 ? <option value="">Belum ada aset aktif</option> : null}
                  {activeAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                  ))}
                </select>
              </label>
              <Input label="Nama Penyewa" value={renterName} onChange={(event) => setRenterName(event.target.value)} />
              <Input label="No HP Penyewa" value={renterPhone} onChange={(event) => setRenterPhone(event.target.value)} />
              <Input label="Tanggal Sewa" type="date" value={rentalDate} onChange={(event) => setRentalDate(event.target.value)} />
              <Input label="Tanggal Kembali" type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
              <Input label="Jumlah Sewa" type="number" min="1" value={rentalQuantity} onChange={(event) => setRentalQuantity(event.target.value)} />
              <Input label="Nominal Sewa" inputMode="numeric" value={formatRupiahInput(rentalAmount)} onChange={(event) => setRentalAmount(event.target.value)} />
              <Input label="Catatan" value={rentalNotes} onChange={(event) => setRentalNotes(event.target.value)} placeholder="Opsional" />
            </div>
            <div className="mt-4">
              <Button onClick={recordRental} disabled={savingRental || activeAssets.length === 0}>{savingRental ? 'Menyimpan...' : 'Catat Sewa'}</Button>
            </div>
          </Card>
        ) : null}

        <Card title="Daftar Aset" subtitle="Klik edit untuk mengubah data, atau aktif/nonaktifkan aset">
          <div className="grid gap-3 md:grid-cols-2">
            {assets.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Belum ada aset.</p>
            ) : assets.map((asset) => (
              <div key={asset.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{asset.name}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{asset.category || 'Tanpa kategori'} • {asset.condition}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${asset.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {asset.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Info label="Jumlah" value={String(asset.quantity)} />
                  <Info label="Tarif" value={formatRupiah(asset.rental_rate)} />
                  <Info label="Total Sewa" value={String(asset.total_rental)} />
                  <Info label="Pendapatan" value={formatRupiah(asset.total_amount)} />
                </div>
                {asset.notes ? <p className="mt-3 text-xs text-[var(--text-muted)]">{asset.notes}</p> : null}
                {canManageAsset ? (
                  <div className="mt-4 flex gap-2">
                    <Button variant="ghost" onClick={() => editAsset(asset)}>Edit</Button>
                    <Button variant="ghost" onClick={() => void toggleAsset(asset)}>{asset.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Riwayat Sewa" subtitle="Status pembayaran sewa aset dan konfirmasi kas oleh Bendahara">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {rentals.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Belum ada riwayat sewa.</p>
            ) : rentals.map((row) => (
              <div key={`summary-${row.id}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{row.asset_name} x{row.quantity}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Penyewa: {row.renter_name}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{formatTanggalIndonesia(row.rental_date)}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="font-bold text-[var(--accent)]">{formatRupiah(row.amount)}</p>
                  {row.paid_at ? <p className="text-xs text-[var(--text-muted)]">Diterima: {formatTanggalIndonesia(row.paid_at)}</p> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tanggal</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Aset</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Penyewa</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Status</th>
                  <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {rentals.length === 0 ? (
                  <tr className="bg-[var(--surface)]">
                    <td colSpan={5} className="px-4 py-3 text-sm text-[var(--text-muted)]">Belum ada riwayat sewa.</td>
                  </tr>
                ) : rentals.map((row) => (
                  <tr key={row.id} className="bg-[var(--surface)]">
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{formatTanggalIndonesia(row.rental_date)}</td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.asset_name} x{row.quantity}</td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.renter_name}</td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-sm">
                      <StatusBadge status={row.status} />
                      {row.paid_at ? <p className="mt-1 text-xs text-[var(--text-muted)]">{formatTanggalIndonesia(row.paid_at)}</p> : null}
                    </td>
                    <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const paid = status === 'PAID';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {paid ? 'Lunas' : 'Menunggu Bendahara'}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
