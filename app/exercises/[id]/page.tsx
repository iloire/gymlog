'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Play } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useState } from 'react'

import { DeleteExercise } from '@/components/delete-exercise'
import { ExerciseDetail, ExerciseDetailLoading } from '@/components/exercise-detail'
import { Loading } from '@/components/loading'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { doExerciseToday } from '@/lib/sessions'

// The tabs an exercise is opened from. `?from=` names one, so the way back
// leads to the screen that was left and that tab stays lit; anything else,
// including a shared link, goes back to the library.
const origins = {
  exercises: { href: '/exercises', label: 'exercises' },
  history: { href: '/history', label: 'progress' },
} as const

function ExerciseDetailPage() {
  const t = useTranslations('exercises')
  const nav = useTranslations('common.nav')
  const userId = useUserId()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const from = useSearchParams().get('from')
  const origin = from !== null && from in origins ? origins[from as keyof typeof origins] : origins.exercises
  const [starting, setStarting] = useState(false)

  const exercise = useLiveQuery(async () => (userId ? getDb(userId).exercises.get(id) : undefined), [userId, id])

  const back = (
    <Link href={origin.href} className="mb-4 flex items-center gap-1 text-sm text-ink-dim">
      <ChevronLeft size={18} aria-hidden />
      {nav(origin.label)}
    </Link>
  )

  if (!userId) {
    return (
      <Loading className="pt-5">
        {back}
        <ExerciseDetailLoading />
      </Loading>
    )
  }

  async function doNow() {
    if (!userId || !exercise || starting) return
    setStarting(true)
    const { sessionId } = await doExerciseToday(userId, exercise)
    router.push(`/session?id=${sessionId}&exercise=${encodeURIComponent(exercise.id)}`)
  }

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-5 pb-6">
        {back}

        <ExerciseDetail
          userId={userId}
          exerciseId={id}
          action={
            <button
              type="button"
              onClick={() => void doNow()}
              disabled={!exercise || starting}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-plate-blue text-base font-semibold text-white transition-colors hover:bg-plate-blue-lift disabled:opacity-60"
            >
              <Play size={16} aria-hidden />
              {t('doNow')}
            </button>
          }
        />

        {exercise?.userId === userId && exercise.deletedAt === null && (
          <div className="mt-8 flex justify-center">
            <DeleteExercise exercise={exercise} />
          </div>
        )}
      </main>
      <Nav tab={origin.href} />
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<ExerciseDetailLoading />}>
      <ExerciseDetailPage />
    </Suspense>
  )
}
