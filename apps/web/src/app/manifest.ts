import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dégommix',
    short_name: 'Dégommix',
    description: 'Marque les dégommages de tes parties entre amis',
    lang: 'fr',
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/',
    scope: '/',
    theme_color: '#ece0c4',
    background_color: '#ece0c4',
    icons: [
      {
        src: '/icons-pwa/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons-pwa/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons-pwa/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
