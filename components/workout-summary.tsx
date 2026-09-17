'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { SessionSets } from '@/components/session-sets'
import { streakMessage, weekStreak } from '@/lib/calendar'
import { formatDay, formatDuration, formatMinutes, formatSet, kg } from '@/lib/format'
import { sessionHistory } from '@/lib/history'
import { lastPerformance, today } from '@/lib/queries'
import { compareExercise, recordHeadline, type ExerciseRecord } from '@/lib/records'

/**
 * The screen a workout ends on.
 *
 * Finishing used to drop you back on Today with nothing to show for it. This
 * is the payoff: the weight you moved set large, then everything that beat
 * last time in plate red — the colour means exactly that everywhere else in
 * the app, so nothing else on this screen is allowed to wear it.
 *
 * Reads Dexie like every other screen, so it works with no signal: the
 * comparisons are one `lastPerformance` scan per exercise.
 */
export function WorkoutSummary({
  userId,
  sessionId,
  onDone,
  onReopen,
}: {
  userId: string
  sessionId: string
  onDone: () => void
  onReopen: () => void
}) {
  const data = useLiveQuery(async () => {
    const history = await sessionHistory(userId)
    const entry = history.find((row) => row.session.id === sessionId)
    if (!entry) return { entry: null }

    const records = await Promise.all(
      entry.exercises.map(async (exercise) =>
        compareExercise(exercise, await lastPerformance(userId, exercise.exerciseId, sessionId)),
      ),
    )

    // The last time this same workout was done, for the one total that carries
    // across exercises. An off-plan session has no template and nothing to match.
    const previous =
      entry.session.templateId === null
        ? null
        : (history.find(
            (row) =>
              row.session.id !== sessionId &&
              row.session.templateId === entry.session.templateId &&
              row.session.scheduledFor <= entry.session.scheduledFor,
          ) ?? null)

    return {
      entry,
      records,
      previousVolumeKg: previous?.volumeKg ?? null,
      streak: weekStreak(
        history.map((row) => row.session.scheduledFor),
        today(),
      ),
    }
  }, [userId, sessionId])

  if (!data) return <main className="p-6 text-ink-dim">Loading…</main>

  if (!data.entry) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-8">
        <h1 className="figure text-4xl leading-[1.05]">Workout finished</h1>
        <p className="mt-2 text-[15px] text-ink-dim">No sets were logged, so there is nothing to compare.</p>
        <Buttons onDone={onDone} onReopen={onReopen} />
      </main>
    )
  }

  const { entry, records, previousVolumeKg, streak } = data
  const { session, setsDone, volumeKg, cardioSec, durationMs, exercises } = entry
  const cardioOnly = volumeKg === 0 && cardioSec > 0
  const volumeUpKg = previousVolumeKg !== null && volumeKg > previousVolumeKg ? volumeKg - previousVolumeKg : null

  const beaten = records.filter((record) => recordHeadline(record) !== null)
  const firsts = records.filter((record) => record.first)

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-8">
      <p className="text-sm text-ink-dim">
        {session.templateName} · {formatDay(session.scheduledFor)}
      </p>

      {/* The hero is the weight itself. A workout is measured in kilos moved,
          not in a tick, so the total gets the largest figure on the screen —
          in ink, because red on this screen marks what was *added* to last
          time and nothing else. A red total would drown the three lines below
          that actually earned it. */}
      <p className="figure mt-2 text-6xl leading-none">{cardioOnly ? formatMinutes(cardioSec) : kg(volumeKg)}</p>
      <p className="mt-2 text-[15px] text-ink-dim">
        {cardioOnly ? 'logged' : 'moved'} over {setsDone} {setsDone === 1 ? 'set' : 'sets'}
        {durationMs !== null && durationMs >= 60_000 && <> in {formatDuration(durationMs)}</>}
      </p>
      {volumeUpKg !== null && (
        <p className="figure mt-1 text-[15px] text-plate-red">
          +{kg(volumeUpKg)} on last {session.templateName}
        </p>
      )}

      {beaten.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm text-ink-dim">Beat last time</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {beaten.map((record) => (
              <li key={record.exerciseId} className="flex items-baseline justify-between gap-3 py-3">
                <span className="min-w-0 truncate text-[15px]">{record.name}</span>
                <span className="shrink-0 text-right">
                  <span className="figure block text-[15px] text-plate-red">{recordHeadline(record)}</span>
                  <span className="figure block text-sm text-ink-dim">{comparison(record)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {firsts.length > 0 && (
        <p className="mt-6 text-[15px] text-ink-dim">
          First time logging {firsts.map((record) => record.name).join(', ')} —{' '}
          {firsts.length === 1 ? 'that is the number' : 'those are the numbers'} to beat now.
        </p>
      )}

      <p className="mt-6 text-[15px]">
        <span className="figure text-ink">{streak.current}</span> {streak.current === 1 ? 'week' : 'weeks'} in a row
        <span className="text-ink-dim">
          {' '}
          · {streak.thisWeek} {streak.thisWeek === 1 ? 'day' : 'days'} this week
        </span>
        <span className="block text-sm text-ink-dim">{streakMessage(streak)}</span>
      </p>

      <section className="mt-8">
        <h2 className="text-sm text-ink-dim">What you logged</h2>
        <div className="mt-2">
          <SessionSets exercises={exercises} />
        </div>
      </section>

      <Buttons onDone={onDone} onReopen={onReopen} />
    </main>
  )
}

/** '82.5×5 from 80×5' — the set that beat it, and the set it beat. */
function comparison(record: ExerciseRecord): string {
  if (!record.best) return ''
  const now = formatSet(record.best)
  return record.previousBest ? `${now} from ${formatSet(record.previousBest)}` : now
}

function Buttons({ onDone, onReopen }: { onDone: () => void; onReopen: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onDone}
        className="mt-8 h-16 w-full rounded-md bg-plate-blue text-lg font-semibold text-white transition-colors hover:bg-plate-blue-lift"
      >
        Back to today
      </button>
      {/* One more exercise in you after all, or finished by mistake. */}
      <button type="button" onClick={onReopen} className="mt-3 h-12 w-full rounded-md border border-line text-sm">
        Reopen workout
      </button>
    </>
  )
}
