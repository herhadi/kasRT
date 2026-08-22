'use client';

import Button from '@/components/ui/Button';
import { formatRupiah, formatTanggalIndonesia } from '@/lib/helpers';
import { PendingApprovalItem } from '@/types';

type Props = {
  item: PendingApprovalItem;
  busy?: boolean;
  actionLabel?: string;
  busyLabel?: string;
  onAction: (item: PendingApprovalItem) => void;
};

function formatOperationalDate(value?: string | null) {
  if (!value) return null;
  const dateOnly = String(value).slice(0, 10);
  return formatTanggalIndonesia(`${dateOnly}T00:00:00+07:00`);
}

function itemHeading(item: PendingApprovalItem) {
  if (item.kind === 'JIMPITAN_BATCH') return 'Setoran Jimpitan';
  return item.title;
}

export default function ApprovalItemCard({
  item,
  busy = false,
  actionLabel = 'Approve',
  busyLabel = '...',
  onAction
}: Props) {
  const operationalDate = formatOperationalDate(item.meta.operational_date);
  const creatorName = item.meta.created_by_nama || null;
  const creatorLabel = item.kind === 'JIMPITAN_BATCH' ? 'Petugas' : 'Dibuat oleh';
  const showAmount = item.kind !== 'PIN_RESET';

  return (
    <article className="surface-muted rounded-xl border border-[var(--line)] p-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{itemHeading(item)}</p>

        <div className="mt-1.5 space-y-1 text-xs text-[var(--text-muted)]">
          {operationalDate ? (
            <p><span className="font-medium text-[var(--text-primary)]">Tanggal operasional:</span> {operationalDate}</p>
          ) : null}
          {creatorName ? (
            <p><span className="font-medium text-[var(--text-primary)]">{creatorLabel}:</span> {creatorName}</p>
          ) : null}
          {item.description ? <p className="break-words">{item.description}</p> : null}
          <p>Diajukan: {formatTanggalIndonesia(item.created_at)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 md:mt-0 md:block md:border-0 md:pt-0 md:text-right">
        {showAmount ? <p className="metric-value text-base font-bold text-[var(--accent)]">{formatRupiah(item.amount)}</p> : <span />}
        <Button
          className="whitespace-nowrap px-3 py-1.5 text-sm md:hidden"
          onClick={() => onAction(item)}
          disabled={busy}
        >
          {busy ? busyLabel : actionLabel}
        </Button>
      </div>

      <Button
        className="hidden whitespace-nowrap px-3 py-1.5 text-sm md:inline-flex"
        onClick={() => onAction(item)}
        disabled={busy}
      >
        {busy ? busyLabel : actionLabel}
      </Button>
    </article>
  );
}
