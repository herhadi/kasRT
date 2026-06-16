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

- Trigger harian via Vercel Cron ke `GET /api/cron` (frontend).
- Target reminder: sebelum operasional jimpitan pukul `21:00 WIB`.
- Schedule Vercel: beberapa trigger di `20:15`, `20:30`, `20:45`, dan `21:00 WIB` sesuai `frontend/vercel.json`.
- Catatan: Vercel Cron pada plan gratis bisa terlambat, jadi backend menerima window `20:15-21:15 WIB`.
- Backend memakai daily lock, jadi beberapa trigger cron tidak akan mengirim reminder dobel.
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

## Migrasi Data Historis

Root-only:
- Frontend: `/management/migrasi-2025`
- Backend: `/migration/*`

Scope:
- `iuran-2025`, `internet-2025`, `lingkungan-2025`, `jimpitan-2025`, `tabungan-2025`, `sosial-2025`, `koperasi-iuran-2025`, `koperasi-loans-2025`
