'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useSyncExternalStore, type ReactNode } from 'react'

import { useIsAdmin } from '@/components/admin/use-is-admin'
import { useEquipment } from '@/components/equipment-picker'
import { useLocale } from '@/components/locale-provider'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { SignOutButton } from '@/components/sign-out-button'
import { useUnit } from '@/components/use-unit'
import { publicEnv } from '@/lib/env.public'
import { presetFor } from '@/lib/equipment'
import { LOCALE_NAMES, localize } from '@/lib/i18n'
import { daysAgo } from '@/lib/history'
import { bodyWeightSeries } from '@/lib/queries'
import { readStyle, readTheme, subscribeTheme } from '@/lib/theme'
import { formatWeight } from '@/lib/units'

/**
 * One row per setting, the current value as its second line: what is set is
 * read in a glance, and the page to change it is one tap. The value comes from
 * wherever the setting lives — the device for appearance and equipment, the
 * account for the unit, the log for bodyweight.
 */
export default function ProfilePage() {
  // The session comes from the auth endpoint, so with no signal there is no
  // name or email to show — the rest of the page works regardless.
  const { data: session } = useSession()
  const user = session?.user
  const userId = useUserId()
  const isAdmin = useIsAdmin()
  const t = useTranslations('profile')
  const locale = useLocale()

  // Device choices exist only in the browser; the server snapshot is null so
  // the row's value line is empty, never wrong, until hydration.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null)
  const style = useSyncExternalStore(subscribeTheme, readStyle, () => null)
  const equipment = useEquipment()
  const unit = useUnit()
  const latestWeight = useLiveQuery(
    async () => (userId ? ((await bodyWeightSeries(userId)).at(-1) ?? null) : null),
    [userId],
    null,
  )

  const appearance = style && theme ? `${capitalise(style)}, ${t(`values.theme.${theme}`)}` : ''
  const gym =
    equipment === null
      ? t('values.notSet')
      : (localize(presetFor(equipment)?.name ?? '', locale) || t('values.items', { count: equipment.length }))
  const bodyweight = latestWeight
    ? `${formatWeight(latestWeight.weightKg, unit, locale)} · ${daysAgo(latestWeight.measuredOn, undefined, locale)}`
    : t('values.noReadings')

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        {/* Whose profile it is, as the headline; the tab bar already says Profile. */}
        <header>
          <p className="text-sm text-ink-dim">{t('title')}</p>
          <h1 className="figure mt-1 truncate text-4xl leading-[1.05]">{user?.name || user?.email || t('title')}</h1>
          {user?.name && user.email && <p className="mt-1.5 text-sm text-ink-dim">{user.email}</p>}
        </header>

        <ul className="mt-6 divide-y divide-line border-y border-line">
          <Row href="/profile/appearance" title={t('rows.appearance')} value={appearance} />
          <Row href="/profile/equipment" title={t('rows.equipment')} value={gym} />
          <Row href="/profile/units" title={t('rows.units')} value={`${t(`units.${unit}`)} (${unit})`} />
          <Row href="/profile/language" title={t('rows.language')} value={LOCALE_NAMES[locale]} />
          <Row href="/weight" title={t('rows.bodyweight')} value={bodyweight} />
          <Row href="/profile/data" title={t('rows.data')} value={t('rows.dataValue')} />
          {/* A plain <a>: the token page is server-rendered and online-only, so
              visiting Profile must not prefetch it. */}
          <Row href="/profile/api" title={t('rows.api')} value={t('rows.apiValue')} plain />
          {/* Likewise the server-rendered admin panel. */}
          {isAdmin && <Row href="/admin" title={t('rows.admin')} value={t('rows.adminValue')} plain />}
        </ul>

        <footer className="mt-8">
          <SignOutButton />
          <p className="mt-6 text-center text-[11px] text-ink-dim">
            {t.rich('credits', {
              link: (chunks) => (
                <a href="https://github.com/yuhonas/free-exercise-db" className="underline underline-offset-2" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
            })}
          </p>
          {publicEnv.commitSha && (
            <p className="mt-2 text-center text-[11px] text-ink-dim">{publicEnv.commitSha}</p>
          )}
        </footer>
      </main>
      <Nav />
    </>
  )
}

/** A setting: its name, what it is set to, and the chevron that says it opens. */
function Row({ href, title, value, plain = false }: { href: string; title: string; value: ReactNode; plain?: boolean }) {
  const className = 'flex items-center gap-3 py-3.5 -mx-2 px-2 rounded-sm active:bg-surface-high'
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{title}</span>
        <span className="block min-h-5 truncate text-sm text-ink-dim">{value}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-dim" />
    </>
  )
  return (
    <li>
      {plain ? (
        <a href={href} className={className}>
          {inner}
        </a>
      ) : (
        <Link href={href} className={className}>
          {inner}
        </Link>
      )}
    </li>
  )
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
