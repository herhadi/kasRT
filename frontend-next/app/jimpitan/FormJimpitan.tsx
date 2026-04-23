'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatRupiah } from '@/lib/helpers';
import { JimpitanListItem } from '@/types';

export default function FormJimpitan({
  selected,
  onSubmit,
  onClose
}: {
  selected: JimpitanListItem | null;
  onSubmit: (nominal: number) => Promise<void>;
  onClose: () => void;
}) {
  const [manualNominal, setManualNominal] = useState('');
  const [loading, setLoading] = useState(false);

  if (!selected) return null;

  async function submitNominal(nominal: number) {
    if (Number.isNaN(nominal) || nominal < 0) return;
    setLoading(true);
    try {
      await onSubmit(nominal);
      setManualNominal('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg rounded-3xl p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Input Jimpitan</p>
        <h3 className="mt-2 font-[var(--font-space-grotesk)] text-2xl font-bold">{selected.nama}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Saran: {formatRupiah(selected.nominalSaran)}</p>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {[0, 500, 1000, 2000].map((value) => (
            <Button key={value} variant="ghost" onClick={() => submitNominal(value)} disabled={loading}>
              {value === 0 ? 'Kosong' : `${value / 1000 >= 1 ? `${value / 1000}k` : value}`}
            </Button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <Input
            label="Nominal Lainnya"
            type="number"
            min={0}
            value={manualNominal}
            onChange={(event) => setManualNominal(event.target.value)}
            placeholder="Contoh: 1500"
          />
          <Button
            className="w-full"
            onClick={() => submitNominal(Number(manualNominal || 0))}
            disabled={loading || manualNominal === ''}
          >
            Simpan Nominal
          </Button>
        </div>

        <Button variant="danger" className="mt-4 w-full" onClick={onClose} disabled={loading}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
