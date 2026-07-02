# Deploy Backend KasRT di VPS

Stack ini menjalankan backend KasRT dan WA gateway mandiri. PostgreSQL tetap memakai Neon dan frontend tetap di Vercel.

## Prasyarat VPS

- Docker Engine dan Docker Compose plugin tersedia.
- User deploy menjadi anggota grup `docker`.
- Repo sudah di-clone pada `/srv/kasrt/app`.
- `cloudflared` yang sudah berjalan memiliki route untuk API dan WA gateway.

Tambahkan ingress berikut sebelum rule `http_status:404` lalu restart Cloudflared:

```yaml
- hostname: api-kasrt.tripleatech.my.id
  service: http://localhost:3005
- hostname: wa-kasrt.tripleatech.my.id
  service: http://localhost:3010
```

## Konfigurasi environment

Mulai dari template, lalu isi dengan nilai environment backend yang aktif:

```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

Kemudian sesuaikan minimal:

```dotenv
PORT=3005
NODE_ENV=production
CORS_ORIGINS=https://kas02.vercel.app
BACKEND_PUBLIC_URL=https://api-kasrt.tripleatech.my.id
```

Tambahkan domain frontend produksi lain ke `CORS_ORIGINS` dengan pemisah koma. Jangan commit file `.env`.

Untuk memakai WA gateway mandiri, set backend:

```dotenv
WA_REMINDER_PROVIDER=http
WA_GATEWAY_URL=https://wa-kasrt.tripleatech.my.id/send
WA_GATEWAY_BASE_URL=https://wa-kasrt.tripleatech.my.id
WA_GATEWAY_SECRET=isi_secret_yang_sama_dengan_gateway
WA_REMINDER_MIN_DELAY_MS=90000
WA_REMINDER_MAX_DELAY_MS=180000
```

## WA gateway mandiri

Buat env gateway:

```bash
cp wa-gateway/.env.example wa-gateway/.env
chmod 600 wa-gateway/.env
```

Isi `WA_GATEWAY_SECRET` dengan nilai yang sama seperti backend. Default aman gateway:

- maksimal `10` nomor unik per hari;
- jeda minimal `90` detik antar kirim;
- auth/session WhatsApp disimpan persistent di volume Docker `kasrt-wa-gateway-data`.

Deploy manual:

```bash
cd /srv/kasrt/app
chmod +x infra/vps/deploy-wa-gateway.sh
./infra/vps/deploy-wa-gateway.sh
curl --fail-with-body http://127.0.0.1:3010/status
```

Tambahkan DNS tunnel dari Debian:

```bash
cloudflared tunnel route dns b44654ea-654f-495d-a844-a513255faae3 wa-kasrt.tripleatech.my.id
```

Setelah container jalan, buka `/management`, cek status WA gateway, lalu scan QR satu kali.

Aktifkan provider dari backend:

1. Update `backend/.env` dengan `WA_REMINDER_PROVIDER=http`, `WA_GATEWAY_URL`, `WA_GATEWAY_BASE_URL`, `WA_GATEWAY_SECRET`, dan delay aman.
2. Deploy/restart backend.
3. Buka `/management` sebagai root, pilih `Gateway Mandiri`, lalu simpan.
4. Klik `Refresh Gateway`; pastikan kuota harian tampil dan status `Connected`.

Untuk menjaga nomor tidak mudah kena pembatasan, jangan naikkan `WA_DAILY_UNIQUE_LIMIT` di atas `10` untuk kebutuhan reminder harian KasRT.

Jalankan deploy awal dari VPS:

```bash
cd /srv/kasrt/app
chmod +x infra/vps/deploy-backend.sh infra/vps/send-jimpitan-shift-reminder.sh
./infra/vps/deploy-backend.sh
curl --fail-with-body http://127.0.0.1:3005/
```

## Cron reminder jimpitan

Pasang file cron sistem agar berjalan tepat pukul `20:30 WIB`:

```bash
sudo install -m 644 infra/vps/kasrt-jimpitan-reminder.cron /etc/cron.d/kasrt-jimpitan-reminder
sudo chmod 700 infra/vps/send-jimpitan-shift-reminder.sh
sudo systemctl restart cron
```

Tes manual tanpa menunggu jadwal:

```bash
sudo /srv/kasrt/app/infra/vps/send-jimpitan-shift-reminder.sh
```

Tes manual di luar window akan mengembalikan `skipped`; itu normal. Untuk pengujian pengiriman, jalankan pada window `20:30-20:45 WIB`.

Scheduler reminder production hanya memakai cron Linux di VPS/Debian.

## GitHub Actions

Workflow memakai GitHub Actions self-hosted runner di PC Debian. Karena runner menjalankan deployment langsung dari PC yang sama, tidak perlu SSH, port forwarding, atau secrets VPS. Runner Eduflow yang terdaftar pada level repository tidak dapat dipakai oleh KasRT, jadi tambahkan runner repository-level kedua dengan label `kasrt-vps`.

Clone repository pada `/srv/kasrt/app` lalu pastikan user runner:

- dapat menjalankan `docker compose`;
- dapat membaca `/srv/kasrt/app/backend/.env`;
- dapat menulis `/srv/kasrt/logs/deploy`.

Jika lokasi clone berbeda, ubah `KASRT_DEPLOY_PATH` dan `KASRT_LOG_DIR` di `.github/workflows/deploy-vps.yml`. Workflow deploy hanya ketika backend atau aset deployment berubah. Script deployment memakai lock, log, cek worktree, `git fetch` lalu `git reset --hard` ke `origin/main`, build container, dan health check. Script selalu menolak worktree yang kotor sebelum reset; file `.env` tetap aman karena tidak di-track Git.
