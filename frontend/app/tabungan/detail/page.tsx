'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import PeriodPickerCompact from '@/components/contribution/PeriodPickerCompact';
import { apiFetch } from '@/lib/api';
import { formatRupiah } from '@/lib/helpers';

type DetailRow = { kind: string; period: string; description: string; target: number; credit: number; status: string };
type Detail = { label: string; start_month: string; until_month: string; summary: { total_paid?: number; ending_balance?: number }; opening_rows: DetailRow[]; rows: DetailRow[] };

function monthLabel(value: string) { const [y, m] = value.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }); }

export default function TabunganDetailPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { void apiFetch<{ success: boolean; data: Detail }>(`/report/my-contribution-detail?module=tabungan&month=${month}`).then((r) => setDetail(r.data)).catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat detail tabungan')); }, [month]);

  async function submit() {
    try {
      await apiFetch('/tabungan/withdrawal-requests', { method: 'POST', body: JSON.stringify({ amount: Number(amount), reason }) });
      setAmount(''); setReason(''); setShowForm(false); setMessage('Pengajuan penarikan dikirim ke Admin Pembangunan.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal mengajukan penarikan'); }
  }

  const rows = [...(detail?.opening_rows || []), ...(detail?.rows || [])].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  return <main className="min-h-screen p-4"><FeedbackToast error={error} message={message} /><div className="mx-auto max-w-4xl space-y-5"><div className="flex items-center justify-between"><Link href="/dashboard" className="btn-action-blue rounded-xl px-3 py-2 text-sm">Kembali</Link><PeriodPickerCompact label="Periode" value={month} onChange={setMonth} /></div><Card title="Detail Tabungan Pembangunan" subtitle={detail ? `Periode ${monthLabel(detail.start_month)} sampai ${monthLabel(detail.until_month)}` : 'Memuat detail...'}>{detail ? <><div className="mb-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-[var(--line)] p-4"><p className="text-xs text-[var(--text-muted)]">Total setoran</p><b>{formatRupiah(Number(detail.summary.total_paid || 0))}</b></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Saldo akhir</p><b className="text-emerald-800">{formatRupiah(Number(detail.summary.ending_balance || 0))}</b></div></div><Button onClick={() => setShowForm(true)}>Ajukan Penarikan Tabungan</Button><div className="mt-4 overflow-x-auto"><table className="min-w-full"><thead><tr><th className="px-3 py-2 text-left text-xs">Periode</th><th className="px-3 py-2 text-right text-xs">Masuk</th><th className="px-3 py-2 text-left text-xs">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.kind}-${row.period}`}><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{monthLabel(row.period)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{row.credit ? formatRupiah(row.credit) : '-'}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{row.kind === 'OPENING' ? 'Saldo awal' : row.status}</td></tr>)}</tbody></table></div></> : <p>Memuat...</p>}</Card></div>{showForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Ajukan Penarikan</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Saldo tersedia: {formatRupiah(Number(detail?.summary.ending_balance || 0))}</p><div className="mt-4 grid gap-3"><Input label="Nominal Penarikan" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /><Input label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opsional" /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowForm(false)}>Batal</Button><Button onClick={() => void submit()}>Kirim Pengajuan</Button></div></div></div></div> : null}</main>;
}
