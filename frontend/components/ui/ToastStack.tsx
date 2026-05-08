'use client';

type ToastItem = {
  id: number;
  text: string;
  kind?: 'success' | 'error' | 'warning';
};

export default function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 top-4 z-[90] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`min-w-[220px] max-w-[86vw] rounded-xl border px-3 py-2 text-sm shadow-md ${
            toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : toast.kind === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
