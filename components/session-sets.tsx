'use client'

import { useTranslations } from 'next-intl'

import { useLocale } from '@/components/locale-provider'
import { useUnit } from '@/components/use-unit'
import { formatSet } from '@/lib/format'
import { libraryName } from '@/lib/exercise-i18n'
import type { HistoryExercise } from '@/lib/session-summary'

/** A session's logged sets, one line per exercise with its note — shared by History and Today. */
export function SessionSets({ exercises }: { exercises: HistoryExercise[] }) {
  const unit = useUnit()
  const locale = useLocale()
  const t = useTranslations('session.sets')
  return (
    <ul className="space-y-2">
      {exercises.map((exercise) => (
        <li key={exercise.exerciseId}>
          <span className="block text-sm text-ink-dim">{libraryName(exercise.exerciseId, exercise.name, locale)}</span>
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {exercise.sets.map((set) => (
              <li key={set.id} className="figure text-[15px]">
                {formatSet(set, unit, locale)}
                {set.isWarmup && <span className="ml-0.5 text-ink-dim">{t('warmup')}</span>}
              </li>
            ))}
          </ol>
          {exercise.notes && <p className="mt-0.5 text-sm italic text-ink-dim">“{exercise.notes}”</p>}
        </li>
      ))}
    </ul>
  )
}
