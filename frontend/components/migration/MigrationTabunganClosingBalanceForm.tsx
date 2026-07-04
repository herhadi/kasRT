'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { formatRupiah } from '@/lib/helpers';
import usePagination from '@/lib/hooks/usePagination';
import PaginationControls from '@/components/pagination/PaginationControls';

type Row = {
  warga_id: string;
  nama: string;
  [key: string]: string | number;
};

type Props = {
  year?: number;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

function parseSignedRupiahInput(value: string | number) {
  const raw = String(value ?? '').trim();
  const negative = raw.startsWith('-');
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return 0;
  const amount = Number(digits);
  return negative ? -amount : amount;
}

function formatSignedRupiahInput(value: string | number) {
  const raw = String(value ?? '').trim();
  const negative = raw.startsWith('-');
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return negative ? '-' : '';
  const formatted = new Intl.NumberFormat('id-ID').format(Number(digits));
  return negative ? `-${formatted}` : formatted;
}

export default function MigrationTabunganClosingBalanceForm({
  year = 2025,
  busy,
  onBusyChange,
  onSaved,
  onError,
  onSuccess
}: Props) {
  const saldoKey = `saldo_akhir_${year}`;
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ success: boolean; data: Row[] }>(`/migration/tabungan-${year}/summary`);
      const data = res.data || [];
      setRows(data);
      setDrafts((current) => {
        const next: Record<string, string> = {};
        for (const row of data) {
          const id = String(row.warga_id || '');
          next[id] = current[id] ?? String(Number(row[saldoKey] || 0));
        }
        return next;
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Gagal memuat saldo tabungan');
    } finally {
      setLoading(false);
    }
  }, [onError, saldoKey, year]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => String(row.nama || '').toLowerCase().includes(q));
  }, [rows, search]);

  const pager = usePagination(filteredRows, 10);

  useEffect(() => {
    pager.reset();
  }, [filteredRows.length, search]);

  async function saveRow(row: Row) {
    const wargaId = String(row.warga_id || '').trim();
    const amount = parseSignedRupiahInput(drafts[wargaId] || '0');
    if (!wargaId) return onError('Warga tidak valid');
    if (!Number.isFinite(amount)) return onError('Saldo akhir tidak valid');

    try {
      onBusyChange(true);
      await apiFetch(`/migration/tabungan-${year}/closing-balances`, {
        method: 'POST',
        body: JSON.stringify({ rows: [{ warga_id: wargaId, closing_balance: amount }] })
      });
      onSuccess(`Saldo akhir tabungan ${row.nama} berhasil disimpan.`);
      await onSaved();
      await loadRows();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Gagal simpan saldo akhir tabungan');
    } finally {
      onBusyChange(false);
    }
  }

  async function saveAllChanged() {
    const payload = rows
      .map((row) => {
        const wargaId = String(row.warga_id || '').trim();
        const current = Number(row[saldoKey] || 0);
        const draft = parseSignedRupiahInput(drafts[wargaId] || '0');
        return { warga_id: wargaId, closing_balance: draft, changed: draft !== current };
      })
      .filter((row) => row.warga_id && row.changed && Number.isFinite(row.closing_balance));

    if (!payload.length) {
      onError('Belum ada perubahan saldo yang valid.');
      return;
    }

    try {
      onBusyChange(true);
      await apiFetch(`/migration/tabungan-${year}/closing-balances`, {
        method: 'POST',
        body: JSON.stringify({ rows: payload.map(({ warga_id, closing_balance }) => ({ warga_id, closing_balance })) })
      });
      onSuccess(`${payload.length} saldo akhir tabungan berhasil disimpan.`);
      await onSaved();
      await loadRows();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Gagal simpan saldo akhir tabungan');
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
        <p className="text-sm font-bold text-[var(--text-primary)]">Saldo Akhir Desember {year} by Name</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Isi saldo akhir tiap warga. Saldo minus diperbolehkan untuk warga yang posisi tabungannya defisit. Sistem menyimpan angka ini sebagai saldo closing Desember {year}, lalu menjadi dasar saldo awal tabungan {year + 1}.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama warga..."
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <Button className="btn-action-green" onClick={() => void saveAllChanged()} disabled={busy || loading}>
          Simpan Semua Perubahan
        </Button>
      </div>

      {loading ? <p className="text-sm text-[var(--text-muted)]">Memuat saldo tabungan...</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
          <thead>
            <tr className="bg-[var(--surface-strong)]">
              <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Nama</th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tersimpan</th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Saldo Akhir</th>
              <th className="border-b border-[var(--line)] px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pager.pagedItems.map((row) => {
              const wargaId = String(row.warga_id || '');
              const savedAmount = Number(row[saldoKey] || 0);
              return (
                <tr key={wargaId} className="bg-[var(--surface)]">
                  <td className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">{row.nama}</td>
                  <td className={`border-b border-[var(--line)] px-3 py-2 text-right text-sm ${savedAmount < 0 ? 'font-semibold text-rose-600' : 'text-[var(--text-muted)]'}`}>{formatRupiah(savedAmount)}</td>
                  <td className="border-b border-[var(--line)] px-3 py-2 text-sm">
                    <input
                      type="text"
                      inputMode="text"
                      value={formatSignedRupiahInput(drafts[wargaId] || '0')}
                      onChange={(event) => setDrafts((current) => ({ ...current, [wargaId]: event.target.value }))}
                      className="w-full min-w-[160px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-2 text-right">
                    <Button variant="ghost" className="btn-action-blue px-3 py-1.5 text-xs" onClick={() => void saveRow(row)} disabled={busy || loading}>
                      Simpan
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!filteredRows.length && !loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-sm text-[var(--text-muted)]">Tidak ada warga.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PaginationControls page={pager.page} totalPages={pager.totalPages} onPrev={pager.prev} onNext={pager.next} />
    </div>
  );
}
