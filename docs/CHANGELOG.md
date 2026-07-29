# Changelog

Semua perubahan penting KasRT dicatat di file ini.

## 2026-07-29

### Diperbaiki

- Reset PIN kini memastikan kolom `users.must_change_pin` tersedia sebelum memproses permintaan.
- Reset session WA Lab dibuat lebih tahan error dengan mematikan reconnect sementara, menutup socket lama, menunggu file auth lepas, lalu menghapus auth dengan retry.
- Ambil QR WA Lab kini membangunkan socket saat state `closed` dan menunggu QR beberapa kali setelah reset session.

### Diubah

- Inbox Persetujuan memisahkan approval utama dari antrean keanggotaan agar reset PIN tidak terlihat dobel dengan request membership.
- Badge Inbox desktop/mobile kini menghitung approval utama saja, sedangkan membership tampil sebagai list berlabel per modul.

### Ditambahkan

- WA Lab menambahkan endpoint dan tombol UI untuk menghapus chat lokal serta pesan lokal tanpa menghapus chat di HP WhatsApp.
- UI hapus pesan WA Lab diubah menjadi mode seleksi ala WhatsApp Web: tahan bubble, checklist muncul, lalu hapus dari tombol di atas textbox.
- WA Lab menambahkan `Full Reset / Mulai Awal` untuk menghapus session, chat lokal, dan usage lokal saat reset biasa tidak menghasilkan QR.
- WA Lab menambahkan simulasi mengetik sebelum kirim pesan, cooldown setelah QR connect untuk reminder otomatis, dan sapaan random ringan pada reminder jimpitan.

## 2026-07-28

### Diubah

- Icon aplikasi KasRT diganti dengan visual rumah warga, tabungan koin, dan tanda cek agar lebih relevan untuk favicon/PWA.
- Area aman icon diperbesar agar tidak terpotong saat launcher HP menampilkan icon berbentuk lingkaran.
- WA Lab kini memperlakukan receipt WhatsApp tanpa status eksplisit sebagai `delivered`, sehingga pesan terkirim tampil centang dua abu-abu sebelum dibaca.
- Jumlah target WA Lab untuk reminder jimpitan kini bisa diatur lewat `WA_JIMPITAN_MAX_RECIPIENTS`, default `1` dan dibatasi maksimal `3`.
- Asset SVG template bawaan Next/Vercel yang tidak dipakai dibersihkan dari `frontend/public`.

## 2026-07-27

### Ditambahkan

- `wa-gateway` sebagai service lab terpisah untuk uji coba WhatsApp manual berbasis Baileys dan `baileys-antiban`.
- Endpoint lab untuk status, QR, kirim tes manual, dan reset session tanpa menghubungkannya ke reminder produksi.
- Mini inbox 1:1 di `wa-gateway` untuk menerima pesan masuk dan membalas manual seperti WA Web sederhana.
- UI WA Lab dirapikan seperti WA Web mini, dengan pengaturan koneksi di tombol gear, chat ke nomor baru, dan indikator centang pesan keluar.
- Balasan WhatsApp yang masuk sebagai `@lid` otomatis digabung ke chat nomor terakhir agar percakapan tidak dobel.
- Pesan incoming duplicate dari `@lid` dan `@s.whatsapp.net` dengan isi sama dan waktu berdekatan kini dideduplikasi.
- Reminder jimpitan dapat mengirim uji terbatas ke nomor valid random dari petugas shift via WA Lab jika diaktifkan lewat env backend.
- WA Lab menambahkan listener receipt untuk memperbarui status pesan keluar hingga delivered/read meski JID receipt berbeda.
- Dokumentasi `docs/WA_GATEWAY_LAB.md` agar eksperimen WA tetap terpisah dari alur Telegram/reminder utama.

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
- Card Catatan Penting di Panduan memakai warna token aplikasi agar tetap terbaca di HP light mode.

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
