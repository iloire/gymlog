'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Nav } from '@/components/nav'
import { ThemePicker } from '@/components/theme-picker'

export default function AppearancePage() {
  const t = useTranslations('profile')
  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>
        <h1 className="figure mt-2 text-4xl">{t('appearance.title')}</h1>

        <section className="mt-8">
          <ThemePicker />
        </section>
      </main>
      <Nav />
    </>
  )
}
