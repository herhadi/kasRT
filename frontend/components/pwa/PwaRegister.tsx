'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
          console.warn('Service worker registration failed:', error);
        });
      };

      if (document.readyState === 'complete') {
        register();
      } else {
        window.addEventListener('load', register, { once: true });
      }
    }

    const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsStandalone(mediaStandalone || navigatorStandalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (!choice || choice.outcome !== 'dismissed') {
      setInstallPrompt(null);
    }
  }

  if (!installPrompt || isStandalone) return null;

  return (
    <div className="pwa-install-banner fixed inset-x-3 z-[95] mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">Install KasRT02</p>
          <p className="text-xs text-[var(--text-muted)]">Buka lebih cepat seperti aplikasi di HP.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]"
            onClick={() => setInstallPrompt(null)}
          >
            Nanti
          </button>
          <button
            type="button"
            className="btn-action-blue rounded-xl px-3 py-2 text-xs font-semibold"
            onClick={() => void installApp()}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
