import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '../styles/globals.css';
import AuthProvider from '@/components/providers/AuthProvider';
import PwaRegister from '@/components/pwa/PwaRegister';

export const metadata: Metadata = {
  title: 'KasRT Modern',
  description: 'Dashboard kas RT modern berbasis Next.js',
  manifest: '/manifest.webmanifest',
  applicationName: 'KasRT02',
  appleWebApp: {
    capable: true,
    title: 'KasRT02',
    statusBarStyle: 'default'
  },
  icons: {
    icon: '/icons/kasrt-icon.svg',
    apple: '/icons/kasrt-icon.svg'
  }
};

export const viewport: Viewport = {
  themeColor: '#0f766e'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <Script id="kasrt-theme-init" strategy="beforeInteractive">
          {`(function(){try{var key='kasrt_theme';var stored=localStorage.getItem(key);var root=document.documentElement;var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var mode=(stored==='dark'||stored==='light')?stored:(prefersDark?'dark':'light');root.classList.remove('light','dark');root.classList.add(mode);}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
        <AuthProvider>{children}</AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
