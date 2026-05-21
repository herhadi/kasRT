'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { JimpitanScheduleData } from '@/types';

type SecRow = {
  id: string;
  report_date: string;
  report_time?: string;
  category: string;
  location: string;
  summary: string;
  status: 'BARU' | 'DIPROSES' | 'SELESAI';
  reporter_name: string;
};

type WargaOption = { id: string; nama: string; no_hp?: string };

function formatTanggalWib(input: string) {
  const value = String(input || '').trim();
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(parsed);
}

export default function OperasionalKeamananPage() {
  const { user, loading } = useAuth();
  const canAccess = hasAnyRole(user, ['Admin Keamanan', 'Ketua']);
  const canWrite = hasAnyRole(user, ['Admin Keamanan', 'root']);
  const canManageShifts = hasAnyRole(user, ['Admin Jimpitan', 'root']);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<SecRow[]>([]);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportTime, setReportTime] = useState('');
  const [category, setCategory] = useState('RONDA');
  const [location, setLocation] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [wargaOptions, setWargaOptions] = useState<WargaOption[]>([]);
  const [scheduleData, setScheduleData] = useState<JimpitanScheduleData | null>(null);
  const [selectedPetugasId, setSelectedPetugasId] = useState('');
  const [selectedShiftDay, setSelectedShiftDay] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [setShiftLoading, setSetShiftLoading] = useState(false);

  async function load() {
    const res = await apiFetch<{ success: boolean; data: SecRow[] }>(`/security/reports?month=${month}`);
    setRows(res.data || []);
  }

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; data: JimpitanScheduleData }>('/jimpitan/schedule');
      const data = result.data;
      setScheduleData(data);
      const options = (data?.petugas || []).map((p) => ({
        id: String(p.id),
        nama: String(p.nama || '')
      }));
      setWargaOptions(options);
      setSelectedPetugasId((previous) => {
        if (previous && options.some((row) => String(row.id) === String(previous))) return previous;
        return options[0]?.id ? String(options[0].id) : '';
      });
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => { if (canAccess) void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal load')); }, [month, canAccess]);

  useEffect(() => {
    if (!canManageShifts) return;
    void loadSchedule().catch((e) => {
      setError(e instanceof Error ? e.message : 'Gagal memuat data shift');
    });
  }, [canManageShifts, loadSchedule]);

  async function submitReport() {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/security/reports', {
        method: 'POST',
        body: JSON.stringify({ report_date: reportDate, report_time: reportTime, category, location, summary })
      });
      setLocation('');
      setSummary('');
      setMessage('Laporan keamanan tersimpan.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal simpan laporan');
    } finally { setBusy(false); }
  }

  async function updateStatus(id: string, status: SecRow['status']) {
    try {
      setBusy(true); setError(''); setMessage('');
      await apiFetch('/security/reports/status', { method: 'POST', body: JSON.stringify({ id, status }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal ubah status');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!selectedPetugasId || !scheduleData?.petugas) return;
    const selected = scheduleData.petugas.find((petugas) => String(petugas.id) === String(selectedPetugasId));
    setSelectedShiftDay(selected?.jimpitan_shift_hari ? String(selected.jimpitan_shift_hari) : '');
  }, [selectedPetugasId, scheduleData]);

  useEffect(() => {
    if (!wargaOptions.length) {
      setSelectedPetugasId('');
      return;
    }
    setSelectedPetugasId((prev) => {
      if (prev && wargaOptions.some((warga) => String(warga.id) === String(prev))) return prev;
      return String(wargaOptions[0].id);
    });
  }, [wargaOptions]);

  async function handleSetPetugasShift() {
    const userId = String(selectedPetugasId || '').trim();
    const shiftHari = selectedShiftDay === '' ? null : Number(selectedShiftDay);
    if (!userId) {
      setError('Pilih warga terlebih dahulu.');
      return;
    }
    try {
      setSetShiftLoading(true); setError(''); setMessage('');
      await apiFetch('/jimpitan/set-petugas-shift', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, shift_hari: shiftHari })
      });
      await loadSchedule();
      setMessage('Jadwal petugas berhasil diperbarui.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal update jadwal petugas');
    } finally {
      setSetShiftLoading(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;
  if (!canAccess) return <main className="min-h-screen"><Navbar /></main>;

  const weeklyGroups = useMemo(() => {
    const days = scheduleData?.shift_days || [];
    const petugas = scheduleData?.petugas || [];
    return days.map((day) => ({
      ...day,
      members: petugas.filter((person) => person.jimpitan_shift_hari === day.id)
    }));
  }, [scheduleData]);

  return (
    <main className="min-h-screen pb-10">
      <FeedbackToast error={error} message={message} />
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        {canWrite ? (
          <Card title="Input Laporan Keamanan" subtitle="Catat kondisi lingkungan dan isu terkini">
            <div className="grid gap-3 md:grid-cols-4">
              <Input label="Tanggal" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
              <Input label="Waktu" type="time" value={reportTime} onChange={(e) => setReportTime(e.target.value)} />
              <label className="block space-y-2"><span className="text-sm font-semibold text-[var(--text-primary)]">Kategori</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"><option>RONDA</option><option>PARKIR</option><option>TAMU</option><option>KEBISINGAN</option><option>DARURAT</option><option>LAINNYA</option></select></label>
              <Input label="Lokasi" value={location} onChange={(e) => setLocation(e.target.value)} />
              <div className="md:col-span-3"><Input label="Ringkasan Kejadian" value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
              <div className="flex items-end"><Button className="w-full" onClick={submitReport} disabled={busy}>Simpan Laporan</Button></div>
            </div>
          </Card>
        ) : null}

        <Card title="Riwayat Laporan Keamanan" subtitle="Filter per bulan">
          <div className="mb-3 w-full max-w-[220px]"><Input label="Periode" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
              <thead><tr className="bg-[var(--surface-strong)]"><th className="px-3 py-2 text-left text-xs">Tanggal</th><th className="px-3 py-2 text-left text-xs">Kategori</th><th className="px-3 py-2 text-left text-xs">Lokasi</th><th className="px-3 py-2 text-left text-xs">Ringkasan</th><th className="px-3 py-2 text-left text-xs">Pelapor</th><th className="px-3 py-2 text-left text-xs">Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">
                      {formatTanggalWib(r.report_date)}
                      {r.report_time ? ` ${String(r.report_time).slice(0, 5)} WIB` : ''}
                    </td>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.category}</td>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.location}</td>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.summary}</td>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.reporter_name}</td>
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">
                      {canWrite ? (
                        <select value={r.status} onChange={(e) => void updateStatus(r.id, e.target.value as SecRow['status'])} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs">
                          <option value="BARU">BARU</option>
                          <option value="DIPROSES">DIPROSES</option>
                          <option value="SELESAI">SELESAI</option>
                        </select>
                      ) : r.status}
                    </td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={6} className="px-3 py-3 text-sm text-[var(--text-muted)]">Belum ada laporan bulan ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>

        {canManageShifts ? (
          <>
            <Card title="Atur Shift Petugas" subtitle="Pilih warga/petugas lalu tentukan hari shift, hasilnya langsung masuk tabel mingguan">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-2 text-sm font-semibold">
                  <span>Pilih Warga</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={selectedPetugasId}
                    onChange={(event) => setSelectedPetugasId(event.target.value)}
                  >
                    <option value="">Pilih warga</option>
                    {wargaOptions.map((warga) => (
                      <option key={warga.id} value={String(warga.id)}>
                        {warga.nama}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>Pilih Hari</span>
                  <select
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
                    value={selectedShiftDay}
                    onChange={(event) => setSelectedShiftDay(event.target.value)}
                  >
                    <option value="">Belum diatur</option>
                    {(scheduleData?.shift_days || []).map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={handleSetPetugasShift}
                    disabled={setShiftLoading || scheduleLoading || !selectedPetugasId}
                  >
                    {setShiftLoading ? 'Menyimpan...' : 'Simpan Jadwal'}
                  </Button>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
                {scheduleLoading ? 'Memuat referensi jadwal...' : 'Pilih user lalu set hari. Jika ingin mengosongkan shift, pilih "Belum diatur".'}
              </div>
            </Card>

            <Card title="Tabel Jadwal Mingguan" subtitle="Referensi petugas jimpitan per hari (Ahad - Sabtu)">
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[var(--line)]">
                  <thead>
                    <tr className="bg-[var(--surface-strong)]">
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Hari</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Petugas Terjadwal</th>
                      <th className="border-b border-[var(--line)] px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyGroups.map((day) => (
                      <tr key={day.id} className="bg-[var(--surface)]">
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{day.label}</td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-sm text-[var(--text-primary)]">
                          {day.members.length > 0 ? day.members.map((person) => person.nama).join(', ') : 'Belum ada petugas'}
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-right text-sm font-semibold text-[var(--accent)]">{day.members.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
