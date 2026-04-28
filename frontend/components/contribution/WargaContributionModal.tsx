'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatRupiahInput, parseRupiahInput } from '@/lib/helpers';

type Preset = { label: string; amount: number };

export default function WargaContributionModal({
  open,
  wargaNama,
  presets,
  loading,
  showManual = true,
  onClose,
  onSubmit
}: {
  open: boolean;
  wargaNama: string;
  presets: Preset[];
  loading: boolean;
  showManual?: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
}) {
  const [manual, setManual] = useState('');
  const [mounted, setMounted] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) {
      setManual('');
      setManualOpen(false);
    }
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm">
      <div className="glass-card w-full max-w-sm rounded-2xl p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Input Iuran</p>
        <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{wargaNama}</h3>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {presets.map((preset) => (
            <Button key={preset.amount} variant="ghost" className="px-2 py-2 text-xs" onClick={() => void onSubmit(preset.amount)} disabled={loading}>
              {preset.label}
            </Button>
          ))}
        </div>

        {showManual ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              className="text-xs font-semibold text-[var(--accent)]"
              onClick={() => setManualOpen((v) => !v)}
            >
              {manualOpen ? '▾ Sembunyikan Nominal Lainnya' : '▸ Nominal Lainnya'}
            </button>
            {manualOpen ? (
              <>
            <Input
              label="Nominal Lainnya"
              type="text"
              inputMode="numeric"
              value={formatRupiahInput(manual)}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Contoh: 30.000"
            />
            <Button className="w-full" onClick={() => void onSubmit(parseRupiahInput(manual))} disabled={loading || !manual}>
              Simpan Nominal
            </Button>
              </>
            ) : null}
          </div>
        ) : null}

        <Button variant="danger" className="mt-4 w-full" onClick={onClose} disabled={loading}>
          Tutup
        </Button>
      </div>
    </div>,
    document.body
  );
}
