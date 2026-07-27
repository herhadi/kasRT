# Changelog

Semua perubahan penting KasRT dicatat di file ini.

## 2026-07-26

### Ditambahkan

- Root `package.json` sebagai pusat script ringan untuk build/check frontend dan backend.
- Modul `/operasional/tagihan-khusus` untuk Bendahara/root membuat tagihan temporer, menunjuk PIC warga, dan memilih target warga.
- Dashboard warga menampilkan Tagihan Khusus aktif lengkap dengan PIC, periode, target, sisa, dan status.
- Notifikasi Telegram dikirim ke warga target yang sudah menghubungkan Telegram saat tagihan khusus dibuat.
- Pengaturan target Tagihan Khusus dengan filter Aktif/Nonaktif dan pagination 10 item.
- Pengaturan Warga Tagihan Khusus global untuk menentukan warga aktif/nonaktif sebelum tagihan dibuat.
- Input pembayaran Tagihan Khusus oleh PIC/Bendahara sebagai dana terkumpul yang belum masuk kas.
- Batch setoran Tagihan Khusus dengan status `PENDING` dan approval Bendahara sebelum masuk Kas Bendahara.
- Riwayat pembayaran Tagihan Khusus per tagihan, termasuk status terkumpul di PIC, menunggu approval, dan masuk kas.
- Panduan Tagihan Khusus di halaman `/panduan` dan tombol cepat dari `/operasional/tagihan-khusus`.
- Notifikasi Telegram saat pembayaran Tagihan Khusus dicatat, dikoreksi, dan saat setoran diterima Bendahara.
- Koreksi pembayaran Tagihan Khusus untuk transaksi yang masih berstatus terkumpul di PIC.

### Diubah

- Navbar desktop menempatkan Operasional tepat sebelum Manajemen.
- Urutan `/operasional` dan Panduan disamakan untuk root, dengan Tagihan Khusus ditempatkan setelah Keamanan.
- Menu `/operasional` menampilkan akses Tagihan Khusus untuk Bendahara/root.
- Bendahara/root dapat menyembunyikan tagihan khusus dari dashboard warga setelah kegiatan selesai.
- Target Tagihan Khusus otomatis mengikuti daftar warga eligible seperti iuran wajib, lalu bisa diaktifkan/nonaktifkan per tagihan.
- Target Tagihan Khusus baru otomatis mengambil warga yang aktif di Pengaturan Warga Tagihan Khusus.
- Approval Bendahara kini menampilkan dan memproses Setoran Tagihan Khusus.
- Setoran Tagihan Khusus hanya mengambil pembayaran yang belum pernah masuk batch, sehingga tidak dobel setor.
- Pembayaran Tagihan Khusus yang sudah masuk batch approval/approved dikunci dari edit langsung agar alur kas tetap aman.

### Diperbaiki

- Tipe `transaction_id` pada batch Tagihan Khusus disesuaikan ke UUID agar cocok dengan tabel `transactions` dan tidak memicu 500 saat inisialisasi tabel.

## 2026-07-24

### Diubah

- Posisi banner install PWA sekarang menyesuaikan keberadaan bottom navbar mobile.
- Saat bottom navbar tidak tampil, misalnya halaman login/ganti PIN, banner PWA kembali berada di bawah seperti footer.
- Saat bottom navbar tampil, banner PWA dinaikkan agar tidak tertutup navigasi mobile.

## 2026-07-15

### Diubah

- Rekap Share WA Jimpitan V2 menampilkan setoran `PENDING` dengan tanda bintang pada nominal.
- Format daftar Rekap Shift Jimpitan dan Rekap Jimpitan Bulanan dibuat rapi dengan backtick per baris.
- Footer Share Shift WA Jimpitan V2 menampilkan petugas pelapor dalam teks miring.
- Panduan modul dipusatkan di halaman `/panduan` dengan anchor per modul dan pencarian sederhana.

## 2026-07-13

### Ditambahkan

- Command Telegram `/cek_inet` untuk cek kewajiban iuran Internet warga.
- Command Telegram `/cek_lingk` untuk cek kewajiban iuran Lingkungan warga.
- Dokumentasi command Telegram di `README.md`.

### Diubah

- `/help` Telegram sekarang menampilkan command Internet dan Lingkungan sebagai fitur aktif.

### Dihapus

- Alias `/cek_ling` tidak dipakai; command resmi Lingkungan adalah `/cek_lingk`.
