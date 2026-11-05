# Dokumentasi Operasional Jimpitan

Dokumen ini menjelaskan perilaku modul Jimpitan berdasarkan implementasi pada branch `main`. Panduan langkah pengguna tersedia di `docs/manual_guide.md`; catatan perubahan kronologis berada di `docs/changelog.md`.

## Mode Operasional

Jimpitan mendukung dua mode yang dipilih berdasarkan konfigurasi mode efektif pada tanggal operasional.

### V1 — Per Warga

- Petugas mencatat nominal untuk warga/donatur satu per satu.
- Catatan V1 menjadi dasar status setoran warga dan ringkasan kewajiban sesuai periode.
- Petugas mengajukan batch setoran; batch berstatus `PENDING` sampai disetujui Admin Jimpitan/root.
- Setoran yang disetujui menjadi mutasi kas final.

### V2 — Setor Shift

V2 menyediakan dua cara pencatatan untuk satu tanggal operasional:

- **Global**: mencatat total pemasukan shift.
- **By Name**: menyimpan histori nominal berdasarkan warga/donatur.

Satu tanggal operasional hanya boleh menggunakan salah satu cara tersebut. Data V2 tidak dihitung sebagai tunggakan per warga pada Dashboard. Admin dapat mencatat pemasukan susulan/harian, pemasukan bulanan, dan serah-terima kas lama sesuai menu yang tersedia.

## Buku Kas Jimpitan

Endpoint buku kas tersedia pada `GET /jimpitan/cash-ledger` dan dapat diakses oleh Admin Jimpitan, Bendahara, Ketua, Sekretaris, serta root.

Buku kas tahunan menampilkan:
- saldo awal tahun;
- total pemasukan;
- total pengeluaran;
- saldo akhir;
- daftar mutasi untuk tahun yang dipilih.

Mutasi yang belum final/approved tidak boleh diperlakukan sebagai saldo kas final. Saldo Jimpitan yang masih dititipkan pada Admin Jimpitan juga tidak otomatis menjadi Kas Umum Bendahara. Serah-terima ke Bendahara memiliki proses pengajuan dan persetujuan tersendiri.

### Pencatatan Pengeluaran

Admin Jimpitan/root dapat mencatat pengeluaran melalui `POST /jimpitan/cash-expense` dengan tanggal pengeluaran, nominal, dan keterangan. Pengeluaran menjadi bagian dari buku kas sesuai status mutasi yang dihasilkan backend. Keterangan perlu ditulis jelas agar dapat dipahami pada laporan.

### Preview dan Ekspor

Standar ekspor buku kas adalah **Preview sebelum Unduh**.

1. Pilih tahun buku kas.
2. Tekan **Preview Excel**.
3. Periksa tampilan laporan pada lembar kertas A4 landscape.
4. Ringkasan menampilkan saldo awal, pemasukan, pengeluaran, dan saldo akhir.
5. Tabel menampilkan ringkasan bulanan dan rincian pengeluaran.
6. **Cetak** membuka dialog cetak browser. **Unduh Excel (.xlsx)** membuat file spreadsheet.
7. Tutup preview jika belum ingin mencetak atau mengunduh.

Pratinjau bukan file Excel; file hanya dibuat saat pengguna memilih tombol unduh. Perubahan format/kolom pada preview harus diselaraskan dengan file ekspor.

## Setor ke Bendahara

Admin Jimpitan/root dapat mengajukan serah-terima kas ke Bendahara. Pengajuan tidak langsung menambah Kas Umum. Bendahara/root melakukan persetujuan setelah uang fisik diterima. Status dan riwayat pengajuan dapat diperiksa dari halaman operasional.

## Notifikasi WhatsApp Grup

Notifikasi grup setelah transaksi Jimpitan disimpan melalui antrean outbox persisten agar proses kirim gateway tidak menahan respons penyimpanan transaksi.

Tabel antrean: `jimpitan_group_notification_outbox`.

Status penting:
- `PENDING`: menunggu worker.
- `PROCESSING`: sedang diproses.
- `SENT`: pengiriman terkonfirmasi.
- `FAILED`: gagal dengan hasil jelas.
- `UNCERTAIN`: hasil tidak diketahui; tidak boleh otomatis dikirim ulang karena dapat menyebabkan pesan ganda.
- `SKIPPED`: dilewati sesuai kondisi worker/konfigurasi.

State pesan grup per tanggal operasional disimpan di `jimpitan_group_message_state` untuk membantu pembaruan pesan grup.

## Rekap Bulanan Grup

Rekap bulanan menggunakan context `monthly-close` pada outbox dan memiliki batas unik per periode bulan. Pengaturan aktif/nonaktif dan jam kirim disimpan pada app setting `jimpitan_monthly_close` dengan default aktif pada pukul `08:00` (waktu operasional deployment).

Root dapat mengirim rekap untuk bulan yang sudah berlalu melalui endpoint `POST /jimpitan/monthly-close/send-manual` dengan `month_key` format `YYYY-MM`. Endpoint menolak periode bulan berjalan atau masa depan. Jika periode sudah `SENT`, sistem tidak mengirim ulang. Status `PROCESSING` atau `UNCERTAIN` menghasilkan konflik agar operator memeriksa grup terlebih dahulu. Job `FAILED` dapat dimasukkan kembali ke antrean.

Pengaturan:
- `GET /jimpitan/monthly-close-settings`
- `PUT /jimpitan/monthly-close-settings`

## Reminder Petugas

Endpoint reminder:
- `POST /jimpitan/send-shift-reminder` untuk pemanggilan scheduler.
- `POST /jimpitan/send-shift-reminder/manual` untuk pemicu manual root.

Reminder menggunakan zona waktu operasional Asia/Jakarta. Tanggal operasional memiliki aturan tersendiri: sebelum pukul 12.00 WIB, sistem masih menganggap periode operasional hari sebelumnya. Pesan mengingatkan jadwal ronda/jimpitan dan rentang input 21.00–06.00 WIB.

Telegram dan WhatsApp adalah kanal terpisah. Pengaturan WA reminder/grup dikelola dari Management, sedangkan gateway WA berjalan sebagai service terpisah. Status timeout yang belum terkonfirmasi tidak sama dengan gagal pasti dan tidak boleh otomatis di-retry jika ada risiko pesan ganda.

Jangan menuliskan jadwal cron yang dianggap permanen di dokumentasi tanpa memeriksa scheduler yang benar-benar aktif di deployment. File `frontend/vercel.json` saat ini hanya berisi pengaturan region, bukan jadwal cron.

## Endpoint Operasional Lain

Route Jimpitan yang tersedia antara lain:
- `GET /jimpitan/mode` dan `POST /jimpitan/mode` (perubahan mode khusus root);
- `GET /jimpitan/list`, `GET /jimpitan/schedule`, dan `GET /jimpitan/daily-recap`;
- `POST /jimpitan/input`, `POST /jimpitan/input-v2-detail`, `POST /jimpitan/setor`, `POST /jimpitan/setor-shift-total`;
- `POST /jimpitan/approve`;
- `GET /jimpitan/v2-entries`;
- `POST /jimpitan/v2-income`, `POST /jimpitan/v2-monthly-income`, `POST /jimpitan/old-cash-handover`;
- `GET /jimpitan/topups`, `POST /jimpitan/topup`;
- `GET /jimpitan/external-participants`, `POST /jimpitan/external-participants`, dan endpoint status peserta;
- `POST /jimpitan/ajukan-setor-bendahara` dan `POST /jimpitan/approve-setor-bendahara`.

Role dan validasi setiap route tetap mengikuti middleware pada `backend/routes/jimpitan.js`. Daftar di atas merupakan ringkasan route, bukan pengganti pemeriksaan kode saat mengubah API.

## Checklist Perubahan Modul

Setiap perubahan Jimpitan perlu diperiksa terhadap dokumen berikut:
- `docs/jimpitan.md`: aturan dan alur modul;
- `docs/manual_guide.md`: langkah penggunaan oleh pengurus/warga;
- `docs/changelog.md`: catatan perubahan;
- `docs/project_rules.md`: bila perubahan menyentuh arsitektur lintas modul atau standar global.
