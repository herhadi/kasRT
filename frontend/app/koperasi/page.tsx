'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type Member = { warga_id: string; nama: string; is_active?: boolean };
type WargaOption = { id: string; nama: string; no_hp?: string };
type PlanRow = { installment_no: number; due_month: string; principal_due: number; interest_due: number; total_due: number };
type LoanRow = { id: string; nama: string; status: string; principal_amount: number; total_tagihan: number; total_bayar: number; sisa_piutang: number };
type Summary = { kas_saldo: number; total_angsuran_masuk: number; loans: LoanRow[] };

export default function KoperasiPage() {
  const { user, loading } = useAuth();
  const canAccess = hasAnyRole(user, ['Admin Koperasi', 'Ketua']);
  const canWrite = hasAnyRole(user, ['Admin Koperasi', 'root']);
  const [members, setMembers] = useState<Member[]>([]);
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
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
  const [showMemberSection, setShowMemberSection] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [registerTarget, setRegisterTarget] = useState<Member | null>(null);
  const [joinFee, setJoinFee] = useState('');
  const memberPager = usePagination(members, 10);

  async function loadAll() {
    if (!canAccess) return;
    const [mRes, sRes, wRes] = await Promise.all([
      apiFetch<{ success: boolean; data: Member[] }>('/koperasi/members'),
      apiFetch<{ success: boolean; data: Summary }>('/koperasi/summary'),
      apiFetch<{ success: boolean; data: WargaOption[] }>('/auth/warga-options')
    ]);
    const m = mRes.data || [];
    const w = wRes.data || [];
    setMembers(m);
    setWargaOptions(w);
    setSummary(sRes.data || null);
    if (w[0] && !wargaId) setWargaId(String(w[0].id));
    if (sRes.data?.loans?.[0] && !payLoanId) setPayLoanId(sRes.data.loans[0].id);
  }

  useEffect(() => { void loadAll().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat data')); }, [canAccess]);
  const selectedName = useMemo(
    () => wargaOptions.find((w) => String(w.id) === String(wargaId))?.nama || members.find((m) => m.warga_id === wargaId)?.nama || '-',
    [wargaOptions, members, wargaId]
  );
  const activeMembers = useMemo(() => members.filter((m) => Boolean(m.is_active)), [members]);
  const previewGrandTotal = useMemo(
    () => plan.reduce((acc, row) => acc + Number(row.total_due || 0), 0),
    [plan]
  );

  useEffect(() => {
    if (!wargaOptions.length) return;
    if (!wargaOptions.some((w) => String(w.id) === String(wargaId))) setWargaId(String(wargaOptions[0].id));
  }, [wargaOptions, wargaId]);
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

  async function submitRegisterMember() {
    if (!registerTarget) return;
    const fee = parseRupiahInput(joinFee);
    if (fee <= 0) return setError('Biaya registrasi wajib diisi.');
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/koperasi/members/register', {
        method: 'POST',
        body: JSON.stringify({ warga_id: registerTarget.warga_id, join_fee: fee })
      });
      setMessage('Registrasi anggota berhasil, status aktif.');
      setRegisterTarget(null);
      setJoinFee('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal registrasi anggota');
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
        <Card title="Operasional Koperasi" subtitle="Flat/menurun, bunga max 2.5% per bulan">
          {!canAccess ? <p className="text-sm text-[var(--text-muted)]">Akses ditolak.</p> : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Kas Koperasi: <b>{formatRupiah(Number(summary?.kas_saldo || 0))}</b></div>
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Angsuran Masuk: <b>{formatRupiah(Number(summary?.total_angsuran_masuk || 0))}</b></div>
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">Total Piutang: <b>{formatRupiah((summary?.loans || []).reduce((a, b) => a + Number(b.sisa_piutang || 0), 0))}</b></div>
            </div>
          )}
          <div className="mt-3">
            <Link href="/operasional/koperasi/iuran" className="btn-action-blue link-action px-3 py-1.5 text-xs">Input Iuran Wajib</Link>
          </div>
        </Card>

        {canWrite ? (
          <Card title="Keanggotaan Koperasi" subtitle="Daftar warga dari master global. Tandai Aktif hanya untuk anggota koperasi.">
            <div className="mb-3">
              <button type="button" className="btn-action-blue link-action px-3 py-1.5 text-xs" onClick={() => setShowMemberSection((v) => !v)}>
                {showMemberSection ? 'Sembunyikan Keanggotaan' : 'Tampilkan Keanggotaan'}
              </button>
            </div>
            {showMemberSection ? <><div className="overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Warga</th><th className="px-3 py-2 text-left text-xs">Status</th><th className="px-3 py-2 text-right text-xs">Aksi</th></tr></thead>
              <tbody>{memberPager.pagedItems.map((m) => <tr key={m.warga_id}><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{m.nama}</td><td className={`border-t border-[var(--line)] px-3 py-2 text-sm font-semibold ${m.is_active ? 'text-emerald-700' : 'text-[var(--text-muted)]'}`}>{m.is_active ? 'Aktif' : 'Nonaktif'}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right"><button type="button" className={`btn-action-blue rounded-xl px-3 py-1.5 text-xs ${m.is_active ? 'opacity-70' : ''}`} onClick={() => { if (m.is_active) void setMemberActive(m.warga_id, false); else { setRegisterTarget(m); setJoinFee(''); } }} disabled={busy}>{m.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>)}
              {!members.length ? <tr><td colSpan={3} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada data warga.</td></tr> : null}</tbody>
            </table></div>
            <PaginationControls page={memberPager.page} totalPages={memberPager.totalPages} onPrev={memberPager.prev} onNext={memberPager.next} /></> : null}
          </Card>
        ) : null}

        {canWrite ? (
          <Card
            title="Buat Pinjaman Baru"
            headerRight={
              <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${members.find((m) => m.warga_id === wargaId)?.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {members.find((m) => m.warga_id === wargaId)?.is_active ? 'Aktif' : 'Belum aktif'}
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="block space-y-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Warga</span>
                <select value={wargaId} onChange={(e) => setWargaId(e.target.value)} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">{wargaOptions.map((w) => <option key={String(w.id)} value={String(w.id)}>{w.nama}</option>)}</select>
              </div>
              <Input label="Pokok Pinjaman" type="text" inputMode="numeric" value={formatRupiahInput(principal)} onChange={(e) => setPrincipal(e.target.value)} />
              <Input label="Tenor (bulan)" type="number" min={1} value={tenor} onChange={(e) => setTenor(e.target.value)} />
              <Input label="Bunga / bulan (%)" type="number" step="0.1" min={0.1} max={2.5} value={rate} onChange={(e) => setRate(e.target.value)} />
              <Input label="Angsuran Mulai" type="month" value={firstDueMonth} onChange={(e) => setFirstDueMonth(e.target.value)} />
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Model Bunga</label>
                <div className="segmented-toggle">
                  <button
                    type="button"
                    className={`segmented-toggle-btn ${
                      model === 'DECLINING'
                        ? 'segmented-toggle-btn-active'
                        : 'segmented-toggle-btn-inactive'
                    }`}
                    onClick={() => setModel('DECLINING')}
                  >
                    Menurun
                  </button>
                  <button
                    type="button"
                    className={`segmented-toggle-btn ${
                      model === 'FLAT'
                        ? 'segmented-toggle-btn-active'
                        : 'segmented-toggle-btn-inactive'
                    }`}
                    onClick={() => setModel('FLAT')}
                  >
                    Flat
                  </button>
                </div>
              </div>
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
              <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                <span className="text-[var(--text-muted)]">Warga: </span>
                <span className="font-semibold text-[var(--text-primary)]">{selectedName || '-'}</span>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Ke</th><th className="px-3 py-2 text-left text-xs">Bulan</th><th className="px-3 py-2 text-right text-xs">Pokok</th><th className="px-3 py-2 text-right text-xs">Bunga</th><th className="px-3 py-2 text-right text-xs">Total</th></tr></thead>
                  <tbody>{plan.map((r) => <tr key={`${r.installment_no}-${r.due_month}`}><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.installment_no}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.due_month}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(r.principal_due)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm">{formatRupiah(r.interest_due)}</td><td className="border-t border-[var(--line)] px-3 py-2 text-right text-sm font-semibold">{formatRupiah(r.total_due)}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                <span className="text-[var(--text-muted)]">Grand Total: </span>
                <span className="ml-2 font-semibold text-[var(--accent)]">{formatRupiah(previewGrandTotal)}</span>
              </div>
            </div>
          </div>
        ) : null}
        {registerTarget ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Registrasi Anggota Baru</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{registerTarget.nama}</p>
              <div className="mt-3">
                <Input label="Biaya Registrasi" type="text" inputMode="numeric" value={formatRupiahInput(joinFee)} onChange={(e) => setJoinFee(e.target.value)} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" className="btn-action-blue" onClick={() => setRegisterTarget(null)}>Batal</Button>
                <Button onClick={submitRegisterMember} disabled={busy}>Bayar & Aktifkan</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
