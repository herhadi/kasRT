'use client';

import { useMemo, useState } from 'react';

export default function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / pageSize)), [items.length, pageSize]);
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  function next() {
    setPage((p) => Math.min(totalPages, p + 1));
  }
  function prev() {
    setPage((p) => Math.max(1, p - 1));
  }
  function reset() {
    setPage(1);
  }

  return { page: safePage, setPage, totalPages, pagedItems, next, prev, reset };
}

