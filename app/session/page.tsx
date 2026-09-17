'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { ExerciseDialog } from '@/components/exercise-dialog'
import { ExerciseNote } from '@/components/exercise-note'
import { ExerciseFrames } from '@/components/exercise-frames'
import { RestTimer } from '@/components/rest-timer'
import { useUserId } from '@/components/session-boot'
import { SetSquares } from '@/components/set-squares'
import { Stepper } from '@/components/stepper'
import { isCardio } from '@/lib/cardio'
import { getDb, type LocalSetLog } from '@/lib/db/dexie'
import { formatMinutes } from '@/lib/format'
import { lastPerformance, type LastPerformance } from '@/lib/queries'
import { startRest } from '@/lib/rest'
import {
  activeSet as pickActiveSet,
  finishSession,
  logSet,
  removeFromSession,
  reopenSession,
} from '@/lib/sessions'
import { useWakeLock } from '@/lib/use-wake-lock'

const WEIGHT_STEP = 2.5 // the smallest pair of plates
const REP_STEP = 1
const MINUTE_STEP = 1

type Values = { weightKg: number | null; reps: number | null; durationSec: number | null }

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
  const params = useSearchParams()
  const id = params.get('id') ?? ''

  const [chosenPosition, setPosition] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<({ id: string } & Values) | null>(null)
  const [viewingExercise, setViewingExercise] = useState(false)
  // The exercise being confirmed for removal, so moving to another one drops the prompt.
  const [removing, setRemoving] = useState<string | null>(null)

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

    // Set logs carry the exercise's name but not its photos.
    const exerciseIds = [...new Set(logs.map((log) => log.exerciseId))]
    const exercises = new Map(
      (await db.exercises.bulkGet(exerciseIds)).flatMap((exercise) =>
        exercise ? [[exercise.id, exercise] as const] : [],
      ),
    )
    return { session, logs, positions, exercises }
  }, [userId, id])

  const positions = data?.positions ?? []
  // Opened with ?exercise= ("Do this now"): start on that exercise until you move.
  const requested = params.get('exercise')
  const position =
    chosenPosition ??
    Math.max(
      0,
      positions.findIndex((at) =>
        (data?.logs ?? []).some((log) => log.position === at && log.exerciseId === requested),
      ),
    )
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

  // The set you tapped, otherwise the first set with nothing logged.
  const activeSet = pickActiveSet(groupLogs, selectedId)

  function goTo(index: number) {
    setPosition(index)
    setSelectedId(null)
  }

  // What to put in the steppers for a set, most specific first:
  //   1. what you already logged for this set (editing it),
  //   2. the set you just did in this session — after two sets at 77.5 kg the
  //      third should say 77.5, not last week's number,
  //   3. the same set number last time, then any set last time,
  //   4. the prescription.
  function suggestion(log: LocalSetLog): Values {
    const justDone = groupLogs
      .filter((set) => set.completedAt !== null && set.setIndex < log.setIndex)
      .at(-1)
    const lastSame = previous?.sets.find((set) => set.setIndex === log.setIndex)
    const lastAny = previous?.sets.at(-1)
    return {
      weightKg:
        log.weightKg ?? justDone?.weightKg ?? lastSame?.weightKg ?? lastAny?.weightKg ?? log.targetWeightKg,
      reps: log.reps ?? log.targetReps ?? justDone?.reps ?? lastSame?.reps ?? null,
      durationSec:
        log.durationSec ??
        log.targetDurationSec ??
        justDone?.durationSec ??
        lastSame?.durationSec ??
        lastAny?.durationSec ??
        null,
    }
  }

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
        : { id: '', weightKg: null, reps: null, durationSec: null }
  const exercise = exerciseId ? data.exercises.get(exerciseId) : undefined
  // Cardio by the library's category, or by the rows themselves if the exercise is not loaded.
  const timed =
    isCardio(exercise) || groupLogs.some((log) => log.targetDurationSec != null || log.durationSec != null)
  const beatsLastTime =
    !timed && previous && values.weightKg !== null && values.weightKg > (previous.topSet.weightKg ?? 0)

  async function completeSet() {
    if (!activeSet || !userId) return
    await logSet(userId, activeSet, values)
    // Back to the next set still to do.
    setSelectedId(null)

    // A correction is not a set: no rest, and it leaves you where you are.
    if (activeSet.completedAt) return
    if (activeSet.restSec) await startRest(userId, activeSet.sessionId, activeSet.restSec)

    const remaining = groupLogs.filter(
      (log) => log.completedAt === null && log.id !== activeSet.id,
    )
    if (remaining.length === 0 && position < positions.length - 1) {
      goTo(position + 1)
    }
  }

  const previousNote = previous?.sets.find((set) => set.notes)?.notes

  const allDone = data.logs.every((log) => log.completedAt !== null)
  const exerciseName = groupLogs[0]?.exerciseName ?? 'Workout'
  const nameAt = (index: number) =>
    data.logs.find((log) => log.position === positions[index])?.exerciseName
  const previousName = position > 0 ? nameAt(position - 1) : undefined
  const nextName = position < positions.length - 1 ? nameAt(position + 1) : undefined

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pt-3 pb-1">
        <Link href="/" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {data.session.templateName}
        </Link>
        {positions.length > 0 && (
          <span className="text-sm text-ink-dim">
            Exercise <span className="figure text-ink">{Math.min(position + 1, positions.length)}</span> of{' '}
            {positions.length}
          </span>
        )}
      </header>

      {/* One segment per exercise: filled once every set of it is logged, so the
          whole workout reads at a glance the way the set squares read one exercise. */}
      {positions.length > 1 && (
        <ol className="flex gap-1 px-4 pt-2" aria-hidden>
          {positions.map((at, index) => {
            const done = data.logs.every((log) => log.position !== at || log.completedAt !== null)
            return (
              <li key={at} className="flex-1">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => goTo(index)}
                  className="block w-full py-1.5"
                >
                  <span
                    className={`block h-1 rounded-full ${
                      done
                        ? 'bg-plate-blue'
                        : index === position
                          ? 'bg-ink'
                          : 'bg-line'
                    }`}
                  />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {viewingExercise && exerciseId && (
        <ExerciseDialog
          userId={userId}
          exerciseId={exerciseId}
          onClose={() => setViewingExercise(false)}
        />
      )}

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-4 pb-8">
        {exercise?.images?.length ? (
          // Full-bleed on a phone; the photo shows the movement you are about to
          // do, and tapping it opens the cues and instructions without leaving.
          <button
            type="button"
            onClick={() => setViewingExercise(true)}
            aria-label={`About ${exerciseName}`}
            className="relative -mx-5 block w-[calc(100%+2.5rem)] text-left sm:mx-0 sm:w-full"
          >
            <ExerciseFrames
              exercise={exercise}
              className="aspect-[3/2] w-full rounded-none sm:rounded-md"
            />
            <span className="absolute inset-0 bg-linear-to-t from-ground via-ground/30 via-25% to-transparent to-50% sm:rounded-md" />
            <span className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-ground/70 text-ink">
              <Info size={18} aria-hidden />
            </span>
          </button>
        ) : null}

        <h1
          className={`figure relative text-3xl leading-tight ${exercise?.images?.length ? '-mt-7' : 'mt-2'}`}
        >
          {exerciseName}
        </h1>

        <p className="mt-2 text-sm text-ink-dim">
          {previous ? (
            <>
              Last time{' '}
              {previous.sets.map((set, index) => (
                <span key={set.setIndex} className="figure text-ink">
                  {index > 0 && <span className="text-ink-dim">, </span>}
                  {set.durationSec != null ? (
                    formatMinutes(set.durationSec)
                  ) : (
                    <>
                      {set.weightKg ?? '—'}
                      <span className="text-ink-dim">×</span>
                      {set.reps ?? '—'}
                    </>
                  )}
                </span>
              ))}
            </>
          ) : (
            'First time logging this one.'
          )}
        </p>
        {previousNote && <p className="mt-1 text-sm italic text-ink-dim">“{previousNote}”</p>}

        <SetSquares
          logs={groupLogs}
          activeId={activeSet?.id}
          onSelect={(logId) => {
            setSelectedId(logId)
            setDraft(null)
          }}
        />

        {activeSet ? (
          <section className="mt-8">
            {/* Stacked, not side by side: two steppers across a phone leave ~58px for
                the number, which truncates 77.5 and anything over 100 kg. */}
            <div className="flex flex-col gap-4">
              {timed ? (
                <Stepper
                  label="Time"
                  unit="min"
                  value={values.durationSec === null ? null : Number((values.durationSec / 60).toFixed(1))}
                  step={MINUTE_STEP}
                  onChange={(minutes) => setDraft({ ...values, durationSec: Math.round(minutes * 60) })}
                />
              ) : (
                <>
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
                </>
              )}
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
              {timed && groupLogs.length === 1
                ? `${activeSet.completedAt ? 'Update' : 'Log'} ${values.durationSec ? formatMinutes(values.durationSec) : 'time'}`
                : activeSet.completedAt
                  ? `Update set ${activeSet.setIndex}`
                  : `Log set ${activeSet.setIndex}`}
            </button>

            {groupLogs[0] && <ExerciseNote key={groupLogs[0].id} userId={userId} log={groupLogs[0]} />}
          </section>
        ) : (
          <p className="mt-8 text-ink-dim">This workout has no exercises yet.</p>
        )}

        <div className="mt-10 grid grid-cols-2 gap-3 border-t border-line pt-3">
          {previousName ? (
            <button
              type="button"
              onClick={() => goTo(position - 1)}
              className="flex min-w-0 items-center gap-1.5 py-2 text-left"
            >
              <ChevronLeft size={18} className="shrink-0 text-ink-dim" aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs text-ink-dim">Previous</span>
                <span className="block truncate text-sm">{previousName}</span>
              </span>
            </button>
          ) : (
            <span />
          )}
          {nextName && (
            <button
              type="button"
              onClick={() => goTo(position + 1)}
              className="col-start-2 flex min-w-0 items-center justify-end gap-1.5 py-2 text-right"
            >
              <span className="min-w-0">
                <span className="block text-xs text-ink-dim">Next</span>
                <span className="block truncate text-sm">{nextName}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-dim" aria-hidden />
            </button>
          )}
        </div>

        {exerciseId &&
          (removing === exerciseId ? (
            <div
              role="alertdialog"
              aria-labelledby="remove-exercise-title"
              className="mt-4 rounded-md border border-plate-red p-4"
            >
              <p id="remove-exercise-title" className="text-[15px]">
                Remove {exerciseName} from this workout?
              </p>
              {groupLogs.some((log) => log.completedAt !== null) && (
                <p className="mt-1 text-sm text-ink-dim">The sets you logged for it go too.</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setRemoving(null)}
                  className="h-12 rounded-md border border-line text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await removeFromSession(userId, id, exerciseId)
                    setRemoving(null)
                    // The next exercise slides into this index; past the end, the last one shows.
                    goTo(Math.max(0, Math.min(position, positions.length - 2)))
                  }}
                  className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRemoving(exerciseId)}
              className="mt-4 h-12 w-full rounded-md border border-line text-sm text-ink-dim"
            >
              Remove exercise
            </button>
          ))}

        {data.session.completedAt ? (
          // Finished by accident, or one more exercise in you: the workout goes
          // back to being today's, with every set it already has.
          <button
            type="button"
            onClick={() => void reopenSession(userId, data.session)}
            className="mt-6 h-14 w-full rounded-md border border-line text-base font-semibold"
          >
            Reopen workout
          </button>
        ) : (
          allDone && (
            <button
              type="button"
              onClick={async () => {
                await finishSession(userId, data.session)
                router.push('/')
              }}
              className="mt-6 h-14 w-full rounded-md border border-line text-base font-semibold"
            >
              Finish workout
            </button>
          )
        )}
      </main>

      <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)]">
        <RestTimer />
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
