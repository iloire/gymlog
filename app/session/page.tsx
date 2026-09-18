'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronLeft, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { EffortChips } from '@/components/effort-chips'
import { ExerciseDialog } from '@/components/exercise-dialog'
import { ExerciseNote } from '@/components/exercise-note'
import { ExerciseFrames } from '@/components/exercise-frames'
import { Placeholder } from '@/components/loading'
import { OverflowMenu } from '@/components/overflow-menu'
import { PlateRail } from '@/components/plate-rail'
import { RemoveExercise } from '@/components/remove-exercise'
import { RestBar, RestTakeover, useRest } from '@/components/rest-timer'
import { useUserId } from '@/components/session-boot'
import { SetSquares } from '@/components/set-squares'
import { Stepper } from '@/components/stepper'
import { UndoToast } from '@/components/undo-toast'
import { useUnit } from '@/components/use-unit'
import { WorkoutSheet } from '@/components/workout-sheet'
import { WorkoutSummary } from '@/components/workout-summary'
import { isCardio } from '@/lib/cardio'
import { getDb, type LocalSetLog } from '@/lib/db/dexie'
import { formatMinutes } from '@/lib/format'
import { daysAgo } from '@/lib/history'
import { suggestNext } from '@/lib/progression'
import { epochToDate, recentPerformances, type LastPerformance } from '@/lib/queries'
import { heavierThanLastTime } from '@/lib/records'
import { startRest } from '@/lib/rest'
import {
  activeSet as pickActiveSet,
  addSet,
  finishSession,
  logSet,
  removeFromSession,
  reopenSession,
  restoreSet,
  skipSet,
  unlogSet,
} from '@/lib/sessions'
import { useWakeLock } from '@/lib/use-wake-lock'
import { displayWeight, fromUnit, tidyWeight } from '@/lib/units'
import { progressionIncrementKg, weightStep, weightStepKg } from '@/lib/weights'

const REP_STEP = 1
/** How far a finger travels sideways before it is a swipe to the next exercise. */
const SWIPE_PX = 64
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
  const unit = useUnit()
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get('id') ?? ''

  const [chosenPosition, setPosition] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<({ id: string } & Values) | null>(null)
  const [viewingExercise, setViewingExercise] = useState(false)
  // The exercise being confirmed for removal, so moving to another one drops the prompt.
  const [removing, setRemoving] = useState<string | null>(null)
  // Set by finishing the workout here, so the summary is the reward for ending
  // one rather than something every visit to a past session has to scroll past.
  const [finished, setFinished] = useState(false)
  const [overview, setOverview] = useState(false)
  // The one-tap change on offer to take back for six seconds — a set added or skipped.
  const [undoable, setUndoable] = useState<{ key: number; message: string; onUndo: () => void } | null>(null)
  const dismissUndoable = useCallback(() => setUndoable(null), [])
  const undoCount = useRef(0)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  // The set just logged, so the rest can ask how it felt — even once the
  // screen has moved on to the next exercise.
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null)

  useWakeLock()
  // Mounted once for the whole screen: the takeover and the bar both draw it.
  const { rest, remaining } = useRest()

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

  // Last time and the time before: the first for the ghost row and the red
  // edge, both for the progression rule that spots a weight missed twice.
  const [recent, setRecent] = useState<LastPerformance[]>([])
  const previous: LastPerformance | null = recent[0] ?? null

  useEffect(() => {
    if (!userId || !exerciseId) return
    let cancelled = false
    void recentPerformances(userId, exerciseId, id).then((result) => {
      if (!cancelled) setRecent(result)
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

  const exercise = exerciseId ? data?.exercises.get(exerciseId) : undefined

  // The next step for this exercise, and why: the same suggestion for every
  // set of it, so the steppers open on the progression rather than on a repeat.
  const progression = activeSet
    ? suggestNext({
        previous: previous?.sets ?? null,
        before: recent[1]?.sets ?? null,
        prescription: activeSet,
        incrementKg: progressionIncrementKg(exercise, unit),
        stepKg: weightStepKg(exercise, unit),
        unit,
      })
    : null

  // What to put in the steppers for a set, most specific first:
  //   1. what you already logged for this set (editing it),
  //   2. the set you just did in this session — after two sets at 77.5 kg the
  //      third should say 77.5, not last week's number,
  //   3. the progression's next step, worked out from last time,
  //   4. the same set number last time, then any set last time,
  //   5. the prescription.
  function suggestion(log: LocalSetLog): Values {
    const justDone = groupLogs
      .filter((set) => set.completedAt !== null && set.setIndex < log.setIndex)
      .at(-1)
    const lastSame = previous?.sets.find((set) => set.setIndex === log.setIndex)
    const lastAny = previous?.sets.at(-1)
    return {
      weightKg:
        log.weightKg ??
        justDone?.weightKg ??
        progression?.weightKg ??
        lastSame?.weightKg ??
        lastAny?.weightKg ??
        (log.targetWeightKg === null ? null : tidyWeight(log.targetWeightKg, unit)),
      reps: log.reps ?? progression?.reps ?? log.targetReps ?? justDone?.reps ?? lastSame?.reps ?? null,
      durationSec:
        log.durationSec ??
        log.targetDurationSec ??
        justDone?.durationSec ??
        lastSame?.durationSec ??
        lastAny?.durationSec ??
        null,
    }
  }

  if (!userId || !data) return <SessionLoading />

  // Finished from this screen: the summary takes it over, with the way back
  // into the workout on it. Opening an old session still lands on the sets.
  if (finished) {
    return (
      <WorkoutSummary
        userId={userId}
        sessionId={id}
        onDone={() => router.push('/')}
        onReopen={async () => {
          await reopenSession(userId, data.session)
          setFinished(false)
        }}
      />
    )
  }

  // Derived, not synced through an effect: edits belong to one set, and moving
  // to the next set falls straight back to that set's own suggestion.
  const values =
    activeSet && draft?.id === activeSet.id
      ? draft
      : activeSet
        ? { id: activeSet.id, ...suggestion(activeSet) }
        : { id: '', weightKg: null, reps: null, durationSec: null }
  // Cardio by the library's category, or by the rows themselves if the exercise is not loaded.
  const timed =
    isCardio(exercise) || groupLogs.some((log) => log.targetDurationSec != null || log.durationSec != null)
  // What there is to beat: last time's heaviest set, or nothing — a first time,
  // or a timed exercise, where weight is not the measure.
  const previousTopKg = !timed && previous ? (previous.topSet.weightKg ?? 0) : null
  // Once a set of this exercise is logged heavier than last time, its square
  // keeps the red edge and the line has said all it has to say.
  const banked = groupLogs.some(
    (log) => log.completedAt !== null && heavierThanLastTime(log.weightKg, previousTopKg),
  )
  const beatsLastTime = !banked && heavierThanLastTime(values.weightKg, previousTopKg)
  // The reason under the steppers, while the numbers are still the suggestion:
  // once you change them, or the set is logged, the reason no longer applies.
  const reason =
    activeSet && activeSet.completedAt === null && draft === null && !timed ? progression?.reason : null

  async function completeSet() {
    if (!activeSet || !userId) return
    await logSet(userId, activeSet, values)
    setLastLoggedId(activeSet.id)
    // A short buzz says it landed, for a thumb that is not looking at the screen.
    navigator.vibrate?.(30)
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

  // A set back to still-to-do: the steppers return for it, on its own suggestion.
  async function undoSet(log: LocalSetLog) {
    if (!userId) return
    await unlogSet(userId, log)
    setSelectedId(null)
    setDraft(null)
  }
  // The set to take back from the menu: the last one logged for this exercise.
  const lastDone = groupLogs.filter((log) => log.completedAt !== null).at(-1)

  // A set you are not going to do, out of the way of Finish. Undo brings it back.
  async function skipOneSet(log: LocalSetLog) {
    if (!userId) return
    await skipSet(userId, log)
    setSelectedId(null)
    setDraft(null)
    undoCount.current += 1
    setUndoable({
      key: undoCount.current,
      message: `Set ${log.setIndex} skipped`,
      onUndo: () => {
        setUndoable(null)
        void restoreSet(userId, log.id)
      },
    })
  }

  // One more set than the template said. Undo takes it out again while the
  // bar shows, unless it has been logged in the meantime — then it stands.
  async function addOneSet() {
    if (!userId) return
    const added = await addSet(userId, groupLogs)
    undoCount.current += 1
    setUndoable({
      key: undoCount.current,
      message: `Set ${added.setIndex} added`,
      onUndo: async () => {
        setUndoable(null)
        const row = await getDb(userId).setLogs.get(added.id)
        if (row && row.completedAt === null) await skipSet(userId, row)
      },
    })
  }

  const previousNote = previous?.sets.find((set) => set.notes)?.notes

  // The suggestion first, then the weights already lifted this session and
  // last time, heaviest first — most sets are one tap on one of these.
  const quickWeights = [
    ...new Set(
      [
        progression?.weightKg ?? null,
        ...groupLogs.filter((log) => log.completedAt !== null).map((log) => log.weightKg),
        ...(previous?.sets ?? []).map((set) => set.weightKg),
      ].filter((weight): weight is number => weight !== null && weight > 0),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 4)

  // Between sets the clock takes the steppers' place. Tapping a done square to
  // fix it mid-rest brings the steppers back, with the bar at the bottom.
  const resting = rest?.sessionId === id && remaining > 0
  const takeover = resting && selectedId === null && activeSet !== undefined && activeSet.completedAt === null
  const nextSet = activeSet
    ? timed
      ? `${values.durationSec ? formatMinutes(values.durationSec) : 'time'}`
      : values.weightKg
        ? `${displayWeight(values.weightKg, unit)} ${unit} × ${values.reps ?? '—'}`
        : `${values.reps ?? '—'} reps`
    : null

  const allDone = data.logs.every((log) => log.completedAt !== null)
  const lastLogged = data.logs.find((log) => log.id === lastLoggedId && log.completedAt !== null) ?? null
  // Nothing left to log and nothing picked to fix: Finish takes the Log button's place.
  const finishing = allDone && data.session.completedAt === null && selectedId === null
  const exerciseName = groupLogs[0]?.exerciseName ?? 'Workout'

  return (
    <div className="flex flex-1 flex-col">
      {/* The way back, then the workout's name as the way to the whole of it:
          a sheet with every exercise and its squares, and a tap to jump. The
          count beside the name says where you are without a bar to hit. */}
      <header className="flex items-center gap-1 px-4 pt-3 pb-1">
        <Link href="/" aria-label="Today" className="flex h-11 w-9 items-center text-ink-dim">
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => setOverview(true)}
          aria-haspopup="dialog"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left text-sm text-ink-dim"
        >
          <span className="truncate">{data.session.templateName}</span>
          {positions.length > 0 && (
            <span className="shrink-0">
              · <span className="figure text-ink">{Math.min(position + 1, positions.length)}</span>/{positions.length}
            </span>
          )}
          <ChevronDown size={16} aria-hidden className="shrink-0" />
        </button>
      </header>

      {overview && (
        <WorkoutSheet
          name={data.session.templateName}
          exercises={positions.map((at) => {
            const logs = data.logs.filter((log) => log.position === at)
            return { position: at, name: logs[0]?.exerciseName ?? 'Exercise', logs }
          })}
          current={position}
          onPick={(index) => {
            goTo(index)
            setOverview(false)
          }}
          onClose={() => setOverview(false)}
        />
      )}

      {viewingExercise && exerciseId && (
        <ExerciseDialog
          userId={userId}
          exerciseId={exerciseId}
          onClose={() => setViewingExercise(false)}
        />
      )}

      {/* A horizontal swipe moves between exercises; a mostly vertical one is a
          scroll and is left alone, as is anything that starts on a scrolling row. */}
      <main
        className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-3 pb-8"
        onTouchStart={(event) => {
          const touch = event.touches[0]
          swipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null
        }}
        onTouchEnd={(event) => {
          const start = swipe.current
          const touch = event.changedTouches[0]
          swipe.current = null
          if (!start || !touch) return
          const dx = touch.clientX - start.x
          const dy = touch.clientY - start.y
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 2) return
          if (dx < 0 && position < positions.length - 1) goTo(position + 1)
          if (dx > 0 && position > 0) goTo(position - 1)
        }}
      >
        {/* The photo runs the full width, cropped wide: a landscape strip of the
            movement reads far bigger than a thumbnail beside the name, and costs
            about the same height. It is the one flex child that grows, so its
            height is whatever the screen has left once the name, the squares, the
            steppers and Log set have theirs: a short phone gets a letterbox that
            keeps Log set above the fold, a tall one nearer the whole frame, and
            spare height beyond the cap pools under the controls. No viewport
            arithmetic to keep right; the width never gives, only the crop.
            Tapping it opens the cues and instructions without leaving. */}
        {exercise?.images?.length ? (
          // The div does the sizing; the button covers it, because a percentage
          // height inside a flexed button resolves to nothing.
          <div className="relative max-h-60 min-h-20 w-full flex-1">
            <button
              type="button"
              onClick={() => setViewingExercise(true)}
              aria-label={`About ${exerciseName}`}
              className="absolute inset-0 block"
            >
              <ExerciseFrames exercise={exercise} className="h-full w-full" />
              <span className="absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ground/70 text-ink">
                <Info size={13} aria-hidden />
              </span>
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex items-start gap-3">
          {/* One line, always: a long name steps down a size and then ends in an
              ellipsis rather than wrapping under the photo, so the squares and
              the steppers sit at the same height whatever the exercise is called.
              The full name is a tap away: the photo opens it, ⋮ is labelled with it. */}
          <h1
            title={exerciseName}
            className={`figure min-w-0 flex-1 truncate leading-tight ${exerciseName.length > 26 ? 'text-xl' : 'text-2xl'}`}
          >
            {exerciseName}
          </h1>

          {/* Removing is the one thing you never want mid-set, so it is two taps
              away behind ⋮ rather than a button under Next, and it takes no
              height on the 320px phone where Log set already touches the bottom
              edge. Undoing the set just logged sits with it: Log tapped before
              the set was done is a regret about the set, not the exercise.
              Swap exercise (roadmap §4.5) joins them here when it lands. */}
          {exerciseId && (
            <OverflowMenu
              label={`More for ${exerciseName}`}
              items={[
                ...(lastDone
                  ? [{ label: `Undo set ${lastDone.setIndex}`, onSelect: () => void undoSet(lastDone) }]
                  : []),
                { label: 'Remove exercise', onSelect: () => setRemoving(exerciseId) },
              ]}
            />
          )}
        </div>

        {exerciseId && removing === exerciseId && (
          <RemoveExercise
            exerciseName={exerciseName}
            loggedSets={groupLogs.some((log) => log.completedAt !== null)}
            onCancel={() => setRemoving(null)}
            onConfirm={async () => {
              await removeFromSession(userId, id, exerciseId)
              setRemoving(null)
              // The next exercise slides into this index; past the end, the last one shows.
              goTo(Math.max(0, Math.min(position, positions.length - 2)))
            }}
          />
        )}

        {!previous && <p className="mt-2 text-sm text-ink-dim">First time logging this one.</p>}
        {previousNote && <p className="mt-1 text-sm italic text-ink-dim">“{previousNote}”</p>}

        <SetSquares
          logs={groupLogs}
          activeId={activeSet?.id}
          previousTopKg={previousTopKg}
          previous={previous?.sets ?? null}
          previousLabel={previous ? `Last time · ${daysAgo(epochToDate(previous.performedAt))}` : 'Last time'}
          justLoggedId={lastLoggedId}
          onSelect={(logId) => {
            setSelectedId(logId)
            setDraft(null)
          }}
          onAdd={data.session.completedAt === null ? () => void addOneSet() : undefined}
        />

        {activeSet && takeover ? (
          <RestTakeover
            rest={rest}
            remaining={remaining}
            next={
              <>
                Set {activeSet.setIndex} · <span className="figure">{nextSet}</span>
              </>
            }
          >
            {lastLogged && <EffortChips userId={userId} log={lastLogged} className="mt-5" />}
          </RestTakeover>
        ) : activeSet && finishing ? (
          // The last set is logged and there is no rest to start: the Log
          // button's place goes to Finish, so the summary is the next tap.
          <section className="mt-4">
            <p className="text-[15px] text-ink-dim">Every set logged. Tap a square to fix one.</p>
            {lastLogged && <EffortChips userId={userId} log={lastLogged} className="mt-4" />}
            <button
              type="button"
              onClick={async () => {
                await finishSession(userId, data.session)
                setFinished(true)
              }}
              className="mt-4 h-16 w-full rounded-md bg-plate-blue text-lg font-semibold text-white transition-colors hover:bg-plate-blue-lift"
            >
              Finish workout
            </button>
          </section>
        ) : activeSet ? (
          <section className="mt-4">
            {/* Stacked, not side by side: two steppers across a phone leave ~58px for
                the number, which truncates 77.5 and anything over 100 kg. */}
            <div className="flex flex-col gap-2">
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
                    unit={unit}
                    value={values.weightKg === null ? null : displayWeight(values.weightKg, unit)}
                    step={weightStep(exercise, unit)}
                    onChange={(weight) => setDraft({ ...values, weightKg: fromUnit(weight, unit) })}
                  />
                  {/* The weights within reach, one tap each: the suggestion, then
                      what this session and last time have already been lifted at. */}
                  {quickWeights.length > 1 && (
                    <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Quick weights">
                      {quickWeights.map((weight) => (
                        <li key={weight}>
                          <button
                            type="button"
                            aria-pressed={values.weightKg === weight}
                            onClick={() => setDraft({ ...values, weightKg: weight })}
                            className={`figure h-9 rounded-full px-3 text-sm ${
                              values.weightKg === weight ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
                            }`}
                          >
                            {displayWeight(weight, unit)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {exercise?.equipment === 'barbell' && <PlateRail weightKg={values.weightKg} />}
                  <Stepper
                    label="Reps"
                    value={values.reps}
                    step={REP_STEP}
                    onChange={(reps) => setDraft({ ...values, reps })}
                  />
                </>
              )}
            </div>

            {reason ? (
              <p className={`mt-3 border-l-2 pl-3 text-sm ${beatsLastTime ? 'border-plate-red' : 'border-line text-ink-dim'}`}>
                {reason}
              </p>
            ) : (
              beatsLastTime && (
                <p className="mt-3 border-l-2 border-plate-red pl-3 text-sm">
                  Heavier than last time&apos;s top set.
                </p>
              )
            )}

            <button
              type="button"
              onClick={() => void completeSet()}
              className="mt-3 h-14 w-full rounded-md bg-plate-blue text-lg font-semibold text-white transition-[background-color,transform] hover:bg-plate-blue-lift motion-safe:active:scale-[0.98]"
            >
              {timed && groupLogs.length === 1
                ? `${activeSet.completedAt ? 'Update' : 'Log'} ${values.durationSec ? formatMinutes(values.durationSec) : 'time'}`
                : activeSet.completedAt
                  ? `Update set ${activeSet.setIndex}`
                  : `Log set ${activeSet.setIndex} · ${nextSet}`}
            </button>

            {activeSet.completedAt !== null && !timed && (
              <EffortChips userId={userId} log={activeSet} className="mt-4" />
            )}

            {/* One quiet line under the button. A logged set picked to fix can
                be taken back altogether: the square goes hollow and the set is
                there to do again. A set still to do can be skipped: it leaves
                the row, so Finish does not ask about it, with Undo on offer. */}
            {activeSet.completedAt !== null ? (
              <button
                type="button"
                onClick={() => void undoSet(activeSet)}
                className="mt-3 h-11 w-full rounded-md text-sm text-ink-dim"
              >
                Clear set {activeSet.setIndex}
              </button>
            ) : (
              data.session.completedAt === null && (
                <button
                  type="button"
                  onClick={() => void skipOneSet(activeSet)}
                  className="mt-3 h-11 w-full rounded-md text-sm text-ink-dim"
                >
                  Skip set {activeSet.setIndex}
                </button>
              )
            )}

            {groupLogs[0] && <ExerciseNote key={groupLogs[0].id} userId={userId} log={groupLogs[0]} />}
          </section>
        ) : (
          <p className="mt-8 text-ink-dim">This workout has no exercises yet.</p>
        )}

        {/* The way between exercises is the swipe and the sheet behind the
            workout's name in the header; no Previous / Next row, so the height
            it took goes to the photo and the controls on a short phone. */}
        {data.session.completedAt && (
          // Finished by accident, or one more exercise in you: the workout goes
          // back to being today's, with every set it already has. It sits at the
          // bottom of the screen, where the thumb is.
          <div className="mt-auto pt-10">
            <button
              type="button"
              onClick={() => void reopenSession(userId, data.session)}
              className="h-14 w-full rounded-md border border-line text-base font-semibold"
            >
              Reopen workout
            </button>
          </div>
        )}
      </main>

      <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)]">
        {undoable && (
          <UndoToast
            key={undoable.key}
            message={undoable.message}
            onUndo={undoable.onUndo}
            onDismiss={dismissUndoable}
          />
        )}
        {!takeover && <RestBar rest={rest} remaining={remaining} />}
      </div>
    </div>
  )
}

/**
 * The session's frame while its rows load: the way back to Today, then the
 * thumbnail and name at the size they take once the exercise is known. The
 * gym screen has no tab bar, so this is not `Loading` from components.
 */
function SessionLoading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <header className="flex items-center gap-1 px-4 pt-3 pb-1">
        <Link href="/" aria-label="Today" className="flex h-11 w-9 items-center text-ink-dim">
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <Placeholder className="h-4 w-24" />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-3 pb-8">
        <Placeholder className="max-h-60 min-h-20 w-full flex-1" />
        <Placeholder className="mt-3 h-8 w-3/4" />
        {/* The controls' share of the height, so the photo lands at the size it keeps. */}
        <div className="h-72" />
      </main>
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense fallback={<SessionLoading />}>
      <Session />
    </Suspense>
  )
}
