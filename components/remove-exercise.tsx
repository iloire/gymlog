'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

/**
 * The confirm behind "Remove exercise" on the gym screen. A modal rather than a
 * panel in the page: removing is the one thing you never want mid-set, so it
 * takes no room next to Log set and cannot be reached without the menu first.
 * A native <dialog> gives Escape and the inert page behind it for free.
 */
export function RemoveExercise({
  exerciseName,
  loggedSets,
  onCancel,
  onConfirm,
}: {
  exerciseName: string
  loggedSets: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = useTranslations('plan.removeExercise')

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-plate-red bg-ground p-4 text-ink backdrop:bg-black/70"
    >
      <p id={titleId} className="text-[15px]">
        {t('title', { name: exerciseName })}
      </p>
      {loggedSets && <p className="mt-1 text-sm text-ink-dim">{t('logged')}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="h-12 rounded-md border border-line text-sm"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
        >
          {t('remove')}
        </button>
      </div>
    </dialog>
  )
}
