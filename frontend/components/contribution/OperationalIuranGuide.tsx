import Link from 'next/link';
import Card from '@/components/ui/Card';
import { CONTRIBUTION_EDIT_HOLD_LABEL } from './constants';

type ModuleName = 'internet' | 'lingkungan';

const moduleCopy = {
  internet: {
    title: 'Internet',
    path: '/operasional/internet',
    settingPath: '/operasional/internet/setting',
    inputPath: '/operasional/internet/iuran',
    kasName: 'Kas Internet'
  },
  lingkungan: {
    title: 'Lingkungan',
    path: '/operasional/lingkungan',
    settingPath: '/operasional/lingkungan/setting',
    inputPath: '/operasional/lingkungan/iuran',
    kasName: 'Kas Lingkungan'
  }
} as const;

export default function OperationalIuranGuide({ module }: { module: ModuleName }) {
  const config = moduleCopy[module];
  const metricCopy = module === 'internet'
    ? [
        ['Kas', `${config.kasName} total: seluruh pemasukan dikurangi seluruh pengeluaran, termasuk saldo awal migrasi bila ada.`],
        ['Masuk', 'Jumlah iuran yang masuk pada periode yang sedang dipilih.'],
        ['Keluar', 'Jumlah pengeluaran yang dicatat pada periode yang sedang dipilih.']
      ]
    : [
        ['Tarif Aktif', 'Nominal iuran yang berlaku pada periode yang dipilih.'],
        ['Warga Aktif', 'Jumlah anggota yang ikut iuran pada periode tersebut.'],
        ['Pemasukan / Pengeluaran Bulan', 'Total transaksi masuk dan keluar pada periode yang dipilih.'],
        ['Total Saldo', 'Pemasukan bulan dikurangi pengeluaran bulan; ini bukan total kas seluruh waktu.'],
        ['Total Kas', `${config.kasName} kumulatif: seluruh pemasukan dikurangi seluruh pengeluaran sampai saat ini, termasuk saldo awal migrasi bila ada.`]
      ];

  return (
    <main className="min-h-screen pb-10">
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <Card
          title={`Panduan Admin ${config.title}`}
          subtitle="Alur pengaturan anggota, pencatatan mulai Januari 2026, dan membaca laporan kas."
          headerRight={<Link href={config.path} className="btn-action-blue link-action px-3 py-1.5 text-xs">Kembali ke Operasional</Link>}
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Data iuran dan tunggakan dimulai dari <b>Januari 2026</b>. Jangan memasukkan iuran atau tunggakan tahun 2025 per warga pada modul ini. Bila ada saldo kas akhir Desember 2025, hanya root yang mengisinya melalui Migrasi 2025 sebagai saldo awal kas 2026.
          </div>
        </Card>

        <Card title="1. Atur tarif dan keanggotaan" subtitle="Lakukan sebelum mencatat iuran bulan pertama.">
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-[var(--text-primary)]">
            <li>Buka <Link href={config.settingPath} className="font-semibold text-[var(--accent)] underline">Pengaturan {config.title}</Link>.</li>
            <li>Isi <b>Tarif Berlaku Mulai</b> dan nominal tarif, lalu pilih <b>Simpan Tarif</b>. Untuk awal pencatatan, gunakan periode Januari 2026 bila tarif memang mulai berlaku pada bulan itu.</li>
            <li>Di tabel Keanggotaan, pilih hanya warga yang memang menjadi peserta {config.title.toLowerCase()}. Warga yang tidak ikut harus tetap <b>Nonaktif</b>.</li>
            <li>Untuk setiap anggota, isi <b>Mulai Iuran</b> (umumnya Januari 2026), pilih <b>Simpan Mulai</b>, lalu pilih <b>Aktifkan</b>. Jika bulan mulai diubah pada anggota yang sudah aktif, gunakan <b>Simpan Mulai</b> lagi.</li>
          </ol>
          <p className="mt-4 text-sm text-[var(--text-muted)]">Keanggotaan dan bulan mulai menentukan siapa yang muncul pada daftar iuran serta sejak kapan tunggakan dihitung.</p>
        </Card>

        <Card title="2. Input iuran mulai Januari 2026" subtitle="Satu pencatatan untuk setiap pembayaran warga.">
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-[var(--text-primary)]">
            <li>Buka <Link href={config.inputPath} className="font-semibold text-[var(--accent)] underline">Input Iuran</Link>.</li>
            <li>Pilih <b>Periode</b>, mulai dari Januari 2026. Pastikan tarif periode tersebut sudah benar terlebih dahulu.</li>
            <li>Pilih warga, masukkan nominal yang benar, lalu simpan. Pembayaran dapat dicatat sebagian; kolom Bayar/Target dan Tunggakan akan memperlihatkan sisa tagihan.</li>
            <li>Jika salah input, tahan card warga selama <b>{CONTRIBUTION_EDIT_HOLD_LABEL}</b> pada halaman Input Iuran. Modal koreksi akan terbuka dengan nominal terakhir pada periode tersebut.</li>
            <li>Gunakan filter <b>Belum</b> untuk menindaklanjuti warga yang masih memiliki tunggakan. Tunggakan total hanya dihitung sejak bulan mulai iuran anggota.</li>
          </ol>
        </Card>

        <Card title="3. Catat pengeluaran" subtitle="Agar saldo kas selalu mencerminkan transaksi nyata.">
          <p className="text-sm leading-6 text-[var(--text-primary)]">Pada halaman Operasional, isi tanggal, nominal Rupiah, dan keterangan di bagian Pengeluaran {config.title}, lalu pilih <b>Catat Pengeluaran</b>. Pengeluaran akan mengurangi kas total dan muncul pada riwayat periode terkait. Gunakan tanggal transaksi yang sebenarnya agar rekap bulanan tepat.</p>
        </Card>

        <Card title="4. Membaca angka kas dan riwayat" subtitle="Pilih periode pada halaman Operasional untuk mengubah angka bulanannya.">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Informasi</th><th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Arti</th></tr></thead>
              <tbody>{metricCopy.map(([name, description]) => <tr key={name} className="bg-[var(--surface)]"><td className="border-t border-[var(--line)] px-3 py-2 text-sm font-semibold">{name}</td><td className="border-t border-[var(--line)] px-3 py-2 text-sm">{description}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--text-primary)]">Bagian <b>Riwayat {config.title}</b> memperlihatkan pemasukan dan pengeluaran per bulan. Pilih bulan pada filter Tahun untuk melihat rekap tahun yang diinginkan. Untuk mengecek kewajiban per orang, lihat tabel <b>Status Iuran Warga</b>: Bayar/Target, <b>Tunggakan Bulan</b> (jumlah bulan yang belum lunas dari seluruh bulan iuran), dan Total Tunggakan.</p>
        </Card>
      </div>
    </main>
  );
}
