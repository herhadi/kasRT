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
  collected_amount: number;
  pending_amount: number;
  approved_amount: number;
  remaining_amount: number;
  is_active: boolean;
  status: string;
};
type SpecialBillMemberRow = {
  warga_id: string;
  nama: string;
  no_hp?: string | null;
  is_active: boolean;
  updated_at?: string | null;
};
type SpecialBillPaymentRow = {
  id: string;
  warga_id: string;
  warga_name: string;
  amount: number;
  status: 'COLLECTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  batch_id?: string | null;
  collected_at: string;
  collected_by_name?: string | null;
  approved_at?: string | null;
  approved_by_name?: string | null;
};

function formatDate(value: string) {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getTargetStatusLabel(target: SpecialBillTargetRow) {
  if (!target.is_active) return 'Nonaktif';
  if (Number(target.approved_amount || 0) >= Number(target.target_amount || 0)) return 'Masuk Kas';
  if (Number(target.pending_amount || 0) > 0) return 'Menunggu Approval';
  if (Number(target.collected_amount || 0) > 0) return 'Terkumpul di PIC';
  if (Number(target.paid_amount || 0) > 0) return 'Sebagian';
  return 'Belum';
}

export default function TagihanKhususPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const canAccess = hasAnyRole(user, ['Bendahara', 'root']);
  const canManage = canAccess;
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<SpecialBillRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [picUserId, setPicUserId] = useState('');
  const [selectedBillId, setSelectedBillId] = useState('');
  const [members, setMembers] = useState<SpecialBillMemberRow[]>([]);
  const [memberFilter, setMemberFilter] = useState<'aktif' | 'nonaktif'>('aktif');
  const [memberPage, setMemberPage] = useState(1);
  const [targets, setTargets] = useState<SpecialBillTargetRow[]>([]);
  const [targetFilter, setTargetFilter] = useState<'aktif' | 'nonaktif'>('aktif');
  const [targetPage, setTargetPage] = useState(1);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<SpecialBillPaymentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function load() {
    const billsUrl = canManage ? '/special-bills' : '/special-bills/pic';
    const billsRes = await apiFetch<{ success: boolean; data: SpecialBillRow[] }>(billsUrl);
    let userOptions: UserOption[] = [];
    if (canManage) {
      const [optionsRes, membersRes] = await Promise.all([
        apiFetch<{ success: boolean; data: { users: UserOption[] } }>('/special-bills/options'),
        apiFetch<{ success: boolean; data: SpecialBillMemberRow[] }>('/special-bills/members')
      ]);
      userOptions = optionsRes.data?.users || [];
      setUsers(userOptions);
      setMembers(membersRes.data || []);
    }
    const billRows = billsRes.data || [];
    setRows(billRows);
    setPicUserId((prev) => prev || String(userOptions[0]?.id || ''));
    setSelectedBillId((prev) => prev || String(billRows[0]?.id || ''));
  }

  useEffect(() => {
    if (!user) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat tagihan khusus'));
  }, [user?.id, canManage]);

  async function loadTargets(billId: string) {
    if (!billId) {
      setTargets([]);
      return;
    }
    const result = await apiFetch<{ success: boolean; data: SpecialBillTargetRow[] }>(`/special-bills/${billId}/targets`);
    const rows = result.data || [];
    setTargets(rows);
    setPaymentDrafts(Object.fromEntries(rows.map((target) => [
      target.warga_id,
      formatRupiahInput(String(Math.max(Number(target.target_amount || 0) - Number(target.paid_amount || 0), 0)))
    ])));
    setTargetPage(1);
  }

  async function loadPayments(billId: string) {
    if (!billId) {
      setPayments([]);
      return;
    }
    const result = await apiFetch<{ success: boolean; data: SpecialBillPaymentRow[] }>(`/special-bills/${billId}/payments`);
    setPayments(result.data || []);
  }

  useEffect(() => {
    if (!selectedBillId || !user) return;
    void Promise.all([loadTargets(selectedBillId), loadPayments(selectedBillId)]).catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat target warga'));
  }, [selectedBillId, user?.id]);

  const filteredTargets = useMemo(
    () => targets.filter((target) => targetFilter === 'aktif' ? target.is_active : !target.is_active),
    [targets, targetFilter]
  );
  const pagedTargets = useMemo(() => {
    const start = (targetPage - 1) * 10;
    return filteredTargets.slice(start, start + 10);
  }, [filteredTargets, targetPage]);
  const totalTargetPages = Math.max(1, Math.ceil(filteredTargets.length / 10));
  const filteredMembers = useMemo(
    () => members.filter((member) => memberFilter === 'aktif' ? member.is_active : !member.is_active),
    [members, memberFilter]
  );
  const pagedMembers = useMemo(() => {
    const start = (memberPage - 1) * 10;
    return filteredMembers.slice(start, start + 10);
  }, [filteredMembers, memberPage]);
  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / 10));

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
      await Promise.all([load(), loadTargets(selectedBillId), loadPayments(selectedBillId)]);
      setMessage(`Target warga berhasil ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah target warga');
    } finally {
      setBusy(false);
    }
  }

  async function setMemberActive(wargaId: string, isActive: boolean) {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/special-bills/members/set-active', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wargaId, is_active: isActive })
      });
      await load();
      setMessage(`Warga berhasil ${isActive ? 'diaktifkan' : 'dinonaktifkan'} untuk Tagihan Khusus berikutnya.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah pengaturan warga');
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

  async function recordPayment(target: SpecialBillTargetRow) {
    const amountValue = parseRupiahInput(paymentDrafts[target.warga_id] || '');
    if (!selectedBillId || amountValue <= 0) return setError('Nominal pembayaran tidak valid.');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch(`/special-bills/${selectedBillId}/payment`, {
        method: 'POST',
        body: JSON.stringify({ warga_id: target.warga_id, amount: amountValue })
      });
      await Promise.all([load(), loadTargets(selectedBillId), loadPayments(selectedBillId)]);
      setMessage(`Pembayaran ${target.nama} dicatat sebagai terkumpul di PIC.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencatat pembayaran');
    } finally {
      setBusy(false);
    }
  }

  async function editPayment(payment: SpecialBillPaymentRow) {
    if (!selectedBillId) return setError('Pilih tagihan terlebih dahulu.');
    if (payment.status !== 'COLLECTED') return setError('Pembayaran yang sudah diajukan/approve tidak bisa diedit langsung.');
    const nextValue = window.prompt(`Koreksi nominal pembayaran ${payment.warga_name}`, formatRupiahInput(String(payment.amount || 0)));
    if (nextValue === null) return;
    const amountValue = parseRupiahInput(nextValue);
    if (amountValue <= 0) return setError('Nominal koreksi tidak valid.');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch(`/special-bills/${selectedBillId}/payments/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: amountValue })
      });
      await Promise.all([load(), loadTargets(selectedBillId), loadPayments(selectedBillId)]);
      setMessage(`Pembayaran ${payment.warga_name} berhasil dikoreksi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal koreksi pembayaran');
    } finally {
      setBusy(false);
    }
  }

  async function submitBatch() {
    if (!selectedBillId) return setError('Pilih tagihan terlebih dahulu.');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch(`/special-bills/${selectedBillId}/submit-batch`, { method: 'POST', body: JSON.stringify({}) });
      await Promise.all([load(), loadTargets(selectedBillId), loadPayments(selectedBillId)]);
      setMessage('Setoran tagihan diajukan dan menunggu approval Bendahara.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengajukan setoran tagihan');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        {canManage ? <Card
          title="Tagihan Khusus"
          subtitle="Buat tagihan temporer, tunjuk PIC warga, dan tampilkan ke dashboard warga"
          headerRight={
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/panduan#tagihan-khusus" className="btn-action-blue link-action px-3 py-1.5 text-xs">📖 Panduan</Link>
              <Link href="/operasional" className="btn-action-blue link-action px-3 py-1.5 text-xs">Operasional</Link>
            </div>
          }
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
            Target tagihan otomatis memakai warga yang aktif di Pengaturan Warga. Setelah tagihan dibuat, targetnya tetap bisa diaktifkan/nonaktifkan lagi dari Pengaturan Target Tagihan.
          </p>

          <div className="mt-4">
            <Button onClick={submit} disabled={busy} className="w-full md:w-auto">
              {busy ? 'Menyimpan...' : 'Buat Tagihan Khusus'}
            </Button>
          </div>
        </Card> : null}

        {canManage ? (
          <Card title="Pengaturan Warga" subtitle="Daftar warga yang akan otomatis menjadi target saat Tagihan Khusus baru dibuat">
            <MembershipStatusFilter
              value={memberFilter}
              activeCount={members.filter((member) => member.is_active).length}
              inactiveCount={members.filter((member) => !member.is_active).length}
              onChange={(value) => {
                setMemberFilter(value);
                setMemberPage(1);
              }}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Warga</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Status</th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMembers.map((member) => (
                    <tr key={member.warga_id}>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">
                        {member.nama}
                        <span className="block text-xs font-normal text-[var(--text-muted)]">{member.no_hp || '-'}</span>
                      </td>
                      <td className={`border-b border-[var(--line)] px-3 py-2 text-sm font-semibold ${member.is_active ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {member.is_active ? 'Aktif' : 'Nonaktif'}
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                        <MemberActionButtons isActive={member.is_active} disabled={busy} onToggle={() => void setMemberActive(member.warga_id, !member.is_active)} />
                      </td>
                    </tr>
                  ))}
                  {!pagedMembers.length ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada warga pada filter ini.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
              <span>Halaman {memberPage} dari {totalMemberPages}</span>
              <div className="flex gap-2">
                <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={memberPage <= 1} onClick={() => setMemberPage((page) => Math.max(1, page - 1))}>Prev</Button>
                <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={memberPage >= totalMemberPages} onClick={() => setMemberPage((page) => Math.min(totalMemberPages, page + 1))}>Next</Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Catatan: perubahan ini berlaku untuk tagihan baru berikutnya. Tagihan yang sudah dibuat tetap memakai Pengaturan Target Tagihan masing-masing.
            </p>
          </Card>
        ) : null}

        <Card title="Pengaturan Target Tagihan" subtitle="Aktif/nonaktif warga per tagihan, pola sama seperti keanggotaan iuran wajib">
          {!rows.length ? (
            <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
              Belum ada Tagihan Khusus. Atur warga aktif/nonaktif di Pengaturan Warga, lalu buat Tagihan Khusus terlebih dahulu.
            </p>
          ) : null}
          {rows.length ? (
            <>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              <span>Pilih Tagihan</span>
              <select className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3" value={selectedBillId} onChange={(e) => setSelectedBillId(e.target.value)}>
                <option value="">Pilih tagihan</option>
                {rows.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
              </select>
            </label>
          </div>
          {canManage ? <MembershipStatusFilter
            value={targetFilter}
            activeCount={targets.filter((target) => target.is_active).length}
            inactiveCount={targets.filter((target) => !target.is_active).length}
            onChange={(value) => {
              setTargetFilter(value);
              setTargetPage(1);
            }}
          /> : null}
          {!canManage ? (
            <p className="mb-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
              Anda adalah PIC tagihan ini. Catat pembayaran warga, lalu ajukan setoran agar Bendahara bisa approve dan memasukkan ke kas.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Warga</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Target</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Terkumpul</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Status</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Input/Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedTargets.map((target) => (
                  <tr key={target.id}>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">{target.nama}<span className="block text-xs font-normal text-[var(--text-muted)]">{target.no_hp || '-'}</span></td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(target.target_amount)}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(target.paid_amount)}</td>
                    <td className={`border-b border-[var(--line)] px-3 py-2 text-sm font-semibold ${target.is_active ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {getTargetStatusLabel(target)}
                    </td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                      <div className="flex min-w-[220px] items-center justify-end gap-2">
                        {target.is_active && Number(target.remaining_amount || 0) > 0 ? (
                          <>
                            <input
                              className="w-28 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-right text-xs"
                              value={paymentDrafts[target.warga_id] || ''}
                              onChange={(e) => setPaymentDrafts((prev) => ({ ...prev, [target.warga_id]: formatRupiahInput(e.target.value) }))}
                              inputMode="numeric"
                            />
                            <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={busy} onClick={() => void recordPayment(target)}>Catat</Button>
                          </>
                        ) : null}
                        {canManage ? <MemberActionButtons isActive={target.is_active} disabled={busy} onToggle={() => void setTargetActive(target.warga_id, !target.is_active)} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!pagedTargets.length ? <tr><td colSpan={5} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada target pada filter ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>Halaman {targetPage} dari {totalTargetPages}</span>
            <div className="flex gap-2">
              <Button variant="ghost" className="btn-action-blue rounded-xl px-3 py-1.5 text-xs" disabled={busy || !selectedBillId} onClick={() => void submitBatch()}>Ajukan Setoran</Button>
              <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={targetPage <= 1} onClick={() => setTargetPage((page) => Math.max(1, page - 1))}>Prev</Button>
              <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={targetPage >= totalTargetPages} onClick={() => setTargetPage((page) => Math.min(totalTargetPages, page + 1))}>Next</Button>
            </div>
          </div>
            </>
          ) : null}
        </Card>

        <Card title="Riwayat Pembayaran" subtitle="Jejak pembayaran warga: terkumpul, menunggu approval, sampai masuk kas">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Tanggal</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Warga</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Nominal</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Status</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs">Input Oleh</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 20).map((payment) => (
                  <tr key={payment.id}>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{formatDate(payment.collected_at)}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">{payment.warga_name}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">{formatRupiah(payment.amount)}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">
                      {payment.status === 'APPROVED'
                        ? 'Masuk Kas'
                        : payment.status === 'PENDING'
                          ? 'Menunggu Approval'
                          : payment.status === 'REJECTED'
                            ? 'Ditolak'
                            : 'Terkumpul di PIC'}
                    </td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{payment.collected_by_name || '-'}</td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                      {payment.status === 'COLLECTED' ? (
                        <Button variant="ghost" className="rounded-xl px-3 py-1.5 text-xs" disabled={busy} onClick={() => void editPayment(payment)}>
                          Koreksi
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!payments.length ? <tr><td colSpan={6} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada riwayat pembayaran.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>

        {canManage ? <Card title="Riwayat Tagihan Khusus" subtitle="Tagihan yang sudah selesai bisa disembunyikan dari dashboard warga">
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
        </Card> : null}
      </div>
    </main>
  );
}
