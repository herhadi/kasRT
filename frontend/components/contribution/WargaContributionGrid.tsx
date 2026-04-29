'use client';

import Button from '@/components/ui/Button';
import { formatRupiah } from '@/lib/helpers';

export type WargaContributionRow = {
  id: string;
  nama: string;
  paidAmount: number;
  targetAmount: number;
  suggestionText?: string;
  canInput?: boolean;
};

export default function WargaContributionGrid({
  rows,
  onInput
}: {
  rows: WargaContributionRow[];
  onInput: (row: WargaContributionRow) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {rows.map((row) => {
        const done = row.paidAmount >= row.targetAmount;
        const canInput = row.canInput ?? true;
        return (
          <article
            key={row.id}
            className={
              done
                ? 'rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4'
                : 'rounded-2xl border border-red-200 bg-red-50/70 p-4'
            }
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">{row.nama}</p>
            <p className={done ? 'mt-1 text-xs text-emerald-700' : 'mt-1 text-xs text-red-700'}>
              {done ? 'Sudah bayar' : 'Belum lunas'} • {formatRupiah(row.paidAmount)}
            </p>
            {row.suggestionText ? (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{row.suggestionText}</p>
            ) : null}
            <Button
              variant="ghost"
              className="mt-3 w-full"
              onClick={() => onInput(row)}
              disabled={!canInput}
            >
              {canInput ? 'Input Iuran' : 'Sudah Diinput'}
            </Button>
          </article>
        );
      })}
    </div>
  );
}
