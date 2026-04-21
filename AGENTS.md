# AGENTS.md — KasRT

Dokumen ini menjelaskan peran sistem, hirarki approval, dan aturan implementasi yang dipakai pada codebase KasRT saat ini.

## Peran

- `Warga`
- `Petugas Jimpitan`
- `Admin Jimpitan`
- `Bendahara`
- `Ketua`
- `Sekretaris`
- `Admin`

## Workflow Inti

### Jimpitan

1. Input jimpitan warga
2. Setor batch (`PENDING`)
3. Approve batch oleh level di atas (`Admin Jimpitan`/`Admin`)
4. Masuk transaksi kas (`IN`, `APPROVED`)

### Transfer Kas

1. Dibuat oleh `Bendahara` (`PENDING`)
2. Di-approve oleh `Ketua`/`Sekretaris`

### Pengeluaran

1. Dibuat oleh `Bendahara` (`PENDING`)
2. Di-approve oleh `Ketua`/`Sekretaris`

## Aturan Approval (Wajib)

- Semua transaksi keuangan harus lewat status `PENDING` -> `APPROVED`.
- Approval hanya sah jika:
  - role approver sesuai hirarki
  - jenis transaksi sesuai endpoint approve
  - status transaksi masih `PENDING`
- Tidak boleh ada perubahan saldo tanpa transaksi tercatat.

## Auth & Ownership

- Semua endpoint sensitif wajib pakai JWT (`Authorization: Bearer <token>`).
- Identitas pelaku diambil dari `req.user`, bukan dari body.
- Audit minimal menyimpan `created_by`, `approved_by`, `approved_at`.

## Frontend Rules

- Frontend di-serve dari backend Node yang sama (`localhost:3005` saat lokal).
- `jimpitan.html` dan `index.html` memakai sesi:
  - `kasrt_token`
  - `kasrt_user`
- `jimpitan.html` harus panggil endpoint Node langsung (bukan alur GAS lama).

## Telegram

- Notifikasi approval dikirim berdasarkan role approver.
- Aktivasi Telegram user dilakukan lewat link `/start kasrt_<kode>` dari dashboard.
- Backend menyimpan `telegram_chat_id` setelah webhook valid.
