'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import MembershipStatusFilter from '@/components/membership/MembershipStatusFilter';
import MemberActionButtons from '@/components/ui/MemberActionButtons';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';

type UserOption = { id: string; nama: string; no_hp?: string | null };
type SpecialBillRow = {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  start_date: string;
  end_date: string;
  pic_user_id: string;
  pic_name: string;
  status: string;
  dashboard_visible: boolean;
  target_count: number;
  total_target: number;
  total_paid: number;
};
type SpecialBillTargetRow = {
  id: string;
  bill_id: string;
  warga_id: string;
  nama: string;
  no_hp?: string | null;
  target_amount: number;
  paid_amount: number;
  remaining_amount: number;
  is_active: boolean;
  status: string;
};

function formatDate(value: string) {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TagihanKhususPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const canAccess = hasAnyRole(user, ['Bendahara', 'root']);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<SpecialBillRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [picUserId, setPicUserId] = useState('');
  const [selectedBillId, setSelectedBillId] = useState('');
  const [targets, setTargets] = useState<SpecialBillTargetRow[]>([]);
  const [targetFilter, setTargetFilter] = useState<'aktif' | 'nonaktif'>('aktif');
  const [targetPage, setTargetPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function load() {
    const [optionsRes, billsRes] = await Promise.all([
      apiFetch<{ success: boolean; data: { users: UserOption[] } }>('/special-bills/options'),
      apiFetch<{ success: boolean; data: SpecialBillRow[] }>('/special-bills')
    ]);
    const userOptions = optionsRes.data?.users || [];
    setUsers(userOptions);
    const billRows = billsRes.data || [];
    setRows(billRows);
    setPicUserId((prev) => prev || String(userOptions[0]?.id || ''));
    setSelectedBillId((prev) => prev || String(billRows[0]?.id || ''));
  }

  useEffect(() => {
    if (!canAccess) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat tagihan khusus'));
  }, [canAccess]);

  async function loadTargets(billId: string) {
    if (!billId) {
      setTargets([]);
      return;
    }
    const result = await apiFetch<{ success: boolean; data: SpecialBillTargetRow[] }>(`/special-bills/${billId}/targets`);
    setTargets(result.data || []);
    setTargetPage(1);
  }

  useEffect(() => {
    if (!selectedBillId || !canAccess) return;
    void loadTargets(selectedBillId).catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat target warga'));
  }, [selectedBillId, canAccess]);

  const filteredTargets = useMemo(
    () => targets.filter((target) => targetFilter === 'aktif' ? target.is_active : !target.is_active),
    [targets, targetFilter]
  );
  const pagedTargets = useMemo(() => {
    const start = (targetPage - 1) * 10;
    return filteredTargets.slice(start, start + 10);
  }, [filteredTargets, targetPage]);
  const totalTargetPages = Math.max(1, Math.ceil(filteredTargets.length / 10));

  async function submit() {
    const numericAmount = parseRupiahInput(amount);
    if (!title.trim()) return setError('Nama tagihan wajib diisi.');
    if (numericAmount <= 0) return setError('Nominal tagihan wajib lebih dari 0.');
    if (!picUserId) return setError('PIC wajib dipilih.');
    try {
      setBusy(true); setError(''); setMessage('');
      const res = await apiFetch<{ success: boolean; notified?: number }>('/special-bills', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          amount: numericAmount,
          start_date: startDate,
          end_date: endDate,
          pic_user_id: picUserId
        })
      });
      setTitle('');
      setDescription('');
      setAmount('');
      await load();
      setMessage(`Tagihan khusus dibuat. Notifikasi Telegram terkirim ke ${Number(res.notified || 0)} warga terhubung.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat tagihan khusus');
    } finally {
      setBusy(false);
    }
  }

  async function setTargetActive(wargaId: string, isActive: boolean) {
    if (!selectedBillId) return;
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch(`/special-bills/${selectedBillId}/targets/set-active`, {
        method: 'POST',
        body: JSON.stringify({ warga_id: wargaId, is_active: isActive })
      });
      await Promise.all([load(), loadTargets(selectedBillId)]);
      setMessage(`Target warga berhasil ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah target warga');
    } finally {
      setBusy(false);
    }
  }

  async function hideBill(id: string) {
    if (!window.confirm('Sembunyikan tagihan ini dari dashboard warga?')) return;
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch(`/special-bills/${id}/hide`, { method: 'POST', body: JSON.stringify({}) });
      await load();
      setMessage('Tagihan disembunyikan dari dashboard warga.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyembunyikan tagihan');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;
  if (!canAccess) {
    return <main className="min-h-screen"><Navbar /><div className="mx-auto mt-6 max-w-5xl px-4"><Card title="Tidak Ada Akses" subtitle="Khusus Bendahara/root"><p className="text-sm text-[var(--text-muted)]">Akun Anda tidak memiliki akses ke Tagihan Khusus.</p></Card></div></main>;
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card
          title="Tagihan Khusus"
          subtitle="Buat tagihan temporer, tunjuk PIC warga, dan tampilkan ke dashboard warga"
          headerRight={<Link href="/operasional" className="btn-action-blue link-action px-3 py-1.5 text-xs">Operasional</Link>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Nama tagihan" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Iuran Perbaikan Drainase" />
            <Input label="Nominal per warga" value={amount} onChange={(e) => setAmount(formatRupiahInput(e.target.value))} placeholder="Rp 0" inputMode="numeric" />
            <Input label="Mulai bayar" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Batas bayar" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <label className="space-y-2 text-sm font-semibold">
              <span>PIC / kolektor</span>
              <select className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3" value={picUserId} onChange={(e) => setPicUserId(e.target.value)}>
                {users.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}
              </select>
            </label>
            <Input label="Catatan" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsional" />
          </div>
          <p className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
            Target tagihan otomatis memakai daftar warga eligible seperti iuran wajib. Setelah tagihan dibuat, warga tertentu tetap bisa diaktifkan/nonaktifkan dari Pengaturan Target di bawah.
          </p>

          <div className="mt-4">
            <Button onClick={submit} disabled={busy} className="w-full md:w-auto">
              {busy ? 'Menyimpan...' : 'Buat Tagihan Khusus'}
            </Button>
          </div>
        </Card>

        <Card title="Pengaturan Target Tagihan" subtitle="Aktif/nonaktif warga per tagihan, pola sama seperti keanggotaan iuran wajib">
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Tagihan</span>
              <select className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3" value={selectedBillId} onChange={(e) => setSelectedBillId(e.target.value)}>
                <option value="">Pilih tagihan</option>
                {rows.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
              </select>
            </label>
          </div>
          <MembershipStatusFilter
            value={targetFilter}
            activeCount={targets.filter((target) => target.is_active).length}
            inactiveCount={targets.filter((target) => !target.is_active).length}
            onChange={(value) => {
              setTargetFilter(value);
              setTargetPage(1);
            }}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Warga</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Target</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Status</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedTargets.map((target) => (
                  <tr key={target.id}>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">{target.nama}<span className="block text-xs font-normal text-[var(--text-muted)]">{target.no_hp || '-'}</span></td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(target.target_amount)}</td>
                    <td className={`border-b border-[var(--line)] px-3 py-2 text-sm font-semibold ${target.is_active ? 'text-emerald-700' : 'text-rose-600'}`}>{target.is_active ? 'Aktif' : 'Nonaktif'}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                      <MemberActionButtons isActive={target.is_active} disabled={busy} onToggle={() => void setTargetActive(target.warga_id, !target.is_active)} />
                    </td>
                  </tr>
                ))}
                {!pagedTargets.length ? <tr><td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada target pada filter ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>Halaman {targetPage} dari {totalTargetPages}</span>
            <div className="flex gap-2">
              <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={targetPage <= 1} onClick={() => setTargetPage((page) => Math.max(1, page - 1))}>Prev</Button>
              <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={targetPage >= totalTargetPages} onClick={() => setTargetPage((page) => Math.min(totalTargetPages, page + 1))}>Next</Button>
            </div>
          </div>
        </Card>

        <Card title="Riwayat Tagihan Khusus" subtitle="Tagihan yang sudah selesai bisa disembunyikan dari dashboard warga">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Tagihan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Periode</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">PIC</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Target</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Status</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">{row.title}<span className="block text-xs font-normal text-[var(--text-muted)]">{formatRupiah(row.amount)} × {row.target_count} warga</span></td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{formatDate(row.start_date)} - {formatDate(row.end_date)}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.pic_name}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">{formatRupiah(row.total_target)}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{row.dashboard_visible ? 'Tampil di dashboard' : 'Disembunyikan'}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                      {row.dashboard_visible ? (
                        <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" onClick={() => void hideBill(row.id)} disabled={busy}>Sembunyikan</Button>
                      ) : <span className="text-xs text-[var(--text-muted)]">Selesai</span>}
                    </td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={6} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada tagihan khusus.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
