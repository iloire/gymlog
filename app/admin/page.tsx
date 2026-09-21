import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { WeekStrip } from '@/components/admin/week-strip'
import { adminOverview } from '@/lib/admin'
import { formatAgo, formatDay } from '@/lib/format'
import { INTL_TAG } from '@/lib/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.panel')
  return { title: t('title') }
}

export default async function AdminPage() {
  const t = await getTranslations('admin.panel')
  const locale = await getLocale()
  const { users, totals } = await adminOverview()

  const figures = [
    { value: totals.accounts, label: t('accountsCount', { count: totals.accounts }) },
    { value: totals.activeThisWeek, label: t('trainedThisWeek') },
    { value: totals.workouts, label: t('workoutsLogged') },
    { value: totals.sets, label: t('setsLogged') },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-8 pb-16">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="figure text-4xl">{t('title')}</h1>
        <Link href="/" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('backToApp')}
        </Link>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
        {figures.map(({ value, label }) => (
          <div key={label}>
            <dt className="sr-only">{label}</dt>
            <dd className="figure text-3xl leading-none">{value.toLocaleString(INTL_TAG[locale])}</dd>
            <dd className="mt-1.5 text-sm text-ink-dim">{label}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">{t('accounts')}</h2>
          <p className="text-sm text-ink-dim">{t('range')}</p>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-[15px]">
            <thead className="text-sm text-ink-dim">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">{t('colAccount')}</th>
                <th className="py-2 pr-4 font-normal">{t('colTraining')}</th>
                <th className="py-2 pr-4 text-right font-normal">{t('colWorkouts')}</th>
                <th className="py-2 pr-4 text-right font-normal">{t('colSets')}</th>
                <th className="py-2 pr-4 font-normal">{t('colLastActive')}</th>
                <th className="py-2 font-normal">{t('colJoined')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((user) => (
                <tr key={user.id} className="group">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift"
                    >
                      <span className="text-ink group-hover:underline group-hover:underline-offset-4">
                        {user.name ?? user.email}
                      </span>
                      {user.role === 'admin' && (
                        <span className="ml-2 rounded-sm border border-line px-1.5 py-0.5 text-xs text-ink-dim">
                          {t('adminBadge')}
                        </span>
                      )}
                      {user.name && <span className="block text-sm text-ink-dim">{user.email}</span>}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <WeekStrip weeks={user.weeks} />
                  </td>
                  <td className="figure py-3 pr-4 text-right">{user.workouts}</td>
                  <td className="figure py-3 pr-4 text-right">{user.sets}</td>
                  <td className="py-3 pr-4 text-ink-dim">{formatAgo(user.lastActiveAt, undefined, locale) ?? t('never')}</td>
                  <td className="py-3 text-ink-dim">{formatDay(user.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export const dynamic = 'force-dynamic'
