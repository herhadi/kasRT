# KasRT

KasRT adalah sistem pengelolaan kas RT berbasis Node.js + PostgreSQL (Neon) dengan workflow approval bertingkat.

## Menjalankan Lokal (Tanpa `serve`)

Semua dijalankan dari backend Node saja.

```bash
cd backend
npm install
npm start
```

Akses dari browser:
- `http://localhost:3005/` -> login
- `http://localhost:3005/index.html` -> dashboard
- `http://localhost:3005/jimpitan.html` -> input jimpitan

## Status Frontend

- `index.html` (dashboard) sudah aktif dan pakai JWT.
- `jimpitan.html` sudah disesuaikan ke API Node saat ini:
  - `GET /jimpitan/list` (dengan Bearer token)
  - `POST /jimpitan/input` (dengan Bearer token)
  - `POST /jimpitan/setor` (dengan Bearer token)
- `jimpitan.html` membaca sesi dari:
  - `kasrt_token`
  - `kasrt_user`

## Approval Bertingkat

- Jimpitan: input/setor -> `PENDING` -> approve oleh `Admin Jimpitan` / `Admin`
- Transfer: dibuat oleh `Bendahara` -> approve `Ketua` / `Sekretaris`
- Pengeluaran: dibuat oleh `Bendahara` -> approve `Ketua` / `Sekretaris`

Semua approval hanya berlaku untuk transaksi `PENDING` dan jenis transaksi yang benar.

## Telegram Notification

### Env wajib

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
```

### Migrasi SQL

Jalankan:
- `backend/sql/2026-04-21-jimpitan-adopsi-gas.sql`
- `backend/sql/2026-04-21-telegram-chat-id.sql`
- `backend/sql/2026-04-21-telegram-link-tokens.sql`

### Flow aktivasi Telegram user

1. User login dashboard
2. Klik `Aktifkan Telegram`
3. Browser membuka bot Telegram (`/start kasrt_<kode>`)
4. Webhook `POST /telegram/webhook` menyimpan `users.telegram_chat_id`

## Render Deploy

Blueprint tersedia di `render.yaml`.

Sebelum deploy, pastikan env var production sudah diisi di Render.
