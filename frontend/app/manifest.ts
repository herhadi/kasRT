import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KasRT 02/04 Perum GKA',
    short_name: 'KasRT02',
    description: 'Portal layanan warga Perum Griya Kalisalak Asri',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f2f6ff',
    theme_color: '#1d4ed8',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/kasrt-icon-v2-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/kasrt-icon-v2-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/kasrt-icon-v2-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
