# WA Gateway Lab

Service ini hanya untuk uji coba manual WhatsApp gateway mandiri berbasis Baileys dan `baileys-antiban`.

> Catatan penting: ini bukan jalur produksi reminder KasRT. Jangan sambungkan ke cron jimpitan otomatis sebelum nomor stabil dan risikonya diterima.

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
```

Jika `.env` lama masih memakai `WA_GATEWAY_SECRET`, service tetap bisa membaca secret tersebut sebagai fallback.

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
7. Untuk kirim ke nomor tertentu, isi nomor pada field `Nomor WA baru`, klik `Chat`, tulis pesan pertama, lalu `Kirim`.

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

Status menampilkan state koneksi, nomor tertaut, limit harian, dan statistik antiban jika tersedia.

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
- Service ini belum terhubung ke backend reminder jimpitan.
- Jika nanti dipakai produksi, lebih baik tetap dibuat opt-in dan manual approval.
