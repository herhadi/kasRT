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

Reminder otomatis jimpitan utama tetap memakai Telegram. Integrasi WA massal sudah dihapus dari stack ini.

Untuk uji terbatas WA Lab pada reminder jimpitan, backend dapat mengirim ke nomor valid random dari petugas shift. Default tetap off. Aktifkan hanya jika `kasrt-wa-lab` sudah tertaut:

```dotenv
WA_JIMPITAN_REMINDER_ENABLED=true
WA_JIMPITAN_MAX_RECIPIENTS=2
WA_LAB_MIN_CONNECTED_AGE_MINUTES=180
WA_LAB_BASE_URL=https://wa-kasrt.tripleatech.my.id
WA_LAB_SECRET=secret_yang_sama_dengan_wa_gateway
```

Variabel `WA_JIMPITAN_*` dan `WA_LAB_MIN_CONNECTED_AGE_MINUTES` di atas dipasang pada environment **backend KasRT**, bukan pada container `wa-gateway`. Setelah root menyimpan pengaturan pada `/management`, nilai UI tersebut mengalahkan fallback env untuk status WA, batas penerima, dan umur koneksi. Batas penerima yang dapat diatur adalah 1–20 per eksekusi, mengikuti limit harian gateway saat ini. `WA_LAB_BASE_URL` serta `WA_LAB_SECRET` tetap wajib berada di env karena merupakan konfigurasi infrastruktur dan kredensial gateway.

Setelah ubah `backend/.env`, deploy/recreate backend:

```bash
docker compose -f docker-compose.vps.yml up -d --build kasrt-backend
```

## WA Gateway Lab

WA Gateway Lab melayani percakapan manual 1:1 dan uji reminder jimpitan terbatas. Service berada di compose root dengan nama `kasrt-wa-lab`, dan seluruh pengiriman melewati `baileys-antiban`.

Siapkan env gateway:

```bash
cd /srv/kasrt/app
cp wa-gateway/.env.example wa-gateway/.env
chmod 600 wa-gateway/.env
nano wa-gateway/.env
```

Pastikan konfigurasi anti-ban di VPS tidak masih memakai delay lama:

```dotenv
TZ=Asia/Jakarta
WA_ANTIBAN_PRESET=conservative
WA_ANTIBAN_MAX_PER_MINUTE=2
WA_ANTIBAN_MAX_PER_HOUR=10
WA_ANTIBAN_MAX_PER_DAY=20
WA_ANTIBAN_MIN_DELAY_MS=2500
WA_ANTIBAN_MAX_DELAY_MS=7000
WA_ANTIBAN_NEW_CHAT_DELAY_MS=4000
WA_ANTIBAN_WARMUP_DAYS=7
WA_ANTIBAN_STATE_FILE=./data/antiban-state.json
```

Hapus `WA_LAB_DISABLE_ANTIBAN` dan `WA_LAB_MANUAL_DIRECT_SEND` dari `.env` jika masih ada; gateway tidak lagi menyediakan jalur bypass.

Jalankan hanya service WA lab:

```bash
docker compose -f docker-compose.vps.yml up -d --build kasrt-wa-lab
docker logs -f kasrt-wa-lab
curl --fail-with-body http://127.0.0.1:3010/health
```

Workflow `.github/workflows/deploy-vps.yml` otomatis terpicu jika ada perubahan
di `wa-gateway/**`. Workflow membandingkan commit push dan hanya melakukan
build/recreate `kasrt-wa-lab` jika file gateway atau `docker-compose.vps.yml`
berubah. Setelah recreate, workflow menunggu endpoint `/health` maksimal 60
detik. Volume `wa-gateway/auth` dan `wa-gateway/data` tetap terpasang sehingga
session WhatsApp, chat lokal, dan state anti-ban tidak hilang.

Pada eksekusi manual GitHub Actions, aktifkan input
`deploy_wa_gateway=true` untuk memaksa rebuild WA Gateway meskipun tidak ada
perubahan file WA pada commit terakhir.

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

Untuk membuka mini inbox, akses `https://wa-kasrt.tripleatech.my.id/`, klik gear `⚙`, masukkan `WA_LAB_SECRET`, klik `Ambil QR` jika belum tertaut, atau `Reset Session / Ganti Nomor` jika salah nomor. Gunakan hanya untuk percakapan manual 1:1; untuk nomor baru, isi field nomor lalu klik `Chat`.

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

Jika lokasi clone berbeda, ubah `KASRT_DEPLOY_PATH` dan `KASRT_LOG_DIR` di `.github/workflows/deploy-vps.yml`. Workflow deploy berjalan ketika backend, WA Gateway, atau aset deployment berubah. Script deployment memakai lock, log, cek worktree, `git fetch` lalu `git reset --hard` ke `origin/main`, build container, dan health check. Script selalu menolak worktree yang kotor sebelum reset; file `.env` tetap aman karena tidak di-track Git.
