'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type RekapItem = {
  wallet_id: string;
  wallet_name: string;
  saldo_akhir: number;
  pemasukan_bulan: number;
  pengeluaran_bulan: number;
};
type KoperasiSummary = {
  kas_saldo: number;
  total_angsuran_masuk: number;
  loans: Array<{ sisa_piutang: number }>;
};
type AttendanceItem = { warga_id: string; nama: string; hadir: boolean };
type ManagementUserLite = { id: string; nama: string; roles?: string[] };

export default function OperasionalSekretarisPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rekap, setRekap] = useState<RekapItem[]>([]);
  const [notes, setNotes] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [agenda, setAgenda] = useState('');
  const [invitePlace, setInvitePlace] = useState('Balai RT02');
  const [chairName, setChairName] = useState('Ketua');
  const [inviteTime, setInviteTime] = useState('19:45');
  const [inviteDate, setInviteDate] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBendaharaDetail, setShowBendaharaDetail] = useState(false);
  const [koperasi, setKoperasi] = useState<KoperasiSummary | null>(null);
  const [historyMonth, setHistoryMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [historyText, setHistoryText] = useState('');
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [speechListening, setSpeechListening] = useState(false);
  const speechRecognitionRef = useRef<null | { stop: () => void }>(null);
  const speechPressedRef = useRef(false);
  const speechBaseTextRef = useRef('');

  const canAccess = hasAnyRole(user, ['Sekretaris', 'Ketua', 'root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadData = useCallback(async () => {
    if (!canAccess) return;
    try {
      setError('');
      const [rekapRes, noteRes, kopRes, attRes] = await Promise.all([
        apiFetch<{ success: boolean; data: RekapItem[] }>(`/report/rekap-keuangan?month=${encodeURIComponent(month)}`),
        apiFetch<{ success: boolean; data: { notes?: string; meeting_date?: string; start_time?: string; agenda?: string } | null }>(
          `/management/meeting-note?month=${encodeURIComponent(month)}`
        ),
        apiFetch<{ success: boolean; data: KoperasiSummary }>('/koperasi/summary'),
        apiFetch<{ success: boolean; data: AttendanceItem[] }>(`/management/meeting-attendance?month=${encodeURIComponent(month)}`)
      ]);
      setRekap(rekapRes.data || []);
      setKoperasi(kopRes.data || null);
      setAttendance(attRes.data || []);
      setNotes(String(noteRes.data?.notes || ''));
      setMeetingDate(String(noteRes.data?.meeting_date || ''));
      setStartTime(String(noteRes.data?.start_time || '').slice(0, 5));
      setAgenda(String(noteRes.data?.agenda || ''));

      // Ambil nama Ketua dari struktur role agar TTD undangan selalu konsisten.
      const mgmt = await apiFetch<{ success: boolean; data: { users: ManagementUserLite[] } }>('/management/users');
      const ketua = (mgmt.data?.users || []).find((u) =>
        (u.roles || []).some((r) => String(r).trim().toLowerCase() === 'ketua')
      );
      if (ketua?.nama) setChairName(String(ketua.nama));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data sekretaris');
    }
  }, [canAccess, month]);

  useEffect(() => { void loadData(); }, [loadData]);

  const rekapGrouped = useMemo(() => {
    const bendaharaDetail = rekap.filter((row) =>
      ['kas iuran wajib', 'kas jimpitan'].includes(String(row.wallet_name || '').trim().toLowerCase())
    );
    const others = rekap.filter(
      (row) => !['kas iuran wajib', 'kas jimpitan'].includes(String(row.wallet_name || '').trim().toLowerCase())
    );
    const kasBendahara = bendaharaDetail.reduce(
      (acc, row) => ({
        pemasukan_bulan: acc.pemasukan_bulan + Number(row.pemasukan_bulan || 0),
        pengeluaran_bulan: acc.pengeluaran_bulan + Number(row.pengeluaran_bulan || 0),
        saldo_akhir: acc.saldo_akhir + Number(row.saldo_akhir || 0)
      }),
      { pemasukan_bulan: 0, pengeluaran_bulan: 0, saldo_akhir: 0 }
    );
    return { bendaharaDetail, kasBendahara, others };
  }, [rekap]);
  const rekapPager = usePagination(rekapGrouped.others, 20);

  useEffect(() => {
    if (!canAccess) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(historyMonth)) return;
    void apiFetch<{ success: boolean; data: { notes?: string } | null }>(
      `/management/meeting-note?month=${encodeURIComponent(historyMonth)}`
    )
      .then((res) => setHistoryText(String(res.data?.notes || '')))
      .catch(() => setHistoryText(''));
  }, [canAccess, historyMonth]);
  useEffect(() => {
    rekapPager.reset();
  }, [month, rekapGrouped.others.length]);

  async function saveNote() {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await apiFetch('/management/meeting-note', {
        method: 'POST',
        body: JSON.stringify({ month, notes, meeting_date: meetingDate || null, start_time: startTime || null, agenda: agenda || null })
      });
      setMessage('Notulen berhasil disimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan notulen');
    } finally {
      setSaving(false);
    }
  }

  async function saveAttendance() {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await apiFetch('/management/meeting-attendance', {
        method: 'POST',
        body: JSON.stringify({ month, attendance })
      });
      setMessage('Presensi kehadiran berhasil disimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan presensi');
    } finally {
      setSaving(false);
    }
  }

  function startSpeech() {
    speechPressedRef.current = true;
    if (speechListening) return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => {
      lang: string; interimResults: boolean; continuous: boolean;
      onstart: (() => void) | null; onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void;
    } }).webkitSpeechRecognition;
    if (!SR) {
      setError('Speech-to-text belum didukung di browser ini.');
      return;
    }
    const rec = new SR();
    speechRecognitionRef.current = rec;
    rec.lang = 'id-ID';
    rec.interimResults = true;
    rec.continuous = true;
    speechBaseTextRef.current = notes;
    rec.onstart = () => setSpeechListening(true);
    rec.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const t = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      const base = speechBaseTextRef.current.trim();
      const merged = [base, finalText.trim(), interim.trim()].filter(Boolean).join(' ').trim();
      setNotes(merged);
    };
    rec.onerror = () => setSpeechListening(false);
    rec.onend = () => {
      setSpeechListening(false);
      speechRecognitionRef.current = null;
      speechBaseTextRef.current = '';
      if (speechPressedRef.current) {
        window.setTimeout(() => {
          if (speechPressedRef.current) startSpeech();
        }, 200);
      }
    };
    rec.start();
  }

  function stopSpeech() {
    speechPressedRef.current = false;
    if (!speechRecognitionRef.current) return;
    try { speechRecognitionRef.current.stop(); } catch {}
  }

  function kirimWA() {
    const d = meetingDate ? new Date(meetingDate) : new Date();
    const tgl = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(d);
    let text = '📝 *NOTULEN RAPAT RT*\n';
    text += `📅 *${tgl}*\n`;
    if (startTime) text += `🕘 *Mulai:* ${startTime}\n`;
    if (agenda) text += `📌 *Agenda:* ${agenda}\n`;
    text += '\n*Hasil Rapat:*\n';
    text += `${notes || '-'}\n`;
    const nomor = process.env.NEXT_PUBLIC_WA_ADMIN || '';
    if (navigator.share) {
      navigator.share({ title: 'Notulen Rapat', text }).catch(() => {});
      return;
    }
    if (!nomor) return;
    window.open(`https://api.whatsapp.com/send?phone=${nomor}&text=${encodeURIComponent(text)}`, '_blank');
  }

  function kirimUndanganWA() {
    const selectedDate = (inviteDate || meetingDate || '').trim();
    if (!selectedDate) {
      setError('Tanggal undangan wajib diisi.');
      return;
    }
    const d = new Date(`${selectedDate}T00:00:00`);
    const hari = d.toLocaleDateString('id-ID', { weekday: 'long' });
    const tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const waktu = (inviteTime || '19:45').replace('.', ':');
    const left1 = 'Hari/Tgl';
    const left2 = 'Waktu';
    const left3 = 'Tempat';
    const maxLeft = Math.max(left1.length, left2.length, left3.length);
    const indent = '    ';
    const line1 = `${left1.padEnd(maxLeft, ' ')} : ${hari}, ${tgl}`;
    const line2 = `${left2.padEnd(maxLeft, ' ')} : ${waktu} WIB`;
    const line3 = `${left3.padEnd(maxLeft, ' ')} : ${invitePlace || 'Balai RT02'}`;

    let text = `_Assalamu'alaikum Warahmatullah..._\n\n`;
    text += 'Dengan Hormat\n';
    text += 'Kepada Bapak-bapak warga RT.02 RW.04 kami mengharap kehadirannya dalam rangka rapat bulanan RT02 pada:\n';
    text += '```\n';
    text += `${line1}\n${line2}\n${line3}\n`;
    text += '```\n';
    text += 'Demikian undangan disampaikan, atas perhatian dan kehadirannya kami ucapkan terima kasih.\n\n';
    text += `_Wassalamu'alaikum Warahmatullah..._\n\n`;
    text += 'Ketua RT 02\n';
    text += 'TTD\n';
    text += `${chairName || 'Ketua'}`;

    const nomor = process.env.NEXT_PUBLIC_WA_ADMIN || '';
    if (navigator.share) {
      navigator.share({ title: 'Undangan Rapat RT', text }).catch(() => {});
      return;
    }
    if (!nomor) return;
    window.open(`https://api.whatsapp.com/send?phone=${nomor}&text=${encodeURIComponent(text)}`, '_blank');
  }

  if (loading || !user) return <main className="min-h-screen" />;
  if (!canAccess) return <main className="min-h-screen"><Navbar /></main>;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card
          title="Operasional Sekretaris"
          subtitle="Rekap keuangan bulanan dan notulen rapat"
          headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead>
                <tr className="bg-[var(--surface-strong)]">
                  <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Kas</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pemasukan</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pengeluaran</th>
                  <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Akhir</th>
                </tr>
              </thead>
              <tbody>
                {rekap.length === 0 ? (
                  <tr className="bg-[var(--surface)]"><td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada data rekap.</td></tr>
                ) : (
                  <>
                    <tr className="bg-[var(--surface)]">
                      <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                        <button type="button" className="inline-flex items-center gap-2" onClick={() => setShowBendaharaDetail((v) => !v)}>
                          <span>{showBendaharaDetail ? '▾' : '▸'}</span>
                          <span>Kas Bendahara</span>
                        </button>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-emerald-600">{formatRupiah(rekapGrouped.kasBendahara.pemasukan_bulan)}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-500">{formatRupiah(rekapGrouped.kasBendahara.pengeluaran_bulan)}</td>
                      <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(rekapGrouped.kasBendahara.saldo_akhir)}</td>
                    </tr>
                    {showBendaharaDetail
                      ? rekapGrouped.bendaharaDetail.map((r) => (
                          <tr key={r.wallet_id} className="bg-[var(--surface)]">
                            <td className="border-b border-[var(--line)] px-3 py-2 pl-8 text-sm text-[var(--text-primary)]">{r.wallet_name}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-emerald-600">{formatRupiah(r.pemasukan_bulan)}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-500">{formatRupiah(r.pengeluaran_bulan)}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(r.saldo_akhir)}</td>
                          </tr>
                        ))
                      : null}
                    {rekapPager.pagedItems.map((r) => (
                      <tr key={r.wallet_id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm">{r.wallet_name}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-emerald-600">{formatRupiah(r.pemasukan_bulan)}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-500">{formatRupiah(r.pengeluaran_bulan)}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(r.saldo_akhir)}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
            <PaginationControls
              page={rekapPager.page}
              totalPages={rekapPager.totalPages}
              onPrev={rekapPager.prev}
              onNext={rekapPager.next}
            />
          </div>
        </Card>
        <Card title="Ringkasan Koperasi" subtitle="Monitoring sekretaris: kas koperasi dan piutang berjalan">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">
              Kas Koperasi: <b>{formatRupiah(Number(koperasi?.kas_saldo || 0))}</b>
            </div>
            <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">
              Angsuran Masuk: <b>{formatRupiah(Number(koperasi?.total_angsuran_masuk || 0))}</b>
            </div>
            <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2">
              Total Piutang: <b>{formatRupiah((koperasi?.loans || []).reduce((a, b) => a + Number(b.sisa_piutang || 0), 0))}</b>
            </div>
          </div>
        </Card>

        <Card title="Notulen Rapat" subtitle={`Periode ${month}`}>
          <div className="grid gap-2 md:grid-cols-3">
            <Input label="Tanggal Rapat" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
            <Input label="Waktu Mulai" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <Input label="Agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} />
          </div>
          <textarea
            className="mt-3 min-h-[160px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-primary)]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tulis ringkasan keputusan rapat..."
          />
          <div className="mt-3">
            <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
              <Button
                variant="ghost"
                className="btn-action-blue w-full"
                onPointerDown={startSpeech}
                onPointerUp={stopSpeech}
                onPointerLeave={stopSpeech}
                onPointerCancel={stopSpeech}
              >
                {speechListening ? '🎙️ Lepas untuk berhenti' : '🎙️ Tekan & tahan'}
              </Button>
              <Button className="btn-action-green w-full" onClick={saveNote} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Notulen'}
              </Button>
            </div>
            <Button variant="ghost" className="btn-action-blue mt-2 w-full md:w-auto" onClick={kirimWA}>
              Kirim WA
            </Button>
          </div>
        </Card>
        <Card title="Undangan Rapat WA" subtitle="Template undangan warga">
          <div className="grid gap-2 md:grid-cols-2">
            <Input label="Tanggal Undangan" type="date" value={inviteDate} onChange={(e) => setInviteDate(e.target.value)} />
            <Input label="Tempat" value={invitePlace} onChange={(e) => setInvitePlace(e.target.value)} />
            <Input label="Waktu Undangan" type="time" value={inviteTime} onChange={(e) => setInviteTime(e.target.value)} />
          </div>
          <div className="mt-3">
            <Button variant="ghost" className="btn-action-green w-full md:w-auto" onClick={kirimUndanganWA}>
              Kirim Undangan WA
            </Button>
          </div>
        </Card>
        <Card title="Presensi Kehadiran Warga" subtitle="Input presensi rapat bulanan dipisah seperti modul iuran">
          <Link href="/operasional/sekretaris/presensi" className="btn-action-blue link-action px-3 py-1.5 text-xs">
            Input Presensi
          </Link>
        </Card>
        <Card title="Riwayat Notulen" subtitle="Arsip notulen per bulan">
          <div className="w-full max-w-[220px]">
            <Input label="Periode Riwayat" type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} />
          </div>
          <textarea
            className="mt-3 min-h-[130px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-primary)]"
            value={historyText}
            readOnly
            placeholder="Belum ada notulen untuk periode ini."
          />
        </Card>
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div>
    </main>
  );
}
