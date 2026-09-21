'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { EffortMark, effortTone } from '@/components/effort-mark'
import { useLibraryLabel } from '@/components/exercise-filters'
import { ExerciseFrames } from '@/components/exercise-frames'
import { FavoriteButton } from '@/components/favorite-button'
import { useLocale } from '@/components/locale-provider'
import { Placeholder } from '@/components/loading'
import { StrengthChart } from '@/components/strength-chart'
import { useUnit } from '@/components/use-unit'
import type { LocalSetLog } from '@/lib/db/dexie'
import { getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { exerciseInstructions, exerciseName } from '@/lib/exercise-i18n'
import { formatAgo, formatDay, formatMinutes, formatSet } from '@/lib/format'
import { INTL_TAG, type Locale } from '@/lib/i18n'
import { exerciseNoteId } from '@/lib/id'
import { strengthSeries } from '@/lib/progress'
import { epochToDate } from '@/lib/queries'
import { bestSet } from '@/lib/records'
import { displayWeight, type Unit } from '@/lib/units'

/**
 * Everything about one exercise, in the order it is wanted at the bar: what
 * you lifted last time and your best, then how the lift has moved, then your
 * cues, and last the library's how-to behind a toggle. Rendered by the
 * exercise page and, as a dialog, by the workout editor — so looking up a
 * movement never navigates you out of the workout you are building.
 */
/** The detail's frame — the photo and the name at their sizes — for the page and the dialog alike. */
export function ExerciseDetailLoading() {
  return (
    <div aria-busy="true">
      <Placeholder className="aspect-[4/3] w-full" />
      <Placeholder className="mt-5 h-9 w-2/3" />
    </div>
  )
}

export function ExerciseDetail({
  userId,
  exerciseId,
  titleId,
  action,
}: {
  userId: string
  exerciseId: string
  titleId?: string
  /** Shown under the name — the exercise page's "Do this now". */
  action?: ReactNode
}) {
  const t = useTranslations('today.exerciseDetail')
  const locale = useLocale()
  const label = useLibraryLabel()
  const unit = useUnit()
  const data = useLiveQuery(async () => {
    const db = getDb(userId)
    const exercise = await db.exercises.get(exerciseId)
    if (!exercise) return null

    const note = await db.exerciseNotes.get(exerciseNoteId(userId, exerciseId))

    // Every set of this movement, newest session first.
    const logs = (await db.setLogs.where('[exerciseId+performedAt]')
      .between([exerciseId, -Infinity], [exerciseId, Infinity])
      .reverse()
      .toArray())
      .filter((log) => log.deletedAt === null && log.completedAt !== null)

    const bySession = new Map<string, typeof logs>()
    for (const log of logs) {
      bySession.set(log.sessionId, [...(bySession.get(log.sessionId) ?? []), log])
    }

    const history = [...bySession.values()]
      .map((sets) => sets.sort((a, b) => a.setIndex - b.setIndex))
      .slice(0, 12)

    return {
      exercise,
      note: note ?? null,
      history,
      series: strengthSeries(logs),
      best: bestSet(logs),
      // The how-to in the language: a chunk fetched once for Spanish, the row itself for English.
      steps: await exerciseInstructions(exercise, locale),
    }
  }, [userId, exerciseId, locale])

  if (!data) return <ExerciseDetailLoading />

  const { exercise, note, history, series, best, steps } = data
  const last = history[0] ?? null
  const lastTop = last ? (bestSet(last) ?? last[0] ?? null) : null
  const bestE1rm = series.length > 0 ? Math.max(...series.map((point) => point.e1rmKg)) : null

  return (
    <>
      <ExerciseFrames exercise={exercise} className="aspect-[4/3] w-full" />

      <div className="mt-5 flex items-start justify-between gap-3">
        <h1 id={titleId} className="figure text-3xl leading-tight">
          {exerciseName(exercise, locale)}
        </h1>
        <FavoriteButton
          userId={userId}
          exerciseId={exercise.id}
          exerciseName={exerciseName(exercise, locale)}
          favorite={note?.favoritedAt != null}
          className="-mr-2 shrink-0 p-2 text-ink-dim"
        />
      </div>
      <p className="mt-1.5 text-sm text-ink-dim">
        {[
          exercise.equipment && label('equipment', exercise.equipment),
          exercise.level && label('level', exercise.level),
          ...(exercise.primaryMuscles ?? []).map((muscle) => label('muscle', muscle)),
        ]
          .filter(Boolean)
          .join(', ')}
      </p>
      {action}

      {last && lastTop ? (
        <section className="mt-6 grid grid-cols-2 gap-3" aria-label={t('tilesLabel')}>
          <div className="rounded-md border border-line p-4">
            <p className="text-sm text-ink-dim">{t('lastTime', { when: formatAgo(lastTop.performedAt, locale) ?? '' })}</p>
            {/* Red when last time was your best: the same red the summary uses for beating it. */}
            <SetFigure set={lastTop} unit={unit} locale={locale} className={best && lastTop.id === best.id ? 'text-plate-red' : ''} />
            <p className="figure mt-1 truncate text-xs text-ink-dim">{last.map((set) => formatSet(set, unit, locale)).join('  ')}</p>
          </div>
          {best && (
            <div className="rounded-md border border-line p-4">
              <p className="text-sm text-ink-dim">{t('best', { date: formatDay(epochToDate(best.performedAt), locale) })}</p>
              <SetFigure set={best} unit={unit} locale={locale} />
              {bestE1rm !== null && (
                <p className="figure mt-1 text-xs text-ink-dim">
                  {t('e1rm', { weight: Math.round(displayWeight(bestE1rm, unit)), unit })}
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <p className="mt-6 text-[15px] text-ink-dim">{t('notLogged')}</p>
      )}

      {history.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-sm text-ink-dim">{t('progress')}</h2>
          <StrengthChart series={series} className="mb-4" />
          <ul className="divide-y divide-line border-y border-line">
            {history.map((sets) => (
              <li key={sets[0]?.id} className="py-3">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-ink-dim">
                    {formatDay(epochToDate(sets[0]?.performedAt ?? 0), locale)}
                  </span>
                  <span className="figure flex flex-wrap justify-end gap-x-3 text-right text-[15px]">
                    {sets.map((set) => (
                      <span key={set.id} className={effortTone(set.effort)}>
                        {formatSet(set, unit, locale)}
                        <EffortMark effort={set.effort} />
                      </span>
                    ))}
                  </span>
                </span>
                {sets.find((set) => set.notes) && (
                  <span className="mt-1 block text-sm italic text-ink-dim">“{sets.find((set) => set.notes)?.notes}”</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Open when you have written some; an empty box is not worth the height. */}
      <details className="mt-7" open={Boolean(note?.notes)}>
        <summary className="cursor-pointer text-sm text-ink-dim">{t('cues')}</summary>
        <textarea
          defaultValue={note?.notes ?? ''}
          rows={3}
          placeholder={t('cuesPlaceholder')}
          onBlur={(event) =>
            void writeRow(userId, 'exerciseNotes', {
              id: exerciseNoteId(userId, exerciseId),
              exerciseId,
              notes: event.target.value,
            })
          }
          className="mt-2 w-full rounded-md border border-line bg-surface p-3 text-[15px] outline-none focus-visible:border-plate-blue-lift"
        />
      </details>

      {steps.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ink-dim">{t('howTo')}</summary>
          <ol className="mt-2 space-y-3">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="figure shrink-0 text-ink-dim">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {exercise.userId === null && (
            // The library is public domain and deserves its name; the Spanish is
            // machine-made, and anyone reading it should know that.
            <p className="mt-3 text-xs text-ink-dim">
              {t.rich('source', {
                link: (chunks) => (
                  <a href="https://github.com/yuhonas/free-exercise-db" className="underline underline-offset-2" target="_blank" rel="noreferrer">
                    {chunks}
                  </a>
                ),
              })}
              {locale !== 'en' && <> {t('machineTranslated')}</>}
            </p>
          )}
        </details>
      )}
    </>
  )
}

/** One set as the tile's big number: the weight with the reps small beside it, the reps alone, or the time. */
function SetFigure({
  set,
  unit,
  locale,
  className = '',
}: {
  set: LocalSetLog
  unit: Unit
  locale: Locale
  className?: string
}) {
  const t = useTranslations('today.exerciseDetail')
  const figure = `figure mt-1 text-3xl leading-none ${className}`
  if (set.durationSec != null) return <p className={figure}>{formatMinutes(set.durationSec)}</p>
  if (set.weightKg) {
    return (
      <p className={figure}>
        {displayWeight(set.weightKg, unit).toLocaleString(INTL_TAG[locale])}
        <span className="text-lg text-ink-dim">×{set.reps ?? 0}</span>
      </p>
    )
  }
  return (
    <p className={figure}>
      {set.reps ?? 0}
      <span className="text-lg text-ink-dim">{t('reps')}</span>
    </p>
  )
}
