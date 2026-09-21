'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DeleteSession } from '@/components/delete-session'
import { FinishSession } from '@/components/finish-session'
import { useLocale } from '@/components/locale-provider'
import { Loading, Placeholder } from '@/components/loading'
import { Nav } from '@/components/nav'
import { ExerciseThumb } from '@/components/exercise-frames'
import { SessionSets } from '@/components/session-sets'
import { useExercises } from '@/components/use-exercises'
import { useUserId } from '@/components/session-boot'
import { libraryName } from '@/lib/exercise-i18n'
import { StrengthChart } from '@/components/strength-chart'
import { TrainingCalendar } from '@/components/training-calendar'
import { useUnit } from '@/components/use-unit'
import { addDays, streakHint, weekStart, weekStreak } from '@/lib/calendar'
import { getDb } from '@/lib/db/dexie'
import { formatDay, formatDuration, formatMinutes, formatSet } from '@/lib/format'
import { sessionHistory, trainedOn } from '@/lib/history'
import { INTL_TAG } from '@/lib/i18n'
import { personalRecords, strengthSeries, weekProgress, type PersonalRecord } from '@/lib/progress'
import { epochToDate, today, weekSchedule } from '@/lib/queries'
import { displayWeight, formatWeight } from '@/lib/units'
import type { HistoryEntry } from '@/lib/session-summary'
import { planWeek } from '@/lib/week'

/** How many lifts get a chart: the ones you do most, with at least two sessions to draw. */
const LIFTS = 4

/**
 * Progress, not just a log. The streak and the calendar were the top of
 * History; the story is the lifts, so they come first: this week against the
 * plan, the main lifts' top set over time, the records, then the consistency,
 * then the sessions themselves.
 */
export default function ProgressPage() {
  const userId = useUserId()
  const unit = useUnit()
  const locale = useLocale()
  const t = useTranslations('history')
  const fallbackWorkout = t('week.fallbackWorkout')
  const [selected, setSelected] = useState<string | null>(null)
  const [lift, setLift] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const history = await sessionHistory(userId)
    const logs = await db.setLogs.toArray()
    const records = personalRecords(logs)
    const lifts = records.filter((record) => record.sessions >= 2).slice(0, LIFTS)

    const date = today()
    const monday = weekStart(date)
    const sunday = addDays(monday, 6)
    const schedule = await weekSchedule(userId)
    const templates = new Map(
      (await db.workoutTemplates.toArray()).filter((t) => t.deletedAt === null).map((t) => [t.id, t.name]),
    )
    const week = planWeek({
      today: date,
      schedule: new Map(
        [...(schedule?.days ?? [])]
          .filter(([, templateId]) => templates.has(templateId))
          .map(([weekday, templateId]) => [weekday, { templateId, name: templates.get(templateId) ?? fallbackWorkout }]),
      ),
      trained: history
        .filter((entry) => entry.session.scheduledFor >= monday && entry.session.scheduledFor <= sunday)
        .map((entry) => ({ date: entry.session.scheduledFor, templateId: entry.session.templateId, name: entry.session.templateName })),
    })

    return { history, logs, records, lifts, week: weekProgress(week.days, history) }
  }, [userId, fallbackWorkout])
  const library = useExercises(data?.records.slice(0, 6).map((record) => record.exerciseId) ?? [])

  if (!userId || !data) {
    return (
      <Loading>
        <h1 className="figure text-4xl">{t('title')}</h1>
        <Placeholder className="mt-2 h-5 w-40" />
      </Loading>
    )
  }

  const { history, logs, records, lifts, week } = data
  const count = history.length
  const date = today()
  const trained = new Set(history.map((entry) => entry.session.scheduledFor))
  const streak = weekStreak(trained, date)
  const hint = streakHint(streak)
  const shownLift = lifts.find((record) => record.exerciseId === lift) ?? lifts[0] ?? null
  const shownRecords = records.slice(0, 6)
  const series = shownLift ? strengthSeries(logs.filter((log) => log.exerciseId === shownLift.exerciseId)) : []

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        {/* The log's size is the headline; the tab bar already says Progress. */}
        {count === 0 ? (
          <header>
            <h1 className="figure text-4xl">{t('title')}</h1>
            <p className="mt-2 text-sm text-ink-dim">{t('intro.empty')}</p>
          </header>
        ) : (
          <header>
            <p className="text-sm text-ink-dim">{t('title')}</p>
            <h1 className="figure mt-1 text-4xl leading-[1.05]">{t('intro.logged', { count })}</h1>
          </header>
        )}

        {count > 0 && (
          <>
            {/* This week's two numbers side by side on a hairline, not in boxes:
                a figure with its label reads on its own. */}
            <section className="mt-7 grid grid-cols-2 divide-x divide-line border-y border-line py-4" aria-label={t('week.label')}>
              <div className="pr-4">
                <p className="text-sm text-ink-dim">{t('week.label')}</p>
                <p className="figure mt-1 text-4xl leading-none">
                  {week.done}
                  <span className="text-lg text-ink-dim">/{week.planned}</span>
                </p>
                <p className="mt-1.5 text-xs text-ink-dim">{t('week.daysOfPlanned')}</p>
              </div>
              <div className="pl-4">
                <p className="text-sm text-ink-dim">{t('week.moved')}</p>
                <p className="figure mt-1 text-4xl leading-none">
                  {Math.round(displayWeight(week.volumeKg, unit)).toLocaleString(INTL_TAG[locale])}
                </p>
                <p className="mt-1.5 text-xs text-ink-dim">{t('week.unitThisWeek', { unit })}</p>
              </div>
            </section>

            {lifts.length > 0 && shownLift && (
              <section className="mt-8" aria-label={t('lifts.label')}>
                <h2 className="text-sm text-ink-dim">{t('lifts.title')}</h2>
                <ul className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
                  {lifts.map((record) => {
                    const active = record.exerciseId === shownLift.exerciseId
                    return (
                      <li key={record.exerciseId}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setLift(record.exerciseId)}
                          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
                            active ? 'bg-ink text-ground' : 'bg-surface text-ink-dim hover:text-ink'
                          }`}
                        >
                          {libraryName(record.exerciseId, record.name, locale)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <StrengthChart series={series} className="mt-3" />
                <Link
                  href={`/exercises/${shownLift.exerciseId}`}
                  className="mt-2 inline-block text-sm text-ink-dim underline underline-offset-4"
                >
                  {t('lifts.everySet', { name: shownLift.name })}
                </Link>
              </section>
            )}

            {records.length > 0 && (
              <section className="mt-8" aria-label={t('records.label')}>
                <h2 className="text-sm text-ink-dim">{t('records.title')}</h2>
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {shownRecords.map((record) => (
                    <RecordRow key={record.exerciseId} record={record} images={library.get(record.exerciseId)?.images ?? null} />
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-8 flex items-center gap-4" aria-label={t('streak.label')}>
              <span className="figure text-6xl leading-none">{streak.current}</span>
              <span className="min-w-0">
                <span className="block text-[15px]">
                  {t('streak.weeksInARow', { count: streak.current })}
                  <span className="text-ink-dim"> {t('streak.daysThisWeek', { count: streak.thisWeek })}</span>
                </span>
                <span className="block text-sm text-ink-dim">{t(`streak.hint.${hint.key}`, { count: hint.count })}</span>
              </span>
            </section>

            <div className="mt-7">
              <TrainingCalendar trained={trained} today={date} selected={selected} onSelect={setSelected} />
            </div>

            {selected && (
              <ul className="mt-4 divide-y divide-line border-y border-line" aria-label={formatDay(selected, locale)}>
                {trainedOn(history, selected).map((entry) => (
                  <SessionRow key={entry.session.id} entry={entry} open />
                ))}
              </ul>
            )}
          </>
        )}

        {count > 0 ? (
          <section className="mt-9">
            <h2 className="text-sm text-ink-dim">{t('past.title')}</h2>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {history.map((entry) => (
                <SessionRow key={entry.session.id} entry={entry} />
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-7 border-y border-line py-6 text-[15px] text-ink-dim">
            {t.rich('empty', {
              link: (chunks) => (
                <Link href="/" className="text-ink underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
      </main>
      <Nav />
    </>
  )
}

/** The heaviest set of one lift, and the estimated max it implies. */
function RecordRow({ record, images }: { record: PersonalRecord; images: string[] | null }) {
  const unit = useUnit()
  const locale = useLocale()
  const t = useTranslations('history')
  return (
    <li className="flex items-center gap-3 py-3">
      <ExerciseThumb exercise={{ id: record.exerciseId, name: record.name, images }} />
      <span className="min-w-0 flex-1">
        <Link href={`/exercises/${record.exerciseId}`} className="block truncate text-[15px]">
          {libraryName(record.exerciseId, record.name, locale)}
        </Link>
        <span className="block text-sm text-ink-dim">{formatDay(epochToDate(record.performedAt), locale)}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="figure block text-[15px]">
          {formatSet({ weightKg: record.weightKg, reps: record.reps }, unit, locale)}
        </span>
        <span className="figure block text-sm text-ink-dim">
          {t('records.e1rm', { value: Math.round(displayWeight(record.bestE1rmKg, unit)), unit })}
        </span>
      </span>
    </li>
  )
}

function SessionRow({ entry, open = false }: { entry: HistoryEntry; open?: boolean }) {
  const unit = useUnit()
  const locale = useLocale()
  const t = useTranslations('history')
  const { session, setsDone, setsPlanned, volumeKg, cardioSec, durationMs, exercises } = entry

  return (
    <li>
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm py-3 outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px]">{session.templateName}</span>
            <span className="block text-sm text-ink-dim">
              {/* A workout done today is read as "Today", in full ink: the date would be
                  worked out from the calendar above, and this row is the one that matters. */}
              {session.scheduledFor === today() ? (
                <span className="font-medium text-ink">{t('past.today')}</span>
              ) : (
                formatDay(session.scheduledFor, locale)
              )}
              {durationMs !== null && durationMs >= 60_000 && <> · {formatDuration(durationMs)}</>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="figure block text-[15px]">
              {/* A cardio-only session has no volume; its minutes say what was done. */}
              {volumeKg > 0 ? formatWeight(volumeKg, unit, locale) : cardioSec > 0 ? formatMinutes(cardioSec) : '—'}
            </span>
            <span className="block text-sm text-ink-dim">{t('past.sets', { done: setsDone, planned: setsPlanned })}</span>
          </span>
        </summary>

        <div className="pb-4">
          <SessionSets exercises={exercises} />
          {/* A workout left open on an earlier day is no longer on Today, so this is
              the one place left to end it. */}
          {session.completedAt === null && (
            <div className="mt-4">
              <FinishSession session={session} setsLeft={setsPlanned - setsDone} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3">
            <Link
              href={`/session?id=${session.id}`}
              className="text-sm text-ink-dim underline underline-offset-4"
            >
              {t('past.openToFix')}
            </Link>
            <DeleteSession session={session} />
          </div>
        </div>
      </details>
    </li>
  )
}
