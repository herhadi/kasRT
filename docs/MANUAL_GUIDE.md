# Manual Guide KasRT

Panduan ini dibuat untuk dicetak atau dibagikan kepada warga dan pengurus RT. Versi aplikasi menyediakan pusat panduan di menu **Panduan** (`/panduan`) dengan isi yang sama secara ringkas.

## 1. Gambaran Umum

KasRT adalah aplikasi kas dan operasional RT untuk:

- melihat kewajiban dan riwayat kontribusi warga;
- mencatat jimpitan, iuran, tabungan, kas sosial, koperasi, dan laporan keamanan;
- mengelola approval transaksi agar saldo kas tidak berubah tanpa persetujuan;
- mengirim notifikasi penting melalui Telegram.

### Menu Utama

| Menu | Fungsi |
| --- | --- |
| Dashboard | Ringkasan kewajiban, saldo, kas, dan info personal warga. |
| Jimpitan | Input jimpitan harian, setoran shift, dan share rekap manual. |
| Operasional | Pintu masuk pengurus sesuai jabatan/modul. |
| Panduan | Pusat bantuan semua modul. |
| Inbox | Approval transaksi, setoran, atau permintaan yang menunggu persetujuan. |
| Manajemen | Pengaturan user, struktur, Telegram, aset, dan migrasi data. |

## 2. Login dan Akun

1. Buka aplikasi KasRT.
2. Login memakai nomor HP dan PIN.
3. Jika sistem meminta ganti PIN, buka menu akun lalu buat PIN baru.
4. Pastikan nama dan nomor HP benar.
5. Aktifkan Telegram jika ingin menerima notifikasi dan memakai command bot.

### Jika Lupa PIN

- Hubungi pengurus yang memiliki akses manajemen user.
- Pengurus dapat melakukan reset PIN dari menu Manajemen.

## 3. Dashboard Warga

Dashboard menampilkan:

- jimpitan bulan ini;
- iuran wajib;
- internet;
- lingkungan;
- koperasi;
- tabungan pembangunan;
- ringkasan kas;
- jadwal jimpitan jika warga menjadi petugas.

Gunakan Dashboard sebagai tempat pertama untuk mengecek status pribadi sebelum bertanya ke admin modul.

## 4. Alur Approval

KasRT memakai alur approval untuk menjaga audit kas.

### Prinsip Utama

1. Transaksi dibuat sebagai `PENDING`.
2. Pengurus berwenang melakukan approval.
3. Setelah `APPROVED`, saldo kas baru dihitung sebagai final.

### Contoh Alur

| Modul | Dibuat Oleh | Disetujui Oleh | Hasil |
| --- | --- | --- | --- |
| Setor Jimpitan | Petugas/Admin Jimpitan | Admin Jimpitan/root | Kas jimpitan final setelah approved. |
| Transfer Kas | Bendahara | Ketua/Sekretaris/Plt Ketua/root | Dana berpindah antar kas. |
| Pengeluaran | Bendahara/Admin Modul | Ketua/Sekretaris/Plt Ketua/root sesuai alur | Kas berkurang setelah approved. |

Jika saldo belum berubah, cek dulu apakah transaksi masih `PENDING`.

## 5. Jimpitan

Jimpitan adalah modul untuk mencatat setoran harian dari warga/donatur.

### Petugas Shift

1. Buka menu **Jimpitan**.
2. Pastikan hari tersebut adalah jadwal shift Anda.
3. Pada mode V2, pilih **Global** untuk mencatat total pendapatan hari ini.
4. Isi **Total pendapatan hari ini**.
5. Klik **Ajukan Setoran Shift**.
6. Tunggu approval Admin Jimpitan/root.

### Aturan Setoran V2

- Satu petugas hanya bisa mengajukan satu setoran global untuk tanggal operasional yang sama.
- Jika sudah mengajukan, tombol dan input akan terkunci.
- Jika tanggal tersebut memakai mode by name, input global dikunci agar data tidak dobel.

### Share WA Manual

Tombol Share WA hanya menyiapkan teks laporan dan membuka WhatsApp manual.

- **Share Shift WA**: rekap setoran petugas pada bulan berjalan.
- **Share Bulanan WA**: rekap semua tanggal dalam bulan berjalan.
- Tanda `*` pada nominal berarti setoran tersebut belum approve admin.
- Footer laporan shift menampilkan `_Dilaporkan oleh : nama petugas_`.

### Reminder Jimpitan

- Reminder otomatis dikirim lewat Telegram.
- Jadwal cron production berjalan di VPS/Debian pukul `20:30 WIB`.
- Window backend dibatasi sekitar `20:30-20:45 WIB` agar tidak terkirim terlalu awal/terlambat.
- Integrasi WA otomatis tidak dipakai karena risiko pembatasan nomor.

## 6. Bendahara

Bendahara mengelola kas utama, iuran wajib, transfer kas, dan pengeluaran.

### Input Iuran Wajib

1. Buka **Operasional Bendahara**.
2. Pilih periode yang benar.
3. Klik **Input Iuran**.
4. Catat pembayaran warga.
5. Cek riwayat untuk memastikan data masuk.

### Transfer Kas dan Pengeluaran

1. Buat pengajuan transfer atau pengeluaran.
2. Status awal adalah `PENDING`.
3. Ketua/Sekretaris/Plt Ketua/root melakukan approval.
4. Setelah approved, saldo kas berubah.

Catatan: jangan melakukan koreksi saldo langsung tanpa transaksi.

## 7. Internet

Modul Internet mengelola iuran internet warga.

### Alur Admin Internet

1. Buka **Operasional Internet**.
2. Atur anggota dan tarif jika perlu.
3. Pilih periode iuran.
4. Input pembayaran warga.
5. Cek tunggakan dan riwayat.

### Untuk Warga

- Cek status internet dari Dashboard.
- Jika Telegram aktif, gunakan command `/cek_inet`.

## 8. Lingkungan

Modul Lingkungan mengelola iuran lingkungan dan kas terkait.

### Alur Admin Lingkungan

1. Buka **Operasional Lingkungan**.
2. Atur anggota dan tarif jika perlu.
3. Pilih periode.
4. Input pembayaran.
5. Pantau tunggakan dan riwayat.

### Untuk Warga

- Cek status lingkungan dari Dashboard.
- Jika Telegram aktif, gunakan command `/cek_lingk`.

## 9. Sosial

Modul Sosial mengelola kas sosial dan pengeluaran sosial.

### Alur Admin Sosial

1. Dana sosial masuk lewat transfer kas dari Bendahara.
2. Admin Sosial mencatat pengeluaran sosial.
3. Pengeluaran mengikuti alur `PENDING -> APPROVED`.
4. Pantau saldo dan riwayat dari Operasional Sosial.

Catatan: modul Sosial tidak memakai tunggakan bulanan warga.

## 10. Koperasi

Modul Koperasi mengelola iuran koperasi dan pinjaman.

### Alur Admin Koperasi

1. Atur anggota koperasi.
2. Catat iuran anggota.
3. Buat draft pinjaman jika ada pengajuan.
4. Gunakan simulasi angsuran untuk mengecek skema flat/menurun.
5. Proses approval sebelum pinjaman dianggap aktif.

Pastikan tenor, nominal pinjaman, dan angsuran sudah dicek sebelum disimpan.

## 11. Tabungan Pembangunan

Tabungan Pembangunan mencatat saldo tabungan warga untuk kebutuhan pembangunan.

### Alur Admin Pembangunan

1. Buka **Operasional Pembangunan**.
2. Atur anggota dan minimum setoran.
3. Pilih periode input.
4. Input setoran warga.
5. Jika ada salah input, gunakan koreksi setoran.
6. Catat pengeluaran kegiatan bila ada.

Catatan:

- Saldo awal migrasi dipisah dari setoran berjalan.
- Periode input harus sesuai bulan transaksi.

## 12. Keamanan

Modul Keamanan dipakai untuk laporan kondisi dan tindak lanjut keamanan.

### Alur Admin Keamanan

1. Buka **Operasional Keamanan**.
2. Catat laporan kondisi atau isu keamanan.
3. Perbarui status tindak lanjut.
4. Gunakan share jadwal WA manual jika diperlukan.

Gunakan deskripsi singkat, jelas, dan mudah dipahami pengurus lain.

## 13. Telegram Bot

Telegram dipakai untuk notifikasi dan command cek kewajiban.

### Aktivasi Telegram

1. Buka menu akun/profil.
2. Buat link aktivasi Telegram.
3. Klik link dan mulai chat dengan bot.
4. Jalankan `/help` untuk melihat command.

### Command Aktif

| Command | Fungsi |
| --- | --- |
| `/help` | Menampilkan daftar command. |
| `/cek_tab` | Cek saldo Tabungan Pembangunan. |
| `/cek_inet` | Cek kewajiban iuran Internet. |
| `/cek_lingk` | Cek kewajiban iuran Lingkungan. |

Jika Telegram tidak menerima notifikasi, cek apakah akun sudah terhubung dan bot tidak diblokir.

## 14. Manajemen

Menu Manajemen digunakan oleh role tertentu seperti Ketua, Sekretaris, dan root.

Fungsi umum:

- mengatur user dan role;
- mengatur struktur organisasi;
- mengatur Telegram;
- mengelola aset;
- melakukan migrasi data histori;
- mengatur mode Jimpitan.

Gunakan menu ini dengan hati-hati karena berdampak ke akses dan data sistem.

## 15. Migrasi Data Historis

Migrasi histori digunakan untuk memasukkan data tahun sebelumnya.

Lokasi:

- Frontend: `/management/migrasi-2025`
- Backend: `/migration/*`

Scope yang tersedia:

- iuran wajib;
- internet;
- lingkungan;
- jimpitan;
- tabungan;
- sosial;
- koperasi iuran;
- koperasi loans.

Catatan: migrasi sebaiknya dilakukan oleh root/admin yang memahami data awal agar tidak dobel.

## 16. Troubleshooting

### Tombol Input Terkunci

Cek:

- apakah role user sesuai;
- apakah hari ini jadwal shift;
- apakah data sudah pernah disetor;
- apakah mode global/by name sedang mengunci input;
- apakah periode sudah benar.

### Data Tidak Muncul

Cek:

- periode bulan/tanggal;
- status approval;
- koneksi internet;
- apakah user sedang melihat modul yang benar.

### Saldo Belum Berubah

Kemungkinan transaksi masih `PENDING`. Cek menu Inbox/Approval.

### Telegram Gagal

Cek:

- akun Telegram sudah aktif;
- bot tidak diblokir;
- koneksi backend ke Telegram normal;
- token bot di environment benar.

## 17. Catatan untuk Pengurus

- Jangan membagikan PIN atau token.
- Jangan mengubah saldo langsung tanpa transaksi.
- Gunakan catatan transaksi yang jelas.
- Biasakan cek status `PENDING` dan `APPROVED`.
- Jika melaporkan bug, sertakan modul, periode, nama warga/petugas, dan screenshot.

