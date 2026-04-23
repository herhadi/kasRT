import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import '../styles/globals.css';
import AuthProvider from '@/components/providers/AuthProvider';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin']
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin']
});

export const metadata: Metadata = {
  title: 'KasRT Modern',
  description: 'Dashboard kas RT modern berbasis Next.js'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning className={`${manrope.variable} ${spaceGrotesk.variable}`}>
      <head>
        <Script id="kasrt-theme-init" strategy="beforeInteractive">
          {`(function(){try{var key='kasrt_theme';var stored=localStorage.getItem(key);var root=document.documentElement;var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var mode=(stored==='dark'||stored==='light')?stored:(prefersDark?'dark':'light');root.classList.remove('light','dark');root.classList.add(mode);}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
