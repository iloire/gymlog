'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { useChooseLocale, useLocale } from '@/components/locale-provider'
import { Nav } from '@/components/nav'
import { type Locale, LOCALE_NAMES, LOCALES } from '@/lib/i18n'

/**
 * English or Spanish. An account setting, not a device one, like the unit: you
 * read in one language wherever you are, so it goes up with the next sync and
 * the other phone follows. Each tile is named in its own language, so the
 * way back is readable from either side.
 */
export default function LanguagePage() {
  const t = useTranslations('profile')
  const locale = useLocale()
  const chooseLocale = useChooseLocale()

  function choose(next: Locale) {
    if (next === locale) return
    void chooseLocale(next)
  }

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>
        <h1 className="figure mt-2 text-4xl">{t('language.title')}</h1>
        <p className="mt-2 text-sm text-ink-dim">{t('language.intro')}</p>

        <fieldset className="mt-8">
          <legend className="sr-only">{t('language.legend')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {LOCALES.map((value) => (
              <label
                key={value}
                lang={value}
                className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface text-sm text-ink-dim has-checked:border-plate-blue-lift has-checked:text-ink has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="locale"
                  value={value}
                  checked={locale === value}
                  onChange={() => choose(value)}
                  className="sr-only"
                />
                <span className="figure text-3xl leading-none uppercase text-ink">{value}</span>
                <span>{LOCALE_NAMES[value]}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-dim">{t('language.saved')}</p>
        </fieldset>
      </main>
      <Nav />
    </>
  )
}
