'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { BodyPartBadges } from '@/components/body-part-badges'
import { Nav } from '@/components/nav'
import { SessionSets } from '@/components/session-sets'
import { useUserId } from '@/components/session-boot'
import { SyncBadge } from '@/components/sync-badge'
import { WeightPrompt } from '@/components/weight-prompt'
import { bodyParts } from '@/lib/body-parts'
import { getDb } from '@/lib/db/dexie'
import { formatMinutes, kg } from '@/lib/format'
import { daysAgo, rotation, sessionHistory, trainedOn, type Rotation } from '@/lib/history'
import type { HistoryEntry } from '@/lib/session-summary'
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

    const history = await sessionHistory(userId)
    // Off-schedule, the workout you have gone longest without comes first.
    const templates = rotation(await db.workoutTemplates.toArray(), history)
    // Once a set is logged today, the screen is today's log rather than a choice of workout.
    const trained = await Promise.all(
      trainedOn(history, date).map(async (entry) => {
        const exercises = await db.exercises.bulkGet(entry.exercises.map((exercise) => exercise.exerciseId))
        const parts = bodyParts(
          entry.exercises.map((exercise, index) => ({ exercise: exercises[index], sets: exercise.sets.length })),
        )
        return { entry, parts }
      }),
    )

    if (!scheduled) {
      return { scheduled: null, templates, trained, session: null, exercises: [] as string[] }
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
      trained,
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

  if (plan?.trained.length) {
    const scheduled = plan.scheduled
    const scheduledDone = plan.trained.some(({ entry }) => entry.session.templateId === scheduled?.templateId)
    // Starting a workout already trained today would only re-open it; its Continue is above.
    const others = plan.templates.filter(
      ({ template }) => !plan.trained.some(({ entry }) => entry.session.templateId === template.id),
    )

    return (
      <>
        <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
          <header className="mb-6">
            <p className="text-sm text-ink-dim">{weekday}</p>
            <h1 className="figure mt-1 text-4xl leading-[1.05]">Today</h1>
          </header>

          <SyncBadge />

          <section className="mt-6 divide-y divide-line border-y border-line">
            {plan.trained.map(({ entry, parts }) => (
              <TodaySession key={entry.session.id} entry={entry} parts={parts} />
            ))}
          </section>

          {scheduled && !scheduledDone && (
            <button
              type="button"
              onClick={() => void start(scheduled.templateId, scheduled.programId)}
              disabled={starting}
              className="mt-6 h-14 w-full rounded-md border border-line text-base font-semibold disabled:opacity-60"
            >
              {plan.session?.startedAt ? 'Continue' : 'Start'} {scheduled.name}
            </button>
          )}

          {others.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-ink-dim">Start another workout</summary>
              <WorkoutList templates={others} onStart={(id) => void start(id, null)} />
            </details>
          )}

          <WeightPrompt />
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
              <WorkoutList templates={plan.templates} onStart={(id) => void start(id, null)} />
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

function WorkoutList({ templates, onStart }: { templates: Rotation[]; onStart: (templateId: string) => void }) {
  return (
    <ul className="mt-5 divide-y divide-line border-y border-line">
      {templates.map(({ template, lastDone }) => (
        <li key={template.id}>
          <button
            type="button"
            onClick={() => onStart(template.id)}
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
  )
}

/** One session trained today: what is logged so far, and the way back into it. */
function TodaySession({ entry, parts }: { entry: HistoryEntry; parts: string[] }) {
  const { session, setsDone, setsPlanned, volumeKg, cardioSec, exercises } = entry
  const totals = [
    `${setsDone}/${setsPlanned} sets`,
    volumeKg > 0 ? kg(volumeKg) : null,
    cardioSec > 0 ? `${formatMinutes(cardioSec)} cardio` : null,
  ].filter(Boolean)

  return (
    <article className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg">{session.templateName}</h2>
        <span className="shrink-0 text-sm text-ink-dim">{totals.join(' · ')}</span>
      </div>
      <BodyPartBadges parts={parts} className="mt-2" />
      <div className="mt-3">
        <SessionSets exercises={exercises} />
      </div>
      {session.completedAt === null ? (
        <Link
          href={`/session?id=${session.id}`}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-md bg-plate-blue text-base font-semibold text-white transition-colors hover:bg-plate-blue-lift"
        >
          Continue {session.templateName}
        </Link>
      ) : (
        <Link
          href={`/session?id=${session.id}`}
          className="mt-3 inline-block text-sm text-ink-dim underline underline-offset-4"
        >
          Finished · open to fix a set
        </Link>
      )}
    </article>
  )
}
