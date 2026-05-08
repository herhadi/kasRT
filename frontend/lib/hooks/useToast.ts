'use client';

import { useCallback, useState } from 'react';

type ToastKind = 'success' | 'error' | 'warning';
type ToastItem = { id: number; text: string; kind: ToastKind };

export default function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  return { toasts, pushToast };
}
