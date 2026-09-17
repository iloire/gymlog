'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { BodyPartBadges } from '@/components/body-part-badges'
import { Nav } from '@/components/nav'
import { PlanTabs } from '@/components/plan-tabs'
import { useUserId } from '@/components/session-boot'
import { bodyParts } from '@/lib/body-parts'
import { getDb } from '@/lib/db/dexie'
import { daysAgo, rotation, sessionHistory } from '@/lib/history'
import { activeProgram, dayOfWeek } from '@/lib/queries'
import { startSession } from '@/lib/sessions'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WorkoutsPage() {
  const userId = useUserId()
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  const workouts = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDb(userId)
    const templates = (await db.workoutTemplates.toArray()).filter(
      (t) => t.deletedAt === null && t.archivedAt === null,
    )

    const program = await activeProgram(userId)
    const days = program
      ? (await db.programDays.where('programId').equals(program.id).toArray()).filter(
          (day) => day.deletedAt === null,
        )
      : []
    const lastDone = new Map(
      rotation(templates, await sessionHistory(userId)).map((entry) => [entry.template.id, entry.lastDone]),
    )

    return Promise.all(
      templates.map(async (template) => {
        const items = (await db.templateItems.where('templateId').equals(template.id).toArray())
          .filter((item) => item.deletedAt === null)
          .sort((a, b) => a.position - b.position)
        const exercises = await db.exercises.bulkGet(items.map((item) => item.exerciseId))
        const parts = bodyParts(items.map((item, index) => ({ exercise: exercises[index], sets: item.sets })))
        const scheduledOn = days
          .filter((day) => day.templateId === template.id)
          .map((day) => day.dayOfWeek)
          .sort((a, b) => a - b)
        return {
          ...template,
          exerciseCount: items.length,
          parts,
          scheduledOn,
          // Started on its own day it is the programme's session, as it is from Today.
          programId: scheduledOn.includes(dayOfWeek()) ? (program?.id ?? null) : null,
          lastDone: lastDone.get(template.id) ?? null,
        }
      }),
    )
  }, [userId])

  async function start(templateId: string, programId: string | null) {
    if (!userId || starting) return
    setStarting(true)
    const id = await startSession(userId, templateId, programId)
    router.push(`/session?id=${id}`)
  }

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-5 pb-6">
        <PlanTabs />
        <h1 className="figure text-4xl">Workouts</h1>
        <p className="mt-2 text-sm text-ink-dim">
          A workout is a list of exercises with the sets, reps and rest you plan to do.
        </p>

        {workouts?.length ? (
          <ul className="mt-7 divide-y divide-line border-y border-line">
            {workouts.map((workout) => (
              <li key={workout.id} className="flex items-center gap-3">
                <Link href={`/workouts/${workout.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{workout.name}</span>
                    <span className="block text-sm text-ink-dim">
                      {workout.scheduledOn.length > 0
                        ? workout.scheduledOn.map((day) => WEEKDAYS[day]).join(' · ')
                        : 'No set day'}
                      {' · '}
                      {workout.lastDone ? `last done ${daysAgo(workout.lastDone)}` : 'not done yet'}
                    </span>
                    <span className="block text-sm text-ink-dim">
                      {workout.exerciseCount} {workout.exerciseCount === 1 ? 'exercise' : 'exercises'}
                    </span>
                    <BodyPartBadges parts={workout.parts} className="mt-1.5" />
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-dim" />
                </Link>
                <button
                  type="button"
                  onClick={() => void start(workout.id, workout.programId)}
                  disabled={starting}
                  aria-label={`Start ${workout.name}`}
                  className="h-12 shrink-0 rounded-md border border-line px-4 text-sm disabled:opacity-60"
                >
                  Start
                </button>
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
      </main>
      <Nav />
    </>
  )
}
