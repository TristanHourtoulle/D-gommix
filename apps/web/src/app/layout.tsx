import type { Metadata, Viewport } from 'next'
import { Cinzel } from 'next/font/google'
import './globals.css'

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Dégommix',
  description: 'Marque les dégommages de tes parties entre amis',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${cinzel.variable} antialiased`}>{children}</body>
    </html>
  )
}
