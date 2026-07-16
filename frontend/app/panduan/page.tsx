'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { useAuth } from '@/lib/useAuth';

type GuideSection = {
  id: string;
  title: string;
  icon: string;
  summary: string;
  quickLinks: Array<{ href: string; label: string }>;
  steps: string[];
  notes: string[];
};

const guideSections: GuideSection[] = [
  {
    id: 'mulai-cepat',
    title: 'Mulai Cepat',
    icon: '🚀',
    summary: 'Alur umum KasRT untuk warga dan pengurus.',
    quickLinks: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/akun', label: 'Akun Saya' }
    ],
    steps: [
      'Login memakai nomor HP dan PIN.',
      'Warga melihat kewajiban, saldo, jadwal jimpitan, dan status Telegram dari Dashboard.',
      'Pengurus membuka menu Operasional sesuai jabatan.',
      'Transaksi penting masuk Inbox/Approval sebelum menjadi kas final.'
    ],
    notes: [
      'Jika diminta ganti PIN, selesaikan dari menu akun terlebih dulu.',
      'Notifikasi otomatis utama memakai Telegram bot resmi.'
    ]
  },
  {
    id: 'jimpitan',
    title: 'Jimpitan',
    icon: '🧺',
    summary: 'Input jimpitan, setoran shift V2, share rekap WA manual, dan approval admin.',
    quickLinks: [
      { href: '/jimpitan', label: 'Input Jimpitan' },
      { href: '/operasional/jimpitan', label: 'Operasional Jimpitan' },
      { href: '/approval', label: 'Approval' }
    ],
    steps: [
      'Petugas shift membuka Jimpitan pada hari tugasnya.',
      'Mode V2 global: isi total pendapatan hari ini lalu ajukan setoran shift.',
      'Jika sudah ajukan setoran, petugas yang sama tidak bisa mengajukan ulang untuk tanggal itu.',
      'Share Shift WA dan Share Bulanan WA bisa dipakai petugas shift untuk laporan manual.',
      'Admin Jimpitan/root melakukan approval agar setoran menjadi final.'
    ],
    notes: [
      'Tanda bintang pada rekap WA berarti setoran belum approve admin.',
      'Rekap WA adalah share manual, bukan gateway otomatis.'
    ]
  },
  {
    id: 'bendahara',
    title: 'Bendahara & Approval',
    icon: '🧾',
    summary: 'Iuran wajib, transfer kas, pengeluaran, dan approval keuangan.',
    quickLinks: [
      { href: '/operasional/bendahara', label: 'Operasional Bendahara' },
      { href: '/approval/bendahara', label: 'Approval Bendahara' },
      { href: '/bendahara', label: 'Dashboard Bendahara' }
    ],
    steps: [
      'Bendahara mencatat iuran wajib atau membuat pengajuan transfer/pengeluaran.',
      'Transfer kas dan pengeluaran masuk status PENDING.',
      'Ketua, Sekretaris, Plt Ketua, atau root menyetujui dari Inbox.',
      'Saldo kas berubah setelah transaksi APPROVED.'
    ],
    notes: [
      'Saldo tidak boleh diubah langsung tanpa transaksi.',
      'Aktor transaksi selalu mengikuti user yang sedang login.'
    ]
  },
  {
    id: 'internet',
    title: 'Internet',
    icon: '🌐',
    summary: 'Kelola iuran internet, anggota, tunggakan, dan pengeluaran kas internet.',
    quickLinks: [
      { href: '/operasional/internet', label: 'Operasional Internet' },
      { href: '/approval/internet', label: 'Approval Internet' },
      { href: '/internet', label: 'Dashboard Internet' }
    ],
    steps: [
      'Admin Internet mengatur anggota dan tarif aktif.',
      'Input iuran dilakukan per periode.',
      'Permintaan aktivasi/nonaktif anggota diproses lewat approval.',
      'Warga bisa cek kewajiban lewat Dashboard atau Telegram /cek_inet.'
    ],
    notes: [
      'Tunggakan dihitung dari periode aktif anggota.',
      'Pengeluaran internet tetap mengikuti kas modul internet.'
    ]
  },
  {
    id: 'lingkungan',
    title: 'Lingkungan',
    icon: '🌿',
    summary: 'Kelola iuran lingkungan, anggota, tunggakan, dan kas lingkungan.',
    quickLinks: [
      { href: '/operasional/lingkungan', label: 'Operasional Lingkungan' },
      { href: '/approval/lingkungan', label: 'Approval Lingkungan' },
      { href: '/lingkungan', label: 'Dashboard Lingkungan' }
    ],
    steps: [
      'Admin Lingkungan mengatur anggota dan tarif.',
      'Input pembayaran iuran lingkungan per periode.',
      'Approval digunakan untuk perubahan status keanggotaan.',
      'Warga bisa cek kewajiban lewat Telegram /cek_lingk.'
    ],
    notes: [
      'Gunakan periode yang benar sebelum input iuran.',
      'Data migrasi histori dipisah dari input operasional berjalan.'
    ]
  },
  {
    id: 'sosial',
    title: 'Sosial',
    icon: '🤝',
    summary: 'Kelola kas sosial, transfer dari bendahara, dan pengeluaran sosial.',
    quickLinks: [
      { href: '/operasional/sosial', label: 'Operasional Sosial' },
      { href: '/sosial', label: 'Dashboard Sosial' },
      { href: '/approval', label: 'Inbox Approval' }
    ],
    steps: [
      'Dana sosial masuk lewat transfer kas yang dibuat Bendahara.',
      'Admin Sosial mencatat pengeluaran sosial sesuai kebutuhan.',
      'Pengeluaran tetap mengikuti alur PENDING lalu APPROVED.',
      'Pantau riwayat dan saldo dari Operasional Sosial.'
    ],
    notes: [
      'Sosial tidak memakai tunggakan warga bulanan.',
      'Gunakan catatan transaksi yang jelas untuk audit.'
    ]
  },
  {
    id: 'koperasi',
    title: 'Koperasi',
    icon: '🏦',
    summary: 'Kelola iuran koperasi, pinjaman, simulasi, dan approval pembiayaan.',
    quickLinks: [
      { href: '/operasional/koperasi', label: 'Operasional Koperasi' },
      { href: '/approval/koperasi', label: 'Approval Koperasi' },
      { href: '/koperasi', label: 'Dashboard Koperasi' }
    ],
    steps: [
      'Admin Koperasi mengatur anggota dan iuran.',
      'Draft pinjaman dibuat dari operasional koperasi.',
      'Simulasi angsuran membantu menentukan skema flat/menurun.',
      'Approval digunakan sebelum pembiayaan aktif.'
    ],
    notes: [
      'Cek tenor dan nominal angsuran sebelum menyimpan.',
      'Pisahkan iuran anggota dan transaksi pinjaman.'
    ]
  },
  {
    id: 'tabungan',
    title: 'Tabungan Pembangunan',
    icon: '🏗️',
    summary: 'Kelola setoran warga, saldo awal migrasi, dan pengeluaran kegiatan pembangunan.',
    quickLinks: [
      { href: '/operasional/tabungan', label: 'Operasional Pembangunan' },
      { href: '/operasional/tabungan/input', label: 'Input Tabungan' },
      { href: '/tabungan', label: 'Dashboard Tabungan' }
    ],
    steps: [
      'Admin Pembangunan mengatur anggota dan minimum setoran.',
      'Input setoran warga per periode.',
      'Jika salah input, gunakan koreksi setoran pada data terkait.',
      'Pengeluaran kegiatan memotong saldo sesuai data anggota aktif.'
    ],
    notes: [
      'Saldo awal migrasi dipisah dari setoran berjalan.',
      'Pastikan periode input sesuai bulan transaksi.'
    ]
  },
  {
    id: 'keamanan',
    title: 'Keamanan',
    icon: '🛡️',
    summary: 'Pantau jadwal keamanan, laporan kondisi, dan tindak lanjut.',
    quickLinks: [
      { href: '/operasional/keamanan', label: 'Operasional Keamanan' },
      { href: '/keamanan', label: 'Dashboard Keamanan' }
    ],
    steps: [
      'Admin Keamanan membuka Operasional Keamanan.',
      'Catat laporan kondisi atau isu keamanan.',
      'Pantau status tindak lanjut dari dashboard.',
      'Gunakan share jadwal WA manual bila perlu.'
    ],
    notes: [
      'Gunakan deskripsi singkat dan jelas saat membuat laporan.',
      'Pastikan status tindak lanjut diperbarui.'
    ]
  },
  {
    id: 'telegram',
    title: 'Telegram Bot',
    icon: '🤖',
    summary: 'Aktivasi Telegram untuk notifikasi dan command cek kewajiban.',
    quickLinks: [
      { href: '/management/telegram', label: 'Manajemen Telegram' },
      { href: '/akun', label: 'Akun Saya' }
    ],
    steps: [
      'Warga membuka akun lalu membuat link aktivasi Telegram.',
      'Klik link aktivasi dan mulai chat dengan bot.',
      'Gunakan /help untuk melihat command aktif.',
      'Command aktif meliputi /cek_inet dan /cek_lingk.'
    ],
    notes: [
      'Jika notifikasi gagal, cek koneksi backend ke api.telegram.org.',
      'Jika ganti akun Telegram, putuskan koneksi lama dari akun.'
    ]
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: '🧰',
    summary: 'Masalah umum dan langkah cek cepat.',
    quickLinks: [
      { href: '/management', label: 'Management' },
      { href: '/approval', label: 'Inbox' }
    ],
    steps: [
      'Jika tombol input terkunci, cek role, jadwal shift, status approval, dan periode.',
      'Jika data tidak muncul, refresh halaman dan pastikan periode sudah benar.',
      'Jika notifikasi Telegram gagal, cek status bot dan log backend.',
      'Jika saldo tidak berubah, cek apakah transaksi masih PENDING.'
    ],
    notes: [
      'Catat tanggal operasional saat melaporkan masalah.',
      'Untuk bug data, sertakan nama modul, periode, dan screenshot bila ada.'
    ]
  }
];

export default function PanduanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const filteredSections = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return guideSections;
    return guideSections.filter((section) => {
      const haystack = [
        section.title,
        section.summary,
        ...section.steps,
        ...section.notes,
        ...section.quickLinks.map((link) => link.label)
      ].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [query]);

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-12">
      <Navbar sticky={false} />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Pusat Bantuan</p>
          <div className="mt-2 grid gap-4 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Panduan KasRT</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                Satu tempat untuk memahami alur kerja tiap modul, tombol penting, approval, dan masalah umum. Tombol panduan di modul akan diarahkan ke bagian terkait di halaman ini.
              </p>
            </div>
            <Input
              label="Cari panduan"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Contoh: jimpitan, approval, telegram"
            />
          </div>
        </section>

        <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 md:top-0 md:mx-0 md:rounded-2xl md:border">
          <div className="flex min-w-max gap-2">
            {guideSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {section.icon} {section.title}
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {filteredSections.map((section) => (
            <Card
              key={section.id}
              title={`${section.icon} ${section.title}`}
              subtitle={section.summary}
              className="scroll-mt-24"
            >
              <section id={section.id} className="scroll-mt-28 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {section.quickLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="btn-action-blue rounded-xl px-3 py-1.5 text-xs font-semibold"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Langkah Kerja</h2>
                    <ol className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-primary)]">
                      {section.steps.map((step, index) => (
                        <li key={step} className="flex gap-2">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <h2 className="text-sm font-bold">Catatan Penting</h2>
                    <ul className="mt-3 space-y-2 text-sm leading-6">
                      {section.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <span aria-hidden="true">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </Card>
          ))}
          {filteredSections.length === 0 ? (
            <Card title="Panduan tidak ditemukan" subtitle="Coba kata kunci lain, misalnya jimpitan, approval, telegram, atau iuran.">
              <button
                type="button"
                onClick={() => setQuery('')}
                className="btn-action-blue rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Reset pencarian
              </button>
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  );
}
