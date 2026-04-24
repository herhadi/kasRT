# KasRT

KasRT adalah sistem kas RT dengan frontend Next.js dan backend Node.js + PostgreSQL.

## Struktur Project

- `backend` -> API, auth JWT, approval workflow, integrasi Telegram.
- `frontend` -> aplikasi Next.js (App Router) untuk login, dashboard, jimpitan, dan approval.

## Workflow Bisnis

1. Jimpitan
- Petugas input jimpitan warga.
- Petugas setor batch (status `PENDING`).
- `Admin Jimpitan` melakukan approve.
- Sistem mencatat transaksi kas masuk (`IN`, `APPROVED`).

2. Transfer kas
- Dibuat `Bendahara` (`PENDING`).
- Di-approve `Ketua` atau `Sekretaris`.

3. Pengeluaran
- Dibuat `Bendahara` (`PENDING`).
- Di-approve `Ketua` atau `Sekretaris`.

## Menjalankan Lokal

1. Jalankan backend:
```bash
cd backend
npm install
npm start
```

2. Jalankan frontend (terminal terpisah):
```bash
cd frontend
npm install
npm run dev
```

3. Set environment frontend lokal (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:3005
NEXT_PUBLIC_WA_ADMIN=628xxxxxxxxxx
```

## Deploy ke Render

Deploy menggunakan `render.yaml` dengan 2 service:

1. `kasrt-backend`
- Root: `backend`
- Env wajib:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_BOT_USERNAME`
  - `TELEGRAM_WEBHOOK_SECRET`

2. `kasrt-frontend`
- Root: `frontend`
- Env wajib:
  - `NEXT_PUBLIC_API_URL` (isi URL service backend Render, contoh `https://kasrt-backend.onrender.com`)
  - `NEXT_PUBLIC_WA_ADMIN`

## Catatan API

- Semua endpoint sensitif pakai JWT: `Authorization: Bearer <token>`.
- Identitas actor diambil dari `req.user`.
- Endpoint root backend (`/`) hanya untuk info status API.
