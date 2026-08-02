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
