'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import type { LocalSetLog } from '@/lib/db/dexie'

/**
 * The whole workout from the gym screen: every exercise with its sets as
 * small squares, filled as they are done, and a tap on any to jump to it.
 * Opened from the workout's name in the header, so the one-exercise screen
 * keeps its focus and still has the overview one tap away. A native <dialog>
 * at the bottom edge: focus trapping, Escape and the inert page behind it come
 * for free.
 */
export function WorkoutSheet({
  name,
  exercises,
  current,
  onPick,
  onClose,
}: {
  name: string
  /** One entry per position, in order, each with its set logs. */
  exercises: { position: number; name: string; logs: LocalSetLog[] }[]
  current: number
  onPick: (index: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = useTranslations('plan.workoutSheet')

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const done = exercises.flatMap((exercise) => exercise.logs).filter((log) => log.completedAt !== null).length
  const total = exercises.reduce((sum, exercise) => sum + exercise.logs.length, 0)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="mt-auto mb-0 max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-md border border-line bg-ground p-0 text-ink backdrop:bg-black/70 mx-auto"
    >
      <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="figure truncate text-xl">
              {name}
            </h2>
            <p className="text-sm text-ink-dim">
              {t.rich('logged', { done, total, n: (chunks) => <span className="figure text-ink">{chunks}</span> })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('close')} className="-mr-2 shrink-0 p-2 text-ink-dim">
            <X size={22} aria-hidden />
          </button>
        </div>

        <ol className="mt-4 divide-y divide-line border-y border-line">
          {exercises.map((exercise, index) => {
            const finished = exercise.logs.every((log) => log.completedAt !== null)
            return (
              <li key={exercise.position}>
                <button
                  type="button"
                  onClick={() => onPick(index)}
                  aria-current={index === current ? 'true' : undefined}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="figure w-6 shrink-0 text-sm text-ink-dim">{index + 1}</span>
                  <span className={`min-w-0 flex-1 truncate text-[15px] ${finished ? 'text-ink-dim' : ''}`}>
                    {exercise.name}
                    {index === current && <span className="ml-2 text-xs text-ink-dim">{t('now')}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1" aria-hidden>
                    {exercise.logs.map((log) => (
                      <span
                        key={log.id}
                        className={`size-3 rounded-[2px] ${log.completedAt !== null ? 'bg-plate-blue' : 'border border-line'}`}
                      />
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </dialog>
  )
}
