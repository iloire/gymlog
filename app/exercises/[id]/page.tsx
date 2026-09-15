'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ExerciseDetail } from '@/components/exercise-detail'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'

export default function ExerciseDetailPage() {
  const userId = useUserId()
  const { id } = useParams<{ id: string }>()

  if (!userId) {
    return <main className="p-6 text-ink-dim">Loading…</main>
  }

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-5 pb-6">
        <Link href="/exercises" className="mb-4 flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Exercises
        </Link>

        <ExerciseDetail userId={userId} exerciseId={id} />
      </main>
      <Nav />
    </>
  )
}
