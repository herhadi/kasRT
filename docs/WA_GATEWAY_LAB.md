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
WA_LAB_MIN_TEXT_LENGTH=2
TZ=Asia/Jakarta
WA_ANTIBAN_PRESET=conservative
WA_ANTIBAN_MAX_PER_MINUTE=2
WA_ANTIBAN_MAX_PER_HOUR=10
WA_ANTIBAN_MAX_PER_DAY=20
WA_ANTIBAN_MIN_DELAY_MS=2500
WA_ANTIBAN_MAX_DELAY_MS=7000
WA_ANTIBAN_NEW_CHAT_DELAY_MS=4000
WA_ANTIBAN_WARMUP_DAYS=7
WA_ANTIBAN_STATE_FILE=./data/antiban-state.json
```

Jika `.env` lama masih memakai `WA_GATEWAY_SECRET`, service tetap bisa membaca secret tersebut sebagai fallback.

Semua jalur kirim memakai socket yang dibungkus `baileys-antiban`. Opsi lama `WA_LAB_DISABLE_ANTIBAN` dan `WA_LAB_MANUAL_DIRECT_SEND` sudah tidak dipakai. Nilai delay 90–300 detik juga harus diganti karena backend reminder memiliki timeout 30 detik.

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

Status menampilkan state koneksi, nomor tertaut, limit harian, statistik anti-ban, presence, delivery receipt, dan transport pengiriman terakhir. Nilai `last_outgoing_transport` harus `baileys-antiban`.

### QR Login

```bash
curl -sS \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  http://127.0.0.1:3010/qr
```

Gunakan nilai `qr_data_url` untuk membuka QR di browser, lalu scan dari WhatsApp.

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

Full reset menghapus session auth, chat lokal, dan usage lokal. Gunakan hanya saat reset biasa tidak menghasilkan QR.

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

Setelah reset, ambil QR baru dari `/qr`.

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
- Warm-up dan daftar chat dikenal disimpan di `wa-gateway/data/antiban-state.json` melalui volume Docker.
- Reminder jimpitan backend hanya boleh memakai mode uji terbatas: nomor valid random dari petugas shift jika `WA_JIMPITAN_REMINDER_ENABLED=true`.
- Jumlah target WA Lab diatur lewat `WA_JIMPITAN_MAX_RECIPIENTS`, default `1`, dan dibatasi maksimal `3`.
- Reminder otomatis WA Lab menunggu umur koneksi minimal dari `WA_LAB_MIN_CONNECTED_AGE_MINUTES`, default `180` menit setelah QR connected.
- Jika nanti dipakai produksi, lebih baik tetap dibuat opt-in dan manual approval.
