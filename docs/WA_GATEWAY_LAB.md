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
```

Jika `.env` lama masih memakai `WA_GATEWAY_SECRET`, service tetap bisa membaca secret tersebut sebagai fallback.

## Setup Docker

```bash
cd wa-gateway
docker compose up -d --build
docker logs -f kasrt-wa-gateway-lab
```

Service bind ke `127.0.0.1:3010` agar tidak terbuka langsung ke publik.

## Endpoint

Semua endpoint selain `/health` wajib memakai header secret:

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

### Ganti Nomor

```bash
curl -sS -X POST http://127.0.0.1:3010/session/reset \
  -H "content-type: application/json" \
  -H "x-wa-lab-secret: isi_secret_panjang" \
  -d '{"confirm":"RESET"}'
```

Setelah reset, ambil QR baru dari `/qr`.

## Deploy via Cloudflare Tunnel

Tambahkan ingress baru hanya jika service perlu diakses dari UI/admin:

```yaml
- hostname: wa-lab-kasrt.tripleatech.my.id
  service: http://localhost:3010
```

Untuk uji awal, lebih aman akses dari terminal VPS melalui `127.0.0.1`.

## Batasan

- Library WhatsApp unofficial tetap berisiko banned.
- `baileys-antiban` hanya mengurangi risiko dengan delay/limit, bukan menjamin aman.
- Service ini belum terhubung ke backend reminder jimpitan.
- Jika nanti dipakai produksi, lebih baik tetap dibuat opt-in dan manual approval.
