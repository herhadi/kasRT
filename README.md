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
  - `CRON_SECRET` (rahasia untuk endpoint reminder cron)

2. `kasrt-frontend`
- Root: `frontend`
- Env wajib:
  - `NEXT_PUBLIC_API_URL` (isi URL service backend Render, contoh `https://kasrt-backend.onrender.com`)
  - `NEXT_PUBLIC_WA_ADMIN`
  - `API_URL` (URL backend untuk dipanggil route cron frontend)
  - `CRON_SECRET` (harus sama dengan backend)

## Reminder Telegram Jimpitan (20:55 WIB)

- Endpoint backend: `POST /jimpitan/send-shift-reminder`
- Endpoint ini mengirim pengingat ke user yang terjadwal pada hari tersebut.
- Endpoint diamankan dengan header `x-cron-secret` (atau `Authorization: Bearer <CRON_SECRET>`).
- Untuk trigger otomatis jam 20:55 WIB, arahkan scheduler/cron provider ke:
  - `GET /api/cron` pada service frontend
  - Jalankan setiap hari pukul 20:55 Asia/Jakarta

## Catatan API

- Semua endpoint sensitif pakai JWT: `Authorization: Bearer <token>`.
- Identitas actor diambil dari `req.user`.
- Endpoint root backend (`/`) hanya untuk info status API.

## Migrasi Data Manual ke KasRT (2025)

Fitur migrasi tersedia khusus role `root` di:
- Frontend: `/management/migrasi-2025`
- Backend API: `/migration/*`

### Modul yang Didukung

- `iuran-2025`
- `internet-2025`
- `lingkungan-2025`
- `jimpitan-2025`
- `tabungan-2025`
- `sosial-2025`
- `koperasi-iuran-2025`
- `koperasi-loans-2025`

### Endpoint Utama

- `GET /migration/{modul}/summary`
- `POST /migration/{modul}`
- khusus iuran wajib:
  - `POST /migration/iuran-2025/apply-opening-2026`

### Aturan Penggunaan

- Periode migrasi dibatasi sampai `2025-12`.
- `warga_id` wajib UUID valid.
- Nominal tidak boleh negatif (kecuali skema yang memang mengizinkan nilai minus pada ledger tertentu).
- `closing_arrears_2025` adalah hasil hitung sistem, bukan input manual.

### Rumus Ringkas

- `closing_arrears_2025 = total_target_2025 - total_paid_2025` (minimal 0).
- Target tahunan default yang dipakai:
  - Iuran Wajib: `30.000 x 12`
  - Jimpitan: `15.000 x 12`
- Internet/Lingkungan menggunakan tarif historis per bulan (`effective_month`) bila terjadi perubahan nominal.
