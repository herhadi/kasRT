'use client';

import {
  MIGRATION_MONTH_KEYS_FOR_YEAR,
  MIGRATION_MONTH_LABELS_FOR_YEAR,
  type MigrationMonthState
} from '@/lib/migration2025';
import { formatRupiah, formatRupiahInput } from '@/lib/helpers';
import { parseMigrationAmountInput } from '@/lib/migration2025';

type Props = {
  state: MigrationMonthState;
  onChange: (next: MigrationMonthState) => void;
  allowNegative?: boolean;
  disabled?: boolean;
  defaultAmountByMonth?: Record<string, number>;
  year?: number;
};

export default function MigrationMonthAmountGrid({
  state,
  onChange,
  allowNegative = false,
  disabled = false,
  defaultAmountByMonth = {},
  year = 2025
}: Props) {
  function patchMonth(month: string, patch: Partial<MigrationMonthState[string]>) {
    onChange({
      ...state,
      [month]: { ...state[month], ...patch }
    });
  }

  const totalActive = MIGRATION_MONTH_KEYS_FOR_YEAR(year).reduce((sum, month) => {
    const entry = state[month];
    if (!entry?.active) return sum;
    return sum + parseMigrationAmountInput(entry.amount);
  }, 0);

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
                Nominal
              </th>
            </tr>
          </thead>
          <tbody>
            {MIGRATION_MONTH_KEYS_FOR_YEAR(year).map((month) => {
              const entry = state[month];
              const active = Boolean(entry?.active);
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
                        const defaultAmount = defaultAmountByMonth[month];
                        patchMonth(month, {
                          active: checked,
                          amount: checked
                            ? entry?.amount || (defaultAmount ? String(defaultAmount) : '')
                            : entry?.amount || ''
                        });
                      }}
                    />
                  </td>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
                    {MIGRATION_MONTH_LABELS_FOR_YEAR(year)[month] || month}
                    <span className="ml-1 text-[10px] text-[var(--text-muted)]">({month})</span>
                    {defaultAmountByMonth[month] ? (
                      <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                        Tarif: {formatRupiah(defaultAmountByMonth[month])}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={disabled || !active}
                      placeholder={allowNegative ? 'Boleh negatif' : '0'}
                      className="w-full min-w-[120px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      value={
                        active
                          ? allowNegative && String(entry?.amount || '').startsWith('-')
                            ? `-${formatRupiahInput(String(entry?.amount).slice(1))}`
                            : formatRupiahInput(entry?.amount || '')
                          : ''
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (allowNegative && raw.startsWith('-')) {
                          const digits = raw.slice(1).replace(/\D+/g, '');
                          patchMonth(month, { amount: digits ? `-${digits}` : '-' });
                          return;
                        }
                        patchMonth(month, { amount: String(parseMigrationAmountInput(raw)) });
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Total bulan aktif: <span className="font-semibold text-[var(--text-primary)]">{formatRupiah(totalActive)}</span>
        {allowNegative ? (
          <span className="ml-1">— nominal negatif untuk penyesuaian/koreksi.</span>
        ) : null}
      </p>
    </div>
  );
}
