'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'

import { Loading, Placeholder } from '@/components/loading'
import { Nav } from '@/components/nav'
import { PlanTabs } from '@/components/plan-tabs'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { formatDay } from '@/lib/format'
import { newId } from '@/lib/id'
import { activeProgram, dayOfWeek, today } from '@/lib/queries'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function ProgramPage() {
  const userId = useUserId()

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)

    const program = await activeProgram(userId)
    const templates = (await db.workoutTemplates.toArray()).filter(
      (t) => t.deletedAt === null && t.archivedAt === null,
    )
    const days = program
      ? (await db.programDays.where('programId').equals(program.id).toArray()).filter(
          (day) => day.deletedAt === null,
        )
      : []

    return { program: program ?? null, templates, days }
  }, [userId])

  if (!userId || !data) {
    return (
      <Loading className="pt-5">
        <PlanTabs />
        <h1 className="figure text-4xl">Your week</h1>
        <Placeholder className="mt-2 h-5 w-64" />
      </Loading>
    )
  }

  async function ensureProgram(): Promise<string> {
    if (data!.program) return data!.program.id
    const id = newId()
    await writeRow(userId!, 'programs', {
      id,
      name: 'My programme',
      stage: 'beginner',
      startedOn: today(),
      endedOn: null,
      notes: null,
    })
    return id
  }

  async function assign(weekday: number, templateId: string) {
    const programId = await ensureProgram()
    const existing = data!.days.find((day) => day.dayOfWeek === weekday)

    if (templateId === '') {
      if (existing) await deleteRow(userId!, 'programDays', existing.id)
      return
    }

    await writeRow(userId!, 'programDays', {
      id: existing?.id ?? newId(),
      programId,
      dayOfWeek: weekday,
      templateId,
    })
  }

  const trainingDays = data.days.length
  const current = dayOfWeek()

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-5 pb-6">
        <PlanTabs />
        <h1 className="figure text-4xl">Your week</h1>
        <p className="mt-2 text-sm text-ink-dim">
          {data.program
            ? `${data.program.name} — ${trainingDays} ${trainingDays === 1 ? 'day' : 'days'} a week, since ${formatDay(data.program.startedOn)}`
            : 'Put a workout on each day you plan to train. Leave the rest empty.'}
        </p>

        {data.templates.length === 0 ? (
          <p className="mt-7 border-y border-line py-6 text-[15px] text-ink-dim">
            Build a workout first, then you can put it on a day.{' '}
            <Link href="/workouts/new" className="text-ink underline underline-offset-4">
              Build one now
            </Link>
            , or{' '}
            <Link href="/programmes" className="text-ink underline underline-offset-4">
              pick a premade programme
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-7 divide-y divide-line border-y border-line">
            {WEEKDAYS.map((label, weekday) => {
              const assigned = data.days.find((day) => day.dayOfWeek === weekday)
              const isToday = weekday === current

              return (
                <li key={label} className="flex items-center gap-3 py-3">
                  <span
                    className={`w-24 shrink-0 text-[15px] ${isToday ? 'text-ink' : 'text-ink-dim'}`}
                  >
                    {label}
                    {isToday && (
                      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-plate-blue-lift align-middle" />
                    )}
                  </span>

                  <select
                    aria-label={`Workout for ${label}`}
                    value={assigned?.templateId ?? ''}
                    onChange={(event) => void assign(weekday, event.target.value)}
                    className="h-12 w-full rounded-md border border-line bg-surface px-3 text-[15px] outline-none focus-visible:border-plate-blue-lift"
                  >
                    <option value="">Rest</option>
                    {data.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
        )}

        {data.program && (
          <StartNewStage
            onStart={async (name) => {
              await writeRow(userId, 'programs', { ...data.program!, endedOn: today() })
              const id = newId()
              await writeRow(userId, 'programs', {
                id,
                name,
                stage: null,
                startedOn: today(),
                endedOn: null,
                notes: null,
              })
            }}
          />
        )}
      </main>
      <Nav />
    </>
  )
}

/**
 * Moving up a stage ends the current programme and starts a new one. Old
 * sessions keep pointing at the old programme, so the history stays intact.
 */
function StartNewStage({ onStart }: { onStart: (name: string) => Promise<void> }) {
  return (
    <details className="mt-8 border-t border-line pt-5">
      <summary className="cursor-pointer text-sm text-ink-dim">Moved up a stage?</summary>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault()
          const input = new FormData(event.currentTarget).get('name')
          const name = String(input ?? '').trim()
          if (name) await onStart(name)
          event.currentTarget.reset()
        }}
      >
        <input
          name="name"
          placeholder="Intermediate 4-day"
          aria-label="New programme name"
          className="h-12 flex-1 rounded-md border border-line bg-surface px-3 outline-none focus-visible:border-plate-blue-lift"
        />
        <button type="submit" className="h-12 shrink-0 rounded-md border border-line px-4 text-sm">
          Start it
        </button>
      </form>
      <p className="mt-3 text-xs text-ink-dim">
        Your logged workouts stay exactly as they are — only what you train next changes.
      </p>
    </details>
  )
}
