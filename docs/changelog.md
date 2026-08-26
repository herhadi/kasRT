# Changelog

Semua perubahan penting KasRT dicatat di file ini.

## 2026-08-22

### Ditambahkan

- WA Gateway kini memasang `link-preview-js` dan mengaktifkan high-quality link preview Baileys agar URL pada reminder menampilkan judul, deskripsi, dan thumbnail di perangkat penerima.
- Root layout frontend menyediakan metadata Open Graph dan Twitter Card untuk URL KasRT, dengan base URL dari `NEXT_PUBLIC_APP_URL` atau fallback `https://kas02.vercel.app`.
- Kartu approval responsif global ditambahkan untuk menampilkan judul, tanggal operasional, pembuat/petugas, detail, tanggal pengajuan, nominal, dan aksi secara utuh di mobile maupun desktop.
- `/management` menampilkan audit 30 login berhasil terbaru khusus root dengan pagination global 10 item, urutan terbaru, tanggal dan waktu WIB hingga detik, user/role, perangkat, browser, sistem operasi, IP jaringan, negara proxy, zona waktu, bahasa, origin, host, referer, dan user agent lengkap.
- Backend menyimpan setiap login berhasil ke `login_audit_logs`; PIN tidak pernah disimpan dalam audit dan histori tetap tersedia jika akun pengguna kemudian dihapus.

### Diubah

- Approval Setoran Jimpitan tidak lagi menyatukan tanggal dan nama petugas dalam judul panjang; informasi tersebut disajikan sebagai metadata terpisah agar tidak terpotong pada layar kecil.
- Halaman Approval utama dan Approval Bendahara memakai komponen kartu approval global yang sama agar modul approval berikutnya memiliki pola tampilan konsisten.
- Kartu Login Terakhir lama di `/management/struktur` dihapus; pemantauan login dipusatkan di audit lengkap `/management`, sedangkan halaman Struktur kembali fokus pada warga, role, dan organisasi.
- Detail teknis setiap audit login di `/management` dibuat collapse secara default melalui toggle inline di bawah waktu login, tanpa subcard; identitas dan waktu tetap terlihat agar daftar ringkas di mobile maupun desktop.
- Detail audit login mengganti Host Backend dan Referer dengan model perangkat serta detail platform (versi, arsitektur, dan bitness) dari User-Agent Client Hints jika didukung browser.
- Urutan detail audit login dikelompokkan menjadi perangkat, software/platform, lokal browser, lalu jaringan agar alur informasinya konsisten pada tampilan mobile dan desktop.
- WA Gateway kini membentuk payload `linkPreview` secara eksplisit sebelum melewati wrapper anti-ban dan menampilkan diagnostic URL, judul, ukuran thumbnail, serta error preview terakhir di `/status`.
- WA Gateway menjadikan `sharp` sebagai dependensi production eksplisit agar gambar Open Graph dapat dikonversi menjadi thumbnail JPEG; diagnostic preview kini juga menjelaskan saat `og:image` tidak tersedia atau konversinya gagal.
- Mini inbox WA Gateway kini menampilkan kartu link preview pada bubble pesan dengan thumbnail, judul, deskripsi, dan domain serta menyimpan preview untuk pesan keluar dan masuk.
- WA Gateway memiliki ikon layanan khusus berupa rumah lingkungan, gelembung percakapan, cek, dan sinyal notifikasi; ikon digunakan pada favicon serta header mini inbox.
- Membuka `/status` langsung dari browser kini menampilkan halaman diagnostic yang memakai secret tersimpan pada mini inbox; API JSON `/status` tetap dilindungi header secret.
- Sapaan reminder WA Jimpitan kini diacak tanpa pengulangan dalam satu eksekusi, sehingga dua nomor penerima tidak lagi menerima sapaan yang sama.
- Navbar dashboard kini menampilkan ikon KasRT di sebelah kiri judul dan subjudul agar identitas aplikasi lebih mudah dikenali.
- Ikon navbar KasRT dipotong lebih fokus dan diberi border warna aksen agar konten serta tepinya tetap terlihat pada light maupun dark mode.
- Workflow VPS otomatis mendeteksi perubahan `wa-gateway/**` atau `docker-compose.vps.yml`, lalu rebuild/recreate dan health-check `kasrt-wa-lab`; workflow manual menyediakan opsi force deploy tanpa menghapus volume session/data WA.

### Keamanan

- `link-preview-js` menggunakan versi `4.0.4` yang sudah memperbaiki celah SSRF pada versi lama; audit dependensi WA Gateway tidak menemukan vulnerability.
- Konfigurasi npm WA Gateway menerima peer override versi aman tersebut karena deklarasi peer Baileys 6.7.24 masih membatasi versi 3.x; Dockerfile menyalin `.npmrc` agar clean install tetap konsisten.

## 2026-07-31

### Diubah

- Aturan arsitektur modul independen dan hubungan terbatas dengan Bendahara dicatat di `docs/project_rules.md`.
- Alur pencairan Tabungan ditambahkan: pengajuan warga, inbox Admin Pembangunan, approval/reject, pembayaran `PAID`, ledger `WITHDRAW`, dan notifikasi detail saldo.
- Detail Tabungan warga dipindahkan dari modal dashboard ke halaman `/tabungan/detail`; form pengajuan penarikan kini berbentuk modal di halaman detail.
- Docker Compose VPS menambahkan rotasi log JSON untuk backend dan WA Lab: maksimal 10 MB per file dengan 3 file rotasi.
- Masa berlaku session login JWT KasRT diubah dari 1 hari menjadi default 1 minggu (`7d`) dan dapat dikonfigurasi melalui `JWT_EXPIRES_IN`.
- Urutan top navbar desktop diseragamkan menjadi Dashboard, Operasional, Jimpitan, Panduan, Inbox, lalu Manajemen.
- Halaman Tabungan mengganti tombol Panduan menjadi Pencairan, membuat saldo awal migrasi collapse secara default, dan menambahkan histori/input sisa kegiatan pembangunan per tahun beserta nama kegiatan.
- Presensi rapat kini memakai daftar eligible user global sebagai dasar, lalu menyediakan halaman pengaturan pengecualian khusus presensi; warga yang dikecualikan tidak masuk input, jumlah wajib hadir, atau rekap.
- Card Presensi di halaman Operasional Sekretaris kini memiliki tombol Pengaturan Presensi dengan ikon roda gigi.
- WA Lab menyimpan waktu pertama nomor tertaut secara persisten agar restart/redeploy tidak mengulang cooldown umur koneksi 180 menit; pergantian nomor tetap memulai cooldown baru.
- WA Gateway meng-upgrade `baileys` ke versi stabil `6.7.24`; `baileys-antiban` tetap pada `4.10.0`.

## 2026-07-29

### Diperbaiki

- WA Lab direfactor agar seluruh kirim manual, balasan, chat baru, dan reminder hanya melewati socket `baileys-antiban`; jalur raw/bypass dihapus.
- Delay anti-ban diselaraskan dengan timeout backend agar request reminder tidak berhenti lebih dulu sebelum pesan dikirim.
- State warm-up dan daftar chat dikenal dari `baileys-antiban` disimpan di `data/antiban-state.json` agar tidak kembali nol setiap container restart.
- WA Lab meresolve target kirim lewat `onWhatsApp`; pengiriman default memakai JID nomor telepon, sedangkan LID hanya aktif bila dikonfigurasi dan sudah terbukti stabil.
- WA Lab mengirim indikator mengetik ke target final yang sama dengan pesan, melakukan `presenceSubscribe` sebelum typing, dan menampilkan diagnostics typing terakhir.
- Kartu ringkasan Inbox Tindakan dan tombol refresh khusus dihapus agar Inbox langsung fokus pada daftar tindakan.
- Kartu Approval dan Permintaan Reset PIN tetap terlihat meskipun antreannya kosong, sehingga struktur Inbox tidak membingungkan.
- PIN sementara pada reset PIN dan notifikasi Telegram kini mengikuti `DEFAULT_USER_PIN` dari environment.
- Reset PIN kini memastikan kolom `users.must_change_pin` tersedia sebelum memproses permintaan.
- Reset session WA Lab dibuat lebih tahan error dengan mematikan reconnect sementara, menutup socket lama, menunggu file auth lepas, lalu menghapus auth dengan retry.
- Ambil QR WA Lab kini membangunkan socket saat state `closed` dan menunggu QR beberapa kali setelah reset session.

### Diubah

- Simulasi mengetik WA Lab kini memakai `PresenceChoreographer` dari `baileys-antiban`, bukan perhitungan delay buatan gateway.
- Status WA Lab menampilkan anti-ban aktif, statistik pengiriman, statistik presence, detail PN/LID target, serta transport terakhir `baileys-antiban`.
- Endpoint trace raw sementara dan diagnostics request HTTP dihapus agar semua pengiriman melewati satu jalur yang sama dan respons status tetap ringkas.
- Diagnostics inbox WA Lab kini membedakan nomor akun tertaut dan lawan chat untuk pesan keluar, sehingga arah pesan saat trace tidak ambigu.
- Dokumentasi menjelaskan bahwa Jimpitan V1 memakai input per warga dan memengaruhi status/tunggakan warga, sedangkan Jimpitan V2 memakai setoran shift atau histori by name tanpa menghitung tunggakan warga di Dashboard.
- Inbox admin mengelompokkan approval transaksi, memisahkan reset PIN, lalu menampilkan antrean keanggotaan dan riwayat secara berurutan.
- Inbox Persetujuan memisahkan approval utama dari antrean keanggotaan agar reset PIN tidak terlihat dobel dengan request membership.
- Badge Inbox desktop/mobile kini menghitung approval utama saja, sedangkan membership tampil sebagai list berlabel per modul.

### Ditambahkan

- WA Lab menormalkan chat incoming `@lid` ke nomor `@s.whatsapp.net` jika metadata `senderPn` tersedia agar balasan dikirim ke tujuan yang benar.
- Input Global Jimpitan Admin tetap berada di Pengaturan Jimpitan agar halaman utama tetap ringkas; rekap setor ke Bendahara mengikuti tanggal operasional yang dipilih.
- WA Lab menambahkan endpoint dan tombol UI untuk menghapus chat lokal serta pesan lokal tanpa menghapus chat di HP WhatsApp.
- UI hapus pesan WA Lab diubah menjadi mode seleksi ala WhatsApp Web: tahan bubble, checklist muncul, lalu hapus dari tombol di atas textbox.
- WA Lab menambahkan `Full Reset / Mulai Awal` untuk menghapus session, chat lokal, dan usage lokal saat reset biasa tidak menghasilkan QR.
- WA Lab menambahkan simulasi mengetik sebelum kirim pesan, cooldown setelah QR connect untuk reminder otomatis, dan sapaan random ringan pada reminder jimpitan.

## 2026-07-28

### Diubah

- Icon aplikasi KasRT diganti dengan visual rumah warga, tabungan koin, dan tanda cek agar lebih relevan untuk favicon/PWA.
- Area aman icon diperbesar agar tidak terpotong saat launcher HP menampilkan icon berbentuk lingkaran.
- WA Lab kini memperlakukan receipt WhatsApp tanpa status eksplisit sebagai `delivered`, sehingga pesan terkirim tampil centang dua abu-abu sebelum dibaca.
- Jumlah target WA Lab untuk reminder jimpitan kini bisa diatur lewat `WA_JIMPITAN_MAX_RECIPIENTS`, dengan contoh operasional `2`, fallback `1`, dan batas maksimal `3`.
- Contoh dan dokumentasi `WA_JIMPITAN_REMINDER_ENABLED` serta `WA_JIMPITAN_MAX_RECIPIENTS` kini ditempatkan pada konfigurasi backend KasRT agar tidak disalahartikan sebagai env milik WA Gateway.
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
- PIN baru saat login pertama kali dan perubahan PIN kini wajib 6 digit angka; informasi batas minimal ditampilkan pada form ganti PIN.
- Tabungan: histori sisa kegiatan tahunan kini default tidak menambah kas; tersedia checklist opsional untuk memasukkannya ke kas total saat ini.
- Tabungan: input histori selalu default tidak masuk kas; admin menentukan per baris melalui checklist histori.
- Tabungan: kolom keterangan di riwayat setoran dihapus; pada saldo awal migrasi dipindahkan ke kolom paling kanan.
- Internet: tombol Panduan dihapus; status iuran warga dibuat ringkas menjadi satu kolom status dan default tertutup.
- Internet: status ringkas membedakan kondisi Menunggak, Surplus, dan Lunas.
- Internet: status iuran ditampilkan dalam tiga kolom; Lunas hijau, Surplus biru/teal, dan Menunggak merah.
- Internet: kolom nominal status iuran diganti menjadi Nominal Setor dan menampilkan total setoran aktual.
- Internet: untuk status Menunggak, Nominal Setor menampilkan total tunggakan sampai bulan berjalan.
- Internet: tombol Panduan dihapus dan kolom Periode pada riwayat Pengeluaran Internet dihapus.
- Lingkungan: tombol Panduan dihapus; Status Iuran Warga default tertutup dan kolom Bayar/Target diganti menjadi Nominal Setor.
- WA Jimpitan: penerima random kini memakai rotasi persisten; nomor yang sudah berhasil dikirimi ditandai dan nomor valid lain diprioritaskan sampai seluruh kandidat mendapat giliran.
- Jimpitan: judul approval setoran dibuat lebih ramah pengguna dengan format hari, tanggal, dan nama petugas; UUID tidak lagi ditampilkan pada judul/deskripsi utama.
- Perbaikan approval: formatter tanggal setoran Jimpitan dibuat aman terhadap format DATE PostgreSQL agar endpoint `/approval/pending` tidak gagal 500.
- Frontend: ditambahkan aturan global `page-container` selebar Navbar (`max-w-6xl`) agar card halaman utama sejajar di desktop, termasuk Jimpitan, Operasional, dan Approval.
