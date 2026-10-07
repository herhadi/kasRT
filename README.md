# KasRT

KasRT adalah aplikasi kas RT berbasis:
- Frontend: Next.js di Vercel (`frontend`)
- Backend API: Node.js di Debian (`backend`)
- Database: PostgreSQL di Neon
- Cache: Redis di Upstash
- WA Gateway: service terpisah di Debian (`wa-gateway`)

## Arsitektur

- Frontend membaca API melalui `NEXT_PUBLIC_API_URL`.
- Backend memakai JWT untuk endpoint sensitif.
- Integrasi Telegram dan WA Gateway untuk notifikasi sesuai pengaturan Management.
- Cache Redis Upstash opsional untuk endpoint baca berat (fallback aman jika Redis tidak tersedia).

## Dokumentasi

- Manual cetak/panduan pengguna: `docs/MANUAL_GUIDE.md`
- Changelog: `docs/CHANGELOG.md`
- WA Gateway Lab: `docs/WA_GATEWAY_LAB.md`
- Deploy VPS: `infra/vps/README.md`

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

### Backend Debian (`backend/.env`)

Wajib:
- `DATABASE_URL`
- `JWT_SECRET`
- `DEFAULT_USER_PIN`
- `CRON_SECRET` (harus sama dengan frontend Vercel)

Infrastruktur:
- `DATABASE_URL` diisi connection string PostgreSQL Neon.
- `REDIS_URL` diisi connection string Redis Upstash, biasanya berawalan `rediss://`.
- `WA_LAB_BASE_URL` dan `WA_LAB_SECRET` dipakai untuk koneksi ke WA Gateway Debian.
- Pengaturan operasional reminder WA dan JID grup disimpan dari `/management/whatsapp`, bukan env.

Telegram:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `BACKEND_PUBLIC_URL`

### Command Telegram

User yang sudah menghubungkan akun Telegram dari menu Profil/Akun dapat memakai command berikut:

- `/help` — menampilkan daftar command KasRT.
- `/cek_tab` — cek saldo Tabungan Pembangunan.
- `/cek_inet` — cek kewajiban iuran Internet.
- `/cek_lingk` — cek kewajiban iuran Lingkungan.

Command yang tidak tersedia akan diarahkan untuk memakai `/help`.

Opsional performa:
- `REDIS_URL` (contoh: `rediss://...`)

### Frontend Vercel (`frontend/.env.local` untuk lokal atau Environment Variables Vercel)

- `NEXT_PUBLIC_API_URL` (URL backend)
- `API_URL` (URL backend untuk route server-side/cron frontend)
- `CRON_SECRET` (harus sama dengan backend Debian)
- `NEXT_PUBLIC_APP_URL` (opsional, URL publik frontend)

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

- Scheduler production memakai Vercel Cron pada `frontend/vercel.json` dan meneruskan request ke backend Debian.
- Target reminder: sebelum operasional jimpitan pukul `21:00 WIB`.
- Backend menerima window `20:30-20:45 WIB` sebagai guard agar reminder tidak terkirim terlalu awal/terlambat.
- Backend memakai daily lock, jadi beberapa trigger cron tidak akan mengirim reminder dobel.
- Kanal Telegram dan WA diperlakukan terpisah.
- WA reminder memakai WA Gateway terpisah dan pengaturan root di `/management/whatsapp`.
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

- Frontend dideploy ke Vercel dari folder `frontend`.
- Backend dan WA Gateway berjalan sebagai container Docker di Debian.
- PostgreSQL menggunakan Neon dan Redis menggunakan Upstash.
- Cloudflare Tunnel mempublikasikan backend dan WA Gateway tanpa membuka port service ke publik secara langsung.
- `CRON_SECRET` pada Vercel dan backend harus sama.
- Detail Docker/Cloudflare tersedia di `infra/vps/README.md`.

## Migrasi Data Historis

Root-only:
- Frontend: `/management/migrasi-2025`
- Backend: `/migration/*`

Scope:
- `iuran-2025`, `internet-2025`, `lingkungan-2025`, `jimpitan-2025`, `tabungan-2025`, `sosial-2025`, `koperasi-iuran-2025`, `koperasi-loans-2025`
