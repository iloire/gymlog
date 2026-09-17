'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useState } from 'react'

import { DeleteSession } from '@/components/delete-session'
import { FinishSession } from '@/components/finish-session'
import { Nav } from '@/components/nav'
import { SessionSets } from '@/components/session-sets'
import { useUserId } from '@/components/session-boot'
import { TrainingCalendar } from '@/components/training-calendar'
import { streakMessage, weekStreak } from '@/lib/calendar'
import { formatDay, formatDuration, formatMinutes, kg } from '@/lib/format'
import { sessionHistory, trainedOn } from '@/lib/history'
import { today } from '@/lib/queries'
import type { HistoryEntry } from '@/lib/session-summary'

export default function HistoryPage() {
  const userId = useUserId()
  const [selected, setSelected] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    if (!userId) return null
    return { history: await sessionHistory(userId) }
  }, [userId])

  if (!userId || !data) {
    return <main className="p-6 text-ink-dim">Loading…</main>
  }

  const count = data.history.length
  const date = today()
  const trained = new Set(data.history.map((entry) => entry.session.scheduledFor))
  const streak = weekStreak(trained, date)

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">History</h1>
        <p className="mt-2 text-sm text-ink-dim">
          {count === 0
            ? 'Every workout you log shows up here.'
            : `${count} ${count === 1 ? 'workout' : 'workouts'} logged`}
        </p>

        {count > 0 && (
          <>
            <section className="mt-7 flex items-center gap-4" aria-label="Streak">
              <span className="figure text-6xl leading-none">{streak.current}</span>
              <span className="min-w-0">
                <span className="block text-[15px]">
                  {streak.current === 1 ? 'week' : 'weeks'} in a row
                  <span className="text-ink-dim">
                    {' '}
                    · {streak.thisWeek} {streak.thisWeek === 1 ? 'day' : 'days'} this week
                  </span>
                </span>
                <span className="block text-sm text-ink-dim">{streakMessage(streak)}</span>
              </span>
            </section>

            <div className="mt-7">
              <TrainingCalendar trained={trained} today={date} selected={selected} onSelect={setSelected} />
            </div>

            {selected && (
              <ul className="mt-4 divide-y divide-line border-y border-line" aria-label={formatDay(selected)}>
                {trainedOn(data.history, selected).map((entry) => (
                  <SessionRow key={entry.session.id} entry={entry} open />
                ))}
              </ul>
            )}
          </>
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

function SessionRow({ entry, open = false }: { entry: HistoryEntry; open?: boolean }) {
  const { session, setsDone, setsPlanned, volumeKg, cardioSec, durationMs, exercises } = entry

  return (
    <li>
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm py-3 outline-none focus-visible:ring-2 focus-visible:ring-plate-blue-lift [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px]">{session.templateName}</span>
            <span className="block text-sm text-ink-dim">
              {formatDay(session.scheduledFor)}
              {durationMs !== null && durationMs >= 60_000 && <> · {formatDuration(durationMs)}</>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="figure block text-[15px]">
              {/* A cardio-only session has no volume; its minutes say what was done. */}
              {volumeKg > 0 ? kg(volumeKg) : cardioSec > 0 ? formatMinutes(cardioSec) : '—'}
            </span>
            <span className="block text-sm text-ink-dim">
              {setsDone}/{setsPlanned} sets
            </span>
          </span>
        </summary>

        <div className="pb-4">
          <SessionSets exercises={exercises} />
          {/* A workout left open on an earlier day is no longer on Today, so this is
              the one place left to end it. */}
          {session.completedAt === null && (
            <div className="mt-4">
              <FinishSession session={session} setsLeft={setsPlanned - setsDone} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3">
            <Link
              href={`/session?id=${session.id}`}
              className="text-sm text-ink-dim underline underline-offset-4"
            >
              Open to fix a set
            </Link>
            <DeleteSession session={session} />
          </div>
        </div>
      </details>
    </li>
  )
}
