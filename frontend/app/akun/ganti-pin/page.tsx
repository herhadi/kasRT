'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import ToastStack from '@/components/ui/ToastStack';
import { apiFetch } from '@/lib/api';
import { isValidPin, normalizePinInput } from '@/lib/helpers';
import useToast from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/useAuth';

export default function WajibGantiPinPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const { toasts, pushToast } = useToast();
  const [pinBaru, setPinBaru] = useState('');
  const [ulangPinBaru, setUlangPinBaru] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && !user.must_change_pin) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidPin(pinBaru)) {
      pushToast('PIN baru harus 4 sampai 6 digit angka.', 'warning');
      return;
    }
    if (pinBaru !== ulangPinBaru) {
      pushToast('Ulangi PIN baru tidak sama.', 'warning');
      return;
    }

    try {
      setSaving(true);
      await apiFetch('/auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({
          new_pin: pinBaru,
          repeat_new_pin: ulangPinBaru
        })
      });
      refreshUser({ ...(user as NonNullable<typeof user>), must_change_pin: false });
      pushToast('PIN berhasil diganti.', 'success');
      window.setTimeout(() => router.replace('/dashboard'), 450);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal mengganti PIN', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen px-4 py-10">
      <ToastStack toasts={toasts} />
      <div className="mx-auto w-full max-w-lg">
        <Card title="Ganti PIN Pertama Kali" subtitle="Untuk keamanan, silakan ganti PIN default Anda sebelum lanjut">
          <form className="space-y-3" onSubmit={submit}>
            <Input
              label="PIN Baru"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinBaru}
              onChange={(e) => setPinBaru(normalizePinInput(e.target.value))}
              minLength={4}
              maxLength={6}
            />
            <Input
              label="Ulangi PIN Baru"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={ulangPinBaru}
              onChange={(e) => setUlangPinBaru(normalizePinInput(e.target.value))}
              minLength={4}
              maxLength={6}
            />
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan dan Masuk Dashboard'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
