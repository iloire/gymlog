'use client'

import { useTranslations } from 'next-intl'

import { EffortMark, effortTone } from '@/components/effort-mark'
import { useLocale } from '@/components/locale-provider'
import { ExerciseThumb } from '@/components/exercise-frames'
import { useExercises } from '@/components/use-exercises'
import { useUnit } from '@/components/use-unit'
import { formatSet } from '@/lib/format'
import { libraryName } from '@/lib/exercise-i18n'
import type { HistoryExercise } from '@/lib/session-summary'

/**
 * A session's logged sets, one line per exercise with its note — shared by
 * History and Today. A set that was marked hard or failed says so after its
 * figure, so a weight that was too much is read off the list, not remembered.
 */
export function SessionSets({ exercises }: { exercises: HistoryExercise[] }) {
  const unit = useUnit()
  const locale = useLocale()
  const t = useTranslations('session.sets')
  const library = useExercises(exercises.map((exercise) => exercise.exerciseId))
  return (
    <ul className="space-y-3">
      {exercises.map((exercise) => {
        const name = libraryName(exercise.exerciseId, exercise.name, locale)
        return (
          <li key={exercise.exerciseId} className="flex items-center gap-3">
            <ExerciseThumb exercise={{ id: exercise.exerciseId, name, images: library.get(exercise.exerciseId)?.images ?? null }} />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink-dim">{name}</span>
              <ol className="flex flex-wrap gap-x-4 gap-y-1">
                {exercise.sets.map((set) => (
                  <li key={set.id} className={`figure text-[15px] ${effortTone(set.effort)}`}>
                    {formatSet(set, unit, locale)}
                    {set.isWarmup && <span className="ml-0.5 text-ink-dim">{t('warmup')}</span>}
                    <EffortMark effort={set.effort} />
                  </li>
                ))}
              </ol>
              {exercise.notes && <p className="mt-0.5 text-sm italic text-ink-dim">“{exercise.notes}”</p>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
