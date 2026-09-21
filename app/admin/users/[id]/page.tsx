import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { WeekStrip } from '@/components/admin/week-strip'
import { adminUserDetail, type AdminUserDetail } from '@/lib/admin'
import { formatDay, formatSet } from '@/lib/format'
import type { Locale } from '@/lib/i18n'
import { formatWeight } from '@/lib/units'
import { weekdayName } from '@/lib/week'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.user')
  return { title: t('title') }
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <p className="text-sm text-ink-dim">{aside}</p>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-[15px] text-ink-dim">{children}</p>
}

export default async function AdminUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const { id } = await params
  const t = await getTranslations('admin.user')
  const locale = await getLocale()
  const detail = await adminUserDetail(id)
  const { user } = detail
  const trainedWeeks = detail.weeks.filter((week) => week.days > 0).length

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-8 pb-16">
      <Link href="/admin" className="flex items-center gap-1 text-sm text-ink-dim">
        <ChevronLeft size={18} aria-hidden />
        {t('allAccounts')}
      </Link>

      <header className="mt-4">
        <h1 className="figure text-4xl leading-[1.05] break-words">{user.name ?? user.email}</h1>
        <p className="mt-2 text-[15px] text-ink-dim">
          {user.name && <>{user.email}, </>}
          {t('summary', { role: user.role, joined: formatDay(user.createdAt, locale), unit: user.unit, rev: user.syncRev })}
        </p>
      </header>

      <div className="mt-8 overflow-x-auto pb-1">
        <WeekStrip weeks={detail.weeks} size="lg" />
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        {t('trainedWeeks', { trained: trainedWeeks, total: detail.weeks.length })}
      </p>

      <div className="grid gap-x-12 lg:grid-cols-2">
        <Section title={t('programme')} aside={detail.program?.stage ?? undefined}>
          {detail.program ? (
            <>
              <p className="pt-3 text-[15px]">
                {detail.program.name}
                <span className="text-ink-dim">{t('since', { date: formatDay(detail.program.startedOn, locale) })}</span>
              </p>
              <ol className="mt-3 divide-y divide-line">
                {Array.from({ length: 7 }, (_, index) => (
                  <li key={index} className="flex gap-4 py-2 text-[15px]">
                    <span className="w-10 text-ink-dim">{weekdayName(index, locale).slice(0, 3)}</span>
                    <span className={detail.program?.week.find((d) => d.dayOfWeek === index) ? '' : 'text-ink-dim'}>
                      {detail.program?.week.find((d) => d.dayOfWeek === index)?.template ?? t('rest')}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <Empty>{t('noProgramme')}</Empty>
          )}
        </Section>

        <Section title={t('workouts')} aside={`${detail.templates.length}`}>
          {detail.templates.length ? (
            <ul className="divide-y divide-line">
              {detail.templates.map((template) => (
                <li key={template.id} className="flex items-baseline justify-between gap-4 py-2 text-[15px]">
                  <span className={template.archivedAt ? 'text-ink-dim' : ''}>
                    {template.name}
                    {template.archivedAt && t('archived')}
                  </span>
                  <span className="text-sm text-ink-dim">{t('exercises', { count: template.exercises })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('noWorkouts')}</Empty>
          )}
        </Section>
      </div>

      <Section title={t('recentSessions')} aside={detail.sessions.length ? t('latest', { count: detail.sessions.length }) : undefined}>
        {detail.sessions.length ? (
          <ul className="divide-y divide-line">
            {detail.sessions.map((session) => (
              <SessionRow key={session.id} session={session} locale={locale} labels={{ sets: t('sets'), notDone: t('notDone'), warmup: t('warmupMark') }} />
            ))}
          </ul>
        ) : (
          <Empty>{t('noSessions')}</Empty>
        )}
      </Section>

      <div className="grid gap-x-12 lg:grid-cols-2">
        <Section title={t('bodyweight')}>
          {detail.weights.length ? (
            <ul className="divide-y divide-line">
              {detail.weights.map((entry) => (
                <li key={entry.measuredOn} className="flex justify-between py-2 text-[15px]">
                  <span className="text-ink-dim">{formatDay(entry.measuredOn, locale)}</span>
                  <span className="figure">{formatWeight(entry.weightKg, 'kg', locale)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('noBodyweight')}</Empty>
          )}
        </Section>

        <Section title={t('ownExercises')} aside={`${detail.ownExercises.length}`}>
          {detail.ownExercises.length ? (
            <ul className="divide-y divide-line">
              {detail.ownExercises.map((exercise) => (
                <li key={exercise.id} className="flex justify-between gap-4 py-2 text-[15px]">
                  <span>{exercise.name}</span>
                  {exercise.equipment && <span className="text-sm text-ink-dim">{exercise.equipment}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('libraryOnly')}</Empty>
          )}
        </Section>
      </div>
    </main>
  )
}

function SessionRow({
  session,
  locale,
  labels,
}: {
  session: AdminUserDetail['sessions'][number]
  locale: Locale
  labels: { sets: string; notDone: string; warmup: string }
}) {
  const exercises = Map.groupBy(session.sets, (set) => `${set.position}:${set.exerciseName}`)

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 rounded-sm py-3 outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift [&::-webkit-details-marker]:hidden">
          <span className="w-28 text-sm text-ink-dim">{formatDay(session.scheduledFor, locale)}</span>
          <span className="flex-1 text-[15px]">{session.templateName}</span>
          <span className="figure text-[15px]">
            {session.setsDone}/{session.sets.length}
            <span className="ml-1 font-normal text-ink-dim [font-variation-settings:'wdth'_100]">{labels.sets}</span>
          </span>
          <span className="figure w-28 text-right text-[15px]">
            {session.volumeKg > 0 ? formatWeight(session.volumeKg, 'kg', locale) : <span className="text-ink-dim">—</span>}
          </span>
        </summary>

        <div className="overflow-x-auto pb-4">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <tbody>
              {[...exercises.values()].map((sets) => (
                <tr key={`${sets[0]?.position}:${sets[0]?.exerciseName}`} className="align-top">
                  <th scope="row" className="w-1/3 py-1.5 pr-4 font-normal text-ink-dim">
                    {sets[0]?.exerciseName}
                  </th>
                  <td className="py-1.5">
                    <ol className="flex flex-wrap gap-x-4 gap-y-1">
                      {sets.map((set) => (
                        <li
                          key={set.setIndex}
                          className={`figure font-semibold ${set.completedAt === null ? 'text-ink-dim' : ''}`}
                        >
                          {set.completedAt === null
                            ? labels.notDone
                            : `${formatSet(set, 'kg', locale)}${set.isWarmup ? ` ${labels.warmup}` : ''}`}
                        </li>
                      ))}
                    </ol>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  )
}

export const dynamic = 'force-dynamic'
