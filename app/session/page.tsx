'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'

import { RestTimer } from '@/components/rest-timer'
import { useUserId } from '@/components/session-boot'
import { SetSquares } from '@/components/set-squares'
import { Stepper } from '@/components/stepper'
import { getDb, type LocalSetLog } from '@/lib/db/dexie'
import { lastPerformance, type LastPerformance } from '@/lib/queries'
import { clearSet, finishSession, logSet } from '@/lib/sessions'
import { useWakeLock } from '@/lib/use-wake-lock'

const WEIGHT_STEP = 2.5 // the smallest pair of plates
const REP_STEP = 1

/**
 * The session lives at `/session?id=…` rather than `/session/<id>`.
 *
 * That is a deliberate offline decision, not a style one: the service worker
 * caches one shell for this route and serves it for every session id, so a
 * workout you have never opened before still loads in a basement. A dynamic
 * path segment would need a separate cached document per session.
 */
function Session() {
  const userId = useUserId()
  const router = useRouter()
  const id = useSearchParams().get('id') ?? ''

  const [position, setPosition] = useState(0)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ id: string; weightKg: number | null; reps: number | null } | null>(null)

  useWakeLock()

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const session = await db.sessions.get(id)
    if (!session) return null

    const logs = (await db.setLogs.where('sessionId').equals(id).toArray())
      .filter((log) => log.deletedAt === null)
      .sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)

    const positions = [...new Set(logs.map((log) => log.position))].sort((a, b) => a - b)
    return { session, logs, positions }
  }, [userId, id])

  const positions = data?.positions ?? []
  const currentPosition = positions[Math.min(position, positions.length - 1)]
  const groupLogs = (data?.logs ?? []).filter((log) => log.position === currentPosition)
  const exerciseId = groupLogs[0]?.exerciseId

  const [previous, setPrevious] = useState<LastPerformance | null>(null)

  useEffect(() => {
    if (!userId || !exerciseId) return
    let cancelled = false
    void lastPerformance(userId, exerciseId, id).then((result) => {
      if (!cancelled) setPrevious(result)
    })
    return () => {
      cancelled = true
    }
  }, [userId, exerciseId, id])

  // The first set with nothing logged is the one you're about to do.
  const activeSet = groupLogs.find((log) => log.completedAt === null) ?? groupLogs.at(-1)

  // Prefill from last time for this exact set number — the single most useful
  // number in the app. Falls back to the prescription, then to the set before.
  const suggestion = useCallback(
    (log: LocalSetLog) => {
      const lastSame = previous?.sets.find((set) => set.setIndex === log.setIndex)
      const lastAny = previous?.sets.at(-1)
      return {
        weightKg: log.weightKg ?? lastSame?.weightKg ?? lastAny?.weightKg ?? log.targetWeightKg,
        reps: log.reps ?? log.targetReps ?? lastSame?.reps ?? null,
      }
    },
    [previous],
  )

  if (!userId || !data) {
    return <main className="p-6 text-ink-dim">Loading…</main>
  }

  // Derived, not synced through an effect: edits belong to one set, and moving
  // to the next set falls straight back to that set's own suggestion.
  const values =
    activeSet && draft?.id === activeSet.id
      ? draft
      : activeSet
        ? { id: activeSet.id, ...suggestion(activeSet) }
        : { id: '', weightKg: null, reps: null }
  const beatsLastTime =
    previous && values.weightKg !== null && values.weightKg > (previous.topSet.weightKg ?? 0)

  async function completeSet() {
    if (!activeSet || !userId) return
    await logSet(userId, activeSet, values)
    if (activeSet.restSec) setRestEndsAt(Date.now() + activeSet.restSec * 1000)

    const remaining = groupLogs.filter(
      (log) => log.completedAt === null && log.id !== activeSet.id,
    )
    if (remaining.length === 0 && position < positions.length - 1) {
      setPosition(position + 1)
    }
  }

  const allDone = data.logs.every((log) => log.completedAt !== null)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href="/" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {data.session.templateName}
        </Link>
        <span className="text-sm text-ink-dim">
          {positions.length ? `${Math.min(position + 1, positions.length)} / ${positions.length}` : ''}
        </span>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-6">
        <h1 className="figure text-3xl leading-tight">{groupLogs[0]?.exerciseName ?? 'Workout'}</h1>

        <p className="mt-2 text-sm text-ink-dim">
          {previous
            ? `Last time: ${previous.sets
                .map((set) => `${set.weightKg ?? '—'}×${set.reps ?? '—'}`)
                .join(', ')}`
            : 'First time logging this one.'}
        </p>

        <SetSquares logs={groupLogs} activeId={activeSet?.id} />

        {activeSet ? (
          <section className="mt-8">
            <div className="flex items-end gap-3">
              <Stepper
                label="Weight"
                unit="kg"
                value={values.weightKg}
                step={WEIGHT_STEP}
                onChange={(weightKg) => setDraft({ ...values, weightKg })}
              />
              <Stepper
                label="Reps"
                value={values.reps}
                step={REP_STEP}
                onChange={(reps) => setDraft({ ...values, reps })}
              />
            </div>

            {beatsLastTime && (
              <p className="mt-4 border-l-2 border-plate-red pl-3 text-sm">
                Heavier than last time&apos;s top set.
              </p>
            )}

            <button
              type="button"
              onClick={() => void completeSet()}
              className="mt-6 h-16 w-full rounded-md bg-plate-blue text-lg font-semibold text-white transition-colors hover:bg-plate-blue-lift"
            >
              {activeSet.completedAt ? 'Update set' : `Log set ${activeSet.setIndex}`}
            </button>

            {activeSet.completedAt && (
              <button
                type="button"
                onClick={() => void clearSet(userId, activeSet)}
                className="mt-3 h-12 w-full rounded-md border border-line text-sm text-ink-dim"
              >
                Undo this set
              </button>
            )}
          </section>
        ) : (
          <p className="mt-8 text-ink-dim">This workout has no exercises yet.</p>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
            className="flex items-center gap-1 py-2 text-sm text-ink-dim disabled:opacity-30"
          >
            <ChevronLeft size={16} aria-hidden />
            Previous
          </button>
          <button
            type="button"
            disabled={position >= positions.length - 1}
            onClick={() => setPosition(position + 1)}
            className="flex items-center gap-1 py-2 text-sm text-ink-dim disabled:opacity-30"
          >
            Next
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>

        {allDone && !data.session.completedAt && (
          <button
            type="button"
            onClick={async () => {
              await finishSession(userId, data.session)
              router.push('/')
            }}
            className="mt-6 mb-8 h-14 w-full rounded-md border border-line text-base font-semibold"
          >
            Finish workout
          </button>
        )}
      </main>

      <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)]">
        <RestTimer endsAt={restEndsAt} onDone={() => setRestEndsAt(null)} />
      </div>
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense fallback={<main className="p-6 text-ink-dim">Loading…</main>}>
      <Session />
    </Suspense>
  )
}
