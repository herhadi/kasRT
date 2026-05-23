'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import {
  buildMigrationIuranRows,
  emptyMigrationIuranMonthState,
  migrationIuranMonthStateFromApi,
  MIGRATION_MONTH_KEYS_2025,
  parseMigrationAmountInput,
  tariffMapFromApi
} from '@/lib/migration2025';
import MigrationIuranMonthGrid from '@/components/migration/MigrationIuranMonthGrid';

type WargaOption = { id: string; nama: string; no_hp?: string };

type Props = {
  wargaOptions: WargaOption[];
  selectedWargaId: string;
  onWargaChange: (wargaId: string) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export default function MigrationIuranWargaForm({
  wargaOptions,
  selectedWargaId,
  onWargaChange,
  busy,
  onBusyChange,
  onSaved,
  onError,
  onSuccess
}: Props) {
  const [monthState, setMonthState] = useState(emptyMigrationIuranMonthState);
  const [defaultTargetByMonth, setDefaultTargetByMonth] = useState<Record<string, number>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadTariffs = useCallback(async () => {
    try {
      const res = await apiFetch<{
        success: boolean;
        data: { months: Array<{ month: string; amount: number }> };
      }>('/migration/iuran-2025/tariffs');
      setDefaultTargetByMonth(tariffMapFromApi(res.data?.months || []));
    } catch {
      setDefaultTargetByMonth({});
    }
  }, []);

  const loadWargaDetail = useCallback(async () => {
    if (!selectedWargaId) {
      setMonthState(emptyMigrationIuranMonthState());
      return;
    }
    try {
      setLoadingDetail(true);
      const res = await apiFetch<{
        success: boolean;
        data: {
          months: Array<{
            month: string;
            target_amount: number;
            paid_amount: number;
            has_saved?: boolean;
          }>;
        };
      }>(`/migration/iuran-2025/warga?warga_id=${encodeURIComponent(selectedWargaId)}`);
      setMonthState(migrationIuranMonthStateFromApi(res.data?.months || []));
    } catch (e) {
      setMonthState(emptyMigrationIuranMonthState());
      onError(e instanceof Error ? e.message : 'Gagal memuat data warga');
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedWargaId, onError]);

  useEffect(() => {
    void loadTariffs();
  }, [loadTariffs]);

  useEffect(() => {
    void loadWargaDetail();
  }, [loadWargaDetail]);

  const wargaIndex = wargaOptions.findIndex((w) => String(w.id) === String(selectedWargaId));

  function goWarga(delta: number) {
    if (!wargaOptions.length) return;
    const next = wargaIndex < 0 ? 0 : (wargaIndex + delta + wargaOptions.length) % wargaOptions.length;
    onWargaChange(String(wargaOptions[next]?.id || ''));
  }

  function fillTargetFromTariff() {
    const next = emptyMigrationIuranMonthState();
    for (const month of MIGRATION_MONTH_KEYS_2025) {
      const target = defaultTargetByMonth[month];
      if (!target) continue;
      next[month] = { active: true, target: String(target), paid: '' };
    }
    setMonthState(next);
  }

  async function saveForm() {
    if (!selectedWargaId) {
      onError('Pilih warga terlebih dahulu');
      return;
    }
    const hasActive = MIGRATION_MONTH_KEYS_2025.some((month) => monthState[month]?.active);
    if (!hasActive) {
      onError('Centang minimal satu bulan');
      return;
    }
    for (const month of MIGRATION_MONTH_KEYS_2025) {
      const entry = monthState[month];
      if (!entry?.active) continue;
      const target = parseMigrationAmountInput(entry.target);
      const paid = parseMigrationAmountInput(entry.paid);
      if (!Number.isFinite(target) || target < 0 || !Number.isFinite(paid) || paid < 0) {
        onError(`Nominal ${month} tidak valid`);
        return;
      }
    }

    try {
      onBusyChange(true);
      const rows = buildMigrationIuranRows(selectedWargaId, monthState);
      await apiFetch('/migration/iuran-2025', {
        method: 'POST',
        body: JSON.stringify({ rows })
      });
      onSuccess('Data iuran wajib untuk warga ini berhasil disimpan.');
      await onSaved();
      await loadWargaDetail();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Gagal simpan migrasi');
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <label className="space-y-1 text-xs font-semibold text-[var(--text-muted)]">
          <span>Pilih Warga</span>
          <select
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-xs text-[var(--text-primary)]"
            value={selectedWargaId}
            onChange={(e) => onWargaChange(e.target.value)}
            disabled={busy || loadingDetail}
          >
            {wargaOptions.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.nama} ({w.no_hp || '-'})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            className="btn-action-blue w-full whitespace-nowrap"
            onClick={() => goWarga(-1)}
            disabled={busy || loadingDetail || wargaOptions.length < 2}
          >
            ← Sebelumnya
          </Button>
          <Button
            variant="ghost"
            className="btn-action-blue w-full whitespace-nowrap"
            onClick={() => goWarga(1)}
            disabled={busy || loadingDetail || wargaOptions.length < 2}
          >
            Berikutnya →
          </Button>
        </div>
      </div>

      <Button
        variant="ghost"
        className="btn-action-blue text-xs"
        onClick={fillTargetFromTariff}
        disabled={busy || loadingDetail || !Object.keys(defaultTargetByMonth).length}
      >
        Isi target sesuai tarif iuran semua bulan
      </Button>

      {loadingDetail ? (
        <p className="text-sm text-[var(--text-muted)]">Memuat data warga...</p>
      ) : (
        <MigrationIuranMonthGrid
          state={monthState}
          onChange={setMonthState}
          defaultTargetByMonth={defaultTargetByMonth}
          disabled={busy}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="btn-action-green" onClick={() => void saveForm()} disabled={busy || loadingDetail}>
          {busy ? 'Menyimpan...' : 'Simpan Warga Ini'}
        </Button>
        <Button variant="ghost" className="btn-action-blue" onClick={() => void loadWargaDetail()} disabled={busy || loadingDetail}>
          Muat Ulang
        </Button>
      </div>
    </div>
  );
}
