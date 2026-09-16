'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import Link from 'next/link'

import { BodyPartBadges } from '@/components/body-part-badges'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { bodyParts } from '@/lib/body-parts'
import { getDb } from '@/lib/db/dexie'

export default function WorkoutsPage() {
  const userId = useUserId()

  const workouts = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDb(userId)
    const templates = (await db.workoutTemplates.toArray()).filter(
      (t) => t.deletedAt === null && t.archivedAt === null,
    )

    return Promise.all(
      templates.map(async (template) => {
        const items = (await db.templateItems.where('templateId').equals(template.id).toArray())
          .filter((item) => item.deletedAt === null)
          .sort((a, b) => a.position - b.position)
        const exercises = await db.exercises.bulkGet(items.map((item) => item.exerciseId))
        const parts = bodyParts(items.map((item, index) => ({ exercise: exercises[index], sets: item.sets })))
        return { ...template, exerciseCount: items.length, parts }
      }),
    )
  }, [userId])

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Workouts</h1>
        <p className="mt-2 text-sm text-ink-dim">
          A workout is a list of exercises with the sets, reps and rest you plan to do.
        </p>

        {workouts?.length ? (
          <ul className="mt-7 divide-y divide-line border-y border-line">
            {workouts.map((workout) => (
              <li key={workout.id}>
                <Link href={`/workouts/${workout.id}`} className="flex items-baseline justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <span className="block text-[15px]">{workout.name}</span>
                    <BodyPartBadges parts={workout.parts} className="mt-1.5" />
                  </div>
                  <span className="shrink-0 text-sm text-ink-dim">
                    {workout.exerciseCount} {workout.exerciseCount === 1 ? 'exercise' : 'exercises'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-7 border-y border-line py-6 text-[15px] text-ink-dim">
            No workouts yet. Build one, then put it on a day of the week.
          </p>
        )}

        <Link
          href="/workouts/new"
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-md bg-plate-blue text-base font-semibold text-white"
        >
          <Plus size={18} aria-hidden />
          New workout
        </Link>
        <Link
          href="/programmes"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-md border border-line text-sm"
        >
          Browse premade programmes
        </Link>
      </main>
      <Nav />
    </>
  )
}
