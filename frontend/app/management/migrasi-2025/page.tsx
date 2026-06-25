'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import FeedbackToast from '@/components/ui/FeedbackToast';
import MigrationFormPanel from '@/components/migration/MigrationFormPanel';
import MigrationSummaryPanel from '@/components/migration/MigrationSummaryPanel';
import MigrationTabunganClosingBalanceForm from '@/components/migration/MigrationTabunganClosingBalanceForm';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { formatRupiahInput, parseRupiahInput } from '@/lib/helpers';
import { isFormMigrationModule, isMemberOnlyMigrationModule, migrationWargaOptionsPath } from '@/lib/migration2025';
import { useAuth } from '@/lib/useAuth';

type ModuleKey =
  | 'iuran-2025'
  | 'internet-2025'
  | 'lingkungan-2025'
  | 'jimpitan-2025'
  | 'tabungan-2025'
  | 'sosial-2025'
  | 'koperasi-iuran-2025'
  | 'koperasi-loans-2025';
type WargaOption = { id: string; nama: string; no_hp?: string };

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'iuran-2025', label: 'Iuran Wajib' },
  { key: 'internet-2025', label: 'Internet' },
  { key: 'lingkungan-2025', label: 'Lingkungan' },
  { key: 'jimpitan-2025', label: 'Jimpitan' },
  { key: 'tabungan-2025', label: 'Tabungan' },
  { key: 'sosial-2025', label: 'Sosial' },
  { key: 'koperasi-iuran-2025', label: 'Koperasi Iuran' },
  { key: 'koperasi-loans-2025', label: 'Koperasi Loan' }
];

const EXAMPLES: Record<ModuleKey, string> = {
  'iuran-2025': JSON.stringify(
    [
      { warga_id: 'UUID_WARGA', month: '2025-01', target_amount: 30000, paid_amount: 30000 },
      { warga_id: 'UUID_WARGA', month: '2025-02', target_amount: 30000, paid_amount: 15000 }
    ],
    null,
    2
  ),
  'internet-2025': JSON.stringify(
    [
      { warga_id: 'UUID_WARGA', month: '2025-01', amount: 60000 },
      { warga_id: 'UUID_WARGA', month: '2025-02', amount: 60000 }
    ],
    null,
    2
  ),
  'lingkungan-2025': JSON.stringify(
    [
      { warga_id: 'UUID_WARGA', month: '2025-01', amount: 20000 },
      { warga_id: 'UUID_WARGA', month: '2025-02', amount: 20000 },
      { warga_id: 'UUID_WARGA', month: '2025-03', amount: 20000 },
      { warga_id: 'UUID_WARGA', month: '2025-04', amount: 20000 },
      { warga_id: 'UUID_WARGA', month: '2025-05', amount: 20000 },
      { warga_id: 'UUID_WARGA', month: '2025-06', amount: 20000 }
    ],
    null,
    2
  ),
  'jimpitan-2025': JSON.stringify(
    [
      { warga_id: 'UUID_WARGA', month: '2025-01', amount: 15000 },
      { warga_id: 'UUID_WARGA', month: '2025-02', amount: 10000 }
    ],
    null,
    2
  ),
  'tabungan-2025': JSON.stringify(
    [
      { warga_id: 'UUID_WARGA', closing_balance: 1250000 }
    ],
    null,
    2
  ),
  'sosial-2025': JSON.stringify(
    [
      { month: '2025-01', pemasukan: 500000, pengeluaran: 200000 },
      { month: '2025-02', pemasukan: 300000, pengeluaran: 100000 }
    ],
    null,
    2
  ),
  'koperasi-iuran-2025': JSON.stringify(
    [
      { warga_id: 'UUID_WARGA', month: '2025-01', amount: 50000 },
      { warga_id: 'UUID_WARGA', month: '2025-02', amount: 50000 }
    ],
    null,
    2
  ),
  'koperasi-loans-2025': JSON.stringify(
    [
      {
        loan_key: 'KOP-ADHIKA-001',
        warga_id: 'UUID_WARGA',
        principal_amount: 2400000,
        tenor_months: 12,
        paid_installments: 4,
        interest_model: 'FLAT',
        interest_rate_monthly: 2.0,
        first_due_month: '2025-01'
      }
    ],
    null,
    2
  )
};

export default function Migration2025Page() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const canAccess = hasAnyRole(user, ['root']);
  const [moduleKey, setModuleKey] = useState<ModuleKey>('iuran-2025');
  const [year, setYear] = useState<number>(2025);
  const [inputMode, setInputMode] = useState<'form' | 'json'>('json');
  const [summary, setSummary] = useState<unknown>(null);
  const [rowsJson, setRowsJson] = useState('[]');
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
  const [selectedWargaId, setSelectedWargaId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; kind: 'success' | 'error' | 'warning' }>>([]);
  const [openingBalance, setOpeningBalance] = useState('0');
  const moduleBase = String(moduleKey).split('-')[0];
  const supportsOpeningBalance = moduleBase === 'internet' || moduleBase === 'lingkungan';
  const cashOnlyMigrationModule = supportsOpeningBalance;

  function pushToast(text: string, kind: 'success' | 'error' | 'warning' = 'success') {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function loadSummary() {
    try {
      setError('');
      setMessage('');
      const moduleBase = String(moduleKey).split('-')[0];
      const res = await apiFetch<{ success: boolean; data: unknown }>(`/migration/${moduleBase}-${year}/summary`);
      setSummary(res.data || null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat summary migrasi';
      setError(msg);
      pushToast(msg, 'error');
    }
  }

  useEffect(() => {
    if (!canAccess) return;
    void loadSummary();
  }, [moduleKey, canAccess]);

  useEffect(() => {
    setInputMode(isFormMigrationModule(moduleKey) ? 'form' : 'json');
  }, [moduleKey]);

  useEffect(() => {
    if (!canAccess) return;
    void (async () => {
      try {
        const moduleBase = String(moduleKey).split('-')[0];
        const res = await apiFetch<{
          success: boolean;
          data: Array<WargaOption & { warga_id?: string }>;
        }>(migrationWargaOptionsPath(moduleKey, year));
        const rows = (res.data || []).map((w) => ({
          id: String(w.id || w.warga_id || ''),
          nama: String(w.nama || ''),
          no_hp: w.no_hp
        }));
        setWargaOptions(rows);
        setSelectedWargaId((prev) => {
          if (prev && rows.some((r) => String(r.id) === String(prev))) return prev;
          return String(rows[0]?.id || '');
        });
      } catch {
        setWargaOptions([]);
        setSelectedWargaId('');
      }
    })();
  }, [canAccess, moduleKey]);

  useEffect(() => {
    if (!canAccess || !supportsOpeningBalance) return;
    void (async () => {
      try {
        const result = await apiFetch<{ success: boolean; data: { amount: number } }>(`/migration/${moduleBase}-${year}/opening-balance`);
        setOpeningBalance(String(Number(result.data?.amount || 0)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Gagal memuat saldo awal';
        setError(msg);
      }
    })();
  }, [canAccess, moduleBase, supportsOpeningBalance, year]);

  async function saveRows() {
    try {
      setBusy(true);
      setError('');
      setMessage('');
      const rows = JSON.parse(rowsJson);
      if (!Array.isArray(rows)) throw new Error('Format JSON harus array');
      const moduleBase = String(moduleKey).split('-')[0];
      const endpoint = moduleKey === 'tabungan-2025'
        ? `/migration/tabungan-${year}/closing-balances`
        : `/migration/${moduleBase}-${year}`;
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ rows }) });
      setMessage('Data migrasi berhasil disimpan.');
      pushToast('Data migrasi berhasil disimpan.', 'success');
      await loadSummary();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal simpan migrasi';
      setError(msg);
      pushToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function applyOpening2026() {
    try {
      setBusy(true);
      setError('');
      setMessage('');
      // apply opening for next year based on selected year
      await apiFetch(`/migration/iuran-${year}/apply-opening-${year + 1}`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(`Opening ${year + 1} dari closing ${year} berhasil diproses.`);
      pushToast(`Opening ${year + 1} berhasil diproses.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal apply opening 2026';
      setError(msg);
      pushToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveOpeningBalance() {
    const amount = parseRupiahInput(openingBalance);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Saldo kas akhir Desember tidak valid.');
      return;
    }
    try {
      setBusy(true);
      const result = await apiFetch<{ success: boolean; data: { amount: number; opening_year: number } }>(`/migration/${moduleBase}-${year}/opening-balance`, {
        method: 'POST',
        body: JSON.stringify({ amount })
      });
      const nextYear = result.data?.opening_year || (year + 1);
      setOpeningBalance(String(Number(result.data?.amount || 0)));
      const msg = `Saldo awal kas ${nextYear} berhasil disimpan.`;
      setMessage(msg);
      pushToast(msg, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan saldo awal kas';
      setError(msg);
      pushToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  const prettySummary = useMemo(() => JSON.stringify(summary, null, 2), [summary]);
  const showFormMode = isFormMigrationModule(moduleKey);
  const activeExample = useMemo(() => {
    const chosen = selectedWargaId || 'UUID_WARGA';
    return EXAMPLES[moduleKey].replaceAll('UUID_WARGA', chosen).replaceAll('2025', String(year));
  }, [moduleKey, selectedWargaId]);

  if (loading || !user) return <main className="min-h-screen" />;

  if (!canAccess) {
    return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
        <div className="mx-auto mt-6 w-full max-w-4xl px-4 md:px-6">
          <Card title="Tidak Ada Akses" subtitle="Khusus root">
            <p className="text-sm text-[var(--text-muted)]">Menu migrasi 2025 hanya untuk root.</p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
              toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : toast.kind === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card title="Migrasi 2025" subtitle="Input data historis s.d. Desember 2025 (root only)">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="col-span-2 md:col-span-4">
              <label className="space-y-1 text-xs font-semibold text-[var(--text-muted)]">
                <span>Tahun</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value || 2025))}
                  className="w-28 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs"
                />
              </label>
            </div>
            {MODULES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setModuleKey(m.key)}
                className={
                  moduleKey === m.key
                    ? 'rounded-xl border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent)]'
                    : 'rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]'
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          {supportsOpeningBalance ? (
            <div className="mt-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
              <p className="text-sm font-bold text-[var(--text-primary)]">Saldo Kas Akhir Desember {year}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Nominal ini menjadi saldo awal kas {moduleBase === 'internet' ? 'Internet' : 'Lingkungan'} pada {year + 1}. Input iuran per warga tetap hanya untuk histori dan tunggakan.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex-1 space-y-1 text-xs font-semibold text-[var(--text-muted)]">
                  <span>Nominal saldo kas</span>
                  <input type="text" inputMode="numeric" value={formatRupiahInput(openingBalance)} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="Contoh: 1.500.000" className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]" />
                </label>
                <Button className="btn-action-blue" onClick={saveOpeningBalance} disabled={busy}>Simpan Saldo Awal {year + 1}</Button>
              </div>
            </div>
          ) : null}
          {!cashOnlyMigrationModule && showFormMode ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setInputMode('form')}
                className={
                  inputMode === 'form'
                    ? 'rounded-xl border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent)]'
                    : 'rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]'
                }
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => setInputMode('json')}
                className={
                  inputMode === 'json'
                    ? 'rounded-xl border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent)]'
                    : 'rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]'
                }
              >
                JSON (lanjutan)
              </button>
            </div>
          ) : null}
          {cashOnlyMigrationModule ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Tidak perlu input iuran atau tunggakan per warga untuk {moduleBase === 'internet' ? 'Internet' : 'Lingkungan'} pada {year}. Cukup simpan saldo kas akhir Desember di atas; tagihan mulai dihitung dari Januari {year + 1}.
            </p>
          ) : <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
              {showFormMode && inputMode === 'form' ? (
                <>
                  {moduleKey === 'tabungan-2025' ? (
                    <MigrationTabunganClosingBalanceForm
                      year={year}
                      busy={busy}
                      onBusyChange={setBusy}
                      onSaved={loadSummary}
                      onError={(msg) => {
                        setError(msg);
                        pushToast(msg, 'error');
                      }}
                      onSuccess={(msg) => {
                        setMessage(msg);
                        pushToast(msg, 'success');
                      }}
                    />
                  ) : (
                    <MigrationFormPanel
                      moduleKey={moduleKey}
                      year={year}
                      wargaOptions={wargaOptions}
                      selectedWargaId={selectedWargaId}
                      onWargaChange={setSelectedWargaId}
                      busy={busy}
                      onBusyChange={setBusy}
                      onSaved={loadSummary}
                      onError={(msg) => {
                        setError(msg);
                        pushToast(msg, 'error');
                      }}
                      onSuccess={(msg) => {
                        setMessage(msg);
                        pushToast(msg, 'success');
                      }}
                    />
                  )}
                  {moduleKey === 'iuran-2025' ? (
                    <div className="mt-3 border-t border-[var(--line)] pt-3">
                      <Button variant="ghost" className="btn-action-blue" onClick={applyOpening2026} disabled={busy}>
                        Apply Opening 2026
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="mb-2 grid gap-2 md:grid-cols-2">
                    <label className="space-y-1 text-xs font-semibold text-[var(--text-muted)]">
                      <span>Pilih Warga (contoh JSON)</span>
                      <select
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
                        value={selectedWargaId}
                        onChange={(e) => setSelectedWargaId(e.target.value)}
                      >
                        {wargaOptions.map((w) => (
                          <option key={String(w.id)} value={String(w.id)}>
                            {w.nama}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <Button variant="ghost" className="btn-action-blue w-full" onClick={() => setRowsJson(activeExample)}>
                        Isi Contoh
                      </Button>
                    </div>
                  </div>
                  <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">Rows JSON</p>
                  <textarea
                    className="min-h-[260px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
                    value={rowsJson}
                    onChange={(e) => setRowsJson(e.target.value)}
                    placeholder={activeExample}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button className="btn-action-green" onClick={saveRows} disabled={busy}>
                      {busy ? 'Menyimpan...' : 'Simpan Rows'}
                    </Button>
                    {moduleKey === 'iuran-2025' ? (
                      <Button variant="ghost" className="btn-action-blue" onClick={applyOpening2026} disabled={busy}>
                        Apply Opening 2026
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--text-muted)]">Summary</p>
                <Button variant="ghost" className="btn-action-blue" onClick={() => void loadSummary()} disabled={busy}>
                  Refresh
                </Button>
              </div>
              {showFormMode && inputMode === 'form' ? (
                <MigrationSummaryPanel
                  moduleKey={moduleKey}
                  summary={summary}
                  selectedWargaId={selectedWargaId}
                  onSelectWarga={setSelectedWargaId}
                />
              ) : (
                <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-[11px] text-[var(--text-primary)]">
                  {prettySummary || '-'}
                </pre>
              )}
            </div>
          </div>}
          {!cashOnlyMigrationModule && isMemberOnlyMigrationModule(moduleKey) ? (
            <p className="mt-3 text-xs text-amber-700">
              Modul <b>{moduleKey === 'internet-2025' ? 'Internet' : 'Lingkungan'}</b> hanya menampilkan warga yang terdaftar sebagai{' '}
              <b>member aktif</b> di pengaturan modul terkait.
            </p>
          ) : null}
          {!cashOnlyMigrationModule ? <p className="mt-3 text-xs text-[var(--text-muted)]">
            Catatan: bulan wajib format `2025-01` s.d. `2025-12`. Untuk tabungan cukup isi saldo akhir Desember per warga.
            Untuk iuran/internet/lingkungan/koperasi gunakan field `amount`.
            Untuk sosial gunakan `pemasukan` + `pengeluaran`. Untuk iuran wajib gunakan `target_amount` + `paid_amount`.
            Untuk koperasi loan gunakan: `loan_key`, `warga_id`, `principal_amount`, `tenor_months`, `paid_installments`, `interest_model`, `interest_rate_monthly`, `first_due_month`.
          </p> : null}
        </Card>
        <Card title="Langkah Penggunaan" subtitle="Panduan cepat migrasi data manual ke KasRT">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-primary)]">
            <li>Pilih modul migrasi yang ingin diinput.</li>
            <li>
              Internet dan Lingkungan hanya membutuhkan saldo kas akhir Desember. Tabungan memakai form saldo akhir Desember per warga/by name. Modul lain selain Koperasi Loan memakai tab <b>Form</b> (grid 12 bulan).
            </li>
            <li>Untuk Internet/Lingkungan, isi saldo kas Desember lalu klik <b>Simpan Saldo Awal</b>. Untuk Tabungan, isi saldo akhir by name. Untuk modul lain, isi form per warga atau rows JSON.</li>
            <li>Klik <b>Refresh</b> untuk cek ringkasan hasil import.</li>
            <li>Ulangi untuk semua modul sampai data Desember 2025 lengkap.</li>
            <li>Khusus modul <b>Iuran Wajib</b>, klik <b>Apply Opening 2026</b> setelah data final.</li>
          </ol>
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--text-muted)]">
            Format wajib: month = 2025-01 s.d. 2025-12, warga_id harus UUID valid, nominal tidak boleh negatif.
          </div>
          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">Contoh JSON untuk modul aktif ({moduleKey})</p>
            <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-[11px] text-[var(--text-primary)]">
              {activeExample}
            </pre>
          </div>
        </Card>
      </div>
    </main>
  );
}
