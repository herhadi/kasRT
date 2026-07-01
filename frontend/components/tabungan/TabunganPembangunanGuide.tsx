'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { CONTRIBUTION_EDIT_HOLD_LABEL } from '@/components/contribution/constants';

export default function TabunganPembangunanGuide() {
  return (
    <main className="min-h-screen pb-10">
      <div className="mx-auto mt-6 w-full max-w-5xl space-y-5 px-4 md:px-6">
        <Card title="Panduan Tabungan Pembangunan" subtitle="Cara mengelola saldo warga, kegiatan pembangunan, dan sisa kas kegiatan">
          <div className="space-y-4 text-sm text-[var(--text-primary)]">
            <section>
              <h2 className="font-bold">1. Atur anggota dan minimum setoran</h2>
              <p className="mt-1 text-[var(--text-muted)]">
                Buka <Link href="/operasional/tabungan/setting" className="font-semibold text-[var(--accent)] underline">Pengaturan Tabungan</Link> untuk mengaktifkan warga yang ikut tabungan pembangunan dan menentukan minimum setoran.
              </p>
            </section>

            <section>
              <h2 className="font-bold">2. Input setoran warga</h2>
              <p className="mt-1 text-[var(--text-muted)]">
                Buka <Link href="/operasional/tabungan/input" className="font-semibold text-[var(--accent)] underline">Input Tabungan</Link>, pilih warga, lalu masukkan nominal setoran. Saldo warga akan bertambah.
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                Jika salah input setoran, tahan card warga selama <b>{CONTRIBUTION_EDIT_HOLD_LABEL}</b>. Modal koreksi akan terbuka dengan nominal setoran terakhir pada periode tersebut.
              </p>
            </section>

            <section>
              <h2 className="font-bold">3. Proses kegiatan pembangunan</h2>
              <p className="mt-1 text-[var(--text-muted)]">
                Pada halaman utama tabungan, isi nama kegiatan, biaya riil, dan nominal final per warga. Sistem menghitung total potong saldo dan selisih.
              </p>
              <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-xs text-[var(--text-muted)]">
                Contoh: biaya drainase Rp500.000, 37 warga, final per warga Rp15.000. Total potong Rp555.000, sisa kegiatan Rp55.000.
              </div>
            </section>

            <section>
              <h2 className="font-bold">4. Pahami Total Kas Dana</h2>
              <p className="mt-1 text-[var(--text-muted)]">
                Total Kas Dana = saldo semua warga + sisa kas kegiatan. Angka ini juga muncul di Kas Umum dashboard sebagai Kas Tabungan Pembangunan.
              </p>
            </section>

            <section>
              <h2 className="font-bold">5. Cek riwayat</h2>
              <p className="mt-1 text-[var(--text-muted)]">
                Riwayat Tabungan menampilkan setoran dan potongan saldo. Riwayat Pengeluaran Tabungan menampilkan potongan kegiatan yang mengurangi saldo warga.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </main>
  );
}
