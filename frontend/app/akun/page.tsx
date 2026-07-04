'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import ToastStack from '@/components/ui/ToastStack';
import { apiFetch } from '@/lib/api';
import { isValidPin, normalizePinInput } from '@/lib/helpers';
import useToast from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/useAuth';
import type { UserSession } from '@/types';

export default function AkunPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const { toasts, pushToast } = useToast();

  const [profileNama, setProfileNama] = useState('');
  const [profileNoHp, setProfileNoHp] = useState('');
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [pinBaru2, setPinBaru2] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [activatingTelegram, setActivatingTelegram] = useState(false);
  const [switchingTelegram, setSwitchingTelegram] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setProfileNama(String(user?.nama || ''));
    setProfileNoHp(String(user?.no_hp || ''));
  }, [user]);

  async function refreshTelegramStatus() {
    try {
      const meResult = await apiFetch<{ success: boolean; user: UserSession }>('/auth/me');
      refreshUser(meResult.user);
      pushToast(
        meResult.user.telegram_connected ? 'Telegram sudah terhubung.' : 'Telegram belum terhubung.',
        meResult.user.telegram_connected ? 'success' : 'warning'
      );
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal memperbarui status Telegram', 'error');
    }
  }

  async function activateTelegram() {
    try {
      setActivatingTelegram(true);
      const res = await apiFetch<{ success: boolean; activation_link: string; expires_in_minutes?: number }>(
        '/auth/telegram-activation-link',
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (!res.activation_link) {
        pushToast('Link aktivasi Telegram tidak tersedia.', 'error');
        return;
      }
      window.open(res.activation_link, '_blank', 'noopener,noreferrer');
      pushToast(`Link aktivasi Telegram dibuka. Berlaku ${res.expires_in_minutes || 15} menit.`, 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal membuat link aktivasi Telegram', 'error');
    } finally {
      setActivatingTelegram(false);
    }
  }

  async function switchTelegramAccount() {
    try {
      setSwitchingTelegram(true);
      await apiFetch<{ success: boolean; message?: string }>('/auth/telegram-disconnect', {
        method: 'POST',
        body: JSON.stringify({})
      });
      await activateTelegram();
      const meResult = await apiFetch<{ success: boolean; user: UserSession }>('/auth/me');
      refreshUser(meResult.user);
      pushToast('Akun Telegram lama dilepas. Lanjutkan aktivasi akun Telegram baru.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal mengganti akun Telegram', 'error');
    } finally {
      setSwitchingTelegram(false);
    }
  }

  async function saveProfile() {
    if (!profileNama.trim() || !profileNoHp.trim()) {
      pushToast('Nama dan nomor HP wajib diisi.', 'warning');
      return;
    }
    try {
      setSavingProfile(true);
      const res = await apiFetch<{ success: boolean; user: UserSession; message?: string }>('/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ nama: profileNama.trim(), no_hp: profileNoHp.trim() })
      });
      refreshUser(res.user);
      pushToast(res.message || 'Profil berhasil diperbarui.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal menyimpan profil', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePin() {
    if (!pinLama || !pinBaru || !pinBaru2) {
      pushToast('PIN lama dan PIN baru wajib diisi.', 'warning');
      return;
    }
    if (!isValidPin(pinBaru)) {
      pushToast('PIN baru harus 4 sampai 6 digit angka.', 'warning');
      return;
    }
    if (pinBaru !== pinBaru2) {
      pushToast('Ulangi PIN baru tidak sama.', 'warning');
      return;
    }
    try {
      setSavingPin(true);
      await apiFetch('/auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({ old_pin: pinLama, new_pin: pinBaru, repeat_new_pin: pinBaru2 })
      });
      setPinLama('');
      setPinBaru('');
      setPinBaru2('');
      pushToast('PIN berhasil diperbarui.', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Gagal mengganti PIN', 'error');
    } finally {
      setSavingPin(false);
    }
  }

  if (loading || !user) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen pb-10">
      <ToastStack toasts={toasts} />
      <Navbar sticky={false} />

      <div className="mx-auto mt-6 w-full max-w-4xl space-y-5 px-4 md:px-6">
        <section className="glass-card rounded-3xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Profil</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">Akun & Pengaturan</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Kelola profil, Telegram, keanggotaan, dan keamanan akun.</p>
        </section>

        <Card title="Profil" subtitle="Data dasar akun warga">
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Nama" value={profileNama} onChange={(e) => setProfileNama(e.target.value)} />
            <Input label="Nomor HP" value={profileNoHp} onChange={(e) => setProfileNoHp(e.target.value)} />
          </div>
          <Button className="mt-3 w-full md:w-auto" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
          </Button>
        </Card>

        <Card title="Telegram" subtitle="Kanal notifikasi approval dan reminder">
          <div className="surface-muted rounded-2xl border border-[var(--line)] px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {user.telegram_connected ? 'Telegram Terhubung' : 'Telegram Belum Terhubung'}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {user.telegram_connected
                    ? 'Akun ini bisa menerima notifikasi approval.'
                    : 'Aktifkan agar notifikasi approval masuk ke Telegram Anda.'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {!user.telegram_connected ? (
                  <Button className="w-full sm:w-auto" onClick={activateTelegram} disabled={activatingTelegram}>
                    {activatingTelegram ? 'Membuat Link...' : 'Aktifkan Telegram'}
                  </Button>
                ) : (
                  <Button className="w-full sm:w-auto" onClick={switchTelegramAccount} disabled={switchingTelegram || activatingTelegram}>
                    {switchingTelegram ? 'Memproses...' : 'Ganti Akun Telegram'}
                  </Button>
                )}
                <Button variant="ghost" className="w-full sm:w-auto" onClick={refreshTelegramStatus}>
                  Refresh Status
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Keanggotaan Saya" subtitle="Internet, lingkungan, dan koperasi">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              Lihat status anggota, ajukan aktif, atau ajukan nonaktif dari halaman keanggotaan.
            </p>
            <Link href="/akun/keanggotaan" className="btn-action-blue inline-flex min-h-[2.5rem] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold">
              Buka Keanggotaan
            </Link>
          </div>
        </Card>

        <Card title="Keamanan" subtitle="Ganti PIN akun">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              label="PIN Lama"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinLama}
              onChange={(e) => setPinLama(normalizePinInput(e.target.value))}
            />
            <Input
              label="PIN Baru"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinBaru}
              onChange={(e) => setPinBaru(normalizePinInput(e.target.value))}
            />
            <Input
              label="Ulangi PIN Baru"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinBaru2}
              onChange={(e) => setPinBaru2(normalizePinInput(e.target.value))}
            />
          </div>
          <Button className="mt-3 w-full md:w-auto" onClick={savePin} disabled={savingPin}>
            {savingPin ? 'Menyimpan...' : 'Simpan PIN'}
          </Button>
        </Card>
      </div>
    </main>
  );
}
