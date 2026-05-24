'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import {
  buildMigrationSosialRows,
  emptyMigrationSosialMonthState,
  migrationSosialMonthStateFromApi,
  MIGRATION_MONTH_KEYS_FOR_YEAR,
  MIGRATION_MONTH_LABELS_FOR_YEAR,
  parseMigrationAmountInput,
  type MigrationSosialMonthState
} from '@/lib/migration2025';
import { formatRupiah, formatRupiahInput } from '@/lib/helpers';

type Props = {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  year?: number;
};

export default function MigrationSosialForm({ busy, onBusyChange, onSaved, onError, onSuccess, year = 2025 }: Props) {
  const [monthState, setMonthState] = useState(() => emptyMigrationSosialMonthState(year));
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      setLoadingDetail(true);
      const res = await apiFetch<{
        success: boolean;
        data: { months: Array<{ month: string; pemasukan: number; pengeluaran: number }> };
      }>(`/migration/sosial-${year}/detail`);
      setMonthState(migrationSosialMonthStateFromApi(res.data?.months || [], year));
    } catch (e) {
      setMonthState(emptyMigrationSosialMonthState(year));
      onError(e instanceof Error ? e.message : 'Gagal memuat data sosial');
    } finally {
      setLoadingDetail(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  function patchMonth(month: string, patch: Partial<MigrationSosialMonthState[string]>) {
    setMonthState((prev) => ({ ...prev, [month]: { ...prev[month], ...patch } }));
  }

  const saldoTotal = MIGRATION_MONTH_KEYS_FOR_YEAR(year).reduce((sum, month) => {
    const entry = monthState[month];
    if (!entry?.active) return sum;
    return (
      sum + parseMigrationAmountInput(entry.pemasukan) - parseMigrationAmountInput(entry.pengeluaran)
    );
  }, 0);

  async function saveForm() {
    const hasActive = MIGRATION_MONTH_KEYS_FOR_YEAR(year).some((month) => monthState[month]?.active);
    if (!hasActive) {
      onError('Centang minimal satu bulan');
      return;
    }

    try {
      onBusyChange(true);
      const rows = buildMigrationSosialRows(monthState, year);
      await apiFetch(`/migration/sosial-${year}`, {
        method: 'POST',
        body: JSON.stringify({ rows })
      });
      onSuccess(`Data sosial ${year} berhasil disimpan.`);
      await onSaved();
      await loadDetail();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Gagal simpan migrasi');
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-3">
      {loadingDetail ? (
        <p className="text-sm text-[var(--text-muted)]">Memuat data...</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-[var(--surface-strong)]">
                <th className="w-10 border-b border-[var(--line)] px-2 py-2 text-center text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Aktif
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Bulan
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Pemasukan
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Pengeluaran
                </th>
              </tr>
            </thead>
            <tbody>
              {MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => {
                const entry = monthState[month];
                const active = Boolean(entry?.active);
                return (
                  <tr key={month} className="bg-[var(--surface)]">
                    <td className="border-b border-[var(--line)] px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={active}
                        disabled={busy}
                        onChange={(e) => patchMonth(month, { active: e.target.checked })}
                      />
                    </td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm">
                      {MIGRATION_MONTH_LABELS_FOR_YEAR(year)[month]}
                    </td>
                    <td className="border-b border-[var(--line)] px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!active || busy}
                        className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-50"
                        value={active ? formatRupiahInput(entry?.pemasukan || '') : ''}
                        onChange={(e) =>
                          patchMonth(month, { pemasukan: String(parseMigrationAmountInput(e.target.value)) })
                        }
                      />
                    </td>
                    <td className="border-b border-[var(--line)] px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!active || busy}
                        className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-50"
                        value={active ? formatRupiahInput(entry?.pengeluaran || '') : ''}
                        onChange={(e) =>
                          patchMonth(month, { pengeluaran: String(parseMigrationAmountInput(e.target.value)) })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Saldo akhir preview: <span className="font-semibold text-[var(--text-primary)]">{formatRupiah(saldoTotal)}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        <Button className="btn-action-green" onClick={() => void saveForm()} disabled={busy || loadingDetail}>
          {busy ? 'Menyimpan...' : 'Simpan Sosial 2025'}
        </Button>
        <Button variant="ghost" className="btn-action-blue" onClick={() => void loadDetail()} disabled={busy || loadingDetail}>
          Muat Ulang
        </Button>
      </div>
    </div>
  );
}
