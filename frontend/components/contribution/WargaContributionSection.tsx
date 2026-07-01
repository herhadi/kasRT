import { useMemo, useState } from 'react';
import WargaContributionGrid, { WargaContributionRow } from './WargaContributionGrid';
import WargaContributionModal from './WargaContributionModal';

type Props = {
  rows: WargaContributionRow[];
  selectedRow: WargaContributionRow | null;
  loading?: boolean;
  presets?: Array<{ label: string; amount: number }>;
  showManual?: boolean;
  editMode?: boolean;
  initialAmount?: number;
  onOpen: (row: WargaContributionRow) => void;
  onEdit?: (row: WargaContributionRow) => void;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
};

export default function WargaContributionSection({
  rows,
  selectedRow,
  loading = false,
  presets,
  showManual = true,
  editMode = false,
  initialAmount,
  onOpen,
  onEdit,
  onClose,
  onSubmit
}: Props) {
  const [filter, setFilter] = useState<'semua' | 'belum' | 'sudah' | 'kosong'>('semua');
  const stats = useMemo(() => {
    const sudah = rows.filter((r) => r.paidAmount >= r.targetAmount).length;
    const kosong = rows.filter((r) => Number(r.paidAmount || 0) === 0).length;
    const belum = rows.length - sudah;
    return { sudah, belum, kosong };
  }, [rows]);
  const filteredRows = useMemo(() => {
    if (filter === 'belum') return rows.filter((r) => r.paidAmount < r.targetAmount);
    if (filter === 'sudah') return rows.filter((r) => r.paidAmount >= r.targetAmount);
    if (filter === 'kosong') return rows.filter((r) => Number(r.paidAmount || 0) === 0);
    return rows;
  }, [rows, filter]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <p className="md:col-span-3 text-sm text-[var(--text-muted)]">
          Pilih warga lalu input iuran lewat form popup agar lebih cepat untuk pembayaran acak.
        </p>
      </div>
      <div className="mt-3">
        <div className="mb-3 grid w-full grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { key: 'semua', label: `Semua (${rows.length})` },
            { key: 'belum', label: `Belum (${stats.belum})` },
            { key: 'sudah', label: `Sudah (${stats.sudah})` },
            { key: 'kosong', label: `Kosong (${stats.kosong})` }
          ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key as 'semua' | 'belum' | 'sudah' | 'kosong')}
                className={
                  filter === item.key
                  ? 'quick-choice-btn quick-choice-btn-active min-h-[2.5rem] text-xs'
                  : 'quick-choice-btn min-h-[2.5rem] text-xs'
                }
              >
                {item.label}
              </button>
          ))}
        </div>
        <WargaContributionGrid rows={filteredRows} onInput={onOpen} onEdit={onEdit} />
      </div>
      <WargaContributionModal
        open={Boolean(selectedRow)}
        wargaNama={selectedRow?.nama || '-'}
        suggestionText={selectedRow?.suggestionText}
        editMode={editMode}
        initialAmount={initialAmount}
        presets={
          presets || [
            { label: '30rb', amount: 30000 },
            { label: '60rb', amount: 60000 },
            { label: '90rb', amount: 90000 },
            { label: '120rb', amount: 120000 },
            { label: '150rb', amount: 150000 },
            { label: '180rb', amount: 180000 }
          ]
        }
        loading={loading}
        showManual={showManual}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </>
  );
}
