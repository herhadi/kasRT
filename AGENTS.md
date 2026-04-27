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

## Integrasi Telegram

- Notifikasi approval dikirim berdasarkan role approver.
- Aktivasi Telegram dilakukan lewat link `/start kasrt_<kode>` dari dashboard.
- Backend menyimpan `telegram_chat_id` setelah webhook valid.

## Standar Perubahan Kode

- Jangan bypass approval workflow demi shortcut implementasi.
- Jangan pindahkan identitas actor ke payload client.
- Pastikan setiap perubahan alur finansial tetap menjaga jejak audit.
- Setiap endpoint baru terkait finansial harus mengikuti pola role check + pending check + audit update.
