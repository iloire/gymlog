'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { formatDay, formatDuration, kg } from '@/lib/format'
import { daysAgo, rotation, sessionHistory, type HistoryEntry } from '@/lib/history'
import { startSession } from '@/lib/sessions'

export default function HistoryPage() {
  const userId = useUserId()
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const history = await sessionHistory(userId)
    const templates = await getDb(userId).workoutTemplates.toArray()
    return { history, rotation: rotation(templates, history) }
  }, [userId])

  if (!userId || !data) {
    return <main className="p-6 text-ink-dim">Loading…</main>
  }

  async function start(templateId: string) {
    if (!userId || starting) return
    setStarting(true)
    const id = await startSession(userId, templateId, null)
    router.push(`/session?id=${id}`)
  }

  const count = data.history.length

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">History</h1>
        <p className="mt-2 text-sm text-ink-dim">
          {count === 0
            ? 'Every workout you log shows up here.'
            : `${count} ${count === 1 ? 'workout' : 'workouts'} logged`}
        </p>

        {data.rotation.length > 1 && count > 0 && (
          <section className="mt-7">
            <h2 className="text-sm text-ink-dim">Longest since you did it</h2>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {data.rotation.map(({ template, lastDone }, index) => (
                <li key={template.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{template.name}</span>
                    <span className="block text-sm text-ink-dim">
                      {lastDone ? daysAgo(lastDone) : 'Not done yet'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void start(template.id)}
                    disabled={starting}
                    className={`h-12 shrink-0 rounded-md px-4 text-sm disabled:opacity-60 ${
                      index === 0
                        ? 'bg-plate-blue font-semibold text-white hover:bg-plate-blue-lift'
                        : 'border border-line'
                    }`}
                  >
                    Start
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {count > 0 ? (
          <section className="mt-9">
            <h2 className="text-sm text-ink-dim">Past workouts</h2>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {data.history.map((entry) => (
                <SessionRow key={entry.session.id} entry={entry} />
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-7 border-y border-line py-6 text-[15px] text-ink-dim">
            Nothing logged yet.{' '}
            <Link href="/" className="text-ink underline underline-offset-4">
              Start today&apos;s workout
            </Link>
            .
          </p>
        )}
      </main>
      <Nav />
    </>
  )
}

function SessionRow({ entry }: { entry: HistoryEntry }) {
  const { session, setsDone, setsPlanned, volumeKg, durationMs, exercises } = entry

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm py-3 outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px]">{session.templateName}</span>
            <span className="block text-sm text-ink-dim">
              {formatDay(session.scheduledFor)}
              {durationMs !== null && durationMs >= 60_000 && <> · {formatDuration(durationMs)}</>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="figure block text-[15px]">{volumeKg > 0 ? kg(volumeKg) : '—'}</span>
            <span className="block text-sm text-ink-dim">
              {setsDone}/{setsPlanned} sets
            </span>
          </span>
        </summary>

        <div className="pb-4">
          <ul className="space-y-2">
            {exercises.map((exercise) => (
              <li key={exercise.exerciseId}>
                <span className="block text-sm text-ink-dim">{exercise.name}</span>
                <ol className="flex flex-wrap gap-x-4 gap-y-1">
                  {exercise.sets.map((set) => (
                    <li key={set.id} className="figure text-[15px]">
                      {/* No weight is a bodyweight set, not a 0 kg one. */}
                      {set.weightKg ? `${set.weightKg}×${set.reps ?? 0}` : `${set.reps ?? 0} reps`}
                      {set.isWarmup && <span className="ml-0.5 text-ink-dim">w</span>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <Link
            href={`/session?id=${session.id}`}
            className="mt-4 inline-block text-sm text-ink-dim underline underline-offset-4"
          >
            Open to fix a set
          </Link>
        </div>
      </details>
    </li>
  )
}
