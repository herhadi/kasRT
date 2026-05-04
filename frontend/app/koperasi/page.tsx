'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type Member = { warga_id: string; nama: string; is_active?: boolean };
type PlanRow = { installment_no: number; due_month: string; principal_due: number; interest_due: number; total_due: number };
type LoanRow = { id: string; nama: string; status: string; principal_amount: number; total_tagihan: number; total_bayar: number; sisa_piutang: number };
type Summary = { kas_saldo: number; total_angsuran_masuk: number; loans: LoanRow[] };

export default function KoperasiPage() {
  const { user, loading } = useAuth();
  const canAccess = hasAnyRole(user, ['Admin Koperasi', 'Ketua', 'Sekretaris', 'root']);
  const canWrite = hasAnyRole(user, ['Admin Koperasi', 'root']);
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [wargaId, setWargaId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [tenor, setTenor] = useState('12');
  const [model, setModel] = useState<'FLAT' | 'DECLINING'>('DECLINING');
  const [rate, setRate] = useState('2');
  const [firstDueMonth, setFirstDueMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [payLoanId, setPayLoanId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payDesc, setPayDesc] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [showMemberSection, setShowMemberSection] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const memberPager = usePagination(members, 10);

  async function loadAll() {
    if (!canAccess) return;
    const [mRes, sRes] = await Promise.all([
      apiFetch<{ success: boolean; data: Member[] }>('/koperasi/members'),
      apiFetch<{ success: boolean; data: Summary }>('/koperasi/summary')
    ]);
    const m = mRes.data || [];
    setMembers(m);
    setSummary(sRes.data || null);
    if (m[0] && !wargaId) setWargaId(m[0].warga_id);
    if (sRes.data?.loans?.[0] && !payLoanId) setPayLoanId(sRes.data.loans[0].id);
  }

  useEffect(() => { void loadAll().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat data')); }, [canAccess]);
  const selectedName = useMemo(() => members.find((m) => m.warga_id === wargaId)?.nama || '-', [members, wargaId]);
  const activeMembers = useMemo(() => members.filter((m) => Boolean(m.is_active)), [members]);

  useEffect(() => {
    const source = showActiveOnly ? activeMembers : members;
    if (!source.length) return;
    if (!source.some((m) => m.warga_id === wargaId)) setWargaId(source[0].warga_id);
  }, [activeMembers, members, showActiveOnly, wargaId]);
  useEffect(() => {
    memberPager.reset();
  }, [members.length]);

  async function previewPlan() {
    const principalValue = parseRupiahInput(principal);
    const tenorValue = Number(tenor || 0);
    const rateValue = Number(rate || 0);
    if (principalValue <= 0) return setError('Pokok pinjaman harus diisi lebih dari 0.');
    if (tenorValue <= 0) return setError('Tenor harus lebih dari 0.');
    if (rateValue <= 0 || rateValue > 2.5) return setError('Bunga per bulan harus di antara 0.1 sampai 2.5.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstDueMonth)) return setError('Angsuran mulai harus format YYYY-MM.');
    try {
      setBusy(true); setError(''); setMessage('');
      const res = await apiFetch<{ success: boolean; data: { plan: PlanRow[] } }>('/koperasi/loan/preview', {
        method: 'POST',
        body: JSON.stringify({
          principal_amount: principalValue,
          tenor_months: tenorValue,
          interest_model: model,
          interest_rate_monthly: rateValue,
          first_due_month: firstDueMonth
        })
      });
      setPlan(res.data?.plan || []);
      setShowPreviewModal(true);
      setMessage(`Preview angsuran berhasil dibuat (${(res.data?.plan || []).length} bulan).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal preview angsuran');
    } finally {
      setBusy(false);
    }
  }

  async function simpanDraft() {
    if (!canWrite) return;
    try {
      setBusy(true); setError(''); setMessage('');
      const res = await apiFetch<{ success: boolean; data: { id: string } }>('/koperasi/loan/draft', {
        method: 'POST',
        body: JSON.stringify({
          warga_id: wargaId,
          principal_amount: parseRupiahInput(principal),
          tenor_months: Number(tenor || 0),
          interest_model: model,
          interest_rate_monthly: Number(rate || 0),
          notes
        })
      });
      await apiFetch('/koperasi/loan/activate', { method: 'POST', body: JSON.stringify({ loan_id: res.data.id, first_due_month: firstDueMonth }) });
      setMessage('Pinjaman aktif berhasil dibuat.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal buat pinjaman');
    } finally {
      setBusy(false);
    }
  }

  async function bayarAngsuran() {
    if (!canWrite) return;
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/koperasi/loan/payment', {
        method: 'POST',
        body: JSON.stringify({
          loan_id: payLoanId,
          amount: parseRupiahInput(payAmount),
          paid_date: payDate,
          description: payDesc
        })
      });
      setPayAmount('');
      setPayDesc('');
      setMessage('Pembayaran angsuran berhasil dicatat.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal bayar angsuran');
    } finally {
      setBusy(false);
    }
  }

  async function setMemberActive(wid: string, next: boolean) {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/koperasi/members/set-active', {
        method: 'POST',
        body: JSON.stringify({ warga_id: wid, is_active: next })
      });
      setMessage(next ? 'Warga diaktifkan sebagai anggota koperasi.' : 'Warga dinonaktifkan dari anggota koperasi.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal update anggota koperasi');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title="Operasional Koperasi" subtitle="Flat/menurun, bunga max 2.5% per bulan">
          {!canAccess ? <p className="text-sm text-[var(--text-muted)]">Akses ditolak.</p> : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Kas Koperasi: <b>{formatRupiah(Number(summary?.kas_saldo || 0))}</b></div>
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Angsuran Masuk: <b>{formatRupiah(Number(summary?.total_angsuran_masuk || 0))}</b></div>
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Total Piutang: <b>{formatRupiah((summary?.loans || []).reduce((a, b) => a + Number(b.sisa_piutang || 0), 0))}</b></div>
            </div>
          )}
        </Card>

        {canWrite ? (
          <Card title="Keanggotaan Koperasi" subtitle="Master warga global, aktifkan yang ikut koperasi">
            <div className="mb-3">
              <button type="button" className="btn-action-blue rounded-xl px-3 py-1.5 text-xs" onClick={() => setShowMemberSection((v) => !v)}>
                {showMemberSection ? 'Sembunyikan Keanggotaan' : 'Tampilkan Keanggotaan'}
              </button>
            </div>
            {showMemberSection ? <><div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Aksi</th></tr></thead>
              <tbody>{memberPager.pagedItems.map((m) => <tr key={m.warga_id}><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{m.nama}</td><td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${m.is_active ? 'text-emerald-700' : 'text-[var(--text-muted)]'}`}>{m.is_active ? 'Aktif' : 'Nonaktif'}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right"><button type="button" className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${m.is_active ? 'opacity-70' : ''}`} onClick={() => void setMemberActive(m.warga_id, !m.is_active)} disabled={busy}>{m.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>)}
              {!members.length ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada data warga.</td></tr> : null}</tbody>
            </table></div>
            <PaginationControls page={memberPager.page} totalPages={memberPager.totalPages} onPrev={memberPager.prev} onNext={memberPager.next} /></> : null}
          </Card>
        ) : null}

        {canWrite ? (
          <Card title="Buat Pinjaman Baru">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center gap-2">
                <button type="button" className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${showActiveOnly ? '' : 'opacity-70'}`} onClick={() => setShowActiveOnly(true)}>Anggota Aktif</button>
                <button type="button" className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${showActiveOnly ? 'opacity-70' : ''}`} onClick={() => setShowActiveOnly(false)}>Semua Warga</button>
              </div>
              <label className="block space-y-2"><span className="text-sm font-semibold text-[var(--text-primary)]">Warga</span><select value={wargaId} onChange={(e) => setWargaId(e.target.value)} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">{(showActiveOnly ? activeMembers : members).map((m) => <option key={m.warga_id} value={m.warga_id}>{m.nama}</option>)}</select></label>
              <Input label="Nama" value={selectedName} readOnly />
              <Input label="Pokok Pinjaman" type="text" inputMode="numeric" value={formatRupiahInput(principal)} onChange={(e) => setPrincipal(e.target.value)} />
              <Input label="Tenor (bulan)" type="number" min={1} value={tenor} onChange={(e) => setTenor(e.target.value)} />
              <Input label="Bunga / bulan (%)" type="number" step="0.1" min={0.1} max={2.5} value={rate} onChange={(e) => setRate(e.target.value)} />
              <Input label="Angsuran Mulai" type="month" value={firstDueMonth} onChange={(e) => setFirstDueMonth(e.target.value)} />
              <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Model Bunga</label><div className="flex gap-2"><button type="button" className={`btn-action-blue px-3 py-1.5 text-xs ${model === 'DECLINING' ? '' : 'opacity-70'}`} onClick={() => setModel('DECLINING')}>Menurun</button><button type="button" className={`btn-action-blue px-3 py-1.5 text-xs ${model === 'FLAT' ? '' : 'opacity-70'}`} onClick={() => setModel('FLAT')}>Flat</button></div></div>
              <Input label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="md:col-span-2 flex gap-2"><Button onClick={previewPlan} disabled={busy}>Preview</Button><Button className="btn-action-blue" variant="ghost" onClick={simpanDraft} disabled={busy}>Simpan & Aktifkan</Button></div>
            </div>
          </Card>
        ) : null}

        {canWrite ? (
          <Card title="Input Angsuran">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="block space-y-2 md:col-span-2"><span className="text-sm font-semibold text-[var(--text-primary)]">Pinjaman Aktif</span><select value={payLoanId} onChange={(e) => setPayLoanId(e.target.value)} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">{(summary?.loans || []).map((l) => <option key={l.id} value={l.id}>{l.nama} · Sisa {formatRupiah(l.sisa_piutang)}</option>)}</select></label>
              <Input label="Tanggal Bayar" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              <Input label="Nominal Bayar" type="text" inputMode="numeric" value={formatRupiahInput(payAmount)} onChange={(e) => setPayAmount(e.target.value)} />
              <div className="md:col-span-3"><Input label="Keterangan" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} /></div>
              <div className="flex items-end"><Button className="w-full" onClick={bayarAngsuran} disabled={busy}>Catat Bayar</Button></div>
            </div>
          </Card>
        ) : null}

        <Card title="Daftar Pinjaman" subtitle="Ringkasan pinjaman per warga">
          <div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
            <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Pokok</th><th className="px-3 py-2 text-right text-xs">Tagihan</th><th className="px-3 py-2 text-right text-xs">Terbayar</th><th className="px-3 py-2 text-right text-xs">Sisa Piutang</th></tr></thead>
            <tbody>{(summary?.loans || []).map((l) => <tr key={l.id}><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{l.nama}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{l.status}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(l.principal_amount)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(l.total_tagihan)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(l.total_bayar)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">{formatRupiah(l.sisa_piutang)}</td></tr>)}
            {!(summary?.loans || []).length ? <tr><td colSpan={6} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada pinjaman.</td></tr> : null}</tbody>
          </table></div>
        </Card>

        {showPreviewModal ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Preview Angsuran</h3>
                <button type="button" className="btn-action-blue rounded-xl px-3 py-1.5 text-xs" onClick={() => setShowPreviewModal(false)}>Tutup</button>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Ke</th><th className="px-3 py-2 text-left text-xs">Bulan</th><th className="px-3 py-2 text-right text-xs">Pokok</th><th className="px-3 py-2 text-right text-xs">Bunga</th><th className="px-3 py-2 text-right text-xs">Total</th></tr></thead>
                  <tbody>{plan.map((r) => <tr key={`${r.installment_no}-${r.due_month}`}><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.installment_no}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.due_month}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(r.principal_due)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(r.interest_due)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">{formatRupiah(r.total_due)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div>
    </main>
  );
}
