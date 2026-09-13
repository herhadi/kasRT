"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const PWA_INSTALL_DISMISSED_AT_KEY = "kasrt_pwa_install_dismissed_at";
const PWA_INSTALL_DISMISS_DELAY_MS = 60 * 60 * 1000;

export default function PwaRegister() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // State pendeteksi ekosistem Apple (iOS & Safari Mac)
  const [isApple, setIsApple] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isMacSafari, setIsMacSafari] = useState(false);
  const [appleDismissed, setAppleDismissed] = useState(false);

  const hasBottomNav = Boolean(
    user &&
    pathname !== "/login" &&
    pathname !== "/akun/ganti-pin" &&
    !user.must_change_pin,
  );

  useEffect(() => {
    // 1. Registrasi Service Worker
    if ("serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
          console.warn("Service worker registration failed:", error);
        });
      };

      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register, { once: true });
      }
    }

    // 2. Cek apakah sudah terinstal (Standalone Mode)
    const mediaStandalone = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;
    const navigatorStandalone = Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    );
    setIsStandalone(mediaStandalone || navigatorStandalone);

    // 3. Deteksi Spesifik Perangkat Apple & Browser Safari
    const ua = window.navigator.userAgent;
    const isIosDevice =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const iosSafari =
      isIosDevice &&
      /Safari/i.test(ua) &&
      !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
    const isMacBrowserSafari =
      ua.includes("Safari") &&
      !ua.includes("Chrome") &&
      !ua.includes("Chromium") &&
      /Macintosh|MacIntel/i.test(ua);

    setIsApple(isIosDevice || isMacBrowserSafari);
    setIsIos(isIosDevice);
    setIsIosSafari(iosSafari);
    setIsMacSafari(isMacBrowserSafari);

    // 4. Periksa status "Nanti" dari LocalStorage
    const dismissedAt = Number(
      window.localStorage.getItem(PWA_INSTALL_DISMISSED_AT_KEY) || 0,
    );
    if (
      dismissedAt &&
      Date.now() - dismissedAt < PWA_INSTALL_DISMISS_DELAY_MS
    ) {
      setAppleDismissed(true);
    }

    // 5. Handler Event untuk Android / Chrome Desktop
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const isDismissed = Number(
        window.localStorage.getItem(PWA_INSTALL_DISMISSED_AT_KEY) || 0,
      );
      if (
        isDismissed &&
        Date.now() - isDismissed < PWA_INSTALL_DISMISS_DELAY_MS
      )
        return;
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (!choice || choice.outcome !== "dismissed") {
      setInstallPrompt(null);
    }
  }

  function dismissInstallPrompt() {
    window.localStorage.setItem(
      PWA_INSTALL_DISMISSED_AT_KEY,
      String(Date.now()),
    );
    setInstallPrompt(null);
    setAppleDismissed(true);
  }

  // LOGIKA TAMPIL: Sembunyikan banner jika sudah terinstal, ATAU jika tidak ada pemicu install di Android & Apple
  if (
    isStandalone ||
    (!installPrompt && !isApple) ||
    (isApple && appleDismissed)
  )
    return null;

  // Menentukan teks panduan berdasarkan jenis perangkat Apple Anda
  const getAppleInstruction = () => {
    if (isMacSafari) {
      return "Di Safari Mac: tekan tombol Bagikan 📤 di kanan atas, lalu pilih Tambahkan ke Dock.";
    }
    if (isIosSafari) {
      return "Di Safari: tekan Bagikan 📤, lalu pilih Tambahkan ke Layar Utama.";
    }
    if (isIos) {
      return "Buka menu Bagikan browser, lalu pilih Tambahkan ke Layar Utama. Jika tidak ada, buka halaman ini di Safari.";
    }
    return "Di Safari iPhone: tekan Bagikan 📤 di bawah, lalu pilih Tambahkan ke Layar Utama.";
  };

  return (
    <div
      className={`pwa-install-banner fixed inset-x-3 z-[95] mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 shadow-xl backdrop-blur ${hasBottomNav ? "pwa-install-banner-with-bottom-nav" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Install KasRT02
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {isApple
              ? getAppleInstruction()
              : "Buka lebih cepat seperti aplikasi di HP."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]"
            onClick={dismissInstallPrompt}
          >
            Nanti
          </button>
          {!isApple && (
            <button
              type="button"
              className="btn-action-blue rounded-xl px-3 py-2 text-xs font-semibold"
              onClick={() => void installApp()}
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
