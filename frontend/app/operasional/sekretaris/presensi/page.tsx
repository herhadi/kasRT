'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import OperationalSubmenuHeader from '@/components/layout/OperationalSubmenuHeader';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ToastStack from '@/components/ui/ToastStack';
import { apiFetch } from '@/lib/api';
import useToast from '@/lib/hooks/useToast';

type AttendanceItem = { warga_id: string; nama: string; status: 'HADIR' | 'IJIN' | 'TIDAK_HADIR' };

export default function PresensiSekretarisPage() {
  const { toasts, pushToast } = useToast();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'semua' | 'hadir' | 'ijin' | 'tidak_hadir'>('semua');
  const [selected, setSelected] = useState<AttendanceItem | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceItem['status']>('TIDAK_HADIR');

  async function load() {
    const res = await apiFetch<{ success: boolean; data: AttendanceItem[] }>(`/management/meeting-attendance?month=${encodeURIComponent(month)}`);
    setAttendance(res.data || []);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat presensi'));
  }, [month]);

  async function saveAttendance() {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await apiFetch('/management/meeting-attendance', {
        method: 'POST',
        body: JSON.stringify({ month, attendance })
      });
      setMessage('Presensi kehadiran berhasil disimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan presensi');
    } finally {
      setSaving(false);
    }
  }

  const filtered = attendance.filter((a) => {
    if (filter === 'hadir') return a.status === 'HADIR';
    if (filter === 'ijin') return a.status === 'IJIN';
    if (filter === 'tidak_hadir') return a.status === 'TIDAK_HADIR';
    return true;
  });

  function openModal(item: AttendanceItem) {
    setSelected(item);
    setSelectedStatus(item.status);
  }

  function applyStatus(nextStatus: AttendanceItem['status']) {
    if (!selected) return;
    setAttendance((prev) => prev.map((p) => (p.warga_id === selected.warga_id ? { ...p, status: nextStatus } : p)));
    setSelectedStatus(nextStatus);
    setSelected(null);
  }

  function kirimRekapHadirWA() {
    const hadir = attendance.filter((a) => a.status === 'HADIR');
    if (hadir.length === 0) {
      pushToast('Belum ada warga yang hadir.', 'warning');
      return;
    }

    const [year, monthStr] = month.split('-');
    const d = new Date(`${year}-${monthStr}-01`);
    const periodText = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(d);

    let text = '📋 *REKAP PRESENSI RAPAT RT*\n';
    text += `📅 *${periodText}*\n`;
    text += `✅ *Total Hadir: ${hadir.length}*\n\n`;
    text += '*Daftar Warga Hadir:*\n';
    hadir.forEach((item, idx) => {
      text += `${idx + 1}. ${item.nama}\n`;
    });

    const nomor = process.env.NEXT_PUBLIC_WA_ADMIN || '';
    if (navigator.share) {
      navigator.share({ title: 'Rekap Presensi Rapat RT', text }).catch(() => {});
      return;
    }
    if (!nomor) {
      pushToast('Nomor WA admin belum dikonfigurasi.', 'error');
      return;
    }
    window.open(`https://api.whatsapp.com/send?phone=${nomor}&text=${encodeURIComponent(text)}`, '_blank');
  }

  return (
    <main className="min-h-screen pb-10">
      <ToastStack toasts={toasts} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <OperationalSubmenuHeader backHref="/operasional/sekretaris" title="Kembali ke Operasional Sekretaris" />
        <Card
          title="Input Presensi Rapat Bulanan"
          subtitle={`Periode ${month}`}
          headerRight={<div className="w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>}
        >
          <div className="mb-3 grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">Hadir: <b>{attendance.filter((a) => a.status === 'HADIR').length}</b></div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">Izin: <b>{attendance.filter((a) => a.status === 'IJIN').length}</b></div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">Tidak Hadir: <b>{attendance.filter((a) => a.status === 'TIDAK_HADIR').length}</b></div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm">Total: <b>{attendance.length}</b></div>
          </div>
          <div className="mb-3 grid w-full grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { key: 'semua', label: `Semua (${attendance.length})` },
              { key: 'hadir', label: `Hadir (${attendance.filter((a) => a.status === 'HADIR').length})` },
              { key: 'ijin', label: `Izin (${attendance.filter((a) => a.status === 'IJIN').length})` },
              { key: 'tidak_hadir', label: `Tidak Hadir (${attendance.filter((a) => a.status === 'TIDAK_HADIR').length})` }
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key as typeof filter)}
                className={
                  filter === f.key
                    ? 'quick-choice-btn quick-choice-btn-active min-h-[2.5rem] text-xs'
                    : 'quick-choice-btn min-h-[2.5rem] text-xs'
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {filtered.map((a) => (
              <div
                key={a.warga_id}
                role="button"
                tabIndex={0}
                onClick={() => openModal(a)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal(a);
                  }
                }}
                className={`rounded-2xl border p-4 ${
                  a.status === 'HADIR'
                    ? 'card-status-paid'
                    : a.status === 'IJIN'
                      ? 'card-status-empty'
                      : 'card-status-unpaid'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{a.nama}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid w-full grid-cols-1 gap-2 md:grid-cols-2">
            <Button className="btn-action-green" onClick={saveAttendance} disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Presensi'}
            </Button>
            <Button variant="ghost" className="btn-action-blue" onClick={kirimRekapHadirWA}>
              Kirim Rekap Hadir WA
            </Button>
          </div>
        </Card>
        {selected ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Input Presensi</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{selected.nama}</p>
              <div className="quick-choice-grid-2 mt-3">
                {[
                  { key: 'HADIR', label: 'Hadir' },
                  { key: 'IJIN', label: 'Izin' }
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => applyStatus(s.key as AttendanceItem['status'])}
                    className={
                      selectedStatus === s.key
                        ? 'quick-choice-btn quick-choice-btn-active'
                        : 'quick-choice-btn'
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" className="btn-action-blue" onClick={() => setSelected(null)}>Tutup</Button>
              </div>
            </div>
          </div>
        ) : null}
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div>
    </main>
  );
}
