'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import SummaryTripleCard from '@/components/ui/SummaryTripleCard';
import { WargaContributionRow } from '@/components/contribution/WargaContributionGrid';
import WargaContributionSection from '@/components/contribution/WargaContributionSection';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiah, formatRupiahInput, formatTanggalIndonesia, parseRupiahInput } from '@/lib/helpers';
import { useAuth } from '@/lib/useAuth';

type WargaItem = { id: string | number; nama: string };
type IuranStatusItem = { warga_id: string; nama: string; paid_amount: number };
type WalletItem = { id: string | number; name: string; balance?: number };
type PengeluaranItem = {
  id: string | number;
  transaction_type?: string;
  status?: string;
  amount: number;
  description: string;
  created_at: string;
  wallet_name: string;
  created_by_nama: string;
};
type TopPenunggakItem = {
  warga_id: string;
  nama: string;
  no_hp?: string;
  iuran_bulan_ini: number;
  tunggakan_bulan_ini: number;
  iuran_tahun_ini: number;
  tunggakan_akumulatif: number;
};
type TrenIuranItem = {
  bulan: string;
  total_warga: number;
  target: number;
  pemasukan: number;
  tunggakan: number;
};
type BendaharaReport = {
  iuran_wajib_target_bulanan: number;
  total_warga: number;
  target_bulan_ini: number;
  pemasukan_bulan_ini: number;
  total_menunggak_bulan_ini: number;
  nominal_tunggakan_bulan_ini: number;
  nominal_tunggakan_akumulatif_tahun_berjalan: number;
  top_10_penunggak?: TopPenunggakItem[];
  tren_6_bulan?: TrenIuranItem[];
};
type YearlyWalletRow = {
  wallet_id: number;
  wallet_name: string;
  opening_balance: number;
  closing_balance: number;
};
type YearlyBookSummary = {
  year: number;
  period: {
    year: number;
    status: string;
    opened_at?: string;
    opened_by?: string;
    closed_at?: string;
    closed_by?: string;
  } | null;
  wallets: YearlyWalletRow[];
  arrears: {
    total_warga: number;
    total_opening_arrears: number;
    total_closing_arrears: number;
    top10: Array<{ warga_id: string; nama: string; no_hp?: string; closing_arrears: number }>;
  };
};
type SosialSummary = {
  saldo_total: number;
  pemasukan_bulan: number;
  pengeluaran_bulan: number;
  expenses: Array<{
    id: string | number;
    amount: number;
    status: string;
    description: string;
    created_at: string;
    created_by_nama?: string | null;
  }>;
};
type RekapKeuanganItem = {
  wallet_id: string;
  wallet_name: string;
  saldo_akhir: number;
  pemasukan_bulan: number;
  pengeluaran_bulan: number;
};
type PendapatanSummary = { iuran: number; jimpitan: number; sewa_aset?: number; total: number };
type OpeningArrearsItem = { warga_id: string; opening_arrears: number };
type IuranTariffItem = { id: string; effective_month: string; monthly_fee: number };

export default function BendaharaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const canSeeOps = hasAnyRole(user, [
    'Bendahara',
    'Ketua',
    'Sekretaris',
    'Admin Jimpitan',
    'Admin Pembangunan',
    'Admin Lingkungan',
    'Admin Sosial',
    'Admin Internet',
    'Admin Koperasi',
    'Admin Keamanan',
    'root'
  ]);
  const isBendahara = hasAnyRole(user, ['Bendahara', 'root']);
  const isAdminJimpitan = hasAnyRole(user, ['Admin Jimpitan', 'root']);
  const isAdminSosial = hasAnyRole(user, ['Admin Sosial', 'root']);
  const isKetua = hasAnyRole(user, ['Ketua']);
  const isSekretaris = hasAnyRole(user, ['Sekretaris', 'root']);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warga, setWarga] = useState<WargaItem[]>([]);
  const [iuranStatus, setIuranStatus] = useState<IuranStatusItem[]>([]);
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [pendapatan, setPendapatan] = useState<PendapatanSummary>({ iuran: 0, jimpitan: 0, sewa_aset: 0, total: 0 });
  const [openingArrears, setOpeningArrears] = useState<Record<string, number>>({});
  const [pengeluaran, setPengeluaran] = useState<PengeluaranItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedMonthOnly, setSelectedMonthOnly] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYearOnly, setSelectedYearOnly] = useState(() => String(new Date().getFullYear()));

  const [selectedWarga, setSelectedWarga] = useState('');
  const [selectedWargaCard, setSelectedWargaCard] = useState<WargaContributionRow | null>(null);
  const [expenseWalletId, setExpenseWalletId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [transferSosialSourceWalletId, setTransferSosialSourceWalletId] = useState('');
  const [transferSosialAmount, setTransferSosialAmount] = useState('');
  const [transferSosialDesc, setTransferSosialDesc] = useState('');
  const [sosialExpenseAmount, setSosialExpenseAmount] = useState('');
  const [sosialExpenseDesc, setSosialExpenseDesc] = useState('');
  const [sosialExpenseDate, setSosialExpenseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [pendingSosialReceiptCount, setPendingSosialReceiptCount] = useState(0);
  const [iuranTariffs, setIuranTariffs] = useState<IuranTariffItem[]>([]);
  const [iuranMonthlyFee, setIuranMonthlyFee] = useState(30000);
  const [showIuranTariffSetting, setShowIuranTariffSetting] = useState(false);
  const [iuranTariffMonth, setIuranTariffMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [iuranTariffValue, setIuranTariffValue] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BendaharaReport | null>(null);
  const [yearlyYear, setYearlyYear] = useState(() => new Date().getFullYear());
  const [yearlyBook, setYearlyBook] = useState<YearlyBookSummary | null>(null);
  const [showClosingTools, setShowClosingTools] = useState(false);
  const [sosialSummary, setSosialSummary] = useState<SosialSummary | null>(null);
  const [rekapKeuangan, setRekapKeuangan] = useState<RekapKeuanganItem[]>([]);
  const [showBendaharaDetail, setShowBendaharaDetail] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingStartTime, setMeetingStartTime] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [meetingNotesLoading, setMeetingNotesLoading] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [meetingNotesDirty, setMeetingNotesDirty] = useState(false);
  const [meetingHistoryMonth, setMeetingHistoryMonth] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [meetingHistoryText, setMeetingHistoryText] = useState('');
  const speechRecognitionRef = useRef<null | {
    stop: () => void;
  }>(null);
  const speechBaseTextRef = useRef('');
  const speechPressedRef = useRef(false);
  const iuranSyncRef = useRef<Promise<void>>(Promise.resolve());
  const iuranPageMode = pathname === '/operasional/iuran' || pathname === '/operasional/bendahara/iuran';
  const bendaharaMode = pathname === '/operasional/bendahara' || pathname === '/operasional' || pathname === '/bendahara';
  const sekretarisMode = pathname === '/operasional/sekretaris';

  const loadMaster = useCallback(async () => {
    const result = await apiFetch<{
      success: boolean;
      data: { wallets: WalletItem[]; pengeluaran: PengeluaranItem[]; iuran_status?: IuranStatusItem[]; pendapatan?: PendapatanSummary };
    }>(`/bendahara/master?month=${encodeURIComponent(selectedMonth)}`);
    let ws = result.data?.wallets || [];
    if (ws.length === 0 && (isKetua || isSekretaris)) {
      try {
        const rekap = await apiFetch<{ success: boolean; data: RekapKeuanganItem[] }>(
          `/report/rekap-keuangan?month=${encodeURIComponent(selectedMonth)}`
        );
        const rows = rekap.data || [];
        ws = rows
          .filter((r) =>
            ['kas iuran wajib', 'kas jimpitan'].includes(String(r.wallet_name || '').trim().toLowerCase())
          )
          .map((r) => ({
            id: String(r.wallet_id || r.wallet_name),
            name: String(r.wallet_name || '-'),
            balance: Number(r.saldo_akhir || 0)
          }));
      } catch {
        // noop: biarkan ws kosong bila fallback juga gagal
      }
    }
    const outs = result.data?.pengeluaran || [];
    setWallets(ws);
    setPengeluaran(outs);
    setIuranStatus(result.data?.iuran_status || []);
    setPendapatan(result.data?.pendapatan || { iuran: 0, jimpitan: 0, total: 0 });
    setExpenseWalletId((prev) => (prev && ws.some((w) => String(w.id) === String(prev)) ? prev : String(ws[0]?.id || '')));
    const kasIuran = ws.find((w) => String(w.name || '').trim().toLowerCase() === 'kas iuran wajib');
    setTransferSosialSourceWalletId((prev) =>
      prev && ws.some((w) => String(w.id) === String(prev))
        ? prev
        : String(kasIuran?.id || ws[0]?.id || '')
    );
  }, [selectedMonth, isKetua, isSekretaris]);

  const loadPendingSosialReceiptCount = useCallback(async () => {
    if (!isAdminSosial) return;
    try {
      const result = await apiFetch<{
        success: boolean;
        data: { sections: Array<{ key: string; items: Array<unknown> }> };
      }>('/approval/pending');
      const section = (result.data?.sections || []).find((row) => row.key === 'social_receipt');
      setPendingSosialReceiptCount((section?.items || []).length);
    } catch {
      setPendingSosialReceiptCount(0);
    }
  }, [isAdminSosial]);

  const loadSosialSummary = useCallback(async () => {
    if (!isAdminSosial) return;
    const result = await apiFetch<{ success: boolean; data: SosialSummary }>(
      `/report/dashboard-admin-sosial?month=${encodeURIComponent(selectedMonth)}`
    );
    setSosialSummary(result.data || null);
  }, [isAdminSosial, selectedMonth]);

  const loadRekapKeuangan = useCallback(async () => {
    if (!isSekretaris) return;
    const result = await apiFetch<{ success: boolean; data: RekapKeuanganItem[] }>(
      `/report/rekap-keuangan?month=${encodeURIComponent(selectedMonth)}`
    );
    setRekapKeuangan(result.data || []);
  }, [isSekretaris, selectedMonth]);

  const loadMeetingNote = useCallback(async () => {
    if (!isSekretaris) return;
    try {
      const result = await apiFetch<{ success: boolean; data: { notes?: string } | null }>(
        `/management/meeting-note?month=${encodeURIComponent(selectedMonth)}`
      );
      if (!meetingNotesDirty) {
        setMeetingNotes(String(result.data?.notes || ''));
        setMeetingDate(String((result.data as { meeting_date?: string } | null)?.meeting_date || ''));
        setMeetingStartTime(String((result.data as { start_time?: string } | null)?.start_time || '').slice(0, 5));
        setMeetingAgenda(String((result.data as { agenda?: string } | null)?.agenda || ''));
      }
    } catch {
      if (!meetingNotesDirty) {
        setMeetingNotes('');
      }
    }
  }, [isSekretaris, selectedMonth, meetingNotesDirty]);

  const loadMeetingHistory = useCallback(async () => {
    if (!isSekretaris) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(meetingHistoryMonth)) return;
    try {
      const result = await apiFetch<{ success: boolean; data: { notes?: string } | null }>(
        `/management/meeting-note?month=${encodeURIComponent(meetingHistoryMonth)}`
      );
      setMeetingHistoryText(String(result.data?.notes || ''));
    } catch {
      setMeetingHistoryText('');
    }
  }, [isSekretaris, meetingHistoryMonth]);

  const loadWargaOptions = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: WargaItem[] }>('/auth/warga-options');
    const rows = result.data || [];
    setWarga(rows);
    setSelectedWarga((prev) => (prev && rows.some((r) => String(r.id) === String(prev)) ? prev : String(rows[0]?.id || '')));
  }, []);

  const loadIuranTariffs = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: { tariffs: IuranTariffItem[]; active_fee: number } }>(
      `/bendahara/iuran-tariffs?month=${encodeURIComponent(selectedMonth)}`
    );
    setIuranTariffs(result.data?.tariffs || []);
    setIuranMonthlyFee(Number(result.data?.active_fee || 30000));
  }, [selectedMonth]);

  const loadReport = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: BendaharaReport }>('/report/dashboard-admin-bendahara');
    setReport(result.data || null);
  }, []);

  const loadOpeningArrears = useCallback(async () => {
    const year = Number(selectedYearOnly || new Date().getFullYear());
    const result = await apiFetch<{ success: boolean; data: OpeningArrearsItem[] }>(
      `/bendahara/opening-arrears?year=${encodeURIComponent(String(year))}&contribution=${encodeURIComponent('Iuran Wajib')}`
    );
    const map: Record<string, number> = {};
    for (const row of result.data || []) map[String(row.warga_id)] = Number(row.opening_arrears || 0);
    setOpeningArrears(map);
  }, [selectedYearOnly]);

  const loadYearlyBook = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: YearlyBookSummary }>(
      `/bendahara/yearly-book?year=${encodeURIComponent(String(yearlyYear))}`
    );
    setYearlyBook(result.data || null);
  }, [yearlyYear]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (pathname === '/bendahara') {
      router.replace('/operasional');
    }
  }, [pathname, router]);

  useEffect(() => {
    if (loading) return;
    if (!canSeeOps) {
      router.replace('/dashboard');
      return;
    }
    if (!isBendahara && !isKetua) {
      if (isAdminSosial) {
        void Promise.all([loadPendingSosialReceiptCount(), loadSosialSummary()]);
      }
      if (isSekretaris) {
        void Promise.all([loadRekapKeuangan(), loadMeetingNote()]);
      }
      return;
    }
    void Promise.all([loadMaster(), loadIuranTariffs(), loadReport(), loadWargaOptions(), loadYearlyBook(), loadOpeningArrears()]).catch((e) =>
      setError(e instanceof Error ? e.message : 'Gagal memuat menu bendahara')
    );
  }, [loading, canSeeOps, isBendahara, isKetua, isAdminSosial, isSekretaris, router, loadMaster, loadIuranTariffs, loadReport, loadWargaOptions, loadYearlyBook, loadPendingSosialReceiptCount, loadSosialSummary, loadRekapKeuangan, loadOpeningArrears, loadMeetingNote]);

  useEffect(() => {
    if (loading || !canSeeOps) return;
    const interval = window.setInterval(() => {
      if (isBendahara || isKetua) {
        void Promise.all([loadMaster(), loadIuranTariffs(), loadReport(), loadOpeningArrears()]);
      } else {
        if (isAdminSosial) {
          void Promise.all([loadPendingSosialReceiptCount(), loadSosialSummary()]);
        }
        if (isSekretaris) {
          void Promise.all([loadRekapKeuangan(), loadMeetingNote()]);
        }
      }
    }, 45000);
    return () => window.clearInterval(interval);
  }, [
    loading,
    canSeeOps,
    isBendahara,
    isKetua,
    isAdminSosial,
    isSekretaris,
    loadMaster,
    loadIuranTariffs,
    loadReport,
    loadPendingSosialReceiptCount,
    loadSosialSummary,
    loadRekapKeuangan,
    loadOpeningArrears,
    loadMeetingNote
  ]);

  async function saveMeetingNote() {
    if (!isSekretaris) return;
    try {
      setMeetingNotesLoading(true);
      await apiFetch('/management/meeting-note', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          notes: meetingNotes,
          meeting_date: meetingDate || null,
          start_time: meetingStartTime || null,
          agenda: meetingAgenda || null
        })
      });
      setMeetingNotesDirty(false);
      setToast({ type: 'success', text: 'Notulen rapat berhasil disimpan.' });
    } catch (e) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'Gagal simpan notulen.' });
    } finally {
      setMeetingNotesLoading(false);
    }
  }

  function sendMeetingNoteToWA() {
    const nomorAdmin = process.env.NEXT_PUBLIC_WA_ADMIN || '628561186917';
    const d = meetingDate ? new Date(`${meetingDate}T00:00:00`) : null;
    const tglLabel = d ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(d) : selectedMonth;
    const text =
      `📝 *NOTULEN RAPAT RT*\n` +
      `📅 *${tglLabel}*\n` +
      `🕒 *Mulai: ${meetingStartTime || '-'} WIB*\n` +
      `📌 *Agenda:* ${meetingAgenda || '-'}\n` +
      `🗂️ *Hasil Rapat:*\n` +
      `━━━━━━━━━━━━━━━\n` +
      `${meetingNotes || '-'}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `_Dicatat oleh: ${user?.nama || 'Sekretaris'}_`;
    const urlWA = `https://api.whatsapp.com/send?phone=${nomorAdmin}&text=${encodeURIComponent(text)}`;
    window.open(urlWA, '_blank');
  }

  function startSpeechToText() {
    speechPressedRef.current = true;
    if (speechListening) return;
    type SpeechRecognitionCtor = new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onstart: (() => void) | null;
      onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? ((window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
          (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition)
        : null;
    if (!SpeechRecognitionCtor) {
      setToast({ type: 'error', text: 'Browser ini belum mendukung input suara.' });
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    speechRecognitionRef.current = recognition;
    recognition.lang = 'id-ID';
    recognition.interimResults = true;
    recognition.continuous = true;
    speechBaseTextRef.current = meetingNotes;
    let finalText = '';
    recognition.onstart = () => {
      setSpeechListening(true);
      speechBaseTextRef.current = meetingNotes;
    };
    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += `${transcript} `;
        else interimText += `${transcript} `;
      }
      const base = speechBaseTextRef.current.trim();
      const composed = `${base}${base ? '\n' : ''}${`${finalText}${interimText}`.trim()}`.trim();
      setMeetingNotes(composed);
    };
    recognition.onerror = () => setToast({ type: 'error', text: 'Gagal memproses suara.' });
    recognition.onend = () => {
      setSpeechListening(false);
      speechRecognitionRef.current = null;
      // Jika user masih menekan tombol, lanjut rekam ulang otomatis.
      if (speechPressedRef.current) {
        window.setTimeout(() => {
          startSpeechToText();
        }, 120);
        return;
      }
      speechBaseTextRef.current = '';
    };
    recognition.start();
  }

  function stopSpeechToText() {
    speechPressedRef.current = false;
    if (!speechRecognitionRef.current) return;
    try {
      speechRecognitionRef.current.stop();
    } catch {
      /* noop */
    }
  }

  const title = useMemo(() => ((isBendahara || isKetua) ? 'Menu Bendahara' : 'Menu Operasional'), [isBendahara, isKetua]);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 2, current - 1, current, current + 1];
  }, []);
  const totalPengeluaranBulanTerpilih = useMemo(
    () => pengeluaran.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [pengeluaran]
  );
  const totalSaldoRealtime = useMemo(
    () => wallets.reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0),
    [wallets]
  );
  const kasIuranWajibWallet = useMemo(
    () => wallets.find((w) => String(w.name || '').trim().toLowerCase() === 'kas iuran wajib') || null,
    [wallets]
  );
  const kasJimpitanWallet = useMemo(
    () => wallets.find((w) => String(w.name || '').trim().toLowerCase() === 'kas jimpitan') || null,
    [wallets]
  );
  const rekapBendahara = useMemo(() => {
    const detail = rekapKeuangan.filter((row) =>
      ['kas iuran wajib', 'kas jimpitan'].includes(String(row.wallet_name || '').trim().toLowerCase())
    );
    const other = rekapKeuangan.filter(
      (row) => !['kas iuran wajib', 'kas jimpitan'].includes(String(row.wallet_name || '').trim().toLowerCase())
    );
    const kasBendahara: RekapKeuanganItem = {
      wallet_id: 'bendahara-aggregate',
      wallet_name: 'Kas Bendahara',
      pemasukan_bulan: detail.reduce((s, r) => s + Number(r.pemasukan_bulan || 0), 0),
      pengeluaran_bulan: detail.reduce((s, r) => s + Number(r.pengeluaran_bulan || 0), 0),
      saldo_akhir: detail.reduce((s, r) => s + Number(r.saldo_akhir || 0), 0)
    };
    return { kasBendahara, detail, other };
  }, [rekapKeuangan]);
  const iuranRows = useMemo<WargaContributionRow[]>(
    () => {
      const paidByWargaId = new Map(
        iuranStatus.map((row) => [String(row.warga_id), Number(row.paid_amount || 0)])
      );
      return warga.map((w) => ({
        id: String(w.id),
        nama: w.nama,
        paidAmount: paidByWargaId.get(String(w.id)) || 0,
        targetAmount: iuranMonthlyFee,
        canInput: hasAnyRole(user, ['root']) || (paidByWargaId.get(String(w.id)) || 0) < iuranMonthlyFee,
        suggestionText: (() => {
          const paid = paidByWargaId.get(String(w.id)) || 0;
          const opening = Number(openingArrears[String(w.id)] || 0);
          const missingThisMonth = Math.max(0, iuranMonthlyFee - paid);
          const totalNeed = opening + missingThisMonth;
          if (totalNeed <= 0) return 'Saran: lunas bulan ini';
          const months = Math.max(1, Math.ceil(totalNeed / Math.max(1, iuranMonthlyFee)));
          return `Saran: ${formatRupiah(totalNeed)} (${months} bulan)`;
        })()
      }));
    },
    [warga, iuranStatus, openingArrears, iuranMonthlyFee, user]
  );
  const iuranPresetAmounts = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((n) => ({ label: `${n}x`, amount: Number(iuranMonthlyFee || 30000) * n })),
    [iuranMonthlyFee]
  );
  const totalPendapatanBulanIni = useMemo(
    () => iuranRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0),
    [iuranRows]
  );

  useEffect(() => {
    setSelectedMonth(`${selectedYearOnly}-${selectedMonthOnly}`);
  }, [selectedMonthOnly, selectedYearOnly]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isSekretaris) return;
    void loadMeetingHistory();
  }, [isSekretaris, loadMeetingHistory]);

  function submitSetorIuran(amountInput: number): boolean {
    const amount = Number(amountInput || 0);
    if (!selectedWarga || !Number.isFinite(amount) || amount <= 0) {
      setError('Pilih warga dan isi nominal setoran iuran yang valid.');
      return false;
    }
    const wargaId = selectedWarga;
    const monthKey = selectedMonth;
    setError('');
    setMessage('Setoran iuran disimpan lokal. Menyinkronkan di latar belakang…');
    setIuranStatus((prev) => {
      const idx = prev.findIndex((r) => String(r.warga_id) === String(wargaId));
      if (idx < 0) {
        const wargaNama = warga.find((w) => String(w.id) === String(wargaId))?.nama || 'Warga';
        return [...prev, { warga_id: String(wargaId), nama: wargaNama, paid_amount: amount }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], paid_amount: Number(next[idx].paid_amount || 0) + amount };
      return next;
    });
    setToast({ type: 'success', text: 'Setoran iuran disimpan lokal.' });

    iuranSyncRef.current = iuranSyncRef.current
      .catch(() => undefined)
      .then(async () => {
        await apiFetch('/bendahara/setor-iuran-wajib', {
        method: 'POST',
        body: JSON.stringify({
          warga_id: wargaId,
          amount,
          tanggal: `${monthKey}-01`
        })
      });
        setMessage('Setoran iuran wajib berhasil disinkronkan.');
        setToast({ type: 'success', text: 'Setoran iuran berhasil disinkronkan.' });
        void Promise.all([loadReport(), loadMaster()]).catch(() => undefined);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Gagal menyinkronkan setoran iuran wajib');
        setToast({ type: 'error', text: e instanceof Error ? e.message : 'Gagal menyinkronkan setoran iuran wajib' });
        void Promise.all([loadReport(), loadMaster()]).catch(() => undefined);
      });
    return true;
  }

  async function submitIuranTariff() {
    const monthlyFee = parseRupiahInput(iuranTariffValue);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(iuranTariffMonth)) {
      setError('Periode tarif wajib format YYYY-MM.');
      return;
    }
    if (!Number.isFinite(monthlyFee) || monthlyFee <= 0) {
      setError('Nominal tarif iuran wajib harus lebih dari 0.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      const result = await apiFetch<{ success: boolean; data: { tariffs: IuranTariffItem[]; active_fee: number } }>(
        '/bendahara/iuran-tariff',
        {
          method: 'POST',
          body: JSON.stringify({ effective_month: iuranTariffMonth, monthly_fee: monthlyFee })
        }
      );
      setIuranTariffs(result.data?.tariffs || []);
      setIuranMonthlyFee(Number(result.data?.active_fee || iuranMonthlyFee));
      setIuranTariffValue('');
      setMessage('Tarif iuran wajib berhasil disimpan.');
      setToast({ type: 'success', text: 'Tarif iuran wajib berhasil disimpan.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan tarif iuran wajib');
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'Gagal menyimpan tarif iuran wajib' });
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense() {
    const wallet_id = String(expenseWalletId || '').trim();
    const amount = parseRupiahInput(expenseAmount);
    if (!wallet_id || !Number.isFinite(amount) || amount <= 0 || !expenseDesc.trim() || !expenseDate) {
      setError('Isi wallet, tanggal keluar, nominal, dan keterangan pengeluaran dengan benar.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/pengeluaran', {
        method: 'POST',
        body: JSON.stringify({
          wallet_id,
          amount,
          description: expenseDesc.trim(),
          tanggal_keluar: expenseDate
        })
      });
      setExpenseAmount('');
      setExpenseDesc('');
      setMessage('Pengeluaran diajukan dan menunggu approval Ketua/Sekretaris.');
      await loadReport();
      await loadMaster();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencatat pengeluaran');
    } finally {
      setBusy(false);
    }
  }

  async function submitTransferSosial() {
    const from_wallet = String(transferSosialSourceWalletId || '').trim();
    const amount = parseRupiahInput(transferSosialAmount);
    if (!from_wallet || !Number.isFinite(amount) || amount <= 0) {
      setError('Pilih wallet sumber dan isi nominal transfer sosial yang valid.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/transaction/transfer-sosial-bulanan', {
        method: 'POST',
        body: JSON.stringify({
          from_wallet,
          amount,
          description: transferSosialDesc.trim() || 'Setor dana sosial bulanan'
        })
      });
      setTransferSosialAmount('');
      setTransferSosialDesc('');
      setMessage('Transfer ke Kas Sosial diajukan, menunggu konfirmasi Admin Sosial.');
      await loadRekapKeuangan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal ajukan transfer dana sosial');
    } finally {
      setBusy(false);
    }
  }

  async function submitSosialExpense() {
    const amount = parseRupiahInput(sosialExpenseAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !sosialExpenseDesc.trim()) {
      setError('Isi nominal dan keterangan pengeluaran sosial dengan benar.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/transaction/expense-sosial', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          description: sosialExpenseDesc.trim(),
          tanggal_keluar: sosialExpenseDate
        })
      });
      setSosialExpenseAmount('');
      setSosialExpenseDesc('');
      setMessage('Pengeluaran sosial diajukan, menunggu approval Ketua/Sekretaris.');
      await Promise.all([loadSosialSummary(), loadRekapKeuangan()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal ajukan pengeluaran sosial');
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseYear() {
    if (!window.confirm(`Tutup buku tahun ${yearlyYear}? Proses ini menyimpan saldo akhir & tunggakan tahunan.`)) return;
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/yearly-book/close', {
        method: 'POST',
        body: JSON.stringify({ year: yearlyYear })
      });
      setMessage(`Closing tahun ${yearlyYear} berhasil.`);
      await Promise.all([loadYearlyBook(), loadReport()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal closing tahunan');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenNextYear() {
    const nextYear = yearlyYear + 1;
    if (!window.confirm(`Buka periode ${nextYear} dengan saldo awal dari closing ${yearlyYear}?`)) return;
    try {
      setBusy(true);
      setError('');
      setMessage('');
      await apiFetch('/bendahara/yearly-book/open', {
        method: 'POST',
        body: JSON.stringify({ year: nextYear })
      });
      setYearlyYear(nextYear);
      setMessage(`Opening periode ${nextYear} berhasil dibuat.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal opening tahun berikutnya');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  if (!canSeeOps) {
    return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      </main>
    );
  }

  if (iuranPageMode && (isBendahara || isKetua)) {
    return (
      <main className="min-h-screen pb-10">
        <FeedbackToast error={error} message={message} />
        {toast ? (
          <div
            className={
              toast.type === 'success'
                ? 'fixed right-4 top-4 z-[70] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-md'
                : 'fixed right-4 top-4 z-[70] rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-md'
            }
          >
            {toast.text}
          </div>
        ) : null}
        <Navbar />
        <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
          <OperationalSubmenuHeader backHref="/operasional/bendahara" title="Kembali ke Operasional Bendahara" />
          <Card
            title="Input Iuran Wajib"
            headerRight={
              <div className="w-full max-w-[220px]">
                <Input
                  label="Periode"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    const value = String(e.target.value || '').trim();
                    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
                    setSelectedMonth(value);
                    const [year, month] = value.split('-');
                    setSelectedYearOnly(year);
                    setSelectedMonthOnly(month);
                  }}
                />
              </div>
            }
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                Tarif aktif: <b>{formatRupiah(iuranMonthlyFee)}</b>
                {iuranTariffs[0]?.effective_month ? (
                  <span className="ml-1 text-[var(--text-muted)]">(mulai {iuranTariffs[0].effective_month})</span>
                ) : null}
              </div>
              {isBendahara ? (
                <Button variant="ghost" className="btn-action-blue" onClick={() => setShowIuranTariffSetting((v) => !v)}>
                  ⚙️ Pengaturan Tarif
                </Button>
              ) : null}
            </div>
            {showIuranTariffSetting && isBendahara ? (
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <Input label="Tarif Berlaku Mulai" type="month" value={iuranTariffMonth} onChange={(e) => setIuranTariffMonth(e.target.value)} />
                <Input
                  label="Nominal Tarif Baru"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(iuranTariffValue)}
                  onChange={(e) => setIuranTariffValue(e.target.value)}
                />
                <div className="md:col-span-2 flex items-end">
                  <Button className="w-full" onClick={submitIuranTariff} disabled={busy}>Simpan Tarif</Button>
                </div>
              </div>
            ) : null}
            <SummaryTripleCard
              title="Pendapatan Bulan Ini"
              sticky
              items={[
                { label: 'Iuran', value: formatRupiah(Number(pendapatan.iuran || totalPendapatanBulanIni || 0)) },
                { label: 'Jimpitan', value: formatRupiah(Number(pendapatan.jimpitan || 0)), className: 'hidden md:block' },
                { label: 'Sewa Aset', value: formatRupiah(Number(pendapatan.sewa_aset || 0)), className: 'hidden md:block' },
                { label: 'Total', value: formatRupiah(Number(pendapatan.total || totalPendapatanBulanIni || 0)), emphasize: true, className: 'hidden md:block' }
              ]}
            />
            <WargaContributionSection
              rows={iuranRows}
              selectedRow={selectedWargaCard}
              loading={busy}
              presets={iuranPresetAmounts}
              onOpen={(row) => {
                setSelectedWarga(String(row.id));
                setSelectedWargaCard(row);
              }}
              onClose={() => setSelectedWargaCard(null)}
              onSubmit={(amount) => {
                const ok = submitSetorIuran(amount);
                if (ok) setSelectedWargaCard(null);
              }}
            />
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      {toast ? (
        <div
          className={
            toast.type === 'success'
              ? 'fixed right-4 top-4 z-[70] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-md'
              : 'fixed right-4 top-4 z-[70] rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-md'
          }
        >
          {toast.text}
        </div>
      ) : null}
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title={title} subtitle="Input iuran wajib bulanan">
          {!isBendahara && !bendaharaMode && !sekretarisMode ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                Anda memiliki akses menu operasional. Fitur input keuangan penuh khusus untuk role Bendahara.
              </p>
              {(isAdminSosial || isSekretaris || isKetua) ? (
                <></>
              ) : null}
              {isAdminJimpitan ? (
                <Link
                  href="/operasional/jimpitan"
                  className="btn-action-blue link-action w-full md:w-auto"
                >
                  Menu Admin Jimpitan
                </Link>
              ) : null}
              {isAdminSosial ? (
                <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Menu Admin Sosial</p>
                    <div className="w-full max-w-[220px]">
                      <Input
                        label="Periode"
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          const value = String(e.target.value || '').trim();
                          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
                          setSelectedMonth(value);
                          const [year, month] = value.split('-');
                          setSelectedYearOnly(year);
                          setSelectedMonthOnly(month);
                        }}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                    Approval baru dana masuk sosial: <b>{pendingSosialReceiptCount}</b>
                  </div>
                  <Link
                    href="/approval"
                    className="btn-action-blue inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold md:w-auto"
                  >
                    Buka Approval
                  </Link>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      label="Nominal Pengeluaran Sosial"
                      type="text"
                      inputMode="numeric"
                      value={formatRupiahInput(sosialExpenseAmount)}
                      onChange={(e) => setSosialExpenseAmount(e.target.value)}
                      placeholder="Contoh: 250.000"
                    />
                    <Input
                      label="Tanggal Pengeluaran"
                      type="date"
                      value={sosialExpenseDate}
                      onChange={(e) => setSosialExpenseDate(e.target.value)}
                    />
                    <div className="flex items-end md:col-span-1">
                      <Button className="w-full" onClick={submitSosialExpense} disabled={busy}>
                        Ajukan Pengeluaran Sosial
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-[var(--text-primary)]">Keterangan</label>
                    <textarea
                      className="mt-2 min-h-[88px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-primary)]"
                      value={sosialExpenseDesc}
                      onChange={(e) => setSosialExpenseDesc(e.target.value)}
                      placeholder="Contoh: santunan warga"
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Line label="Saldo Kas Sosial" value={formatRupiah(Number(sosialSummary?.saldo_total || 0))} />
                    <Line label="Pemasukan Bulan" value={formatRupiah(Number(sosialSummary?.pemasukan_bulan || 0))} />
                    <Line label="Pengeluaran Bulan" value={formatRupiah(Number(sosialSummary?.pengeluaran_bulan || 0))} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                      <thead>
                        <tr className="bg-[var(--surface-strong)]">
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tanggal</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Keterangan</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Status</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sosialSummary?.expenses || []).length === 0 ? (
                          <tr className="bg-[var(--surface)]">
                            <td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada riwayat pengeluaran sosial pada bulan ini.</td>
                          </tr>
                        ) : (
                          (sosialSummary?.expenses || []).map((row) => (
                            <tr key={String(row.id)} className="bg-[var(--surface)]">
                              <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)] break-words whitespace-normal">{row.description || '-'}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.status}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.amount || 0))}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {(isSekretaris || sekretarisMode) ? (
                <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Rekap Keuangan Bulanan (Bendahara & Admin)</p>
                    <div className="w-full max-w-[220px]">
                      <Input
                        label="Periode"
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          const value = String(e.target.value || '').trim();
                          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
                          setSelectedMonth(value);
                          const [year, month] = value.split('-');
                          setSelectedYearOnly(year);
                          setSelectedMonthOnly(month);
                        }}
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                      <thead>
                        <tr className="bg-[var(--surface-strong)]">
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Kas</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pemasukan Bulan</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pengeluaran Bulan</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Akhir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekapKeuangan.length === 0 ? (
                          <tr className="bg-[var(--surface)]">
                            <td colSpan={4} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada data rekap.</td>
                          </tr>
                        ) : (
                          <>
                            <tr className="bg-[var(--surface)]">
                              <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2"
                                  onClick={() => setShowBendaharaDetail((prev) => !prev)}
                                >
                                  <span>{showBendaharaDetail ? '▾' : '▸'}</span>
                                  <span>Kas Bendahara</span>
                                </button>
                              </td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-emerald-600">{formatRupiah(Number(rekapBendahara.kasBendahara.pemasukan_bulan || 0))}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-500">{formatRupiah(Number(rekapBendahara.kasBendahara.pengeluaran_bulan || 0))}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(rekapBendahara.kasBendahara.saldo_akhir || 0))}</td>
                            </tr>
                            {showBendaharaDetail
                              ? rekapBendahara.detail.map((row) => (
                                  <tr key={row.wallet_id} className="bg-[var(--surface)]">
                                    <td className="border-b border-[var(--line)] px-3 py-2 pl-8 text-sm text-[var(--text-primary)]">{row.wallet_name}</td>
                                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-emerald-600">{formatRupiah(Number(row.pemasukan_bulan || 0))}</td>
                                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-500">{formatRupiah(Number(row.pengeluaran_bulan || 0))}</td>
                                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.saldo_akhir || 0))}</td>
                                  </tr>
                                ))
                              : null}
                            {rekapBendahara.other.map((row) => (
                              <tr key={row.wallet_id} className="bg-[var(--surface)]">
                                <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.wallet_name}</td>
                                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-emerald-600">{formatRupiah(Number(row.pemasukan_bulan || 0))}</td>
                                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-rose-500">{formatRupiah(Number(row.pengeluaran_bulan || 0))}</td>
                                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.saldo_akhir || 0))}</td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {(isSekretaris || sekretarisMode) ? (
                <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Notulen Rapat Bulanan</p>
                  <textarea
                    className="min-h-[160px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-primary)]"
                    value={meetingNotes}
                    onChange={(e) => {
                      setMeetingNotes(e.target.value);
                      setMeetingNotesDirty(true);
                    }}
                    placeholder="Tulis ringkasan keputusan rapat bulan ini..."
                  />
                  <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3">
                    <Input
                      label="Tanggal Rapat"
                      type="date"
                      value={meetingDate}
                      onChange={(e) => {
                        setMeetingDate(e.target.value);
                        setMeetingNotesDirty(true);
                      }}
                    />
                    <Input
                      label="Waktu Mulai"
                      type="time"
                      value={meetingStartTime}
                      onChange={(e) => {
                        setMeetingStartTime(e.target.value);
                        setMeetingNotesDirty(true);
                      }}
                    />
                    <Input
                      label="Agenda Rapat"
                      value={meetingAgenda}
                      onChange={(e) => {
                        setMeetingAgenda(e.target.value);
                        setMeetingNotesDirty(true);
                      }}
                      placeholder="Contoh: evaluasi iuran bulanan"
                    />
                  </div>
                  <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
                    <Button
                      variant="ghost"
                      className="btn-action-blue w-full"
                      onPointerDown={startSpeechToText}
                      onPointerUp={stopSpeechToText}
                      onPointerLeave={stopSpeechToText}
                      onPointerCancel={stopSpeechToText}
                    >
                      {speechListening ? '🎙️ Lepas untuk berhenti' : '🎙️ Tekan & tahan'}
                    </Button>
                    <Button className="btn-action-green w-full" onClick={saveMeetingNote} disabled={meetingNotesLoading}>
                      {meetingNotesLoading ? 'Menyimpan...' : 'Simpan Notulen'}
                    </Button>
                  </div>
                  <Button variant="ghost" className="btn-action-blue w-full" onClick={sendMeetingNoteToWA}>
                    Kirim WA
                  </Button>
                </div>
              ) : null}
              {(isSekretaris || sekretarisMode) ? (
                <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Riwayat Notulen</p>
                    <div className="w-full max-w-[220px]">
                      <Input
                        label="Periode Riwayat"
                        type="month"
                        value={meetingHistoryMonth}
                        onChange={(e) => {
                          const value = String(e.target.value || '').trim();
                          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
                          setMeetingHistoryMonth(value);
                        }}
                      />
                    </div>
                  </div>
                  <textarea
                    className="min-h-[130px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--text-primary)]"
                    value={meetingHistoryText}
                    readOnly
                    placeholder="Belum ada notulen untuk periode ini."
                  />
                </div>
              ) : null}
            </div>
          ) : (isBendahara || bendaharaMode) ? (
            <>
              <SummaryTripleCard
                title="Pendapatan Bulan Ini"
                sticky
                items={[
                  { label: 'Iuran', value: formatRupiah(Number(pendapatan.iuran || totalPendapatanBulanIni || 0)) },
                  { label: 'Jimpitan', value: formatRupiah(Number(pendapatan.jimpitan || 0)), className: 'hidden md:block' },
                  { label: 'Sewa Aset', value: formatRupiah(Number(pendapatan.sewa_aset || 0)), className: 'hidden md:block' },
                  { label: 'Total', value: formatRupiah(Number(pendapatan.total || totalPendapatanBulanIni || 0)), emphasize: true, className: 'hidden md:block' }
                ]}
              />
              {!iuranPageMode ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  <Link
                    href="/operasional/bendahara/iuran"
                    className="btn-action-blue inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    Input Iuran
                  </Link>
                  {isBendahara ? (
                    <Link
                      href="/approval/bendahara"
                      className="btn-action-blue inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
                    >
                      Approval Bendahara
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {iuranPageMode ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="surface-muted rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                      Tarif aktif: <b>{formatRupiah(iuranMonthlyFee)}</b>
                      {iuranTariffs[0]?.effective_month ? (
                        <span className="ml-1 text-[var(--text-muted)]">(mulai {iuranTariffs[0].effective_month})</span>
                      ) : null}
                    </div>
                    {isBendahara ? (
                      <Button variant="ghost" className="btn-action-blue" onClick={() => setShowIuranTariffSetting((v) => !v)}>
                        ⚙️ Pengaturan Tarif
                      </Button>
                    ) : null}
                  </div>
                  {showIuranTariffSetting && isBendahara ? (
                    <div className="mb-4 grid gap-3 md:grid-cols-4">
                      <Input label="Tarif Berlaku Mulai" type="month" value={iuranTariffMonth} onChange={(e) => setIuranTariffMonth(e.target.value)} />
                      <Input
                        label="Nominal Tarif Baru"
                        type="text"
                        inputMode="numeric"
                        value={formatRupiahInput(iuranTariffValue)}
                        onChange={(e) => setIuranTariffValue(e.target.value)}
                      />
                      <div className="md:col-span-2 flex items-end">
                        <Button className="w-full" onClick={submitIuranTariff} disabled={busy}>Simpan Tarif</Button>
                      </div>
                    </div>
                  ) : null}
                  <WargaContributionSection
                    rows={iuranRows}
                    selectedRow={selectedWargaCard}
                    loading={busy}
                    presets={iuranPresetAmounts}
                    onOpen={(row) => {
                      setSelectedWarga(String(row.id));
                      setSelectedWargaCard(row);
                    }}
                    onClose={() => setSelectedWargaCard(null)}
                    onSubmit={(amount) => {
                      const ok = submitSetorIuran(amount);
                      if (ok) setSelectedWargaCard(null);
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Card>

        {(isBendahara || isKetua) ? (
          <>
            <Card title="Total Saldo Realtime" subtitle="Akumulasi saldo kas dari transaksi APPROVED">
              <SummaryTripleCard
                title="Ringkasan Saldo"
                items={[
                  { label: 'Kas Iuran Wajib', value: formatRupiah(Number(kasIuranWajibWallet?.balance || 0)) },
                  { label: 'Kas Jimpitan', value: formatRupiah(Number(kasJimpitanWallet?.balance || 0)) },
                  { label: 'Total Saldo', value: formatRupiah(totalSaldoRealtime), emphasize: true }
                ]}
              />
            </Card>

            <Card
              title="List Pengeluaran"
              subtitle={`Riwayat pengeluaran untuk ${selectedMonth}`}
              headerRight={
                <div className="w-full max-w-[220px]">
                  <Input
                    label="Periode"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      const value = String(e.target.value || '').trim();
                      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
                      setSelectedMonth(value);
                      const [year, month] = value.split('-');
                      setSelectedYearOnly(year);
                      setSelectedMonthOnly(month);
                    }}
                  />
                </div>
              }
            >
              <div className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Total Pengeluaran Bulan Terpilih</p>
                <p className="mt-1 text-xl font-bold text-rose-500">{formatRupiah(totalPengeluaranBulanTerpilih)}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tanggal</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Jenis</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Wallet</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Keterangan</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Status</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pengeluaran.length === 0 ? (
                      <tr className="bg-[var(--surface)]">
                        <td colSpan={6} className="px-4 py-3 text-sm text-[var(--text-muted)]">Belum ada pengeluaran bulan ini.</td>
                      </tr>
                    ) : (
                      pengeluaran.map((row) => (
                        <tr key={String(row.id)} className="bg-[var(--surface)]">
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                            {new Date(row.created_at).toLocaleDateString('id-ID')}
                          </td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                            {row.transaction_type === 'TRANSFER' ? 'Transfer Sosial' : 'Pengeluaran'}
                          </td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.wallet_name || '-'}</td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)] break-words whitespace-normal">{row.description || '-'}</td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">{row.status || '-'}</td>
                          <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">
                            {formatRupiah(Number(row.amount || 0))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Pengeluaran Bulanan" subtitle="Pencatatan pengeluaran operasional bulanan">
              <div className="grid gap-4 md:grid-cols-4">
                <Input
                  label="Tanggal Keluar"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
                <label className="space-y-2 text-sm font-semibold">
                  <span>Wallet</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={expenseWalletId}
                    onChange={(e) => setExpenseWalletId(e.target.value)}
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Nominal"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(expenseAmount)}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="Contoh: 150.000"
                />
                <Input label="Keterangan" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} placeholder="Contoh: listrik balai RT" />
                <div className="flex items-end">
                  <Button className="w-full" onClick={submitExpense} disabled={busy}>Catat Pengeluaran</Button>
                </div>
              </div>
            </Card>

            <Card title="Transfer ke Kas Sosial" subtitle="Bendahara ajukan transfer, Admin Sosial yang konfirmasi penerimaan">
              <div className="grid gap-4 md:grid-cols-4">
                <label className="space-y-2 text-sm font-semibold">
                  <span>Wallet Sumber</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={transferSosialSourceWalletId}
                    onChange={(e) => setTransferSosialSourceWalletId(e.target.value)}
                  >
                    {(kasIuranWajibWallet ? [kasIuranWajibWallet] : []).map((w) => (
                      <option key={String(w.id)} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Nominal Transfer"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahInput(transferSosialAmount)}
                  onChange={(e) => setTransferSosialAmount(e.target.value)}
                  placeholder="Contoh: 300.000"
                />
                <Input
                  label="Keterangan"
                  value={transferSosialDesc}
                  onChange={(e) => setTransferSosialDesc(e.target.value)}
                  placeholder="Contoh: alokasi sosial bulanan"
                />
                <div className="flex items-end">
                  <Button className="w-full" onClick={submitTransferSosial} disabled={busy}>
                    Transfer ke Kas Sosial
                  </Button>
                </div>
              </div>
            </Card>            

            {report ? (
              <Card title="Report Bendahara" subtitle="Ringkasan iuran wajib dan tunggakan">
                <div className="grid gap-2 md:grid-cols-2">
                  <Line label="Target Iuran Wajib / Bulan" value={formatRupiah(Number(report.iuran_wajib_target_bulanan || 0))} />
                  <Line label="Target Bulan Ini" value={formatRupiah(Number(report.target_bulan_ini || 0))} />
                  <Line label="Pemasukan Bulan Ini" value={formatRupiah(Number(report.pemasukan_bulan_ini || 0))} />
                  <Line label="Total Warga" value={String(report.total_warga || 0)} />
                  <Line label="Menunggak Bulan Ini" value={String(report.total_menunggak_bulan_ini || 0)} />
                  <Line label="Nominal Tunggakan Bulan Ini" value={formatRupiah(Number(report.nominal_tunggakan_bulan_ini || 0))} />
                  <Line label="Tunggakan Akumulatif Tahun Berjalan" value={formatRupiah(Number(report.nominal_tunggakan_akumulatif_tahun_berjalan || 0))} />
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">         
                  <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[var(--surface-strong)]">
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tren 6 Bulan</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Target</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Masuk</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tunggakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.tren_6_bulan || []).map((row) => (
                          <tr key={row.bulan} className="bg-[var(--surface)]">
                            <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.bulan}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-[var(--text-primary)]">{formatRupiah(Number(row.target || 0))}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.pemasukan || 0))}</td>
                            <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-500">{formatRupiah(Number(row.tunggakan || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Grafik Tren 6 Bulan
                  </p>
                  <div className="space-y-2">
                    {(report.tren_6_bulan || []).map((row) => {
                      const target = Number(row.target || 0);
                      const pemasukan = Number(row.pemasukan || 0);
                      const ratio = target > 0 ? Math.min((pemasukan / target) * 100, 100) : 0;
                      return (
                        <div key={`bar-${row.bulan}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-[var(--text-primary)]">{row.bulan}</span>
                            <span className="text-[var(--text-muted)]">{formatRupiah(pemasukan)} / {formatRupiah(target)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)] transition-all"
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>                  
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)]">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-[var(--surface-strong)]">
                          <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Top 10 Penunggak</th>
                          <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tunggakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.top_10_penunggak || []).length === 0 ? (
                          <tr className="bg-[var(--surface)]">
                            <td colSpan={2} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada data penunggak.</td>
                          </tr>
                        ) : (
                          (report.top_10_penunggak || []).map((row) => (
                            <tr key={String(row.warga_id)} className="bg-[var(--surface)]">
                              <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.nama}</td>
                              <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.tunggakan_akumulatif || 0))}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
              </Card>
            ) : null}

            <Card title="Closing Tahunan" subtitle="Tools tahunan (disembunyikan saat operasional harian/bulanan)">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--text-muted)]">Dipakai untuk tutup buku dan buka periode tahun berikutnya.</p>
                <Button variant="ghost" onClick={() => setShowClosingTools((prev) => !prev)}>
                  {showClosingTools ? 'Sembunyikan Tools Closing' : 'Buka Closing Tahunan'}
                </Button>
              </div>

              {showClosingTools ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <Input
                      label="Tahun Buku"
                      type="text"
                      inputMode="numeric"
                      value={String(yearlyYear)}
                      onChange={(e) => {
                        const raw = String(e.target.value || '').replace(/[^\d]/g, '');
                        if (!raw) {
                          setYearlyYear(new Date().getFullYear());
                          return;
                        }
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          const bounded = Math.min(2100, Math.max(2000, parsed));
                          setYearlyYear(bounded);
                        }
                      }}
                    />
                    <div className="flex items-end">
                      <Button className="w-full" onClick={loadYearlyBook} disabled={busy}>Muat Data Tahun</Button>
                    </div>
                    <div className="flex items-end">
                      <Button className="w-full" onClick={handleCloseYear} disabled={busy}>Close Tahun</Button>
                    </div>
                    <div className="flex items-end">
                      <Button className="w-full" onClick={handleOpenNextYear} disabled={busy}>Open Tahun Berikutnya</Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <Line label="Status Periode" value={yearlyBook?.period?.status || 'BELUM ADA'} />
                    <Line label="Total Warga (Snapshot)" value={String(yearlyBook?.arrears?.total_warga || 0)} />
                    <Line label="Total Tunggakan Awal" value={formatRupiah(Number(yearlyBook?.arrears?.total_opening_arrears || 0))} />
                    <Line label="Total Tunggakan Akhir" value={formatRupiah(Number(yearlyBook?.arrears?.total_closing_arrears || 0))} />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                      <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="bg-[var(--surface-strong)]">
                            <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Kas</th>
                            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Awal</th>
                            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Akhir</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(yearlyBook?.wallets || []).length === 0 ? (
                            <tr className="bg-[var(--surface)]">
                              <td colSpan={3} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada snapshot saldo kas.</td>
                            </tr>
                          ) : (
                            (yearlyBook?.wallets || []).map((row) => (
                              <tr key={row.wallet_id} className="bg-[var(--surface)]">
                                <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.wallet_name || '-'}</td>
                                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm text-[var(--text-primary)]">{formatRupiah(Number(row.opening_balance || 0))}</td>
                                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-[var(--accent)]">{formatRupiah(Number(row.closing_balance || 0))}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                      <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="bg-[var(--surface-strong)]">
                            <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Top Tunggakan Akhir Tahun</th>
                            <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nominal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(yearlyBook?.arrears?.top10 || []).length === 0 ? (
                            <tr className="bg-[var(--surface)]">
                              <td colSpan={2} className="px-3 py-2 text-sm text-[var(--text-muted)]">Belum ada data tunggakan akhir tahun.</td>
                            </tr>
                          ) : (
                            (yearlyBook?.arrears?.top10 || []).map((row) => (
                              <tr key={String(row.warga_id)} className="bg-[var(--surface)]">
                                <td className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--text-primary)]">{row.nama || '-'}</td>
                                <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-rose-500">{formatRupiah(Number(row.closing_arrears || 0))}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </Card>
          </>
        ) : null}

      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <strong className="text-right text-[var(--text-primary)]">{value}</strong>
    </div>
  );
}
