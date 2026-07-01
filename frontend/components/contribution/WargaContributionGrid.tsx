'use client';

import { useRef } from 'react';
import Button from '@/components/ui/Button';
import { formatRupiah } from '@/lib/helpers';
import { CONTRIBUTION_EDIT_HOLD_MS } from './constants';

export type WargaContributionRow = {
  id: string;
  nama: string;
  paidAmount: number;
  targetAmount: number;
  suggestionText?: string;
  canInput?: boolean;
  canEdit?: boolean;
  editId?: string;
  editAmount?: number;
};

export default function WargaContributionGrid({
  rows,
  onInput,
  onEdit,
  holdMs = CONTRIBUTION_EDIT_HOLD_MS
}: {
  rows: WargaContributionRow[];
  onInput: (row: WargaContributionRow) => void;
  onEdit?: (row: WargaContributionRow) => void;
  holdMs?: number;
}) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHold(row: WargaContributionRow) {
    clearHoldTimer();
    if (!onEdit || !row.canEdit) return;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      onEdit(row);
    }, holdMs);
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {rows.map((row) => {
        const done = row.paidAmount >= row.targetAmount;
        const canInput = row.canInput ?? true;
        return (
          <article
            key={row.id}
            onMouseDown={() => startHold(row)}
            onMouseUp={clearHoldTimer}
            onMouseLeave={clearHoldTimer}
            onTouchStart={() => startHold(row)}
            onTouchEnd={clearHoldTimer}
            onTouchCancel={clearHoldTimer}
            className={
              done
                ? 'card-status-paid rounded-2xl border p-4'
                : 'card-status-unpaid rounded-2xl border p-4'
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
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
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
