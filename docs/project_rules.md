# Aturan Arsitektur Project KasRT

Dokumen ini menjadi acuan agar perubahan modul tidak mencampurkan alur yang
memang berdiri sendiri.

## Kemandirian Modul

Modul berikut berjalan sebagai modul operasional independen:

- Tabungan
- Internet
- Lingkungan
- Koperasi
- Iuran wajib
- Pembangunan
- Keamanan
- Jimpitan operasional, kecuali alur kas yang secara khusus ditentukan di bawah

Modul independen menyimpan ledger, saldo, anggota, dan prosesnya sendiri sesuai
kebutuhan modul. Transaksi pada modul tersebut tidak otomatis menjadi transaksi
Bendahara.

## Hubungan dengan Bendahara

Hubungan lintas modul yang diakui hanya:

- Bendahara
- Jimpitan
- Sosial

Perubahan saldo atau kas dalam hubungan tersebut tetap harus mengikuti transaksi
dan state approval yang berlaku. Jangan membuat modul independen masuk ke alur
Bendahara hanya karena modul tersebut memiliki saldo atau transaksi keuangan.

## Tabungan

Tabungan adalah modul independen. Setoran, saldo warga, potongan kegiatan, dan
penarikan tabungan harus dicatat pada ledger Tabungan sendiri. Penarikan tabungan
warga bukan transaksi Bendahara kecuali aturan project diubah secara eksplisit.

### Alur Penarikan Tabungan

- Warga mengajukan permintaan penarikan.
- Permintaan masuk ke Inbox Admin Pembangunan.
- Admin Pembangunan memeriksa saldo dan nominal pengajuan.
- Status pencairan menggunakan alur `PENDING -> APPROVED -> PAID` atau
  `PENDING -> REJECTED`.
- Saldo warga baru berkurang ketika uang benar-benar diserahkan dan status menjadi
  `PAID`.
- Approval atau penolakan wajib mengirim notifikasi kepada warga.
- Notifikasi wajib menyertakan minimal:
  - saldo tersedia;
  - nominal penarikan yang diajukan;
  - status approval/penolakan;
  - alasan penolakan jika ditolak.
- Contoh penolakan karena saldo tidak cukup: `Pengajuan penarikan Rp50.000
  ditolak. Saldo tersedia Rp30.000.`
- UI pengajuan warga tersedia di `/tabungan/penarikan`; Inbox pencairan Admin
  Pembangunan tersedia di `/operasional/tabungan/penarikan`.

## Internet dan Modul Operasional Lain

Internet dan modul operasional lain juga independen. Status anggota, transaksi,
saldo, dan laporan modul dikelola oleh modul masing-masing. Status aktif/nonaktif
atau pengecualian pada satu modul tidak boleh mengubah keanggotaan modul lain
secara otomatis.

## Aturan Implementasi

- Jangan menghubungkan endpoint, tabel, atau approval antar-modul tanpa dasar
  aturan project ini.
- Jika sebuah modul membutuhkan transaksi pencairan atau pengeluaran, catat pada
  ledger modul tersebut terlebih dahulu.
- Dokumentasikan setiap pengecualian arsitektur baru di file ini dan changelog.

## Session Login

Session login KasRT menggunakan JWT dengan masa berlaku default 1 minggu (`7d`).
Masa berlaku dapat diubah melalui `JWT_EXPIRES_IN` pada environment backend.

Setiap login berhasil dicatat pada `login_audit_logs` untuk audit root. Audit
menyimpan snapshot user/role, waktu login, IP dan header jaringan, perangkat,
browser, sistem operasi, serta konteks browser non-sensitif. PIN dan token JWT
tidak boleh disimpan. UI `/management` hanya mengambil 30 kejadian terbaru dan
menampilkannya 10 item per halaman, terbaru lebih dulu. Informasi negara bersifat
best effort dari header proxy dan bukan lokasi GPS pengguna. Model perangkat,
versi platform, arsitektur, dan bitness juga best effort dari Client Hints;
browser tertentu, terutama Safari/iPhone, dapat tidak memberikannya.


## Standar Dokumentasi dan Ekspor

- Setiap perubahan fitur, perbaikan bug yang memengaruhi perilaku, alur operasional, API, database, scheduler, worker, konfigurasi, atau UI yang mengubah cara penggunaan wajib memperbarui dokumentasi di folder `docs/`.
- Perbarui file yang paling relevan terlebih dahulu: manual pengguna untuk langkah penggunaan, dokumen modul untuk aturan/alur bisnis, dokumen teknis untuk API/infrastruktur, dan `docs/changelog.md` untuk catatan perubahan kronologis.
- Fitur baru yang belum memiliki dokumen modul harus dibuatkan dokumen yang sesuai. Jangan menumpuk seluruh detail operasional hanya di changelog.
- Dokumentasi harus mencerminkan implementasi yang benar-benar ada pada branch `main`; jangan mendokumentasikan rencana sebagai fitur aktif.
- Setiap fitur ekspor spreadsheet menggunakan pola **Preview sebelum Unduh**: pengguna dapat memeriksa periode, ringkasan, isi, dan total sebelum file dibuat.
- Preview ekspor harus menyerupai hasil dokumen akhir (print view/kertas jika sesuai), dan isi preview harus konsisten dengan isi file yang diunduh.
- Perubahan kode dan dokumentasi terkait dikirim dalam rangkaian commit yang sama atau commit berurutan yang saling merujuk.
