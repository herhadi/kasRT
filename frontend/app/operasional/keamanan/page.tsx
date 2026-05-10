'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';

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

export default function OperasionalKeamananPage() {
  const { user, loading } = useAuth();
  const canAccess = hasAnyRole(user, ['Admin Keamanan', 'Ketua']);
  const canWrite = hasAnyRole(user, ['Admin Keamanan', 'root']);
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

  async function load() {
    const res = await apiFetch<{ success: boolean; data: SecRow[] }>(`/security/reports?month=${month}`);
    setRows(res.data || []);
  }
  useEffect(() => { if (canAccess) void load().catch((e) => setError(e instanceof Error ? e.message : 'Gagal load')); }, [month, canAccess]);

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

  if (loading || !user) return <main className="min-h-screen" />;
  if (!canAccess) return <main className="min-h-screen"><Navbar /></main>;

  return (
    <main className="min-h-screen pb-10">
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
                    <td className="border-t border-[var(--line)] px-3 py-2 text-sm">{r.report_date}{r.report_time ? ` ${String(r.report_time).slice(0, 5)}` : ''}</td>
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
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      </div>
    </main>
  );
}
