import type { Metadata, Viewport } from 'next'
import { Archivo, Big_Shoulders, Kalam, Nunito } from 'next/font/google'
import { getLocale, getTranslations } from 'next-intl/server'

import { LocaleProvider } from '@/components/locale-provider'
import { SessionBoot } from '@/components/session-boot'
import { publicEnv } from '@/lib/env.public'
import { THEME_COLORS, themeScript } from '@/lib/theme'
import './globals.css'

// Plate's face, and the default: one family, two jobs — the width axis carries
// the difference between a label and a number. See docs/design-system.md.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
})

// The other styles' faces. Not preloaded: a browser only downloads a face once
// the chosen style uses it, and the service worker caches it from then on.
const kalam = Kalam({ variable: '--font-kalam', subsets: ['latin'], weight: ['400', '700'], preload: false })
const bigShoulders = Big_Shoulders({
  variable: '--font-big-shoulders',
  subsets: ['latin'],
  axes: ['opsz'],
  preload: false,
})
const nunito = Nunito({ variable: '--font-nunito', subsets: ['latin'], preload: false })
const fontVariables = [archivo, kalam, bigShoulders, nunito].map((font) => font.variable).join(' ')

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.meta')
  return {
    title: publicEnv.appName,
    description: t('description'),
    manifest: '/manifest.json',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: publicEnv.appName },
  }
}

export const viewport: Viewport = {
  themeColor: THEME_COLORS.plate.dark,
  // The session screen is a fixed stack; letting it zoom only breaks the layout
  // mid-set. Text is already large by design.
  maximumScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // The device's language cookie (i18n/request.ts). Reading it makes the
  // layout dynamic, which every screen behind the proxy already is.
  const locale = await getLocale()
  return (
    // The theme script adds `light` and `data-style` to <html> before React
    // hydrates, so the attributes legitimately differ from the server's.
    <html lang={locale} className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Installed on a phone the page runs under a translucent status bar
          (statusBarStyle above, viewportFit cover), so every screen starts below it. */}
      <body className="min-h-full flex flex-col bg-ground text-ink pt-[env(safe-area-inset-top)]">
        <SessionBoot>
          <LocaleProvider initial={locale}>{children}</LocaleProvider>
        </SessionBoot>
      </body>
    </html>
  )
}
