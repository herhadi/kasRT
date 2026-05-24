'use client';

import { formatRupiah } from '@/lib/helpers';

type WargaRow = {
  warga_id: string;
  nama: string;
  [key: string]: any;
};

type Props = {
  moduleKey: string;
  rows: WargaRow[];
  selectedWargaId: string;
  onSelectWarga: (wargaId: string) => void;
  year?: number;
};

export default function MigrationAmountSummaryTable({
  moduleKey,
  rows,
  selectedWargaId,
  onSelectWarga,
  year = 2025
}: Props) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--text-muted)]">Belum ada data summary.</p>;
  }

  const showArrears =
    moduleKey === `jimpitan-${year}` ||
    moduleKey === `internet-${year}` ||
    moduleKey === `lingkungan-${year}` ||
    moduleKey === `iuran-${year}`;

  const showTabunganOnly = moduleKey === `tabungan-${year}`;
  const showKoperasiOnly = moduleKey === `koperasi-iuran-${year}`;

  return (
    <div className="max-h-[360px] overflow-auto rounded-xl border border-[var(--line)]">
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr className="sticky top-0 bg-[var(--surface-strong)]">
            <th className="border-b border-[var(--line)] px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">
              Warga
            </th>
            {showTabunganOnly ? (
              <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                Saldo akhir {year}
              </th>
            ) : null}
            {showKoperasiOnly ? (
              <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                Total bayar
              </th>
            ) : null}
            {showArrears ? (
              <>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Total bayar
                </th>
                <th className="border-b border-[var(--line)] px-3 py-2 text-right text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  Tunggakan
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = String(row.warga_id) === String(selectedWargaId);
                    const paid = Number(row[`total_paid_${year}`] || row[`saldo_akhir_${year}`] || 0);
            const hasData = paid !== 0;
            return (
              <tr
                key={row.warga_id}
                className={`cursor-pointer ${selected ? 'bg-[var(--accent)]/10' : 'bg-[var(--surface)]'} hover:bg-[var(--accent)]/5`}
                onClick={() => onSelectWarga(String(row.warga_id))}
              >
                <td className="border-b border-[var(--line)] px-3 py-2 text-sm">
                  <span className="font-medium text-[var(--text-primary)]">{row.nama}</span>
                  {!hasData ? <span className="ml-2 text-[10px] text-[var(--text-muted)]">belum diisi</span> : null}
                </td>
                {showTabunganOnly ? (
                  <td
                    className={`border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold ${
                      paid < 0 ? 'text-rose-600' : 'text-[var(--accent)]'
                    }`}
                  >
                    {formatRupiah(paid)}
                  </td>
                ) : null}
                {showKoperasiOnly ? (
                  <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-emerald-700">
                    {formatRupiah(paid)}
                  </td>
                ) : null}
                {showArrears ? (
                  <>
                    <td className="border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold text-emerald-700">
                      {formatRupiah(Number(row[`total_paid_${year}`] || 0))}
                    </td>
                    <td
                      className={`border-b border-[var(--line)] px-3 py-2 text-right text-sm font-semibold ${
                        Number(row[`closing_arrears_${year}`] || 0) > 0 ? 'text-rose-600' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {formatRupiah(Number(row[`closing_arrears_${year}`] || 0))}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
