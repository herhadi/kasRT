'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import {
  buildMigrationAmountRows,
  emptyMigrationMonthState,
  migrationMonthStateFromApi,
  MODULE_HAS_TARIFF_DEFAULTS,
  isMemberOnlyMigrationModule,
  MIGRATION_MONTH_KEYS_FOR_YEAR,
  parseMigrationAmountInput,
  tariffMapFromApi,
  type FormAmountMigrationModule,
  type MigrationMonthState
} from '@/lib/migration2025';
import MigrationMonthAmountGrid from '@/components/migration/MigrationMonthAmountGrid';

type WargaOption = { id: string; nama: string; no_hp?: string };

type Props = {
  moduleKey: FormAmountMigrationModule;
  year?: number;
  wargaOptions: WargaOption[];
  selectedWargaId: string;
  onWargaChange: (wargaId: string) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const MODULE_META: Record<
  FormAmountMigrationModule,
  {
    label: string;
    allowNegative: boolean;
    fillUniformAmount?: number;
    fillUniformLabel?: string;
    fillFromTariffLabel?: string;
  }
> = {
  'tabungan-2025': { label: 'Tabungan', allowNegative: true },
  'jimpitan-2025': {
    label: 'Jimpitan',
    allowNegative: false,
    fillFromTariffLabel: 'Isi tarif jimpitan (Rp 15.000) semua bulan'
  },
  'internet-2025': {
    label: 'Internet',
    allowNegative: false,
    fillFromTariffLabel: 'Isi sesuai tarif internet semua bulan'
  },
  'lingkungan-2025': {
    label: 'Lingkungan',
    allowNegative: false,
    fillFromTariffLabel: 'Isi sesuai tarif lingkungan semua bulan'
  },
  'koperasi-iuran-2025': {
    label: 'Koperasi Iuran',
    allowNegative: false
  }
};

export default function MigrationWargaAmountForm({
  year = 2025,
  moduleKey,
  wargaOptions,
  selectedWargaId,
  onWargaChange,
  busy,
  onBusyChange,
  onSaved,
  onError,
  onSuccess
}: Props) {
  const meta = MODULE_META[moduleKey];
  const memberOnly = isMemberOnlyMigrationModule(moduleKey);
  const moduleWithYear = moduleKey.replace('-2025', `-${year}`);
  const [wargaList, setWargaList] = useState<WargaOption[]>(wargaOptions);
  const [monthState, setMonthState] = useState<MigrationMonthState>(emptyMigrationMonthState);
  const [defaultAmountByMonth, setDefaultAmountByMonth] = useState<Record<string, number>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadMemberWarga = useCallback(async () => {
    if (!memberOnly) return;
    try {
      setLoadingMembers(true);
      const res = await apiFetch<{
        success: boolean;
        data: Array<WargaOption & { warga_id?: string }>;
      }>(`/migration/${moduleWithYear}/members`);
      const rows = (res.data || []).map((w) => ({
        id: String(w.id || w.warga_id || ''),
        nama: String(w.nama || ''),
        no_hp: w.no_hp
      }));
      setWargaList(rows);
    } catch (e) {
      setWargaList([]);
      onError(e instanceof Error ? e.message : 'Gagal memuat member aktif');
    } finally {
      setLoadingMembers(false);
    }
  }, [memberOnly, moduleKey, onError]);

  useEffect(() => {
    if (!memberOnly) {
      setWargaList(wargaOptions);
      return;
    }
    void loadMemberWarga();
  }, [memberOnly, moduleKey, wargaOptions, loadMemberWarga]);

  useEffect(() => {
    if (!memberOnly || loadingMembers) return;
    if (selectedWargaId && wargaList.some((r) => String(r.id) === String(selectedWargaId))) return;
    onWargaChange(String(wargaList[0]?.id || ''));
  }, [memberOnly, loadingMembers, wargaList, selectedWargaId, onWargaChange]);

  const loadTariffs = useCallback(async () => {
    if (!MODULE_HAS_TARIFF_DEFAULTS[moduleKey]) {
      setDefaultAmountByMonth({});
      return;
    }
    try {
      const res = await apiFetch<{
        success: boolean;
        data: { months: Array<{ month: string; amount: number }> };
      }>(`/migration/${moduleWithYear}/tariffs`);
      setDefaultAmountByMonth(tariffMapFromApi(res.data?.months || []));
    } catch {
      setDefaultAmountByMonth({});
    }
  }, [moduleKey]);

  const loadWargaDetail = useCallback(async () => {
    if (!selectedWargaId) {
      setMonthState(emptyMigrationMonthState(year));
      return;
    }
    try {
      setLoadingDetail(true);
      const res = await apiFetch<{
        success: boolean;
        data: { warga_id: string; months: Array<{ month: string; amount: number }> };
      }>(`/migration/${moduleWithYear}/warga?warga_id=${encodeURIComponent(selectedWargaId)}`);
      setMonthState(migrationMonthStateFromApi(res.data?.months || [], year));
    } catch (e) {
      setMonthState(emptyMigrationMonthState(year));
      onError(e instanceof Error ? e.message : 'Gagal memuat data warga');
    } finally {
      setLoadingDetail(false);
    }
  }, [moduleKey, selectedWargaId, onError]);

  useEffect(() => {
    void loadTariffs();
  }, [loadTariffs]);

  useEffect(() => {
    void loadWargaDetail();
  }, [loadWargaDetail]);

  const wargaIndex = wargaList.findIndex((w) => String(w.id) === String(selectedWargaId));

  function goWarga(delta: number) {
    if (!wargaList.length) return;
    const next = wargaIndex < 0 ? 0 : (wargaIndex + delta + wargaList.length) % wargaList.length;
    onWargaChange(String(wargaList[next]?.id || ''));
  }

  function fillFromTariff() {
    const next = emptyMigrationMonthState(year);
    for (const month of MIGRATION_MONTH_KEYS_FOR_YEAR(year)) {
      const amount = defaultAmountByMonth[month] ?? meta.fillUniformAmount;
      if (!amount) continue;
      next[month] = { active: true, amount: String(amount) };
    }
    setMonthState(next);
  }

  async function saveForm() {
    if (!selectedWargaId) {
      onError('Pilih warga terlebih dahulu');
      return;
    }
    const rows = buildMigrationAmountRows(selectedWargaId, monthState);
    const rowsWithYear = buildMigrationAmountRows(selectedWargaId, monthState, year);
    const hasActive = rowsWithYear.some((r) => {
      const entry = monthState[r.month];
      return entry?.active && Number.isFinite(parseMigrationAmountInput(entry.amount));
    });
    if (!hasActive) {
      onError('Centang minimal satu bulan dengan nominal');
      return;
    }
    for (const row of rows) {
      const entry = monthState[row.month];
      if (!entry?.active) continue;
      const amount = parseMigrationAmountInput(entry.amount);
      if (!Number.isFinite(amount)) {
        onError(`Nominal ${row.month} tidak valid`);
        return;
      }
      if (!meta.allowNegative && amount < 0) {
        onError(`Nominal ${row.month} tidak boleh negatif`);
        return;
      }
    }

    try {
      onBusyChange(true);
      await apiFetch(`/migration/${moduleKey.replace('-2025', `-${year}`)}`, {
        method: 'POST',
        body: JSON.stringify({ rows })
      });
      onSuccess(`Data ${meta.label} untuk warga ini berhasil disimpan.`);
      await onSaved();
      await loadWargaDetail();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Gagal simpan migrasi');
    } finally {
      onBusyChange(false);
    }
  }

  const showTariffFill = Boolean(meta.fillFromTariffLabel && Object.keys(defaultAmountByMonth).length);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <label className="space-y-1 text-xs font-semibold text-[var(--text-muted)]">
          <span>Pilih Warga</span>
          <select
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
            value={selectedWargaId}
            onChange={(e) => onWargaChange(e.target.value)}
            disabled={busy || loadingDetail || loadingMembers}
          >
            {wargaList.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.nama}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            className="btn-action-blue w-full whitespace-nowrap"
            onClick={() => goWarga(-1)}
            disabled={busy || loadingDetail || loadingMembers || wargaList.length < 2}
          >
            ← Sebelumnya
          </Button>
          <Button
            variant="ghost"
            className="btn-action-blue w-full whitespace-nowrap"
            onClick={() => goWarga(1)}
            disabled={busy || loadingDetail || loadingMembers || wargaList.length < 2}
          >
            Berikutnya →
          </Button>
        </div>
      </div>

      {memberOnly ? (
        <p className="text-xs text-[var(--text-muted)]">
          Menampilkan <b>{wargaList.length}</b> member aktif (sama dengan daftar status Aktif di operasional).
        </p>
      ) : null}

      {showTariffFill ? (
        <Button variant="ghost" className="btn-action-blue text-xs" onClick={fillFromTariff} disabled={busy || loadingDetail || loadingMembers}>
          {meta.fillFromTariffLabel}
        </Button>
      ) : null}

      {loadingMembers || loadingDetail ? (
        <p className="text-sm text-[var(--text-muted)]">{loadingMembers ? 'Memuat member aktif...' : 'Memuat data warga...'}</p>
      ) : wargaList.length === 0 && memberOnly ? (
        <p className="text-sm text-amber-700">Belum ada member {meta.label} aktif. Aktifkan dulu di menu operasional.</p>
      ) : (
        <MigrationMonthAmountGrid
          state={monthState}
          onChange={setMonthState}
          allowNegative={meta.allowNegative}
          disabled={busy}
          defaultAmountByMonth={defaultAmountByMonth}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="btn-action-green" onClick={() => void saveForm()} disabled={busy || loadingDetail || loadingMembers || !wargaList.length}>
          {busy ? 'Menyimpan...' : 'Simpan Warga Ini'}
        </Button>
        <Button variant="ghost" className="btn-action-blue" onClick={() => void loadWargaDetail()} disabled={busy || loadingDetail}>
          Muat Ulang
        </Button>
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        Bulan tidak dicentang disimpan sebagai Rp 0. Default tarif mengikuti pengaturan sistem (effective month).
      </p>
    </div>
  );
}
