'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { useUserId } from '@/components/session-boot'
import { writeRow } from '@/lib/db/write'
import { newId } from '@/lib/id'

export default function NewWorkoutPage() {
  const userId = useUserId()
  const router = useRouter()
  const created = useRef(false)
  const t = useTranslations('plan')
  const defaultName = t('defaults.workout')

  useEffect(() => {
    if (!userId || created.current) return
    created.current = true

    void (async () => {
      const id = newId()
      await writeRow(userId, 'workoutTemplates', {
        id,
        name: defaultName,
        notes: null,
        archivedAt: null,
      })
      router.replace(`/workouts/${id}`)
    })()
  }, [userId, router, defaultName])

  return <main className="p-6 text-ink-dim">{t('editor.creating')}</main>
}
