# AGENTS.md — KasRT

Dokumen ini menjadi pedoman implementasi agent di codebase KasRT.

## Konvensi ID (Penting)

- Semua identifier utama di sistem menggunakan `UUID`.
- Jangan mengasumsikan ID bertipe integer pada frontend maupun backend.
- Validasi `user_id`, `warga_id`, `created_by`, `approved_by`, dan relasi lain harus kompatibel UUID (string), kecuali field yang memang numerik secara eksplisit.

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
- `root`

## Alur Inti

### Jimpitan

1. Petugas input jimpitan warga.
2. Petugas melakukan setor batch -> status `PENDING`.
3. Approver `Admin Jimpitan` (atau role setara yang diizinkan) melakukan approval.
4. Sistem membentuk transaksi kas masuk dengan status final `APPROVED`.

### Transfer Kas

1. Dibuat oleh `Bendahara` -> `PENDING`.
2. Disetujui oleh `Ketua` atau `Sekretaris`.

### Pengeluaran

1. Dibuat oleh `Bendahara` -> `PENDING`.
2. Disetujui oleh `Ketua` atau `Sekretaris`.

## Aturan Approval (Wajib)

- Semua transaksi finansial wajib lewat state machine `PENDING -> APPROVED`.
- Approval valid hanya jika:
  - Approver punya role yang sesuai hirarki.
  - Endpoint approve sesuai jenis transaksi.
  - Status data masih `PENDING` saat dieksekusi.
- Dilarang mengubah saldo tanpa transaksi tercatat.

## Auth, Ownership, Audit

- Endpoint sensitif wajib JWT (`Authorization: Bearer <token>`).
- Pelaku (`created_by`) dan approver (`approved_by`) harus bersumber dari `req.user`, bukan request body.
- Audit minimum yang wajib ada:
  - `created_by`
  - `approved_by`
  - `approved_at`

## Arsitektur Frontend-Backend

- Frontend berjalan sebagai aplikasi Next.js pada folder `frontend`.
- Backend berjalan sebagai service API Node.js pada folder `backend`.
- Frontend memakai env `NEXT_PUBLIC_API_URL` untuk mengakses backend.
- Session frontend disimpan dengan key:
  - `kasrt_token`
  - `kasrt_user`

## Migrasi Data Historis 2025 (Root Only)

- Tersedia menu khusus root: `/management/migrasi-2025`.
- Endpoint backend migrasi berada di prefix `/migration/*` dan wajib role `root`.
- Scope migrasi saat ini:
  - `iuran-2025`
  - `internet-2025`
  - `lingkungan-2025`
  - `jimpitan-2025`
  - `tabungan-2025`
  - `sosial-2025`
  - `koperasi-iuran-2025`
  - `koperasi-loans-2025`
- Aturan periode:
  - data histori migrasi dibatasi sampai `2025-12`.
  - data operasional 2026+ tetap diinput normal oleh admin terkait.
- Untuk iuran wajib tersedia aksi:
  - `POST /migration/iuran-2025/apply-opening-2026`
  - fungsinya membentuk opening tunggakan 2026 dari closing 2025.

### Prinsip Hitung Tunggakan

- `closing_arrears_2025` adalah output sistem, bukan input manual user.
- Rumus umum: `closing_arrears_2025 = total_target_2025 - total_paid_2025` (minimal 0).
- Target tahunan yang ditetapkan:
  - Iuran Wajib: `30.000 x 12`
  - Jimpitan: `15.000 x 12`
- Untuk Internet/Lingkungan, target dihitung dari tarif historis per bulan (effective month), bukan dirata-rata.

## Integrasi Telegram

- Notifikasi approval dikirim berdasarkan role approver.
- Aktivasi Telegram dilakukan lewat link `/start kasrt_<kode>` dari dashboard.
- Backend menyimpan `telegram_chat_id` setelah webhook valid.

## Standar Perubahan Kode

- Jangan bypass approval workflow demi shortcut implementasi.
- Jangan pindahkan identitas actor ke payload client.
- Pastikan setiap perubahan alur finansial tetap menjaga jejak audit.
- Setiap endpoint baru terkait finansial harus mengikuti pola role check + pending check + audit update.
