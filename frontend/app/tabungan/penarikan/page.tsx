'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { formatRupiah } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import { hasAnyRole } from '@/lib/auth';

type RequestRow = { id: string; warga_id: string; nama: string; amount: number; available_balance: number; reason?: string; status: string };

export default function TabunganWithdrawalPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isAdmin = hasAnyRole(user, ['Admin Pembangunan', 'root']);

  async function load() {
    if (!isAdmin) return;
    const result = await apiFetch<{ success: boolean; data: RequestRow[] }>('/tabungan/withdrawal-requests/pending');
    setRows(result.data || []);
  }
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat pencairan')); }, [isAdmin]);

  async function submit() {
    try {
      setError('');
      await apiFetch('/tabungan/withdrawal-requests', { method: 'POST', body: JSON.stringify({ amount: Number(amount), reason }) });
      setAmount(''); setReason(''); setMessage('Pengajuan penarikan dikirim ke Admin Pembangunan.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal mengajukan penarikan'); }
  }
  async function decide(id: string, action: 'APPROVE' | 'REJECT' | 'PAID') {
    const rejection = action === 'REJECT' ? window.prompt('Alasan penolakan:') || '' : '';
    if (action === 'REJECT' && !rejection) return;
    try {
      await apiFetch(`/tabungan/withdrawal-requests/${id}/decision`, { method: 'POST', body: JSON.stringify({ action, reason: rejection }) });
      setMessage(`Permintaan berhasil diproses: ${action}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memproses permintaan'); }
  }

  return <main className="min-h-screen p-4"><FeedbackToast error={error} message={message} /><div className="mx-auto max-w-4xl space-y-5">
    {!isAdmin ? <Card title="Ajukan Penarikan Tabungan" subtitle="Permintaan akan diperiksa Admin Pembangunan."><div className="grid gap-3"><Input label="Nominal Penarikan" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /><Input label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opsional" /><Button onClick={() => void submit()}>Ajukan Penarikan</Button></div></Card> : <Card title="Inbox Pencairan Tabungan" subtitle="Periksa saldo sebelum menyetujui dan serahkan uang setelah status APPROVED."><div className="space-y-3">{rows.map((row) => <div key={row.id} className="rounded-2xl border border-[var(--line)] p-4"><div className="flex justify-between gap-3"><b>{row.nama}</b><span>{row.status}</span></div><p className="text-sm">Pengajuan: {formatRupiah(row.amount)} · Saldo: {formatRupiah(row.available_balance)}</p><p className="text-sm text-[var(--text-muted)]">{row.reason || 'Tanpa alasan'}</p><div className="mt-3 flex flex-wrap gap-2">{row.status === 'PENDING' ? <><Button onClick={() => void decide(row.id, 'APPROVE')}>Approve</Button><Button variant="ghost" onClick={() => void decide(row.id, 'REJECT')}>Reject</Button></> : <Button onClick={() => void decide(row.id, 'PAID')}>Uang Diserahkan</Button>}</div></div>)}{!rows.length ? <p className="text-sm text-[var(--text-muted)]">Tidak ada pencairan menunggu.</p> : null}</div></Card>}
  </div></main>;
}
