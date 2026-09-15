import type { Metadata, Viewport } from 'next'
import { Archivo } from 'next/font/google'

import { SessionBoot } from '@/components/session-boot'
import { publicEnv } from '@/lib/env.public'
import './globals.css'

// One family, two jobs — the width axis carries the difference between a label
// and a number. See docs/design-system.md.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
})

export const metadata: Metadata = {
  title: publicEnv.appName,
  description: 'Build your workouts, then log what you actually lifted — with or without signal.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: publicEnv.appName },
}

export const viewport: Viewport = {
  themeColor: '#12171c',
  // The session screen is a fixed stack; letting it zoom only breaks the layout
  // mid-set. Text is already large by design.
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ground text-ink">
        <SessionBoot>{children}</SessionBoot>
      </body>
    </html>
  )
}
