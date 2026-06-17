# AGENTS.md — KasRT

Dokumen ini adalah pedoman implementasi agent untuk alur terbaru KasRT.

## Konvensi Data

- Semua ID utama menggunakan `UUID`.
- Jangan asumsikan integer untuk `user_id`, `warga_id`, `created_by`, `approved_by`.
- Actor finansial selalu dari `req.user`, bukan body request.

## Peran Sistem

- `Warga`
- `Admin Jimpitan`
- `Admin Pembangunan`
- `Admin Lingkungan`
- `Admin Sosial`
- `Admin Internet`
- `Admin Koperasi`
- `Admin Keamanan`
- `Bendahara`
- `Ketua`
- `Sekretaris`
- `Plt Ketua` (akses setara Ketua untuk approval)
- `root`

## Alur Finansial Wajib

1. Jimpitan:
- input petugas -> setor batch (`PENDING`) -> approve admin jimpitan -> kas masuk (`APPROVED`).

2. Transfer kas:
- dibuat Bendahara (`PENDING`) -> approve Ketua/Sekretaris/Plt Ketua.

3. Pengeluaran:
- dibuat Bendahara (`PENDING`) -> approve Ketua/Sekretaris/Plt Ketua.

Larangan:
- Tidak boleh update saldo langsung tanpa transaksi.
- Tidak boleh bypass state `PENDING -> APPROVED`.

## Auth, Audit, Session

- Endpoint sensitif wajib JWT.
- Audit minimal:
  - `created_by`
  - `approved_by`
  - `approved_at`
- Session frontend:
  - `kasrt_token`
  - `kasrt_user`

## Arsitektur & Deploy

- Frontend Next.js ada di folder `frontend`.
- Backend Node API ada di folder `backend`.
- Frontend akses backend via `NEXT_PUBLIC_API_URL`.
- Deploy mengikuti `render.yaml`.

## Cron Reminder Jimpitan

- Scheduler: Vercel Cron `frontend/vercel.json`.
- Target reminder: sebelum operasional jimpitan pukul `21:00 WIB`.
- Schedule Vercel: beberapa trigger di `20:15`, `20:30`, `20:45`, dan `21:00 WIB`.
- Alasan schedule: Vercel Cron gratis tidak presisi dan bisa terlambat; backend menerima window `20:15-21:15 WIB`.
- Backend memakai daily lock sehingga beberapa trigger cron tidak mengirim reminder dobel.
- Kanal Telegram dan WA harus diperlakukan terpisah.
- Telegram memakai bot resmi untuk user yang sudah aktivasi chat id.
- WA reminder memakai service `backend/services/waReminderService.js` dengan provider env:
  - `WA_REMINDER_PROVIDER=off`
  - `WA_REMINDER_PROVIDER=fonnte`
  - `WA_REMINDER_PROVIDER=http`
- Root bisa mengubah provider aktif lewat `/management`.
- Pilihan UI disimpan di tabel `app_settings` key `wa_reminder` dan mengalahkan fallback env `WA_REMINDER_PROVIDER`.
- Provider `http` dipakai untuk gateway WA mandiri yang terpisah dari backend utama.
- Untuk provider `http`, backend mengirim serial dengan jeda acak:
  - `WA_REMINDER_MIN_DELAY_MS`
  - `WA_REMINDER_MAX_DELAY_MS`
- WA hanya untuk reminder ringan jimpitan harian; notifikasi kompleks diarahkan ke Telegram/dashboard.
- Alur:
  - Vercel hit `GET /api/cron` (frontend),
  - frontend forward ke `POST /jimpitan/send-shift-reminder` (backend).
- Secret wajib sinkron:
  - frontend `CRON_SECRET`
  - backend `CRON_SECRET`
- Backend punya window guard agar reminder tidak terkirim terlalu malam.

## Redis Cache (Opsional, Disarankan)

- Env backend: `REDIS_URL` (`rediss://...`).
- Jika Redis tidak tersedia, sistem fallback tanpa cache.
- Cache aktif saat ini:
  - dashboard warga (`/report/dashboard`) TTL 60 detik.
  - jadwal jimpitan (`/jimpitan/schedule`) TTL 300 detik.
- Invalidasi:
  - perubahan petugas shift harus hapus cache jadwal.

## Optimasi DB

- Jalankan script index performa setelah deploy schema/perubahan besar:
  - `cd backend && npm run db:indexes`
- Script ini idempotent (`CREATE INDEX IF NOT EXISTS`).

## Migrasi Histori 2025 (Root Only)

- Frontend: `/management/migrasi-2025`
- Backend: `/migration/*`
- Scope:
  - `iuran-2025`
  - `internet-2025`
  - `lingkungan-2025`
  - `jimpitan-2025`
  - `tabungan-2025`
  - `sosial-2025`
  - `koperasi-iuran-2025`
  - `koperasi-loans-2025`
- Batas periode histori: sampai `2025-12`.
