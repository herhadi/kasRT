'use client';
import { useEffect, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';

export default function ManagementWhatsappPage() {
  const { user, loading } = useAuth(); const router = useRouter(); const [status, setStatus] = useState<any>(null); const [qr, setQr] = useState<any>(null); const [settings, setSettings] = useState<any>(null); const [message, setMessage] = useState(''); const isRoot = hasAnyRole(user, ['root']);
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  async function refresh() { try { const [r, s] = await Promise.all([apiFetch<any>('/management/wa-gateway/status'), apiFetch<any>('/management/wa-jimpitan-reminder')]); setStatus(r.data); setSettings(s.data); } catch (e) { setMessage(e instanceof Error ? e.message : 'Gagal memuat status'); } }
  async function loadQr() { try { const r = await apiFetch<any>('/management/wa-gateway/qr'); setQr(r.data); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Gagal memuat QR'); } }
  async function saveSettings() { if (!settings) return; try { const r = await apiFetch<any>('/management/wa-jimpitan-reminder', { method: 'PUT', body: JSON.stringify({ enabled: settings.enabled, max_recipients: Number(settings.max_recipients), min_connected_age_minutes: Number(settings.min_connected_age_minutes) }) }); setSettings(r.data); setMessage('Pengaturan WA Gateway tersimpan.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan'); } }
  useEffect(() => { if (user && isRoot) void refresh(); }, [user, isRoot]);
  if (loading || !user) return <main className="min-h-screen" />;
  return <main className="min-h-screen pb-10"><Navbar /><div className="mx-auto mt-6 w-full max-w-6xl px-4 md:px-6"><Card title="Manajemen WhatsApp Gateway" subtitle="Khusus root: koneksi nomor, QR, dan pengaturan reminder Jimpitan">{!isRoot ? <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses ke menu ini.</p> : <div className="space-y-4">{message ? <p className="text-sm text-[var(--text-muted)]">{message}</p> : null}<div className="flex gap-2"><Button onClick={() => void refresh()}>Refresh Status</Button><Button variant="ghost" onClick={() => void loadQr()}>Ambil QR</Button></div><p className="rounded-2xl border border-[var(--line)] p-4 text-sm"><b>Status:</b> {status?.connected ? `Connected (${status.linked_number || '-'})` : status?.state || 'Belum diperiksa'}</p>{qr?.qr_data_url ? <div className="flex justify-center rounded-2xl bg-white p-4"><img src={qr.qr_data_url} alt="QR koneksi WhatsApp" className="h-64 w-64" /></div> : null}{settings ? <><label className="flex items-center justify-between rounded-2xl border border-[var(--line)] p-4 text-sm font-semibold">Aktifkan reminder WhatsApp<input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} className="h-5 w-5" /></label><div className="grid gap-3 md:grid-cols-2"><Input label="Maksimum penerima per reminder" type="number" min="1" max="20" value={String(settings.max_recipients)} onChange={e => setSettings({ ...settings, max_recipients: Number(e.target.value) })} /><Input label="Minimum umur koneksi gateway (menit)" type="number" min="0" max="1440" value={String(settings.min_connected_age_minutes)} onChange={e => setSettings({ ...settings, min_connected_age_minutes: Number(e.target.value) })} /></div><Button onClick={() => void saveSettings()}>Simpan Pengaturan WA</Button></> : null}</div>}</Card></div></main>;
}
