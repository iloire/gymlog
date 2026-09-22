'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useUserId } from '@/components/session-boot'
import type { LocalExercise } from '@/lib/db/dexie'
import { deleteExercise } from '@/lib/exercises'

/**
 * Delete an exercise of your own, with the same inline confirm a logged
 * workout gets. Only your own: the library is read-only, and the control is
 * not rendered for it. What was logged against it stays.
 */
export function DeleteExercise({ exercise }: { exercise: LocalExercise }) {
  const userId = useUserId()
  const router = useRouter()
  const t = useTranslations('exercises.delete')
  const [confirming, setConfirming] = useState(false)

  if (!userId) return null

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-ink-dim underline underline-offset-4"
      >
        {t('button')}
      </button>
    )
  }

  async function remove() {
    if (!userId) return
    await deleteExercise(userId, exercise.id)
    router.replace('/exercises')
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={`delete-exercise-${exercise.id}`}
      className="w-full rounded-md border border-plate-red p-4"
    >
      <p id={`delete-exercise-${exercise.id}`} className="text-[15px]">
        {t('question', { name: exercise.name })}
      </p>
      <p className="mt-1 text-sm text-ink-dim">{t('detail')}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" autoFocus onClick={() => setConfirming(false)} className="btn-quiet">
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
        >
          {t('confirm')}
        </button>
      </div>
    </div>
  )
}
