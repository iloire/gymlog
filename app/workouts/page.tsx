'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { BodyPartBadges } from '@/components/body-part-badges'
import { DayPicker } from '@/components/day-picker'
import { Loading, Placeholder } from '@/components/loading'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { bodyParts } from '@/lib/body-parts'
import { getDb } from '@/lib/db/dexie'
import { formatDay } from '@/lib/format'
import { daysAgo, rotation, sessionHistory } from '@/lib/history'
import { assignDay, startNewStage } from '@/lib/program'
import { activeProgram, dayOfWeek } from '@/lib/queries'
import { startSession } from '@/lib/sessions'
import { WEEKDAY_INITIALS, weekdayName } from '@/lib/week'

/** A, B, C… — the letter a workout wears on the week and beside its name. */
const letter = (index: number) => String.fromCharCode(65 + index)

/**
 * The Plan tab, whole: the week along the top, a cell per day wearing the
 * letter of its workout, and the workouts under it wearing the same letters.
 * A tap on a day picks its workout from a sheet. What you train and when
 * used to be two screens behind a segmented control; they are one idea.
 */
export default function WorkoutsPage() {
  const userId = useUserId()
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const templates = (await db.workoutTemplates.toArray()).filter(
      (t) => t.deletedAt === null && t.archivedAt === null,
    )

    const program = (await activeProgram(userId)) ?? null
    const days = program
      ? (await db.programDays.where('programId').equals(program.id).toArray()).filter(
          (day) => day.deletedAt === null,
        )
      : []
    const lastDone = new Map(
      rotation(templates, await sessionHistory(userId)).map((entry) => [entry.template.id, entry.lastDone]),
    )

    const workouts = await Promise.all(
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

    // A programme day pointing at a deleted workout is a rest day.
    const week = WEEKDAY_INITIALS.map((_, weekday) => {
      const templateId = days.find((day) => day.dayOfWeek === weekday)?.templateId ?? null
      const index = workouts.findIndex((workout) => workout.id === templateId)
      return { weekday, templateId: index === -1 ? null : templateId, index }
    })

    return { program, workouts, week, trainingDays: week.filter((day) => day.templateId !== null).length }
  }, [userId])

  async function start(templateId: string, programId: string | null) {
    if (!userId || starting) return
    setStarting(true)
    const id = await startSession(userId, templateId, programId)
    router.push(`/session?id=${id}`)
  }

  if (!userId || !data) {
    return (
      <Loading>
        <h1 className="figure text-4xl">Plan</h1>
        <Placeholder className="mt-2 h-5 w-64" />
        <Placeholder className="mt-7 h-16 w-full" />
      </Loading>
    )
  }

  const { program, workouts, week, trainingDays } = data
  const current = dayOfWeek()

  return (
    <>
      {picking !== null && (
        <DayPicker
          weekday={picking}
          templates={workouts}
          current={week[picking]?.templateId ?? null}
          onPick={(templateId) => {
            void assignDay(userId, picking, templateId)
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Plan</h1>
        <p className="mt-2 text-sm text-ink-dim">
          {program
            ? `${program.name} — ${trainingDays} ${trainingDays === 1 ? 'day' : 'days'} a week, since ${formatDay(program.startedOn)}`
            : 'Your workouts, and the days you train them. Tap a day to put one on it.'}
        </p>

        {/* The week: a cell per day wearing its workout's letter. */}
        <section className="mt-7" aria-label="Your week">
          <ol className="grid grid-cols-7 gap-1.5">
            {week.map((day) => {
              const isToday = day.weekday === current
              const name = day.index === -1 ? null : (workouts[day.index]?.name ?? null)
              return (
                <li key={day.weekday} className="flex flex-col items-center gap-1.5">
                  <span aria-hidden className={`text-xs ${isToday ? 'text-ink' : 'text-ink-dim'}`}>
                    {WEEKDAY_INITIALS[day.weekday]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPicking(day.weekday)}
                    disabled={workouts.length === 0}
                    aria-label={`${weekdayName(day.weekday)}${isToday ? ', today' : ''}: ${name ?? 'rest'}. Change`}
                    className={`figure flex aspect-square w-full items-center justify-center rounded-sm text-lg ${
                      name ? 'bg-plate-blue text-white' : 'border border-line text-ink-dim'
                    } ${isToday ? 'ring-2 ring-ink ring-inset' : ''} disabled:opacity-50`}
                  >
                    {name ? letter(day.index) : <span className="size-1 rounded-full bg-line" />}
                  </button>
                </li>
              )
            })}
          </ol>
        </section>

        {workouts.length ? (
          <ul className="mt-7 divide-y divide-line border-y border-line">
            {workouts.map((workout, index) => (
              <li key={workout.id} className="flex items-center gap-3">
                <Link href={`/workouts/${workout.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-4">
                  <span
                    className={`figure flex size-9 shrink-0 items-center justify-center rounded-sm text-base ${
                      workout.scheduledOn.length > 0 ? 'bg-plate-blue text-white' : 'border border-line text-ink-dim'
                    }`}
                    aria-hidden
                  >
                    {letter(index)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{workout.name}</span>
                    <span className="block text-sm text-ink-dim">
                      {workout.scheduledOn.length > 0
                        ? workout.scheduledOn.map((day) => weekdayName(day).slice(0, 3)).join(' · ')
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
            No workouts yet. Build one, or copy a premade programme, then put it on the days you train.
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

        {program && <NewStage onStart={(name) => startNewStage(userId, name)} />}
      </main>
      <Nav />
    </>
  )
}

/**
 * Moving up a stage ends the current programme and starts a new, empty one.
 * Old sessions keep pointing at the old programme, so the history stays intact.
 */
function NewStage({ onStart }: { onStart: (name: string) => Promise<unknown> }) {
  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="text-xl font-semibold">Start a new stage</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Ends the current programme and starts an empty week for the next one. Everything you have
        logged stays exactly as it is.
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const name = String(new FormData(form).get('name') ?? '').trim()
          if (!name) return
          await onStart(name)
          form.reset()
        }}
      >
        <input
          name="name"
          placeholder="Intermediate 4-day"
          aria-label="New programme name"
          className="h-12 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 outline-none focus-visible:border-plate-blue-lift"
        />
        <button type="submit" className="h-12 shrink-0 rounded-md border border-line px-4 text-sm">
          Start it
        </button>
      </form>
    </section>
  )
}
