# WA Gateway Lab

Service ini adalah gateway mandiri berbasis Baileys dan `baileys-antiban` untuk percakapan manual 1:1 serta uji terbatas reminder jimpitan.

> Catatan penting: library WhatsApp tidak resmi tetap memiliki risiko pembatasan akun. Gunakan nomor cadangan dan pertahankan batas penerima yang kecil.

## Tujuan

- Menguji koneksi WhatsApp dari service terpisah.
- Melihat QR login dan nomor yang tertaut.
- Mengirim pesan tes manual dengan limit kecil.
- Menguji reset session saat ingin mengganti nomor.

## Prinsip Aman

- Pakai nomor cadangan, bukan nomor utama.
- Kirim manual dulu, maksimal 1-3 nomor unik per hari.
- Hindari broadcast, pesan identik, dan pengiriman beruntun.
- Utamakan Telegram/dashboard untuk notifikasi operasional rutin.
- Jangan expose service tanpa Cloudflare Access atau firewall.

## Setup Lokal

```bash
cd wa-gateway
cp .env.example .env
npm install
npm start
```

Isi minimal `.env`:

```dotenv
PORT=3010
WA_LAB_SECRET=isi_secret_panjang
WA_AUTH_DIR=./auth
WA_DATA_DIR=./data
WA_LAB_DAILY_UNIQUE_LIMIT=3
WA_LAB_PREFER_LID_SEND=false
TZ=Asia/Jakarta
```

Konfigurasi anti-ban, minimal panjang pesan, typing, logging, dan lokasi state memakai default aman dari kode. Nilai override tersedia pada bagian eksperimen di `.env.example`; gunakan nilai konservatif selama pengujian.

Semua jalur kirim memakai socket yang dibungkus `baileys-antiban`. Sebelum kirim ke nomor `@s.whatsapp.net`, gateway memanggil `onWhatsApp`, tetapi secara default tetap mengirim ke JID nomor telepon (`WA_LAB_PREFER_LID_SEND=false`). Aktifkan LID hanya bila sudah terbukti stabil untuk nomor terkait. Opsi lama `WA_LAB_DISABLE_ANTIBAN` dan `WA_LAB_MANUAL_DIRECT_SEND` sudah tidak dipakai. Nilai delay 90–300 detik juga harus diganti karena backend reminder memiliki timeout 30 detik.

Pesan teks yang memuat URL akan dibuatkan link preview oleh Baileys memakai
`link-preview-js`. Gateway mengaktifkan high-quality preview agar thumbnail ikut
diunggah ke WhatsApp dan lebih konsisten tampil di perangkat penerima. Halaman
tujuan harus bisa diakses publik melalui HTTPS dan menyediakan metadata Open
Graph minimal `og:title`, `og:description`, dan `og:image`. Frontend KasRT sudah
menyediakan metadata tersebut dari root layout; `NEXT_PUBLIC_APP_URL` dapat
diisi jika domain produksinya bukan `https://kas02.vercel.app`.

Jika pesan tetap hanya menampilkan URL, periksa log gateway untuk kegagalan
mengambil metadata/gambar, pastikan `og:image` dapat diakses tanpa autentikasi,
dan pastikan deploy gateway memasang dependensi sesuai `package-lock.json`.
Gateway membentuk `linkPreview` secara eksplisit sebelum pesan masuk ke wrapper
anti-ban, sehingga pengiriman tidak bergantung pada generator implisit
`sendMessage`. Endpoint `/status` menyediakan diagnostic
`last_link_preview_url`, `last_link_preview_title`,
`last_link_preview_thumbnail_bytes`, dan `last_link_preview_error`. Nilai byte
thumbnail harus lebih dari `0` agar gambar benar-benar ikut dalam payload.
File `wa-gateway/.npmrc` mengaktifkan `legacy-peer-deps` karena Baileys 6.7.24
masih mendeklarasikan peer `link-preview-js` 3.x, sedangkan gateway memakai
4.0.4 yang kompatibel dengan API generator Baileys dan sudah memperbaiki celah
SSRF versi lama. Dockerfile wajib ikut menyalin `.npmrc` sebelum `npm install`.

## Setup Docker

```bash
cd /srv/kasrt/app
docker compose -f docker-compose.vps.yml up -d --build kasrt-wa-lab
docker logs -f kasrt-wa-lab
```

Service bind ke `127.0.0.1:3010` agar tidak terbuka langsung ke publik.

## Endpoint

UI mini inbox tersedia di root service:

```bash
open http://127.0.0.1:3010/
```

Masukkan `WA_LAB_SECRET` pada field secret, lalu:

1. Klik tombol gear `⚙` untuk membuka pengaturan.
2. Klik `Cek Koneksi` untuk melihat status tertaut.
3. Klik `Ambil QR` jika belum connected.
4. Scan QR dari WhatsApp → Perangkat tertaut → Tautkan perangkat.
5. Setelah connected, tunggu chat 1:1 masuk dari WhatsApp.
6. Jika salah nomor, klik `Reset Session / Ganti Nomor`, lalu scan QR baru.
7. Jika reset biasa membandel, klik `Full Reset / Mulai Awal` untuk menghapus session, chat lokal, dan usage lokal, lalu scan QR baru.
8. Untuk kirim ke nomor tertentu, isi nomor pada field `Nomor WA baru`, klik `Chat`, tulis pesan pertama, lalu `Kirim`.
9. Gunakan tombol `Hapus Chat` untuk menghapus riwayat chat lokal WA Lab.
10. Untuk hapus pesan lokal, tahan lama bubble pesan sampai checklist muncul, pilih pesan, lalu klik tombol `Hapus` di atas textbox.

Semua endpoint API selain `/health` wajib memakai header secret:

```bash
-H "x-wa-lab-secret: isi_secret_panjang"
```

Alternatif header lama juga diterima:

```bash
-H "x-wa-gateway-secret: isi_secret_panjang"
```

### Health

```bash
curl -sS http://127.0.0.1:3010/health
```

### Status

```bash
curl -sS \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  http://127.0.0.1:3010/status
```

Status menampilkan state koneksi, nomor tertaut, limit harian, statistik anti-ban, presence, delivery receipt, serta detail target kirim terakhir. Nilai `last_outgoing_transport` harus `baileys-antiban`. Untuk trace PN/LID, cek `last_outgoing_requested_jid`, `last_outgoing_resolved_jid`, `last_outgoing_resolved_lid`, dan `last_outgoing_jid`.

### QR Login

```bash
curl -sS \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  http://127.0.0.1:3010/qr
```

Gunakan nilai `qr_data_url` untuk membuka QR di browser, lalu scan dari WhatsApp. Mini inbox memperbarui QR otomatis setiap 5 detik selama panel QR terbuka, sehingga QR terbaru akan tampil ketika Baileys menerbitkan QR pengganti yang lama.

Reminder WA Jimpitan memilih penerima secara acak dari nomor valid yang belum berhasil dikirimi pada siklus berjalan. Setelah seluruh kandidat mendapat giliran, rotasi dimulai kembali.

### Kirim Tes Manual

```bash
curl -sS -X POST http://127.0.0.1:3010/send-test \
  -H "content-type: application/json" \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  -d '{"phone":"6281234567890","text":"Halo, ini tes manual KasRT WA Lab."}'
```

### Hapus Chat/Pesan Lokal

```bash
curl -sS -X DELETE \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  "http://127.0.0.1:3010/chats/6281234567890%40s.whatsapp.net"

curl -sS -X DELETE \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  "http://127.0.0.1:3010/chats/6281234567890%40s.whatsapp.net/messages/ID_PESAN"
```

Hapus chat/pesan hanya membersihkan data lokal WA Lab di `wa-gateway/data/chats.json`; chat di aplikasi WhatsApp HP tidak ikut dihapus.

### Full Reset

```bash
curl -sS -X POST http://127.0.0.1:3010/session/full-reset \
  -H "content-type: application/json" \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  -d '{"confirm":"FULL_RESET"}'
```

Full reset menghapus session auth, chat lokal, usage lokal, dan state warm-up
`wa-gateway/data/antiban-state.json`. Setelah itu akun dimulai dari warm-up day 1.
Penghapusan state dilakukan sebelum session baru dibuat agar `baileys-antiban`
tidak memuat snapshot lama.

Full reset tidak menghapus batas warm-up. Dengan `WA_ANTIBAN_PRESET=conservative`,
batas hari pertama tetap `15` pesan; reset hanya mengembalikan hitungan menjadi
`0/15`. Gunakan preset/config antiban yang sesuai bila membutuhkan batas berbeda.

Gunakan hanya saat memang ingin mulai ulang akun/session. Untuk sekadar mengganti
nomor tanpa menghapus chat, usage, dan state warm-up, gunakan reset session biasa.

Limit nomor unik harian dikontrol oleh `WA_LAB_DAILY_UNIQUE_LIMIT`.

### Mini Inbox 1:1

```bash
curl -sS \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  http://127.0.0.1:3010/chats
```

Balasan hanya bisa dikirim ke chat 1:1 yang sudah pernah mengirim pesan masuk.
Pada WhatsApp baru, chat masuk bisa muncul sebagai `@lid`, bukan `@s.whatsapp.net`; pakai `jid` persis dari endpoint `/chats`.
Gateway akan mencoba menggabungkan balasan `@lid` ke chat nomor yang baru dikirimi pesan dalam 10 menit terakhir jika kandidatnya hanya satu. Jika pesan incoming yang sama muncul di chat `@lid` dan `@s.whatsapp.net` dalam 2 menit, gateway menganggapnya duplicate dan menyimpan satu percakapan saja. Jika ada beberapa kandidat, chat dibiarkan terpisah agar tidak salah gabung.
Status centang pesan keluar diperbarui dari event `messages.update` dan `message-receipt.update`; jika WhatsApp/Baileys tidak mengirim receipt, centang tetap best effort.

```bash
curl -sS -X POST "http://127.0.0.1:3010/chats/6281234567890%40s.whatsapp.net/reply" \
  -H "content-type: application/json" \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  -d '{"text":"Baik, pesan sudah diterima."}'
```

Mulai chat ke nomor tertentu:

```bash
curl -sS -X POST http://127.0.0.1:3010/chats/start \
  -H "content-type: application/json" \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  -d '{"phone":"6281234567890","text":"Halo, ini pesan pertama dari KasRT WA Lab."}'
```

### Ganti Nomor

```bash
curl -sS -X POST http://127.0.0.1:3010/session/reset \
  -H "content-type: application/json" \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  -d '{"confirm":"RESET"}'
```

Setelah reset, ambil QR baru dari `/qr`. Reset session biasa hanya menghapus
session auth dan tidak mereset usage, chat lokal, atau state warm-up.

## Deploy via Cloudflare Tunnel

Tambahkan ingress baru hanya jika service perlu diakses dari UI/admin. Karena `cloudflared` berjalan sebagai service systemd, edit config aktif di `/etc/cloudflared/config.yml`, bukan `~/.cloudflared/config.yml`.

```yaml
- hostname: wa-lab-kasrt.tripleatech.my.id
  service: http://localhost:3010
```

Untuk hostname produksi lab yang dipakai sekarang, gunakan:

```yaml
- hostname: wa-kasrt.tripleatech.my.id
  service: http://localhost:3010
```

Tambahkan sebelum rule akhir `http_status:404`, lalu buat DNS route tunnel:

```bash
cloudflared tunnel route dns b44654ea-654f-495d-a844-a513255faae3 wa-kasrt.tripleatech.my.id
sudo systemctl restart cloudflared
curl -sS https://wa-kasrt.tripleatech.my.id/health
```

Untuk uji awal, lebih aman akses dari terminal VPS melalui `127.0.0.1`. Jika domain publik dibuka, sebaiknya pasang Cloudflare Access karena UI menyimpan secret di browser lokal.

## Batasan

- Library WhatsApp unofficial tetap berisiko banned.
- `baileys-antiban` hanya mengurangi risiko dengan delay/limit, bukan menjamin aman.
- Gateway tidak memiliki jalur kirim langsung melalui raw socket; seluruh pesan melewati `wrapSocket()`.
- Link preview hanya terbentuk jika gateway dapat mengambil halaman dan gambar Open Graph sebelum timeout; kegagalan preview tidak menggagalkan pengiriman teks.
- Warm-up dan daftar chat dikenal disimpan di `wa-gateway/data/antiban-state.json` melalui volume Docker.
- Waktu pertama nomor tertaut disimpan di `wa-gateway/data/connection-state.json`; restart/redeploy gateway tidak mengulang cooldown umur koneksi, tetapi pergantian nomor membuat timestamp baru.
- Reminder jimpitan backend hanya boleh memakai mode uji terbatas: nomor valid random dari petugas shift jika `WA_JIMPITAN_REMINDER_ENABLED=true`.
- Jumlah target WA Lab diatur lewat `WA_JIMPITAN_MAX_RECIPIENTS`, default `1`, dan dibatasi maksimal `3`.
- Reminder otomatis WA Lab menunggu umur koneksi minimal dari `WA_LAB_MIN_CONNECTED_AGE_MINUTES`, default `180` menit sejak nomor pertama kali tertaut pada gateway.
- Jika nanti dipakai produksi, lebih baik tetap dibuat opt-in dan manual approval.
