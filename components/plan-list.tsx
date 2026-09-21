'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ExerciseDialog } from '@/components/exercise-dialog'
import { ExerciseThumb } from '@/components/exercise-frames'
import { useUserId } from '@/components/session-boot'
import type { PlanLine } from '@/lib/plan'

/**
 * The exercises of a planned workout, each with what it asks for and what you
 * lifted there last time — enough to know what you are walking into without
 * opening the workout. A row opens the exercise as a dialog, for the animation
 * and the how-to when the name alone does not say what it is, and closing it
 * leaves you where you were: about to start.
 */
export function PlanList({ lines }: { lines: PlanLine[] }) {
  const t = useTranslations('today.planList')
  const userId = useUserId()
  const [viewingExerciseId, setViewingExerciseId] = useState<string | null>(null)

  return (
    <>
      {userId && viewingExerciseId && (
        <ExerciseDialog
          userId={userId}
          exerciseId={viewingExerciseId}
          onClose={() => setViewingExerciseId(null)}
        />
      )}

      <ol className="divide-y divide-line border-y border-line">
        {lines.map((line, index) => (
          <li key={`${line.exerciseId}-${index}`}>
            <button
              type="button"
              onClick={() => setViewingExerciseId(line.exerciseId)}
              className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface"
            >
              <ExerciseThumb exercise={{ id: line.exerciseId, name: line.name, images: line.images }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{line.name}</span>
                <span className="mt-0.5 block text-sm text-ink-dim">
                  <span className="figure">{line.target}</span>
                  {line.last ? (
                    <>
                      {t('last')}
                      <span className="figure">{line.last}</span>
                    </>
                  ) : (
                    t('firstTime')
                  )}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-dim" />
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}
