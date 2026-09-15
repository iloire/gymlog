'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { SyncBadge } from '@/components/sync-badge'
import { WeightPrompt } from '@/components/weight-prompt'
import { getDb } from '@/lib/db/dexie'
import { daysAgo, rotation, sessionHistory } from '@/lib/history'
import { dayOfWeek, templateForDay, templateItems, today } from '@/lib/queries'
import { startSession } from '@/lib/sessions'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function TodayPage() {
  const userId = useUserId()
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  const plan = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const scheduled = await templateForDay(userId)
    const date = today()

    // Off-schedule, the workout you have gone longest without comes first.
    const templates = rotation(await db.workoutTemplates.toArray(), await sessionHistory(userId))

    if (!scheduled) {
      return { scheduled: null, templates, session: null, exercises: [] as string[] }
    }

    const template = await db.workoutTemplates.get(scheduled.templateId)
    const items = await templateItems(userId, scheduled.templateId)
    const session = await db.sessions
      .where('scheduledFor')
      .equals(date)
      .filter((s) => s.templateId === scheduled.templateId && s.deletedAt === null)
      .first()

    const exercises = await Promise.all(
      items.map(async (item) => (await db.exercises.get(item.exerciseId))?.name ?? 'Exercise'),
    )

    return {
      scheduled: { ...scheduled, name: template?.name ?? 'Workout', sets: items.length },
      templates,
      session: session ?? null,
      exercises,
    }
  }, [userId])

  async function start(templateId: string, programId: string | null) {
    if (!userId || starting) return
    setStarting(true)
    const id = await startSession(userId, templateId, programId)
    router.push(`/session?id=${id}`)
  }

  const weekday = WEEKDAYS[dayOfWeek()] ?? ''

  // useLiveQuery yields undefined until IndexedDB answers. Rendering the empty
  // state during that gap tells you it is a rest day when it isn't — on a cold
  // start in the gym that is the difference between training and going home.
  if (plan === undefined) {
    return (
      <>
        <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8" aria-busy="true">
          <p className="text-sm text-ink-dim">{weekday}</p>
          <div className="mt-2 h-10 w-48 animate-pulse rounded bg-surface" />
        </main>
        <Nav />
      </>
    )
  }

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <header className="mb-6">
          <p className="text-sm text-ink-dim">{weekday}</p>
          {plan?.scheduled ? (
            <h1 className="figure mt-1 text-4xl leading-[1.05]">{plan.scheduled.name}</h1>
          ) : (
            <h1 className="figure mt-1 text-4xl leading-[1.05]">Rest day</h1>
          )}
        </header>

        <SyncBadge />

        {plan?.scheduled ? (
          <section className="mt-6">
            <ol className="divide-y divide-line border-y border-line">
              {plan.exercises.map((name, index) => (
                <li key={`${name}-${index}`} className="flex items-baseline gap-3 py-3">
                  <span className="figure w-6 text-sm text-ink-dim">{index + 1}</span>
                  <span className="text-[15px]">{name}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => void start(plan.scheduled!.templateId, plan.scheduled!.programId)}
              disabled={starting}
              className="mt-6 h-16 w-full rounded-md bg-plate-blue text-lg font-semibold text-white transition-colors hover:bg-plate-blue-lift disabled:opacity-60"
            >
              {plan.session?.startedAt ? 'Continue workout' : 'Start workout'}
            </button>
          </section>
        ) : (
          <section className="mt-6">
            <p className="text-[15px] text-ink-dim">
              Nothing is scheduled for {weekday}.{' '}
              <Link href="/program" className="text-ink underline underline-offset-4">
                Set up your week
              </Link>
              , or train something anyway.
            </p>

            {plan?.templates.length ? (
              <ul className="mt-5 divide-y divide-line border-y border-line">
                {plan.templates.map(({ template, lastDone }) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => void start(template.id, null)}
                      className="flex w-full items-center justify-between gap-3 py-4 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px]">{template.name}</span>
                        <span className="block text-sm text-ink-dim">
                          {lastDone ? `Last done ${daysAgo(lastDone)}` : 'Not done yet'}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-ink-dim">Start</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <Link
                  href="/programmes"
                  className="mt-6 flex h-16 w-full items-center justify-center rounded-md bg-plate-blue text-lg font-semibold text-white"
                >
                  Pick a premade programme
                </Link>
                <Link
                  href="/workouts/new"
                  className="mt-3 flex h-12 w-full items-center justify-center rounded-md border border-line text-sm"
                >
                  Build your own workout
                </Link>
              </>
            )}
          </section>
        )}

        <WeightPrompt />
      </main>
      <Nav />
    </>
  )
}
