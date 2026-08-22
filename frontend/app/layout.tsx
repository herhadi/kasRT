import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '../styles/globals.css';
import AuthProvider from '@/components/providers/AuthProvider';
import PwaRegister from '@/components/pwa/PwaRegister';
import BottomNav from '@/components/layout/BottomNav';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kas02.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: 'KasRT 02/04',
  description: 'Perum Griya Kalisalak Asri',
  manifest: '/manifest.webmanifest',
  applicationName: 'KasRT02',
  appleWebApp: {
    capable: true,
    title: 'KasRT02',
    statusBarStyle: 'black-translucent'
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      { url: '/icons/kasrt-icon-v2-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/kasrt-icon-v2-512.png', type: 'image/png', sizes: '512x512' }
    ],
    apple: '/apple-icon.png'
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: '/',
    siteName: 'KasRT 02/04',
    title: 'KasRT 02/04',
    description: 'Portal layanan warga Perum Griya Kalisalak Asri',
    images: [
      {
        url: '/icons/kasrt-icon-v3-source.png',
        width: 1024,
        height: 1024,
        alt: 'KasRT 02/04'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KasRT 02/04',
    description: 'Portal layanan warga Perum Griya Kalisalak Asri',
    images: ['/icons/kasrt-icon-v3-source.png']
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1d4ed8' },
    { media: '(prefers-color-scheme: dark)', color: '#050b18' }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <Script id="kasrt-theme-init" strategy="beforeInteractive">
          {`(function(){try{var key='kasrt_theme';var stored=localStorage.getItem(key);var root=document.documentElement;var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var mode=(stored==='dark'||stored==='light')?stored:(prefersDark?'dark':'light');root.classList.remove('light','dark');root.classList.add(mode);}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
        <AuthProvider>
          {children}
          <BottomNav />
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
