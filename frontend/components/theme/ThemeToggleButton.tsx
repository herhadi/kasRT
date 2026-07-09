'use client';

import { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  showLabel?: boolean;
};

export function setKasrtTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  window.localStorage.setItem('kasrt_theme', theme);
}

export function toggleKasrtTheme() {
  const root = document.documentElement;
  const nextTheme = root.classList.contains('dark') ? 'light' : 'dark';
  setKasrtTheme(nextTheme);
}

export default function ThemeToggleButton({ showLabel = false, className = '', ...props }: Props) {
  return (
    <button
      type="button"
      onClick={toggleKasrtTheme}
      aria-label="Ganti tema terang atau gelap"
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] p-2.5 text-[var(--text-primary)] shadow-sm transition hover:scale-[1.02] ${className}`}
      {...props}
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
      {showLabel ? <span className="text-sm font-semibold">Tema</span> : null}
    </button>
  );
}
