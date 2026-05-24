'use client';

import {
  MIGRATION_MONTH_KEYS_FOR_YEAR,
  MIGRATION_MONTH_LABELS_FOR_YEAR,
  parseMigrationAmountInput,
  type MigrationIuranMonthState
} from '@/lib/migration2025';
import { formatRupiah, formatRupiahInput } from '@/lib/helpers';

type Props = {
  state: MigrationIuranMonthState;
  onChange: (next: MigrationIuranMonthState) => void;
  defaultTargetByMonth: Record<string, number>;
  disabled?: boolean;
  year?: number;
};

export default function MigrationIuranMonthGrid({
  state,
  onChange,
  defaultTargetByMonth,
  disabled = false
  , year = 2025
}: Props) {
  function patchMonth(month: string, patch: Partial<MigrationIuranMonthState[string]>) {
    onChange({ ...state, [month]: { ...state[month], ...patch } });
  }

  const totalTarget = MIGRATION_MONTH_KEYS_FOR_YEAR(year).reduce((sum, month) => {
    const entry = state[month];
    if (!entry?.active) return sum;
    return sum + parseMigrationAmountInput(entry.target);
  }, 0);

  const totalPaid = MIGRATION_MONTH_KEYS_FOR_YEAR(year).reduce((sum, month) => {
    const entry = state[month];
    if (!entry?.active) return sum;
    return sum + parseMigrationAmountInput(entry.paid);
  }, 0);

  const tunggakan = Math.max(totalTarget - totalPaid, 0);

  return (
    <div className="space-y-2">
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
                Target
              </th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">
                Dibayar
              </th>
            </tr>
          </thead>
          <tbody>
            {MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => {
              const entry = state[month];
              const active = Boolean(entry?.active);
              const defaultTarget = defaultTargetByMonth[month];
              return (
                <tr key={month} className="bg-[var(--surface)]">
                  <td className="border-b border-[var(--line)] px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--line)]"
                      checked={active}
                      disabled={disabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        patchMonth(month, {
                          active: checked,
                          target: checked
                            ? entry?.target || (defaultTarget ? String(defaultTarget) : '')
                            : entry?.target || '',
                          paid: checked ? entry?.paid || '' : entry?.paid || ''
                        });
                      }}
                    />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
                    {MIGRATION_MONTH_LABELS_FOR_YEAR(year)[month]}
                    {defaultTarget ? (
                      <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                        Tarif: {formatRupiah(defaultTarget)}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={disabled || !active}
                      className="w-full min-w-[100px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm disabled:opacity-50"
                      value={active ? formatRupiahInput(entry?.target || '') : ''}
                      onChange={(e) =>
                        patchMonth(month, { target: String(parseMigrationAmountInput(e.target.value)) })
                      }
                    />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={disabled || !active}
                      className="w-full min-w-[100px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm disabled:opacity-50"
                      value={active ? formatRupiahInput(entry?.paid || '') : ''}
                      onChange={(e) =>
                        patchMonth(month, { paid: String(parseMigrationAmountInput(e.target.value)) })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
          <p className="text-[var(--text-muted)]">Total target</p>
          <p className="font-semibold text-[var(--text-primary)]">{formatRupiah(totalTarget)}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
          <p className="text-[var(--text-muted)]">Total dibayar</p>
          <p className="font-semibold text-emerald-700">{formatRupiah(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
          <p className="text-[var(--text-muted)]">Tunggakan preview</p>
          <p className="font-semibold text-rose-600">{formatRupiah(tunggakan)}</p>
        </div>
      </div>
    </div>
  );
}
