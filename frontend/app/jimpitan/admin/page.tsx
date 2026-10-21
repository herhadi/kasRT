"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { hasAnyRole } from "@/lib/auth";
import {
  formatRupiah,
  formatRupiahInput,
  formatTanggalIndonesia,
  parseRupiahInput,
} from "@/lib/helpers";
import { useAuth } from "@/lib/useAuth";
import usePagination from "@/lib/hooks/usePagination";
import PaginationControls from "@/components/pagination/PaginationControls";
import PeriodPickerCompact from "@/components/contribution/PeriodPickerCompact";
import MembershipStatusFilter from "@/components/membership/MembershipStatusFilter";

type WargaOption = { id: string; nama: string; no_hp?: string };
type ExternalParticipant = {
  id: string;
  nama: string;
  no_hp?: string | null;
  keterangan?: string | null;
  is_active: boolean;
};
type JimpitanMember = {
  warga_id: string;
  nama: string;
  no_hp?: string | null;
  status: "ACTIVE" | "INACTIVE";
};
type SetorHistoryItem = {
  id: number;
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  description: string;
  created_at: string;
  approved_at?: string | null;
  target_wallet_name?: string | null;
};
type TopupHistoryItem = {
  id: string;
  warga_id: string;
  nama: string;
  month_key: string;
  nominal: number;
  note?: string | null;
  created_at: string;
  admin_name?: string | null;
};
type JimpitanCashLedgerRow = {
  id: string;
  type: string;
  direction: "IN" | "OUT";
  amount: number;
  description?: string | null;
  created_at: string;
  approved_at?: string | null;
  source_wallet_name?: string | null;
  target_wallet_name?: string | null;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  balance_after: number;
};
type JimpitanCashLedger = {
  year: number;
  balance: number;
  opening_balance: number;
  total_in: number;
  total_out: number;
  closing_balance: number;
  rows: JimpitanCashLedgerRow[];
};

type JimpitanV2Entry = {
  id: string;
  entry_type: "SHIFT_INCOME" | "MONTHLY_INCOME" | "OLD_CASH_HANDOVER";
  entry_date: string;
  amount: number;
  description?: string | null;
  created_at: string;
  created_by_name?: string | null;
};

function buildDefaultJimpitanDailyNote(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "setoran jimpitan";
  const label = date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `setoran jimpitan ${label}`;
}

function normalizeJimpitanExportDescription(value?: string | null) {
  let description = String(value || "").trim();
  const prefixMatch = description.match(/^\s*(\[JIMPITAN_V2(?:_ADMIN)?\])\s*/i);
  const prefix = prefixMatch?.[1]?.toUpperCase() || "";
  if (prefixMatch) description = description.slice(prefixMatch[0].length).trim();

  // Standarkan tanggal ISO menjadi nama hari/tanggal Indonesia; hindari tanggal ganda
  // bila keterangan sudah memuat tanggal lengkap yang bisa dibaca.
  const hasReadableDate = /\b\d{1,2}\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}\b/i.test(description);
  description = description.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, year, month, day) => {
    if (hasReadableDate) return "";
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return match;
    return date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  });
  description = description.replace(/\s+([•|])/g, " $1").replace(/([•|])\s+/g, "$1 ").replace(/\s{2,}/g, " ").trim();

  // Normalisasi tanggal lama berbahasa Inggris, misalnya "Wed Sep 23" -> "Rabu, 23 September".
  const weekdays: Record<string, string> = {
    mon: "Senin", monday: "Senin", tue: "Selasa", tues: "Selasa", tuesday: "Selasa",
    wed: "Rabu", wednesday: "Rabu", thu: "Kamis", thur: "Kamis", thurs: "Kamis", thursday: "Kamis",
    fri: "Jumat", friday: "Jumat", sat: "Sabtu", saturday: "Sabtu", sun: "Minggu", sunday: "Minggu",
  };
  const months: Record<string, string> = {
    jan: "Januari", january: "Januari", feb: "Februari", february: "Februari",
    mar: "Maret", march: "Maret", apr: "April", april: "April", may: "Mei",
    jun: "Juni", june: "Juni", jul: "Juli", july: "Juli", aug: "Agustus", august: "Agustus",
    sep: "September", sept: "September", september: "September", oct: "Oktober", october: "Oktober",
    nov: "November", november: "November", dec: "Desember", december: "Desember",
  };
  description = description.replace(/\b(Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?/gi,
    (_match, day, month, date, year) => `${weekdays[day.toLowerCase()]}, ${Number(date)} ${months[month.toLowerCase()]}${year ? ` ${year}` : ""}`);
  description = description.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, (day) => weekdays[day.toLowerCase()]);
  // Terjemahkan nama bulan Inggris yang tersisa pada keterangan lama.
  description = description.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/gi, (month) => months[month.toLowerCase()]);
  return { description, prefix };
}

export default function JimpitanAdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
  const [topupWargaId, setTopupWargaId] = useState("");
  const [topupNominal, setTopupNominal] = useState("");
  const [topupPeriod, setTopupPeriod] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupHistoryLoading, setTopupHistoryLoading] = useState(false);
  const [topupHistory, setTopupHistory] = useState<TopupHistoryItem[]>([]);
  const [v2Date, setV2Date] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [v2Amount, setV2Amount] = useState("");
  const [v2Note, setV2Note] = useState(() =>
    buildDefaultJimpitanDailyNote(new Date().toISOString().slice(0, 10)),
  );
  const [v2NoteEdited, setV2NoteEdited] = useState(false);
  const [v2Loading, setV2Loading] = useState(false);
  const [v2MonthlyPeriod, setV2MonthlyPeriod] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [v2MonthlyAmount, setV2MonthlyAmount] = useState("");
  const [v2MonthlyNote, setV2MonthlyNote] = useState("");
  const [v2MonthlyLoading, setV2MonthlyLoading] = useState(false);
  const [handoverDate, setHandoverDate] = useState(() => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  });
  const [handoverAmount, setHandoverAmount] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [v2EntriesLoading, setV2EntriesLoading] = useState(false);
  const [v2Entries, setV2Entries] = useState<JimpitanV2Entry[]>([]);
  const [ledgerYear, setLedgerYear] = useState(() => new Date().getFullYear());
  const [cashLedger, setCashLedger] = useState<JimpitanCashLedger | null>(null);
  const [cashLedgerLoading, setCashLedgerLoading] = useState(false);
  const [cashLedgerExporting, setCashLedgerExporting] = useState(false);
  const [expenseDate, setExpenseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [setorPeriod, setSetorPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [setorLoading, setSetorLoading] = useState(false);
  const [setorHistoryLoading, setSetorHistoryLoading] = useState(false);
  const [setorHistory, setSetorHistory] = useState<SetorHistoryItem[]>([]);
  const [externalParticipants, setExternalParticipants] = useState<
    ExternalParticipant[]
  >([]);
  const [members, setMembers] = useState<JimpitanMember[]>([]);
  const [memberSettingsExpanded, setMemberSettingsExpanded] = useState(false);
  const [memberFilter, setMemberFilter] = useState<"ACTIVE" | "INACTIVE">(
    "ACTIVE",
  );
  const [donaturNama, setDonaturNama] = useState("");
  const [donaturNoHp, setDonaturNoHp] = useState("");
  const [donaturKeterangan, setDonaturKeterangan] = useState("");
  const [savingDonatur, setSavingDonatur] = useState(false);
  const [toasts, setToasts] = useState<
    Array<{
      id: number;
      message: string;
      kind: "success" | "error" | "warning";
    }>
  >([]);

  const isAdminJimpitan = hasAnyRole(user, ["Admin Jimpitan", "root"]);
  const isKetua = hasAnyRole(user, ["Ketua"]);
  const settingMode = pathname === "/operasional/jimpitan/setting";

  const pushToast = useCallback(
    (message: string, kind: "success" | "error" | "warning" = "success") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, message, kind }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 3200);
    },
    [],
  );

  const loadWargaOptions = useCallback(async () => {
    const result = await apiFetch<{ success: boolean; data: WargaOption[] }>(
      "/auth/warga-options",
    );
    const rows = result.data || [];
    setWargaOptions(rows);
    setTopupWargaId((previous) => {
      if (previous && rows.some((row) => String(row.id) === String(previous)))
        return previous;
      return rows[0]?.id ? String(rows[0].id) : "";
    });
  }, []);

  const loadSetorHistory = useCallback(async () => {
    setSetorHistoryLoading(true);
    try {
      const result = await apiFetch<{
        success: boolean;
        data: SetorHistoryItem[];
      }>("/jimpitan/setor-history?limit=20");
      setSetorHistory(result.data || []);
    } finally {
      setSetorHistoryLoading(false);
    }
  }, []);

  const loadCashLedger = useCallback(async () => {
    if (!isAdminJimpitan) return;
    setCashLedgerLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; data: JimpitanCashLedger }>(
        `/jimpitan/cash-ledger?year=${ledgerYear}`,
      );
      setCashLedger(result.data);
    } finally {
      setCashLedgerLoading(false);
    }
  }, [isAdminJimpitan, ledgerYear]);

  const handleSubmitJimpitanExpense = useCallback(async () => {
    const amount = parseRupiahInput(expenseAmount);
    const description = expenseDescription.trim();
    if (!expenseDate || amount <= 0 || !description) {
      pushToast("Lengkapi tanggal, nominal, dan keperluan pengeluaran.", "error");
      return;
    }
    setExpenseSubmitting(true);
    try {
      await apiFetch("/jimpitan/cash-expense", {
        method: "POST",
        body: JSON.stringify({ expense_date: expenseDate, amount, description }),
      });
      setExpenseAmount("");
      setExpenseDescription("");
      pushToast("Pengeluaran diajukan. Saldo baru berubah setelah disetujui Ketua/Sekretaris.", "success");
      await loadCashLedger();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Gagal mengajukan pengeluaran", "error");
    } finally {
      setExpenseSubmitting(false);
    }
  }, [expenseDate, expenseAmount, expenseDescription, loadCashLedger, pushToast]);

  const loadExternalParticipants = useCallback(async () => {
    if (!isAdminJimpitan) return;
    const result = await apiFetch<{
      success: boolean;
      data: ExternalParticipant[];
    }>("/jimpitan/external-participants");
    setExternalParticipants(result.data || []);
  }, [isAdminJimpitan]);

  const loadMembers = useCallback(async () => {
    if (!isAdminJimpitan) return;
    const result = await apiFetch<{ success: boolean; data: JimpitanMember[] }>(
      "/jimpitan/members",
    );
    setMembers(result.data || []);
  }, [isAdminJimpitan]);

  const loadTopupHistory = useCallback(async () => {
    if (!isAdminJimpitan) return;
    setTopupHistoryLoading(true);
    try {
      const result = await apiFetch<{
        success: boolean;
        data: TopupHistoryItem[];
      }>(`/jimpitan/topups?month=${encodeURIComponent(topupPeriod)}&limit=100`);
      setTopupHistory(result.data || []);
    } finally {
      setTopupHistoryLoading(false);
    }
  }, [isAdminJimpitan, topupPeriod]);

  const loadV2Entries = useCallback(async () => {
    if (!isAdminJimpitan) return;
    setV2EntriesLoading(true);
    try {
      const result = await apiFetch<{
        success: boolean;
        data: JimpitanV2Entry[];
      }>("/jimpitan/v2-entries");
      setV2Entries(result.data || []);
    } finally {
      setV2EntriesLoading(false);
    }
  }, [isAdminJimpitan]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isAdminJimpitan && !isKetua) {
      router.replace("/jimpitan");
      return;
    }
    void Promise.all([
      loadWargaOptions(),
      loadSetorHistory(),
      loadExternalParticipants(),
      loadMembers(),
      loadV2Entries(),
    ]).catch((error) => {
      pushToast(
        error instanceof Error
          ? error.message
          : "Gagal memuat data admin jimpitan",
        "error",
      );
    });
  }, [
    loading,
    user,
    isAdminJimpitan,
    isKetua,
    router,
    loadWargaOptions,
    loadSetorHistory,
    loadExternalParticipants,
    loadMembers,
    loadV2Entries,
    pushToast,
  ]);

  useEffect(() => {
    if (!loading && user && isAdminJimpitan && !settingMode) {
      void loadCashLedger().catch((error) => {
        pushToast(error instanceof Error ? error.message : "Gagal memuat buku kas jimpitan", "error");
      });
    }
  }, [loading, user, isAdminJimpitan, settingMode, loadCashLedger, pushToast]);

  const setorHistoryPager = usePagination(setorHistory, 10);
  const filteredMembers = useMemo(
    () => members.filter((member) => member.status === memberFilter),
    [members, memberFilter],
  );
  const memberPager = usePagination(filteredMembers, 10);
  const topupHistoryPager = usePagination(topupHistory, 10);
  const v2EntriesPager = usePagination(v2Entries, 10);
  const cashLedgerPager = usePagination(cashLedger?.rows || [], 10);

  useEffect(() => {
    cashLedgerPager.reset();
  }, [ledgerYear, cashLedger?.rows.length]);

  useEffect(() => {
    setorHistoryPager.reset();
  }, [setorHistory.length]);

  useEffect(() => {
    memberPager.reset();
  }, [memberFilter, filteredMembers.length]);

  useEffect(() => {
    topupHistoryPager.reset();
  }, [topupHistory.length, topupPeriod]);

  useEffect(() => {
    v2EntriesPager.reset();
  }, [v2Entries.length]);

  useEffect(() => {
    if (!v2NoteEdited) {
      setV2Note(buildDefaultJimpitanDailyNote(v2Date));
    }
  }, [v2Date, v2NoteEdited]);

  useEffect(() => {
    if (!loading && user && isAdminJimpitan && !settingMode) {
      void loadTopupHistory().catch((error) => {
        pushToast(
          error instanceof Error
            ? error.message
            : "Gagal memuat riwayat top up",
          "error",
        );
      });
    }
  }, [
    loading,
    user,
    isAdminJimpitan,
    settingMode,
    loadTopupHistory,
    pushToast,
  ]);

  async function updateMemberStatus(
    member: JimpitanMember,
    status: JimpitanMember["status"],
  ) {
    if (member.status === status) return;
    try {
      await apiFetch("/jimpitan/members/status", {
        method: "POST",
        body: JSON.stringify({ warga_id: member.warga_id, status }),
      });
      await loadMembers();
      pushToast(`Status jimpitan ${member.nama} berhasil diubah.`, "success");
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : "Gagal mengubah status peserta jimpitan",
        "error",
      );
    }
  }

  async function handleTopup() {
    const wargaId = String(topupWargaId || "").trim();
    const nominal = parseRupiahInput(topupNominal);

    if (!wargaId) {
      pushToast("Pilih warga yang valid terlebih dahulu.", "warning");
      return;
    }
    if (!Number.isFinite(nominal) || nominal <= 0) {
      pushToast("Nominal top up harus lebih dari 0.", "warning");
      return;
    }

    try {
      setTopupLoading(true);
      await apiFetch("/jimpitan/topup", {
        method: "POST",
        body: JSON.stringify({
          warga_id: wargaId,
          nominal,
          month_key: topupPeriod,
        }),
      });
      const wargaName =
        wargaOptions.find((row) => String(row.id) === wargaId)?.nama || "warga";
      setTopupNominal("");
      pushToast(
        `Top up ${wargaName} ${formatRupiah(nominal)} periode ${topupPeriod} berhasil.`,
        "success",
      );
      void Promise.allSettled([loadWargaOptions(), loadTopupHistory()]).then(
        (results) => {
          if (results.some((result) => result.status === "rejected")) {
            pushToast(
              "Top up tersimpan, tetapi refresh riwayat gagal. Silakan muat ulang jika data belum tampil.",
              "warning",
            );
          }
        },
      );
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Top up gagal",
        "error",
      );
    } finally {
      setTopupLoading(false);
    }
  }

  async function handleInputV2Income() {
    const amount = parseRupiahInput(v2Amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v2Date)) {
      pushToast("Tanggal pemasukan tidak valid.", "warning");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast("Nominal pemasukan V2 harus lebih dari 0.", "warning");
      return;
    }
    try {
      setV2Loading(true);
      await apiFetch("/jimpitan/v2-income", {
        method: "POST",
        body: JSON.stringify({
          operational_date: v2Date,
          amount,
          note: v2Note.trim(),
        }),
      });
      setV2Amount("");
      setV2NoteEdited(false);
      setV2Note(buildDefaultJimpitanDailyNote(v2Date));
      pushToast(
        `Pemasukan Jimpitan V2 tanggal ${v2Date} berhasil dicatat.`,
        "success",
      );
      void loadV2Entries().catch(() => {
        pushToast(
          "Pemasukan tersimpan, tetapi daftar belum berhasil diperbarui.",
          "warning",
        );
      });
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Gagal input pemasukan V2",
        "error",
      );
    } finally {
      setV2Loading(false);
    }
  }

  async function handleInputV2MonthlyIncome() {
    const amount = parseRupiahInput(v2MonthlyAmount);
    if (!/^\d{4}-\d{2}$/.test(v2MonthlyPeriod)) {
      pushToast("Periode rekap bulanan tidak valid.", "warning");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast("Nominal rekap bulanan harus lebih dari 0.", "warning");
      return;
    }
    try {
      setV2MonthlyLoading(true);
      await apiFetch("/jimpitan/v2-monthly-income", {
        method: "POST",
        body: JSON.stringify({
          month_key: v2MonthlyPeriod,
          amount,
          note: v2MonthlyNote.trim(),
        }),
      });
      setV2MonthlyAmount("");
      setV2MonthlyNote("");
      await loadV2Entries();
      pushToast(
        `Rekap bulanan Jimpitan V2 periode ${v2MonthlyPeriod} berhasil dicatat.`,
        "success",
      );
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Gagal input rekap bulanan V2",
        "error",
      );
    } finally {
      setV2MonthlyLoading(false);
    }
  }

  async function handleInputOldCashHandover() {
    const amount = parseRupiahInput(handoverAmount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(handoverDate)) {
      pushToast("Tanggal serah terima tidak valid.", "warning");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast("Nominal setoran susulan harus lebih dari 0.", "warning");
      return;
    }
    if (
      !window.confirm(
        `Catat setoran susulan kas lama Jimpitan ${formatRupiah(amount)} per ${handoverDate}?`,
      )
    )
      return;
    try {
      setHandoverLoading(true);
      await apiFetch("/jimpitan/old-cash-handover", {
        method: "POST",
        body: JSON.stringify({
          handover_date: handoverDate,
          amount,
          note: handoverNote.trim(),
        }),
      });
      setHandoverAmount("");
      setHandoverNote("");
      await loadV2Entries();
      pushToast(
        `Setoran susulan kas lama Jimpitan per ${handoverDate} berhasil dicatat.`,
        "success",
      );
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : "Gagal input setoran susulan kas lama",
        "error",
      );
    } finally {
      setHandoverLoading(false);
    }
  }

  async function handleAjukanSetorBendahara() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(setorPeriod)) {
      pushToast("Format periode harus YYYY-MM.", "warning");
      return;
    }
    try {
      setSetorLoading(true);
      const result = await apiFetch<{
        success: boolean;
        data: { periode: string; total_batch: number; total_nominal: number };
      }>("/jimpitan/ajukan-setor-bendahara", {
        method: "POST",
        body: JSON.stringify({ bulan: setorPeriod }),
      });
      const data = result.data;
      pushToast(
        `Pengajuan setor dikirim • ${data.periode} • batch ${data.total_batch}`,
        "success",
      );
      await loadSetorHistory();
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : "Gagal ajukan setor ke Bendahara",
        "error",
      );
    } finally {
      setSetorLoading(false);
    }
  }

  async function handleAddDonatur() {
    if (!donaturNama.trim()) {
      pushToast("Nama donatur wajib diisi.", "warning");
      return;
    }
    try {
      setSavingDonatur(true);
      await apiFetch("/jimpitan/external-participants", {
        method: "POST",
        body: JSON.stringify({
          nama: donaturNama.trim(),
          no_hp: donaturNoHp.trim(),
          keterangan: donaturKeterangan.trim(),
        }),
      });
      setDonaturNama("");
      setDonaturNoHp("");
      setDonaturKeterangan("");
      await loadExternalParticipants();
      pushToast("Donatur jimpitan berhasil ditambahkan.", "success");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Gagal menambah donatur",
        "error",
      );
    } finally {
      setSavingDonatur(false);
    }
  }

  async function toggleDonaturStatus(item: ExternalParticipant) {
    try {
      await apiFetch(
        `/jimpitan/external-participants/${encodeURIComponent(item.id)}/status`,
        {
          method: "POST",
          body: JSON.stringify({ is_active: !item.is_active }),
        },
      );
      await loadExternalParticipants();
      pushToast(
        `${item.nama} ${item.is_active ? "dinonaktifkan" : "diaktifkan"}.`,
        "success",
      );
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : "Gagal mengubah status donatur",
        "error",
      );
    }
  }

  async function exportCashLedgerExcel() {
    if (!cashLedger) return;
    setCashLedgerExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "KasRT";
      workbook.subject = `Ringkasan bulanan kas jimpitan tahun ${cashLedger.year}`;
      workbook.title = `Ringkasan Bulanan Kas Jimpitan ${cashLedger.year}`;
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(`Ringkasan ${cashLedger.year}`, {
        views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
        pageSetup: {
          orientation: "portrait",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 1,
          paperSize: 9,
        },
      });
      sheet.columns = [
        { header: "No", key: "no", width: 7 },
        { header: "Bulan / Tanggal", key: "period", width: 23 },
        { header: "Saldo Awal (Rp)", key: "opening", width: 19 },
        { header: "Pemasukan (Rp)", key: "in", width: 19 },
        { header: "Pengeluaran (Rp)", key: "out", width: 19 },
        { header: "Saldo Akhir (Rp)", key: "closing", width: 19 },
        { header: "Keterangan Pengeluaran", key: "description", width: 42 },
      ];

      sheet.mergeCells("A1:G1");
      sheet.getCell("A1").value = "RINGKASAN BULANAN KAS JIMPITAN";
      sheet.getCell("A1").font = { name: "Aptos Display", size: 17, bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B5D" } };
      sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
      sheet.getRow(1).height = 34;

      sheet.mergeCells("A2:G2");
      sheet.getCell("A2").value = `Tahun buku ${cashLedger.year} | Dicetak ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
      sheet.getCell("A2").font = { italic: true, color: { argb: "FF526273" }, size: 10 };
      sheet.getRow(2).height = 22;

      sheet.mergeCells("A4:B4"); sheet.getCell("A4").value = `Saldo Awal Tahun: ${formatRupiah(cashLedger.opening_balance)}`;
      sheet.mergeCells("C4:D4"); sheet.getCell("C4").value = `Total Pemasukan: ${formatRupiah(cashLedger.total_in)}`;
      sheet.mergeCells("E4:G4"); sheet.getCell("E4").value = `Total Pengeluaran: ${formatRupiah(cashLedger.total_out)}`;
      sheet.mergeCells("A5:B5"); sheet.getCell("A5").value = `Saldo Akhir Tahun: ${formatRupiah(cashLedger.closing_balance)}`;
      sheet.mergeCells("C5:G5"); sheet.getCell("C5").value = `Saldo Kas Terkini: ${formatRupiah(cashLedger.balance)}`;
      for (const address of ["A4", "C4", "E4", "A5", "C5"]) {
        const cell = sheet.getCell(address);
        cell.font = { bold: true, size: 10, color: { argb: "FF123B5D" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1F6" } };
        cell.alignment = { vertical: "middle", wrapText: true };
      }
      sheet.getRow(4).height = 30;
      sheet.getRow(5).height = 30;
      sheet.getRow(6).height = 8;

      const months = Array.from({ length: 12 }, (_, index) => ({
        index,
        label: new Date(cashLedger.year, index, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
        incoming: 0,
        outgoing: 0,
        count: 0,
        expenses: [] as typeof cashLedger.rows,
      }));
      for (const row of cashLedger.rows) {
        const date = new Date(row.created_at);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(cashLedger.year)) continue;
        const month = months[date.getMonth()];
        const amount = Number(row.amount || 0);
        if (row.direction === "IN") month.incoming += amount;
        else if (row.direction === "OUT") {
          month.outgoing += amount;
          month.expenses.push(row);
        }
        month.count += 1;
      }

      const header = sheet.getRow(7);
      header.values = ["No", "Bulan / Tanggal", "Saldo Awal (Rp)", "Pemasukan (Rp)", "Pengeluaran (Rp)", "Saldo Akhir (Rp)", "Keterangan Pengeluaran"];
      header.height = 32;
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5A7A" } };
      header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

      let runningBalance = Number(cashLedger.opening_balance || 0);
      let sequence = 1;
      months.forEach((month, index) => {
        const isFutureMonth = index >= 10;
        const opening = runningBalance;
        const closing = opening + month.incoming - month.outgoing;
        const summaryRow = sheet.addRow({
          no: sequence++, period: month.label,
          opening: isFutureMonth ? null : opening,
          in: isFutureMonth ? null : (month.incoming || null),
          out: null,
          closing: isFutureMonth ? null : closing,
          description: null,
        });
        for (const col of [3, 4, 5, 6]) summaryRow.getCell(col).numFmt = '"Rp" #,##0;[Red]("Rp" #,##0);-';
        summaryRow.getCell(4).font = { color: { argb: "FF047857" }, bold: true };
        summaryRow.getCell(6).font = { bold: true, color: { argb: "FF123B5D" } };
        summaryRow.height = 28;
        summaryRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFEAF1F6" : "FFF4F7FA" } }; });

        if (!isFutureMonth) {
          for (const expense of month.expenses) {
            const expenseDate = new Date(expense.created_at);
            const dateLabel = expenseDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
            const description = String(expense.description || "Pengeluaran kas jimpitan")
              .replace(/^\[JIMPITAN_EXPENSE\]\s*/i, "")
              .replace(/^\[JIMPITAN_V2(?:_ADMIN)?\]\s*/i, "");
            const expenseRow = sheet.addRow({
              no: sequence++, period: `  ${dateLabel}`, opening: null, in: null,
              out: Number(expense.amount || 0), closing: null, description,
            });
            expenseRow.getCell(5).numFmt = '"Rp" #,##0;[Red]("Rp" #,##0);-';
            expenseRow.getCell(5).font = { color: { argb: "FFB91C1C" }, bold: true };
            expenseRow.getCell(7).alignment = { vertical: "middle", wrapText: true };
            expenseRow.height = 30;
          }
        }
        if (!isFutureMonth) runningBalance = closing;
      });

      const totalRow = sheet.addRow({
        no: "", period: "TOTAL TAHUN", opening: null,
        in: months.reduce((sum, month) => sum + month.incoming, 0),
        out: null, closing: cashLedger.closing_balance, description: null,
      });
      totalRow.font = { bold: true, color: { argb: "FF123B5D" } };
      totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE8F0" } };
      for (const col of [3, 4, 5, 6]) totalRow.getCell(col).numFmt = '"Rp" #,##0;[Red]("Rp" #,##0);-';
      totalRow.height = 30;

      sheet.autoFilter = { from: "A7", to: `G${sheet.rowCount}` };
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 7) row.eachCell((cell) => {
          cell.border = { bottom: { style: "hair", color: { argb: "FFD7E0E8" } } };
          if (rowNumber > 7) cell.alignment = { vertical: "middle", horizontal: [3, 4, 5, 6].includes(Number(cell.col)) ? "right" : "left" };
        });
      });
      sheet.pageSetup.printArea = `A1:G${sheet.rowCount}`;
      sheet.pageSetup.printTitlesRow = "1:7";
      sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
      sheet.headerFooter.oddFooter = "KasRT | Ringkasan Bulanan Kas Jimpitan &P | Halaman &P dari &N";

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Ringkasan-Bulanan-Kas-Jimpitan-${cashLedger.year}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      pushToast("Ringkasan bulanan Excel berhasil dibuat.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Gagal mengekspor Excel", "error");
    } finally { setCashLedgerExporting(false); }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
              toast.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : toast.kind === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <Navbar />

      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Admin Jimpitan
            </p>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {settingMode ? "Pengaturan Jimpitan" : "Menu Khusus Admin"}
            </h2>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {settingMode ? (
              <Link
                href="/operasional/jimpitan"
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                ✕ Close
              </Link>
            ) : isAdminJimpitan ? (
              <Link
                href="/operasional/jimpitan/setting"
                className="btn-action-blue link-action px-3 py-2"
              >
                ⚙️ Pengaturan
              </Link>
            ) : null}
          </div>
        </div>

        {!settingMode && isAdminJimpitan ? (
          <Card
            title="Kas Jimpitan"
            subtitle="Saldo dan mutasi yang sudah disetujui. Transaksi pending tidak dihitung."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {[
                { label: "Saldo Saat Ini", value: cashLedger?.balance ?? 0, emphasis: true },
                { label: `Saldo Awal ${ledgerYear}`, value: cashLedger?.opening_balance ?? 0 },
                { label: `Pemasukan ${ledgerYear}`, value: cashLedger?.total_in ?? 0 },
                { label: `Pengeluaran ${ledgerYear}`, value: cashLedger?.total_out ?? 0 },
              ].map((item) => (
                <div key={item.label} className={`min-w-0 rounded-xl border px-3 py-2.5 sm:px-3 sm:py-3 ${item.emphasis ? "border-sky-200 bg-sky-50" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                  <p className="text-[10px] font-semibold leading-tight text-[var(--text-muted)] sm:text-xs">{item.label}</p>
                  <p className={`mt-1.5 break-words text-base font-bold leading-tight sm:text-lg ${item.emphasis ? "text-sky-900" : "text-[var(--text-primary)]"}`}>{cashLedgerLoading ? "…" : formatRupiah(item.value)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--line)] p-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:w-40">
                <label htmlFor="jimpitan-ledger-year" className="mb-1 block text-xs font-semibold text-[var(--text-primary)]">Tahun buku</label>
                <select id="jimpitan-ledger-year" value={ledgerYear} onChange={(event) => setLedgerYear(Number(event.target.value))} className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  {Array.from({ length: Math.max(5, new Date().getFullYear() - 2024) }, (_, index) => new Date().getFullYear() - index).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <p className="text-xs text-[var(--text-muted)] sm:text-sm">Saldo akhir {ledgerYear}: <strong className="text-[var(--text-primary)]">{formatRupiah(cashLedger?.closing_balance || 0)}</strong></p>
                <Button onClick={exportCashLedgerExcel} disabled={!cashLedger || cashLedgerLoading || cashLedgerExporting}>
                  {cashLedgerExporting ? "Membuat Excel…" : "Ekspor Excel (.xlsx)"}
                </Button>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-3 sm:p-4">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-rose-950">Input Pengeluaran Kas Jimpitan</h3>
                <p className="mt-1 text-xs text-rose-900">Pengajuan tidak langsung mengurangi saldo. Ketua atau Sekretaris harus menyetujui terlebih dahulu.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input label="Tanggal pengeluaran" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
                <Input label="Nominal (Rp)" inputMode="numeric" value={formatRupiahInput(expenseAmount)} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="Contoh: 50.000" />
                <div className="sm:col-span-2">
                  <Input label="Keperluan / keterangan" value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Contoh: pembelian perlengkapan kerja" maxLength={500} />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-rose-900">Setelah disimpan, periksa status pengajuan di menu Persetujuan.</p>
                <Button className="w-full sm:w-auto" onClick={handleSubmitJimpitanExpense} disabled={expenseSubmitting}>
                  {expenseSubmitting ? "Mengajukan…" : "Ajukan Pengeluaran"}
                </Button>
              </div>
            </div>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-[var(--line)]">
                <thead><tr className="bg-[var(--surface-strong)]">
                  {["Tanggal", "Keperluan / Keterangan", "Pemasukan", "Pengeluaran", "Saldo Berjalan"].map((label) => <th key={label} className={`border-b border-[var(--line)] px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)] ${["Pemasukan", "Pengeluaran", "Saldo Berjalan"].includes(label) ? "text-right" : "text-left"}`}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {cashLedgerLoading ? <tr><td colSpan={5} className="px-3 py-5 text-center text-sm text-[var(--text-muted)]">Memuat buku kas…</td></tr> : !cashLedgerPager.pagedItems.length ? <tr><td colSpan={5} className="px-3 py-5 text-center text-sm text-[var(--text-muted)]">Belum ada transaksi kas yang disetujui pada tahun {ledgerYear}.</td></tr> : cashLedgerPager.pagedItems.map((row) => <tr key={row.id} className="bg-[var(--surface)]">
                    <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2.5 text-xs text-[var(--text-primary)]">{formatTanggalIndonesia(row.created_at)}</td>
                    <td className="min-w-56 border-b border-[var(--line)] px-3 py-2.5 text-sm text-[var(--text-primary)]">{row.description || (row.direction === "IN" ? `Setoran dari ${row.source_wallet_name || "transaksi"}` : `Keperluan pengeluaran: ${row.target_wallet_name || "belum dicantumkan"}`)}<span className="mt-1 block text-[11px] text-[var(--text-muted)]">{row.created_by_name ? `Dicatat: ${row.created_by_name}` : ""}{row.approved_by_name ? ` • Disetujui: ${row.approved_by_name}` : ""}</span></td>
                    <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2.5 text-right text-xs font-semibold text-emerald-700">{row.direction === "IN" ? formatRupiah(row.amount) : "—"}</td>
                    <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2.5 text-right text-xs font-semibold text-red-700">{row.direction === "OUT" ? formatRupiah(row.amount) : "—"}</td>
                    <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2.5 text-right text-xs font-bold text-[var(--text-primary)]">{formatRupiah(row.balance_after)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-2 md:hidden">
              {cashLedgerLoading ? <p className="rounded-xl border border-[var(--line)] p-4 text-center text-sm text-[var(--text-muted)]">Memuat buku kas…</p> : !cashLedgerPager.pagedItems.length ? <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-sm text-[var(--text-muted)]">Belum ada transaksi disetujui pada {ledgerYear}.</p> : cashLedgerPager.pagedItems.map((row) => <div key={row.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-[var(--text-muted)]">{formatTanggalIndonesia(row.created_at)}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{row.description || (row.direction === "IN" ? `Setoran dari ${row.source_wallet_name || "transaksi"}` : `Keperluan pengeluaran: ${row.target_wallet_name || "belum dicantumkan"}`)}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${row.direction === "IN" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{row.direction === "IN" ? "MASUK" : "KELUAR"}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-2">
                  <div><p className="text-[10px] text-[var(--text-muted)]">{row.direction === "IN" ? "Pemasukan" : "Pengeluaran"}</p><p className={`mt-0.5 text-sm font-bold ${row.direction === "IN" ? "text-emerald-700" : "text-red-700"}`}>{formatRupiah(row.amount)}</p></div>
                  <div className="text-right"><p className="text-[10px] text-[var(--text-muted)]">Saldo setelah transaksi</p><p className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">{formatRupiah(row.balance_after)}</p></div>
                </div>
                {(row.created_by_name || row.approved_by_name) ? <p className="mt-2 text-[10px] text-[var(--text-muted)]">{row.created_by_name ? `Dicatat ${row.created_by_name}` : ""}{row.approved_by_name ? ` · Disetujui ${row.approved_by_name}` : ""}</p> : null}
              </div>)}
            </div>
            <PaginationControls page={cashLedgerPager.page} totalPages={cashLedgerPager.totalPages} onPrev={cashLedgerPager.prev} onNext={cashLedgerPager.next} />
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">Menampilkan maksimal 10 transaksi per halaman. Mutasi berstatus APPROVED saja yang dihitung.</p>
          </Card>
        ) : null}

        {settingMode && isAdminJimpitan ? (
          <Card
            title="Pengaturan Warga Jimpitan"
            subtitle="Atur warga yang wajib ikut jimpitan bulanan. Donatur dikelola pada bagian terpisah."
            headerRight={
              <button
                type="button"
                aria-expanded={memberSettingsExpanded}
                onClick={() => setMemberSettingsExpanded((expanded) => !expanded)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${memberSettingsExpanded ? "border-[var(--line)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-strong)]" : "border-amber-500 bg-amber-100 text-amber-950 ring-2 ring-amber-300/70 hover:bg-amber-200 focus-visible:ring-amber-500"}`}
              >
                {memberSettingsExpanded ? "Tutup" : "Tampilkan"}
                <span aria-hidden="true">{memberSettingsExpanded ? "▲" : "▼"}</span>
              </button>
            }
          >
            {memberSettingsExpanded ? (
              <>
            <MembershipStatusFilter
              value={memberFilter === "ACTIVE" ? "aktif" : "nonaktif"}
              activeCount={
                members.filter((member) => member.status === "ACTIVE").length
              }
              inactiveCount={
                members.filter((member) => member.status === "INACTIVE").length
              }
              onChange={(filter) =>
                setMemberFilter(filter === "aktif" ? "ACTIVE" : "INACTIVE")
              }
            />
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Nama
                    </th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Status
                    </th>
                    <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={3}
                        className="px-3 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Tidak ada peserta pada status ini.
                      </td>
                    </tr>
                  ) : (
                    memberPager.pagedItems.map((member) => (
                      <tr key={member.warga_id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                          {member.nama}
                          {member.no_hp ? (
                            <span className="block text-xs font-normal text-[var(--text-muted)]">
                              {member.no_hp}
                            </span>
                          ) : null}
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm">
                          <span
                            className={`text-sm font-bold ${
                              member.status === "ACTIVE"
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {member.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700"
                              onClick={() =>
                                void updateMemberStatus(member, "ACTIVE")
                              }
                            >
                              Aktif
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700"
                              onClick={() =>
                                void updateMemberStatus(member, "INACTIVE")
                              }
                            >
                              Nonaktif
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={memberPager.page}
              totalPages={memberPager.totalPages}
              onPrev={memberPager.prev}
              onNext={memberPager.next}
            />
              </>
            ) : null}
          </Card>
        ) : null}

        {settingMode && isAdminJimpitan ? (
          <Card
            title="Input Jimpitan V2"
            subtitle="Untuk mode setoran total shift. Input admin langsung APPROVED karena uang sudah di tangan admin."
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Pemasukan Harian V2
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Untuk bulan berjalan agar bisa masuk rekap harian dan Kirim
                  Rekap Bulanan WA.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <Input
                    label="Tanggal"
                    type="date"
                    value={v2Date}
                    onChange={(event) => setV2Date(event.target.value)}
                  />
                  <Input
                    label="Nominal"
                    inputMode="numeric"
                    value={formatRupiahInput(v2Amount)}
                    onChange={(event) => setV2Amount(event.target.value)}
                    placeholder="Contoh: 150.000"
                  />
                  <Input
                    label="Catatan"
                    value={v2Note}
                    onChange={(event) => {
                      setV2NoteEdited(true);
                      setV2Note(event.target.value);
                    }}
                    placeholder={buildDefaultJimpitanDailyNote(v2Date)}
                  />
                  <Button
                    className="w-full"
                    onClick={handleInputV2Income}
                    disabled={v2Loading}
                  >
                    {v2Loading ? "Menyimpan..." : "Simpan Pemasukan Harian"}
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Pemasukan Bulanan V2
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Untuk rekap bulan lampau, misalnya Januari sampai Juni 2026
                  cukup total per bulan.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <Input
                    label="Periode"
                    type="month"
                    value={v2MonthlyPeriod}
                    onChange={(event) => setV2MonthlyPeriod(event.target.value)}
                  />
                  <Input
                    label="Nominal"
                    inputMode="numeric"
                    value={formatRupiahInput(v2MonthlyAmount)}
                    onChange={(event) => setV2MonthlyAmount(event.target.value)}
                    placeholder="Contoh: 2.250.000"
                  />
                  <Input
                    label="Catatan"
                    value={v2MonthlyNote}
                    onChange={(event) => setV2MonthlyNote(event.target.value)}
                    placeholder="Opsional"
                  />
                  <Button
                    className="w-full"
                    onClick={handleInputV2MonthlyIncome}
                    disabled={v2MonthlyLoading}
                  >
                    {v2MonthlyLoading ? "Menyimpan..." : "Simpan Rekap Bulanan"}
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Setoran Susulan Kas Lama
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Untuk uang dari petugas/admin lama yang baru diserahkan
                  kemudian dan baru menambah Kas Jimpitan saat diterima.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <Input
                    label="Tanggal Serah Terima"
                    type="date"
                    value={handoverDate}
                    onChange={(event) => setHandoverDate(event.target.value)}
                  />
                  <Input
                    label="Nominal"
                    inputMode="numeric"
                    value={formatRupiahInput(handoverAmount)}
                    onChange={(event) => setHandoverAmount(event.target.value)}
                    placeholder="Contoh: 1.250.000"
                  />
                  <Input
                    label="Catatan"
                    value={handoverNote}
                    onChange={(event) => setHandoverNote(event.target.value)}
                    placeholder="Contoh: setoran sisa kas admin lama Juni 2026"
                  />
                  <Button
                    className="w-full"
                    onClick={handleInputOldCashHandover}
                    disabled={handoverLoading}
                  >
                    {handoverLoading
                      ? "Menyimpan..."
                      : "Simpan Setoran Susulan"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {settingMode && isAdminJimpitan ? (
          <Card
            title="Riwayat Input Jimpitan V2"
            subtitle="Pemasukan manual dan setoran susulan kas lama yang langsung masuk Kas Jimpitan"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Tanggal
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Jenis
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Catatan
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Nominal
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Admin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {v2EntriesLoading ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={5}
                        className="px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Memuat riwayat V2...
                      </td>
                    </tr>
                  ) : v2Entries.length === 0 ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={5}
                        className="px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Belum ada input V2.
                      </td>
                    </tr>
                  ) : (
                    v2EntriesPager.pagedItems.map((row) => (
                      <tr
                        key={`${row.entry_type}-${row.id}`}
                        className="bg-[var(--surface)]"
                      >
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {String(row.entry_date || "").slice(0, 10)}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                          {row.entry_type === "OLD_CASH_HANDOVER"
                            ? "Setoran Susulan"
                            : row.entry_type === "MONTHLY_INCOME"
                              ? "Pemasukan Bulanan"
                              : "Pemasukan Harian"}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-muted)]">
                          {String(row.description || "-")
                            .replace("[ADMIN_INPUT]", "")
                            .replace("[ADMIN_MONTHLY]", "")
                            .replace("[JIMPITAN_OLD_CASH_HANDOVER]", "")
                            .trim()}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">
                          {formatRupiah(Number(row.amount || 0))}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {row.created_by_name || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationControls
                page={v2EntriesPager.page}
                totalPages={v2EntriesPager.totalPages}
                onPrev={v2EntriesPager.prev}
                onNext={v2EntriesPager.next}
              />
            </div>
          </Card>
        ) : null}

        {!settingMode ? (
          <Card
            title="Top Up Saldo Warga"
            subtitle="Pilih periode agar saldo masuk ke bulan yang benar"
            headerRight={
              <PeriodPickerCompact
                label="Periode"
                value={topupPeriod}
                onChange={setTopupPeriod}
              />
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm font-semibold">
                <span>Pilih Warga</span>
                <select
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                  value={topupWargaId}
                  onChange={(event) => setTopupWargaId(event.target.value)}
                >
                  {wargaOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.nama}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Nominal"
                type="text"
                inputMode="numeric"
                value={formatRupiahInput(topupNominal)}
                onChange={(event) => setTopupNominal(event.target.value)}
                placeholder="Contoh: 50.000"
              />
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handleTopup}
                  disabled={topupLoading}
                >
                  {topupLoading ? "Menyimpan..." : "Simpan Top Up"}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {!settingMode ? (
          <Card
            title="Riwayat Top Up Saldo"
            subtitle={`Top up periode ${topupPeriod}`}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Tanggal Input
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Warga
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Nominal
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Admin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topupHistoryLoading ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Memuat riwayat top up...
                      </td>
                    </tr>
                  ) : topupHistory.length === 0 ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Belum ada top up pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    topupHistoryPager.pagedItems.map((row) => (
                      <tr key={row.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {formatTanggalIndonesia(row.created_at)}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                          {row.nama}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">
                          {formatRupiah(Number(row.nominal || 0))}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {row.admin_name || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationControls
                page={topupHistoryPager.page}
                totalPages={topupHistoryPager.totalPages}
                onPrev={topupHistoryPager.prev}
                onNext={topupHistoryPager.next}
              />
            </div>
          </Card>
        ) : null}

        {!settingMode ? (
          <Card
            title="Setor Kas ke Bendahara"
            subtitle="Ajukan serah-terima kas jimpitan. Bendahara akan approve saat uang fisik diterima."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                label="Periode Rekap (YYYY-MM)"
                value={setorPeriod}
                onChange={(event) => setSetorPeriod(event.target.value)}
                placeholder="Contoh: 2026-03"
              />
              <div className="flex items-end md:col-span-2">
                <Button
                  className="w-full md:w-auto"
                  onClick={handleAjukanSetorBendahara}
                  disabled={setorLoading}
                >
                  {setorLoading ? "Mengajukan..." : "Ajukan Setor ke Bendahara"}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {settingMode && isAdminJimpitan ? (
          <Card
            title="Donatur Jimpitan"
            subtitle="Kelola donatur non-warga yang ikut daftar input jimpitan harian"
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                label="Nama Donatur"
                value={donaturNama}
                onChange={(event) => setDonaturNama(event.target.value)}
              />
              <Input
                label="No HP"
                value={donaturNoHp}
                onChange={(event) => setDonaturNoHp(event.target.value)}
              />
              <Input
                label="Keterangan"
                value={donaturKeterangan}
                onChange={(event) => setDonaturKeterangan(event.target.value)}
              />
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handleAddDonatur}
                  disabled={savingDonatur}
                >
                  {savingDonatur ? "Menyimpan..." : "Tambah Donatur"}
                </Button>
              </div>
            </div>
            {externalParticipants.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        Nama
                      </th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        Status
                      </th>
                      <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {externalParticipants.map((item) => (
                      <tr key={item.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                          {item.nama}
                          {item.no_hp ? (
                            <span className="block text-xs font-normal text-[var(--text-muted)]">
                              {item.no_hp}
                            </span>
                          ) : null}
                          {item.keterangan ? (
                            <span className="block text-xs font-normal text-[var(--text-muted)]">
                              {item.keterangan}
                            </span>
                          ) : null}
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-sm">
                          <span
                            className={`text-sm font-bold ${item.is_active ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {item.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void toggleDonaturStatus(item)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                              item.is_active
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {item.is_active ? "Nonaktif" : "Aktifkan"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Belum ada donatur jimpitan.
              </p>
            )}
          </Card>
        ) : null}

        {!settingMode ? (
          <Card
            title="Riwayat Setor ke Bendahara"
            subtitle="Jejak pengajuan setor kas jimpitan oleh Admin Jimpitan"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                <thead>
                  <tr className="bg-[var(--surface-strong)]">
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Waktu Ajukan
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Tujuan
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Nominal
                    </th>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {setorHistoryLoading ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Memuat riwayat setor...
                      </td>
                    </tr>
                  ) : setorHistory.length === 0 ? (
                    <tr className="bg-[var(--surface)]">
                      <td
                        colSpan={4}
                        className="px-4 py-3 text-sm text-[var(--text-muted)]"
                      >
                        Belum ada riwayat setor.
                      </td>
                    </tr>
                  ) : (
                    setorHistoryPager.pagedItems.map((row) => (
                      <tr key={row.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {formatTanggalIndonesia(row.created_at)}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {row.target_wallet_name || "-"}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">
                          {formatRupiah(Number(row.amount || 0))}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                          {row.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <PaginationControls
                page={setorHistoryPager.page}
                totalPages={setorHistoryPager.totalPages}
                onPrev={setorHistoryPager.prev}
                onNext={setorHistoryPager.next}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
