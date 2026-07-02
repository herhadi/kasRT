# KasRT

KasRT adalah aplikasi kas RT berbasis:
- Frontend: Next.js (`frontend`)
- Backend API: Node.js + PostgreSQL (`backend`)

## Arsitektur

- Frontend membaca API melalui `NEXT_PUBLIC_API_URL`.
- Backend memakai JWT untuk endpoint sensitif.
- Integrasi Telegram untuk notifikasi approval dan reminder jimpitan.
- Cache Redis opsional untuk endpoint baca berat (fallback aman jika Redis tidak tersedia).

## Menjalankan Lokal

1. Backend
```bash
cd backend
npm install
npm start
```

2. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment

### Backend (`backend/.env`)

Wajib:
- `DATABASE_URL`
- `JWT_SECRET`
- `DEFAULT_USER_PIN`
- `CRON_SECRET`

Telegram:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `BACKEND_PUBLIC_URL`

WA reminder jimpitan:
- `WA_REMINDER_PROVIDER`
  - `off`: WA reminder mati.
  - `fonnte`: kirim via Fonnte lama.
  - `http`: kirim ke gateway WA mandiri yang terpisah.
- Root bisa mengubah provider aktif dari `/management` pada card `WA Reminder Jimpitan`.
- Pilihan dari UI disimpan di database (`app_settings`) dan akan mengalahkan fallback `WA_REMINDER_PROVIDER`.
- `WA_GATEWAY_URL` (wajib jika `WA_REMINDER_PROVIDER=http`)
- `WA_GATEWAY_BASE_URL` (opsional untuk UI `/management`, contoh `https://kasrt-wa-gateway.onrender.com`)
- `WA_GATEWAY_SECRET` (opsional, dikirim sebagai header `x-wa-gateway-secret`)
- `WA_REMINDER_MIN_DELAY_MS` dan `WA_REMINDER_MAX_DELAY_MS` untuk jeda acak antar nomor pada provider `http`.
- `FONNTE_TOKEN` hanya dipakai jika `WA_REMINDER_PROVIDER=fonnte` atau provider dikosongkan dan token tersedia.

Opsional performa:
- `REDIS_URL` (contoh: `rediss://...`)

### Frontend (`frontend/.env.local` atau env provider)

- `NEXT_PUBLIC_API_URL` (URL backend)
- `NEXT_PUBLIC_WA_ADMIN`
- `API_URL` (URL backend untuk route cron frontend)
- `CRON_SECRET` (harus sama dengan backend)

## Workflow Inti

1. Jimpitan:
- Petugas input jimpitan.
- Petugas setor batch (`PENDING`).
- Admin Jimpitan approve.
- Sistem catat kas masuk final `APPROVED`.

2. Transfer kas & pengeluaran:
- Dibuat Bendahara (`PENDING`).
- Disetujui Ketua/Sekretaris.

Semua transaksi finansial wajib mengikuti approval flow dan audit actor (`created_by`, `approved_by`, `approved_at`).

## Reminder Otomatis Jimpitan

- Scheduler production memakai cron Linux di VPS/Debian yang memanggil backend lokal pada pukul `20:30 WIB`.
- Target reminder: sebelum operasional jimpitan pukul `21:00 WIB`.
- Backend menerima window `20:30-20:45 WIB` sebagai guard agar reminder tidak terkirim terlalu awal/terlambat.
- Backend memakai daily lock, jadi beberapa trigger cron tidak akan mengirim reminder dobel.
- Telegram dan WA dipisah. Telegram tetap memakai bot resmi, sedangkan WA reminder memakai provider backend terpisah:
  - `off`
  - `fonnte`
  - `http` untuk gateway WA mandiri.
- Root dapat mengubah provider WA dari `/management` tanpa deploy ulang.
- Provider `http` mengirim serial dengan jeda acak agar reminder harian tidak menembak banyak nomor sekaligus.
- Gateway mandiri ada di folder `wa-gateway` dan dapat dideploy sebagai service Render `kasrt-wa-gateway`.
- Endpoint gateway:
  - `GET /status`
  - `GET /qr`
  - `POST /send`
- Backend membutuhkan:
  - `WA_GATEWAY_URL=https://.../send`
  - `WA_GATEWAY_BASE_URL=https://...`
  - `WA_GATEWAY_SECRET` sama dengan env gateway.
- QR login gateway bisa dicek dari `/management` oleh root.
- Frontend cron route meneruskan ke backend:
  - `POST /jimpitan/send-shift-reminder`
  - auth via `x-cron-secret` / bearer secret.
- Backend tetap membatasi window pengiriman agar tidak terkirim terlalu malam.

## Optimasi DB & Cache

1. Index performa:
```bash
cd backend
npm run db:indexes
```

2. Redis cache (opsional):
- `dashboard:warga:<user_id>:<month>`
- `jimpitan:schedule:weekly:v1`
- Jika Redis down/missing, aplikasi tetap jalan tanpa cache.

## Deploy

Deploy menggunakan `render.yaml`:
- Service backend: root `backend`
- Service frontend: root `frontend`

Pastikan env frontend-backend dan `CRON_SECRET` sinkron.

Alternatif deploy backend tanpa sleep menggunakan Docker di VPS tersedia pada `infra/vps/README.md`. Konfigurasi ini menjalankan backend pada `127.0.0.1:3005` dan dapat dipublikasikan melalui Cloudflare Tunnel.

## Migrasi Data Historis

Root-only:
- Frontend: `/management/migrasi-2025`
- Backend: `/migration/*`

Scope:
- `iuran-2025`, `internet-2025`, `lingkungan-2025`, `jimpitan-2025`, `tabungan-2025`, `sosial-2025`, `koperasi-iuran-2025`, `koperasi-loans-2025`
