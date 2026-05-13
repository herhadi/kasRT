'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FeedbackToast from '@/components/ui/FeedbackToast';
import { apiFetch } from '@/lib/api';
import { hasAnyRole } from '@/lib/auth';
import { useAuth } from '@/lib/useAuth';
import { useRouter } from 'next/navigation';

type WebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};

export default function ManagementTelegramPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<WebhookInfo | null>(null);

  const canManage = hasAnyRole(user, ['root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function loadInfo() {
    try {
      setError('');
      const res = await apiFetch<{ success: boolean; data: WebhookInfo }>('/management/telegram/webhook-info');
      setInfo(res.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat webhook info');
    }
  }

  useEffect(() => {
    if (!user || !canManage) return;
    void loadInfo();
  }, [user, canManage]);

  async function handleSetWebhook() {
    try {
      setBusy(true);
      setError('');
      setMessage('');
      const res = await apiFetch<{ success: boolean; message?: string }>('/management/telegram/set-webhook', { method: 'POST', body: JSON.stringify({}) });
      setMessage(res.message || 'Webhook berhasil diset.');
      await loadInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal set webhook');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWebhook() {
    try {
      setBusy(true);
      setError('');
      setMessage('');
      const res = await apiFetch<{ success: boolean; message?: string }>('/management/telegram/delete-webhook', { method: 'POST', body: JSON.stringify({}) });
      setMessage(res.message || 'Webhook berhasil dihapus.');
      await loadInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal hapus webhook');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <Navbar />
      <div className="mx-auto mt-6 w-full max-w-6xl space-y-5 px-4 md:px-6">
        <FeedbackToast error={error} message={message} />
        <Card title="Manajemen Telegram Webhook" subtitle="Khusus root: cek, set, dan hapus webhook Telegram bot">
          {!canManage ? (
            <p className="text-sm text-[var(--text-muted)]">Anda tidak memiliki akses ke menu ini.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void loadInfo()} disabled={busy}>Refresh Status</Button>
                <Button variant="ghost" className="btn-action-blue" onClick={() => void handleSetWebhook()} disabled={busy}>Set Webhook</Button>
                <Button variant="ghost" onClick={() => void handleDeleteWebhook()} disabled={busy}>Hapus Webhook</Button>
              </div>
              <div className="surface-muted rounded-2xl border border-[var(--line)] p-4">
                <pre className="overflow-auto text-xs text-[var(--text-primary)]">{JSON.stringify(info || {}, null, 2)}</pre>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

