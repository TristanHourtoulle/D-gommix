import type { Metadata, Viewport } from 'next'
import { Cinzel } from 'next/font/google'
import { ThemeScript } from '@/components/theme/theme-script'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Dégommix',
  description: 'Marque les dégommages de tes parties entre amis',
  applicationName: 'Dégommix',
  appleWebApp: {
    capable: true,
    /*
     * `black-translucent` is the only value that lets the installed PWA draw
     * edge-to-edge under the iOS status bar. With `default` iOS reserves the
     * strip and paints it itself — an opaque black band above the app. Every
     * top-of-page shell compensates with `env(safe-area-inset-top)` so the
     * content still starts below the clock.
     */
    statusBarStyle: 'black-translucent',
    title: 'Dégommix',
  },
  icons: {
    apple: '/icons-pwa/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ece0c4' },
    { media: '(prefers-color-scheme: dark)', color: '#1c150d' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${cinzel.variable} antialiased`}>
        {/*
          The one and only toaster. It sits above every route group so a toast
          fired right before `router.push()` outlives the navigation instead of
          dying with the layout that owned it (« Invitation envoyée ! » from
          Amis landing in /lobby). `children` stays a server subtree.
        */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
