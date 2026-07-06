'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatRupiah, formatRupiahInput, parseRupiahInput } from '@/lib/helpers';

type Preset = { label: string; amount: number };

export default function WargaContributionModal({
  open,
  wargaNama,
  suggestionText,
  currentBalance,
  editMode = false,
  initialAmount,
  presets,
  loading,
  showManual = true,
  onClose,
  onSubmit
}: {
  open: boolean;
  wargaNama: string;
  suggestionText?: string;
  currentBalance?: number | null;
  editMode?: boolean;
  initialAmount?: number;
  presets: Preset[];
  loading: boolean;
  showManual?: boolean;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void> | void;
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
      return;
    }
    if (editMode && typeof initialAmount === 'number') {
      setManual(String(initialAmount));
      setManualOpen(true);
    }
  }, [open, editMode, initialAmount]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm">
      <div className="glass-card w-full max-w-sm rounded-2xl p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">{editMode ? 'Koreksi Iuran' : 'Input Iuran'}</p>
        <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{wargaNama}</h3>
        {suggestionText ? <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">{suggestionText}</p> : null}
        {typeof currentBalance === 'number' ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Saldo saat ini: <b>{formatRupiah(currentBalance)}</b>
          </p>
        ) : null}

        {!editMode ? (
          <div className="mt-4 grid grid-cols-2 gap-4 px-1 py-2">
            {presets.map((preset) => (
              <Button
                key={preset.amount}
                variant="ghost"
                className="quick-choice-btn btn-action-blue !min-h-[4.25rem] !px-4 !py-3 !text-base"
                onClick={() => void onSubmit(preset.amount)}
                disabled={loading}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        ) : null}

        {showManual ? (
          <div className="mt-5 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
            <button
              type="button"
              className="text-sm font-semibold text-[var(--accent)]"
              onClick={() => setManualOpen((v) => !v)}
            >
              {editMode ? 'Nominal Koreksi' : manualOpen ? '▾ Sembunyikan Nominal Lainnya' : '▸ Nominal Lainnya'}
            </button>
            {manualOpen ? (
              <>
              <Input
              label="Nominal Lainnya"
              type="text"
              inputMode="numeric"
              className="!py-4 !text-lg !font-bold"
              value={formatRupiahInput(manual)}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Contoh: 30.000"
            />
            <Button className="w-full !min-h-[3.5rem] !text-base" onClick={() => void onSubmit(parseRupiahInput(manual))} disabled={loading || !manual}>
              {editMode ? 'Simpan Koreksi' : 'Simpan Nominal'}
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
