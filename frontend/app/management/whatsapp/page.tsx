'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';

type Settings = {
  enabled: boolean;
  max_recipients: number;
  daily_unique_limit: number;
  min_connected_age_minutes: number;
  selection_mode: 'random' | 'all';
  group_jid: string;
};
type WaGroup = { jid: string; name: string };

export default function ManagementWhatsappPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isRoot = hasAnyRole(user, ['root']);
  const [status, setStatus] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function refresh() {
    try {
      const [gateway, reminder] = await Promise.all([
        apiFetch<any>('/management/wa-gateway/status'),
        apiFetch<any>('/management/wa-jimpitan-reminder')
      ]);
      setStatus(gateway.data);
      setSettings(reminder.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat status');
    }
  }

  async function getQr() {
    setBusy(true);
    try {
      const result = await apiFetch<any>('/management/wa-gateway/qr');
      setQr(result.data);
      setMessage(result.data?.qr_data_url ? 'QR koneksi berhasil dimuat.' : 'QR belum tersedia.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat QR');
    } finally {
      setBusy(false);
    }
  }

  async function loadGroups() {
    setBusy(true);
    try {
      const result = await apiFetch<{ success: boolean; data: WaGroup[] }>('/management/wa-gateway/groups');
      setGroups(result.data || []);
      setMessage(`${result.data?.length || 0} grup berhasil dimuat.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar grup');
    } finally {
      setBusy(false);
    }
  }

  async function changeNumber() {
    if (!window.confirm('Ganti nomor akan memutus session saat ini. Lanjutkan?')) return;
    setBusy(true);
    try {
      await apiFetch('/management/wa-gateway/reset', { method: 'POST' });
      setQr(null);
      setMessage('Session direset, QR baru sedang disiapkan.');
      await getQr();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengganti nomor');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const result = await apiFetch<any>('/management/wa-jimpitan-reminder', {
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          max_recipients: Number(settings.max_recipients),
          min_connected_age_minutes: Number(settings.min_connected_age_minutes)
        })
      });
      setSettings(result.data);
      setMessage('Pengaturan WA Gateway berhasil disimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user && isRoot) void refresh();
  }, [user, isRoot]);

  useEffect(() => {
    if (!isRoot || status?.connected || !qr?.qr_data_url) return;
    const timer = window.setInterval(() => void getQr(), 5000);
    return () => window.clearInterval(timer);
  }, [isRoot, status?.connected, qr?.qr_data_url]);

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <FeedbackToast error={error} message={message} />
      <div className="mx-auto mt-6 w-full max-w-6xl px-4 md:px-6">
        <Card title="Manajemen WhatsApp Gateway" subtitle="Khusus root: koneksi nomor, QR, dan pengaturan reminder Jimpitan">
          {!isRoot ? (
            <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses ke menu ini.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void refresh()} disabled={busy}>Refresh Status</Button>
                <Button variant="ghost" onClick={() => void getQr()} disabled={busy}>Ambil QR</Button>
                <Button variant="ghost" onClick={() => void changeNumber()} disabled={busy}>Ganti Nomor</Button>
              </div>
              <p className="rounded-2xl border border-[var(--line)] p-4 text-sm">
                <b>Status:</b> {status?.connected ? `Connected (${status.linked_number || '-'})` : status?.state || 'Belum diperiksa'}
              </p>
              {qr?.qr_data_url ? <div className="flex justify-center rounded-2xl bg-white p-4"><img src={qr.qr_data_url} alt="QR koneksi WhatsApp" className="h-64 w-64" /></div> : null}
              {settings ? (
                <>
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] p-4 text-sm font-semibold">
                    Aktifkan reminder WhatsApp
                    <input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} className="h-5 w-5" />
                  </label>
                  <label className="block text-sm font-semibold">Penerima reminder WA
                    <select className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-normal" value={settings.selection_mode} onChange={e => setSettings({ ...settings, selection_mode: e.target.value as 'random' | 'all' })}>
                      <option value="random">Acak dengan rotasi</option>
                      <option value="all">Semua nomor valid pada shift</option>
                    </select>
                    <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">Mode semua mengirim ke seluruh petugas shift yang memiliki nomor WA valid.</span>
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="Maksimum penerima per reminder"
                      type="number"
                      min="1"
                      max="20"
                      value={String(settings.max_recipients)}
                      disabled={settings.selection_mode === 'all'}
                      className={settings.selection_mode === 'all' ? 'cursor-not-allowed opacity-60' : ''}
                      onChange={e => setSettings({ ...settings, max_recipients: Number(e.target.value) })}
                    />
                    <Input
                      label="Batas nomor unik harian gateway"
                      type="number"
                      min="1"
                      max="20"
                      value={String(settings.daily_unique_limit)}
                      onChange={e => setSettings({ ...settings, daily_unique_limit: Number(e.target.value) })}
                    />
                    <Input label="Minimum umur koneksi gateway (menit)" type="number" min="0" max="1440" value={String(settings.min_connected_age_minutes)} onChange={e => setSettings({ ...settings, min_connected_age_minutes: Number(e.target.value) })} />
                  </div>
                  <Input
                    label="JID grup WhatsApp Jimpitan"
                    value={settings.group_jid}
                    placeholder="Contoh: 6285842446299-1606444505@g.us"
                    onChange={e => setSettings({ ...settings, group_jid: e.target.value })}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[240px] flex-1">
                      <label className="block text-sm font-semibold">Pilih dari grup gateway</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-normal"
                        value={groups.some(group => group.jid === settings.group_jid) ? settings.group_jid : ''}
                        onChange={e => setSettings({ ...settings, group_jid: e.target.value })}
                      >
                        <option value="">Pilih grup yang ditemukan</option>
                        {groups.map(group => <option key={group.jid} value={group.jid}>{group.name} ({group.jid})</option>)}
                      </select>
                    </div>
                    <Button variant="ghost" onClick={() => void loadGroups()} disabled={busy}>Ambil Daftar Grup</Button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Isi dari endpoint daftar grup. Kosongkan jika notifikasi rekap Jimpitan ke grup ingin dimatikan.
                  </p>
                  <Button onClick={() => void save()} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Pengaturan WA'}</Button>
                </>
              ) : <p className="text-sm text-[var(--text-muted)]">Memuat pengaturan...</p>}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
