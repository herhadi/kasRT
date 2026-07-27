# Deploy Backend KasRT di VPS

Stack ini menjalankan backend KasRT. PostgreSQL tetap memakai Neon dan frontend tetap di Vercel.

## Prasyarat VPS

- Docker Engine dan Docker Compose plugin tersedia.
- User deploy menjadi anggota grup `docker`.
- Repo sudah di-clone pada `/srv/kasrt/app`.
- `cloudflared` yang sudah berjalan memiliki route untuk API.

Tambahkan ingress berikut sebelum rule `http_status:404` lalu restart Cloudflared:

```yaml
- hostname: api-kasrt.tripleatech.my.id
  service: http://localhost:3005
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

Reminder otomatis jimpitan hanya memakai Telegram. Integrasi WA otomatis sudah dihapus dari stack ini.

## WA Gateway Lab

WA Gateway Lab bersifat eksperimen manual 1:1 dan tidak terhubung ke reminder produksi. Service berada di compose root dengan nama `kasrt-wa-lab`.

Siapkan env gateway:

```bash
cd /srv/kasrt/app
cp wa-gateway/.env.example wa-gateway/.env
chmod 600 wa-gateway/.env
nano wa-gateway/.env
```

Jalankan hanya service WA lab:

```bash
docker compose -f docker-compose.vps.yml up -d --build kasrt-wa-lab
docker logs -f kasrt-wa-lab
curl --fail-with-body http://127.0.0.1:3010/health
```

Jika ingin diarahkan ke Cloudflare Tunnel, tambahkan ingress berikut di `/etc/cloudflared/config.yml` sebelum rule `http_status:404`:

```yaml
- hostname: wa-kasrt.tripleatech.my.id
  service: http://localhost:3010
```

Buat DNS route dan restart tunnel:

```bash
cloudflared tunnel route dns b44654ea-654f-495d-a844-a513255faae3 wa-kasrt.tripleatech.my.id
sudo systemctl restart cloudflared
curl --fail-with-body https://wa-kasrt.tripleatech.my.id/health
```

Untuk membuka mini inbox, akses `https://wa-kasrt.tripleatech.my.id/`, masukkan `WA_LAB_SECRET`, klik `Ambil QR` jika belum tertaut, atau `Reset Session / Ganti Nomor` jika salah nomor. Gunakan hanya untuk percakapan manual 1:1.

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
