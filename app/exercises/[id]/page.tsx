'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Play } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

import { ExerciseDetail, ExerciseDetailLoading } from '@/components/exercise-detail'
import { Loading } from '@/components/loading'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { doExerciseToday } from '@/lib/sessions'

export default function ExerciseDetailPage() {
  const userId = useUserId()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [starting, setStarting] = useState(false)

  const exercise = useLiveQuery(async () => (userId ? getDb(userId).exercises.get(id) : undefined), [userId, id])

  if (!userId) {
    return (
      <Loading className="pt-5">
        <Link href="/exercises" className="mb-4 flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Exercises
        </Link>
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
        <Link href="/exercises" className="mb-4 flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Exercises
        </Link>

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
              Do this now
            </button>
          }
        />
      </main>
      <Nav />
    </>
  )
}
