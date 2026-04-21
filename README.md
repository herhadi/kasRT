# Kas RT System

Sistem pengelolaan kas RT berbasis Node.js + PostgreSQL dengan role-based workflow.

## Menjalankan Lokal (Testing Sebelum Deploy Render)

1. Jalankan backend API
```bash
cd backend
npm install
npm run start
```
API akan aktif di `http://localhost:3005` (sesuaikan `.env` bila perlu).

2. Jalankan frontend statis
```bash
cd frontend
npx serve -l 5500 .
```
Frontend bisa diakses dari:
- `http://localhost:5500/login.html`
- `http://localhost:5500/index.html`

3. Alur test cepat
- Login di `login.html`
- Setelah berhasil, akan diarahkan ke `index.html`
- Dashboard menarik data dari `GET /report/dashboard` dengan JWT
- Tombol `Input Jimpitan` menuju `jimpitan.html` (halaman lama tetap bisa dipakai)

## Ringkasan Dashboard Warga

Dashboard menampilkan:
- Jimpitan target Rp500/hari atau Rp15.000/bulan
- Iuran wajib target Rp30.000
- Iuran opsional per warga (Koperasi, Internet, Pembangunan, dll) berdasarkan data aktual bulan berjalan
- Total kontribusi bulan berjalan

## Struktur Kontribusi

Contoh seed contribution types:
```sql
INSERT INTO public.contribution_types ("name", is_mandatory) VALUES
  ('Iuran Wajib', true),
  ('Jimpitan', true),
  ('Pembangunan', true),
  ('Koperasi', false),
  ('Internet', false);
```

## Notifikasi Telegram (Approval)

Tambahkan env di backend:
```env
TELEGRAM_BOT_TOKEN=isi_bot_token_kamu
```

Tambahkan `telegram_chat_id` pada tabel `users` (lihat SQL migrasi):
- `backend/sql/2026-04-21-telegram-chat-id.sql`

Flow notifikasi aktif:
- Transfer `PENDING` -> notify Ketua/Sekretaris
- Pengeluaran `PENDING` -> notify Ketua/Sekretaris
- Setor Jimpitan `PENDING` -> notify Admin Jimpitan/Admin
- Setelah approve -> notify pembuat transaksi/setoran

## Aktivasi Telegram dari Dashboard

Tambahkan env backend:
```env
TELEGRAM_BOT_TOKEN=isi_bot_token
TELEGRAM_BOT_USERNAME=username_bot_tanpa_@
TELEGRAM_WEBHOOK_SECRET=opsional_secret_webhook
```

Jalankan migrasi:
- `backend/sql/2026-04-21-telegram-chat-id.sql`
- `backend/sql/2026-04-21-telegram-link-tokens.sql`

Endpoint baru:
- `GET /auth/me` (cek status telegram user)
- `POST /auth/telegram-activation-link` (buat link aktivasi bot)
- `POST /telegram/webhook` (dipanggil Telegram webhook untuk simpan chat id)

Alur user:
1. Login dashboard
2. Klik `Aktifkan Telegram`
3. Browser buka bot Telegram dengan parameter `/start kasrt_<kode>`
4. Backend webhook menyimpan `users.telegram_chat_id`
