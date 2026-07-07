'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { LoginResponse } from '@/types';
import { isValidPin, normalizePinInput } from '@/lib/helpers';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [noHp, setNoHp] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.must_change_pin) {
        router.replace('/akun/ganti-pin');
        return;
      }
      router.replace('/dashboard');
    }
  }, [user, router]);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.classList.contains('dark') ? 'light' : 'dark';
    root.classList.remove('dark', 'light');
    root.classList.add(nextTheme);
    localStorage.setItem('kasrt_theme', nextTheme);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');

    if (!noHp.trim() || !pin.trim()) {
      setMessage('Nomor HP dan PIN wajib diisi.');
      return;
    }
    if (!isValidPin(pin.trim())) {
      setMessage('PIN harus 4 sampai 6 digit angka.');
      return;
    }

    try {
      setLoading(true);
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ no_hp: noHp.trim(), pin: pin.trim() })
      });

      login({ token: result.token, user: result.user });
      if (result.user.must_change_pin) {
        router.push('/akun/ganti-pin');
        return;
      }
      router.push('/dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset() {
    setResetMessage('');
    setMessage('');
    if (!noHp.trim()) {
      setResetMessage('Isi nomor HP dulu, lalu kirim permintaan reset PIN.');
      return;
    }
    try {
      setResetLoading(true);
      const result = await apiFetch<{ success: boolean; message?: string }>('/auth/request-pin-reset', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ no_hp: noHp.trim() })
      });
      setResetMessage(result.message || 'Permintaan reset PIN dikirim ke admin.');
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : 'Gagal mengirim permintaan reset PIN.');
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle dark dan light mode"
        className="theme-toggle absolute right-4 top-4 z-20 inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-strong)] p-2.5 text-[var(--text-primary)] shadow-sm transition hover:scale-[1.02]"
      >
        <span className="theme-icon theme-icon-sun" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.55 1.55M17.52 17.52l1.55 1.55M2 12h2.2M19.8 12H22M4.93 19.07l1.55-1.55M17.52 6.48l1.55-1.55" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="theme-icon theme-icon-moon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4c-.16.5-.25 1.02-.25 1.56a8.5 8.5 0 0 0 8.5 8.5c.53 0 1.05-.09 1.55-.26Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div className="glass-card relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70">
        <div className="grid md:grid-cols-2">
          <section className="hidden bg-[linear-gradient(160deg,#1e3a8a,#2563eb,#06b6d4)] p-10 text-white md:block">
            <p className="rounded-full bg-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em]">KasRT Warga</p>
            <h1 className="mt-6 max-w-sm font-[var(--font-space-grotesk)] text-4xl font-bold leading-tight">
              Sistem kas RT yang rapi, real-time, dan transparan.
            </h1>
            <p className="mt-4 max-w-sm text-sm text-blue-100">
              Pantau kontribusi, approval, dan aktivitas jimpitan dari satu dashboard modern.
            </p>
          </section>

          <section className="p-6 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Selamat Datang</p>
            <h2 className="mt-2 font-[var(--font-space-grotesk)] text-3xl font-bold text-[var(--text-primary)]">
              Masuk ke KasRT
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Gunakan nomor HP dan PIN Anda.</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">PIN awal ketik 123456</p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <Input label="Nomor HP" type="tel" placeholder="08xxxxxxxxxx" value={noHp} onChange={(e) => setNoHp(e.target.value)} />
              <Input
                label="PIN"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(normalizePinInput(e.target.value))}
                minLength={4}
                maxLength={6}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
                  onClick={() => {
                    setShowReset((prev) => !prev);
                    setResetMessage('');
                  }}
                >
                  Lupa PIN?
                </button>
              </div>

              {showReset ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">Minta reset PIN ke admin</p>
                  <p className="mt-1 text-xs leading-5">
                    Pastikan nomor HP di atas sudah benar. Admin Struktur akan mendapat permintaan reset, lalu PIN Anda diatur ke default sementara.
                  </p>
                  <Button type="button" variant="ghost" className="mt-3 w-full bg-white/70 text-amber-900" onClick={handleRequestReset} disabled={resetLoading}>
                    {resetLoading ? 'Mengirim...' : 'Kirim Permintaan Reset'}
                  </Button>
                  {resetMessage ? (
                    <p className="mt-2 rounded-xl border border-amber-200 bg-white/70 px-3 py-2 text-xs font-semibold text-amber-900">{resetMessage}</p>
                  ) : null}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
              ) : null}

              <Button type="submit" className="w-full py-3" disabled={loading}>
                {loading ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
