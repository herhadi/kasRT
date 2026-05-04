'use client';

type Props = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export default function PaginationControls({ page, totalPages, onPrev, onNext, className = '' }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className={`mt-3 flex items-center justify-end gap-2 ${className}`.trim()}>
      <button type="button" className="btn-action-blue rounded-lg px-3 py-1.5 text-xs" disabled={page <= 1} onClick={onPrev}>
        Prev
      </button>
      <span className="text-xs text-[var(--text-muted)]">{page}/{totalPages}</span>
      <button type="button" className="btn-action-blue rounded-lg px-3 py-1.5 text-xs" disabled={page >= totalPages} onClick={onNext}>
        Next
      </button>
    </div>
  );
}

