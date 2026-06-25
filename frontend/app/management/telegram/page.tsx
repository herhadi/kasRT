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
type WebhookConfig = {
  required_env?: string[];
  optional_env?: string[];
  backend_public_url?: string;
  webhook_url_from_env?: string;
  has_webhook_secret?: boolean;
  has_bot_username?: boolean;
};

export default function ManagementTelegramPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');

  const canManage = hasAnyRole(user, ['root']);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function loadInfo() {
    try {
      setError('');
      const res = await apiFetch<{ success: boolean; data: WebhookInfo; config?: WebhookConfig }>('/management/telegram/webhook-info');
      setInfo(res.data || null);
      setConfig(res.config || null);
      setWebhookUrl((current) => current || res.config?.webhook_url_from_env || '');
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
      const res = await apiFetch<{ success: boolean; message?: string }>('/management/telegram/set-webhook', {
        method: 'POST',
        body: JSON.stringify({ webhook_url: webhookUrl.trim() || undefined })
      });
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
              <div className="grid gap-3 md:grid-cols-2">
                <div className="surface-muted rounded-2xl border border-[var(--line)] p-4 text-sm">
                  <p className="font-bold text-[var(--text-primary)]">Variabel backend</p>
                  <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                    <p>Wajib: <b>{(config?.required_env || ['TELEGRAM_BOT_TOKEN', 'BACKEND_PUBLIC_URL']).join(', ')}</b></p>
                    <p>Opsional: <b>{(config?.optional_env || ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_BOT_USERNAME']).join(', ')}</b></p>
                    <p>BACKEND_PUBLIC_URL: <b>{config?.backend_public_url || '-'}</b></p>
                    <p>Secret webhook: <b>{config?.has_webhook_secret ? 'Ada' : 'Belum ada'}</b></p>
                    <p>Bot username env: <b>{config?.has_bot_username ? 'Ada' : 'Bisa auto dari getMe'}</b></p>
                  </div>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Webhook URL</span>
                  <input
                    value={webhookUrl}
                    onChange={(event) => setWebhookUrl(event.target.value)}
                    placeholder="https://api-kasrt.tripleatech.my.id/telegram/webhook"
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                  <span className="block text-xs text-[var(--text-muted)]">
                    Jika env sudah benar, isi otomatis dari BACKEND_PUBLIC_URL. Untuk Cloudflare Tunnel biasanya: <b>https://api-kasrt.tripleatech.my.id/telegram/webhook</b>
                  </span>
                </label>
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
