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

- Endpoint reminder tersedia pada backend `POST /jimpitan/send-shift-reminder` dan endpoint manual root `POST /jimpitan/send-shift-reminder/manual`.
- Jangan mengasumsikan scheduler berada di Vercel: `frontend/vercel.json` saat ini hanya mengatur region.
- Jadwal aktual harus diverifikasi dari konfigurasi scheduler deployment yang aktif; jangan menuliskan jam/window tetap tanpa verifikasi.
- Backend menentukan tanggal operasional berdasarkan zona waktu Asia/Jakarta dan memakai daily lock untuk mencegah reminder ganda.
- Kanal Telegram dan WhatsApp diperlakukan terpisah. Pengaturan reminder WA dan JID grup dikelola dari Management.
- Notifikasi grup setelah transaksi memakai outbox persisten; status `UNCERTAIN` tidak boleh dikirim ulang otomatis karena dapat menghasilkan pesan ganda.
- Detail endpoint dan status antrean ada di `docs/jimpitan.md`.

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


## Wajib Dokumentasi

- Setiap perubahan fitur/perilaku harus disertai pembaruan file relevan di `docs/`.
- Manual pengguna menjelaskan langkah penggunaan aktual; dokumen modul menjelaskan aturan/alur; dokumen teknis menjelaskan endpoint, data, worker, dan konfigurasi; changelog mencatat perubahan penting.
- Jika belum ada dokumen modul yang sesuai, buat dokumen baru.
- Untuk ekspor spreadsheet, gunakan **Preview sebelum Unduh** dan pastikan preview konsisten dengan file. Preview harus menampilkan format print view/kertas bila laporan berbentuk dokumen.
- Jangan menyatakan pekerjaan selesai sebelum dokumentasi relevan ikut diperbarui.
