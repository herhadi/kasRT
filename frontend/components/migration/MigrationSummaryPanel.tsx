'use client';

import MigrationAmountSummaryTable from '@/components/migration/MigrationAmountSummaryTable';
import { formatRupiah } from '@/lib/helpers';
import { MIGRATION_MONTH_LABELS_FOR_YEAR, type MigrationFormModule } from '@/lib/migration2025';

type Props = {
  moduleKey: MigrationFormModule | string;
  summary: unknown;
  selectedWargaId: string;
  onSelectWarga: (wargaId: string) => void;
  year?: number;
};

type SosialSummary = {
  rows: Array<{ month: string; pemasukan: number; pengeluaran: number; saldo_bulan: number }>;
  saldo_akhir_2025: number;
};

export default function MigrationSummaryPanel({
  moduleKey,
  summary,
  selectedWargaId,
  onSelectWarga,
  year = 2025
}: Props) {
  if (moduleKey === 'sosial-2025') {
    const data = summary as SosialSummary | null;
    if (!data?.rows?.length) {
      return <p className="text-sm text-[var(--text-muted)]">Belum ada data sosial.</p>;
    }
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          Saldo akhir {year}: <span className="text-[var(--accent)]">{formatRupiah(Number(data.saldo_akhir_2025 || 0))}</span>
        </p>
        <div className="max-h-[320px] overflow-auto rounded-xl border border-[var(--line)]">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="sticky top-0 bg-[var(--surface-strong)]">
                <th className="border-b border-[var(--line)] px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Bulan
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Masuk
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Keluar
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.month} className="bg-[var(--surface)]">
                  <td className="border-b border-[var(--line)] px-3 py-2">
                    {MIGRATION_MONTH_LABELS_FOR_YEAR(year)[row.month] || row.month}
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2 text-right text-emerald-700">
                    {formatRupiah(row.pemasukan)}
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2 text-right text-rose-600">
                    {formatRupiah(row.pengeluaran)}
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2 text-right font-semibold">
                    {formatRupiah(row.saldo_bulan)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!Array.isArray(summary)) {
    return <p className="text-sm text-[var(--text-muted)]">Belum ada data summary.</p>;
  }

  const rows = summary as Array<{ warga_id: string; nama: string }>;
  const amountModule =
    moduleKey === 'tabungan-2025' ||
    moduleKey === 'jimpitan-2025' ||
    moduleKey === 'internet-2025' ||
    moduleKey === 'lingkungan-2025';

  if (amountModule) {
    return (
      <MigrationAmountSummaryTable
        moduleKey={moduleKey as 'tabungan-2025' | 'jimpitan-2025' | 'internet-2025' | 'lingkungan-2025'}
        rows={rows}
        selectedWargaId={selectedWargaId}
        onSelectWarga={onSelectWarga}
          year={year}
      />
    );
  }

  if (moduleKey === 'iuran-2025' || moduleKey === 'koperasi-iuran-2025') {
    return (
      <MigrationAmountSummaryTable
        moduleKey={moduleKey}
        rows={rows}
        selectedWargaId={selectedWargaId}
        onSelectWarga={onSelectWarga}
        year={year}
      />
    );
  }

  return null;
}
