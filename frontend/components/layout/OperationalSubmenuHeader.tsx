'use client';

import Link from 'next/link';

type OperationalSubmenuHeaderProps = {
  backHref: string;
  title?: string;
};

export default function OperationalSubmenuHeader({ backHref, title = 'Kembali ke modul' }: OperationalSubmenuHeaderProps) {
  return (
    <div className="mb-3 flex justify-end">
      <Link
        href={backHref}
        aria-label={title}
        title={title}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-lg font-bold text-[var(--text-primary)] shadow-sm transition-colors hover:bg-[var(--surface-strong)]"
      >
        X
      </Link>
    </div>
  );
}
