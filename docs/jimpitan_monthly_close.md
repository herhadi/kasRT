# Penutupan Rekap Bulanan Jimpitan

## Perilaku

- Pengaturan tersedia di `/operasional/jimpitan/setting` pada kartu **Pengiriman Rekap Bulanan WhatsApp**.
- Pengiriman aktif secara default dengan jadwal `08:00 WIB`, setelah shift malam berakhir pukul 06.00.
- Pada awal bulan, worker membuat satu pekerjaan penutupan untuk bulan sebelumnya. Contoh: 1 November pukul 08.00 mengirim atau memperbarui rekap Oktober.
- Worker membaca ulang rekap dari transaksi yang tersimpan ketika pekerjaan diproses. Transaksi bulan sebelumnya tetap masuk meskipun dicatat sebelum atau sesudah pergantian periode, selama tanggal operasionalnya berada pada bulan tersebut.
- Pekerjaan penutupan unik per bulan untuk mencegah jadwal berulang membuat kiriman ganda. Worker mencoba mengejar jadwal yang terlewat dalam tiga hari kalender pertama.
- Jika pesan untuk tanggal operasional terakhir bulan itu masih dapat diperbarui melalui ID WhatsApp yang tersimpan, pesan tersebut diperbarui; jika tidak ada state pesan, worker mengirim pesan baru. Status `UNCERTAIN` tetap perlu ditinjau sebelum pengiriman ulang manual agar tidak membuat duplikat.

## Pengaturan API

- `GET /jimpitan/monthly-close-settings`
- `PUT /jimpitan/monthly-close-settings` dengan body JSON `{"enabled": true, "send_time": "08:00"}`
- Akses dibatasi untuk role `Admin Jimpitan` dan `root`.
- Pengaturan disimpan di `app_settings` dengan key `jimpitan_monthly_close`.

Jam menggunakan format 24 jam `HH:mm` dan zona waktu `Asia/Jakarta` (WIB).