import type { Metadata, Viewport } from 'next'
import { Cinzel } from 'next/font/google'
import { ThemeScript } from '@/components/theme/theme-script'
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
    statusBarStyle: 'default',
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
      <body className={`${cinzel.variable} antialiased`}>{children}</body>
    </html>
  )
}
