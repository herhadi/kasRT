# 🤖 AGENTS.md — Kas RT System

Dokumen ini menjelaskan peran (agents), tanggung jawab, dan alur kerja dalam sistem Kas RT.

---

## 🧑‍🤝‍🧑 Agents (Peran Sistem)

### 👤 Warga
- Login ke sistem
- Melihat dashboard (jimpitan & iuran)
- Dapat bertugas sebagai petugas jimpitan

---

### 🧹 Petugas Jimpitan
- Input jimpitan warga
- Mengumpulkan data jimpitan harian
- Melakukan setor ke admin jimpitan

---

### 🧾 Admin Jimpitan
- Memverifikasi setor jimpitan
- Melakukan approval
- Mengubah status menjadi pemasukan kas jimpitan

---

### 💰 Bendahara
- Mengelola kas utama
- Melakukan transfer antar kas
- Menginput pengeluaran

---

### 🏛 Ketua / Sekretaris
- Otoritas tertinggi
- Menyetujui:
  - Transfer kas
  - Pengeluaran

---

## 🔁 Workflow Sistem

### 🌾 Jimpitan


Petugas
↓
Input jimpitan
↓
Setor (PENDING)
↓
Approve Admin Jimpitan
↓
Masuk ke Kas Jimpitan (APPROVED)


---

### 💰 Transfer Kas


Bendahara
↓
Buat transfer (PENDING)
↓
Approve Ketua / Sekretaris
↓
Saldo berpindah


---

### 💸 Pengeluaran


Bendahara
↓
Input pengeluaran (PENDING)
↓
Approve Ketua / Sekretaris
↓
Saldo berkurang


---

## 🔐 Authorization Rules

- Semua request harus menggunakan JWT token
- Role menentukan akses endpoint
- Validasi dilakukan melalui middleware

### Akses Berdasarkan Role

| Action              | Role yang Diizinkan        |
|--------------------|--------------------------|
| Input Jimpitan     | Semua user               |
| Setor Jimpitan     | Petugas / Warga          |
| Approve Jimpitan   | Admin Jimpitan           |
| Transfer Kas       | Bendahara                |
| Approve Transfer   | Ketua / Sekretaris       |
| Pengeluaran        | Bendahara                |
| Approve Pengeluaran| Ketua / Sekretaris       |

---

## 🗄️ Data Ownership

- Semua data user diidentifikasi melalui `req.user` (JWT)
- Tidak menggunakan ID dari request body untuk identitas user
- Semua transaksi memiliki:
  - `created_by`
  - `approved_by`
  - timestamp

---

## 🧠 System Principles

- ✔ Semua transaksi harus melalui proses approval
- ✔ Tidak ada perubahan saldo tanpa transaksi
- ✔ Semua pergerakan uang tercatat
- ✔ Sistem mendukung multi-wallet (multi kas)
- ✔ Transparansi dan audit trail adalah prioritas

---

## ⚙️ Agents Interaction Summary


User → Login → Token
↓
Request API
↓
Auth Middleware
↓
Role Check
↓
Controller
↓
Database
↓
Response


---

## 🚀 Notes

- Sistem dirancang untuk skala RT (real-world usage)
- Mendukung berbagai jenis iuran:
  - Jimpitan
  - Iuran wajib
  - Koperasi
  - Internet
  - Pembangunan

---

## 📌 Conclusion

Sistem ini menggunakan pendekatan berbasis role dan approval untuk memastikan:
- keamanan
- transparansi
- akurasi pencatatan keuangan