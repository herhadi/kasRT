'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { WargaContributionRow } from '@/components/contribution/WargaContributionGrid';
import WargaContributionSection from '@/components/contribution/WargaContributionSection';

type Row = { warga_id: string; nama: string; paid_amount: number; target_amount: number; arrears: number };

export default function KoperasiIuranPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [fee, setFee] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<WargaContributionRow | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await apiFetch<{ success: boolean; data: { monthly_fee: number; rows: Row[] } }>(`/koperasi/iuran/summary?month=${month}`);
    setRows(res.data.rows || []);
    setFee(String(Math.round(Number(res.data.monthly_fee || 0))));
  }
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal load iuran')); }, [month]);

  const sectionRows = useMemo<WargaContributionRow[]>(() => rows.map((r) => ({
    id: r.warga_id, nama: r.nama, paidAmount: Number(r.paid_amount || 0), targetAmount: Number(r.target_amount || 0), canInput: true
  })), [rows]);

  async function saveFee() {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/koperasi/iuran/monthly-fee', {
        method: 'POST',
        body: JSON.stringify({ effective_month: month, amount: parseRupiahInput(fee) })
      });
      setMessage('Iuran wajib bulanan koperasi disimpan.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal simpan iuran');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <OperationalSubmenuHeader backHref="/operasional/koperasi" title="Kembali ke Operasional Koperasi" />
        <Card title="Input Iuran Wajib Koperasi" subtitle="Untuk anggota koperasi aktif" headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Input label="Nominal Iuran Wajib/Bulan" type="text" inputMode="numeric" value={formatRupiahInput(fee)} onChange={(e) => setFee(e.target.value)} />
            <div className="md:col-span-2 flex items-end"><Button onClick={saveFee} disabled={busy}>Simpan Nominal</Button></div>
          </div>
          <WargaContributionSection
            rows={sectionRows}
            selectedRow={selected}
            loading={busy}
            onOpen={setSelected}
            onClose={() => setSelected(null)}
            onSubmit={async (amount) => {
              await apiFetch('/koperasi/loan/payment', { method: 'POST', body: JSON.stringify({ loan_id: String(selected?.id || ''), amount, paid_date: `${month}-01`, description: 'Iuran wajib koperasi' }) });
              setSelected(null);
              await load();
            }}
          />
        </Card>
      </div>
    </main>
  );
}
