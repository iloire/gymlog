'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { ExerciseDetail } from '@/components/exercise-detail'

/**
 * An exercise's detail as a modal, for screens you must not leave mid-task —
 * the workout editor. A native <dialog> gives focus trapping, Escape and the
 * inert page behind it for free.
 */
export function ExerciseDialog({
  userId,
  exerciseId,
  onClose,
}: {
  userId: string
  exerciseId: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  // Blur first: the cues textarea saves on blur, and unmounting a focused
  // field does not fire it.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) close()
      }}
      className="m-auto max-h-[calc(100dvh-2rem-2*env(safe-area-inset-top))] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-md border border-line bg-ground p-0 text-ink backdrop:bg-black/70"
    >
      <div className="px-5 pt-3 pb-6">
        <div className="flex justify-end">
          <button type="button" onClick={close} aria-label="Close" className="-mr-2 p-2 text-ink-dim">
            <X size={22} aria-hidden />
          </button>
        </div>
        <ExerciseDetail userId={userId} exerciseId={exerciseId} titleId={titleId} />
      </div>
    </dialog>
  )
}
