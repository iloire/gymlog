'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { AuthHero } from '@/components/auth-hero'
import { useChooseLocale, useLocale } from '@/components/locale-provider'
import { LOCALE_NAMES, LOCALES } from '@/lib/i18n'

export function AuthShell({
  title,
  error,
  children,
}: {
  title: string
  error?: string | null
  children: ReactNode
}) {
  const t = useTranslations('common.auth')
  return (
    // Phone: the picture across the top with the wordmark on its lower edge and
    // the form below. Desk: the picture fills the left, the form the right.
    <main className="flex-1 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="relative h-[40dvh] min-h-60 lg:sticky lg:top-0 lg:h-dvh">
        <AuthHero className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 px-6 lg:px-14 lg:pb-14">
          <p className="figure mx-auto max-w-sm text-6xl leading-none text-ink lg:mx-0 lg:max-w-none lg:text-9xl">
            gymlog
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 pt-5 pb-12 lg:px-14 lg:py-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-ink-dim">{t('tagline')}</p>
            <LanguageToggle />
          </div>

          <h1 className="mt-10 mb-6 text-xl font-semibold">{title}</h1>

          {error && (
            <p className="mb-5 border-l-2 border-plate-red bg-surface px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          {children}
        </div>
      </div>
    </main>
  )
}

/**
 * Before there is an account to save it on, the language is the device's:
 * the cookie the proxy set from the browser, or this toggle. Signup copies
 * it onto the new account.
 */
function LanguageToggle() {
  const t = useTranslations('common.auth')
  const locale = useLocale()
  const chooseLocale = useChooseLocale()
  return (
    <div className="flex shrink-0 gap-2 text-xs" role="group" aria-label={t('language')}>
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={locale === value}
          onClick={() => void chooseLocale(value)}
          className={`rounded-sm px-1 uppercase ${locale === value ? 'text-ink underline underline-offset-4' : 'text-ink-dim'}`}
          title={LOCALE_NAMES[value]}
        >
          {value}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  ...rest
}: {
  label: string
  name: string
  type?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-dim">{label}</span>
      <input
        name={name}
        type={type}
        className="h-12 w-full rounded-md border border-line bg-surface px-3 text-ink outline-none focus-visible:border-plate-blue-lift focus-visible:ring-2 focus-visible:ring-plate-blue-lift/40"
        {...rest}
      />
    </label>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  const t = useTranslations('common.auth')
  return (
    <button
      type="submit"
      disabled={busy}
      className="h-14 w-full rounded-md bg-plate-blue text-base font-semibold text-white transition-colors hover:bg-plate-blue-lift disabled:opacity-60"
    >
      {busy ? t('working') : children}
    </button>
  )
}
