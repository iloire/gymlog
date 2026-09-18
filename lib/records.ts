/**
 * What a workout beat.
 *
 * Pure and free of Dexie: a screen hands it the sets logged for an exercise
 * and what that exercise looked like last time, and gets back the numbers the
 * summary prints in plate red. Red means "you beat last time" everywhere in
 * this app, so what counts as beating it is decided here and nowhere else.
 */
import type { LocalSetLog } from '@/lib/db/dexie'
import { formatMinutes } from '@/lib/format'
import type { HistoryExercise } from '@/lib/session-summary'
import { formatWeight, type Unit } from '@/lib/units'

/** Last time's working sets for one exercise — the shape `lastPerformance` returns. */
export type Previous = { sets: LocalSetLog[]; topSet: LocalSetLog }

export type ExerciseRecord = {
  exerciseId: string
  name: string
  /** The heaviest working set logged this time, or the longest timed one. */
  best: LocalSetLog | null
  /** The set it was measured against, null the first time the exercise is done. */
  previousBest: LocalSetLog | null
  /** Kg added to last time's heaviest set. Null unless it went up. */
  weightUpKg: number | null
  /** Reps added at that same weight, when the weight itself did not move. Null unless up. */
  repsUp: number | null
  /** Seconds added to last time's longest timed set. Null unless up. */
  timeUpSec: number | null
  /** Kg of volume added on last time. Null unless it went up. */
  volumeUpKg: number | null
  /** Never logged before this workout. */
  first: boolean
}

const working = (set: LocalSetLog) => !set.isWarmup

/** Weight × reps over the working sets, in kg — the same sum History shows. */
function volume(sets: LocalSetLog[]): number {
  return sets.filter(working).reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0)
}

/** The heaviest working set, or the longest when the exercise is timed. Ties go to more reps. */
function best(sets: LocalSetLog[]): LocalSetLog | null {
  const candidates = sets.filter(working)
  return (
    candidates.reduce<LocalSetLog | null>((top, set) => {
      if (!top) return set
      if (set.durationSec != null || top.durationSec != null) {
        return (set.durationSec ?? 0) > (top.durationSec ?? 0) ? set : top
      }
      if ((set.weightKg ?? 0) !== (top.weightKg ?? 0)) return (set.weightKg ?? 0) > (top.weightKg ?? 0) ? set : top
      return (set.reps ?? 0) > (top.reps ?? 0) ? set : top
    }, null) ?? null
  )
}

/** Positive differences only: a set that went down is not news on this screen. */
const up = (now: number | null | undefined, then: number | null | undefined): number | null => {
  const gain = Number(((now ?? 0) - (then ?? 0)).toFixed(2))
  return gain > 0 ? gain : null
}

/**
 * One exercise of a finished workout against the last time it was done.
 *
 * A heavier top set, more reps at the same top weight, a longer time and more
 * total volume are four different wins, and which one to say is left to
 * `recordHeadline` — the comparison itself stays arithmetic.
 */
export function compareExercise(exercise: HistoryExercise, previous: Previous | null): ExerciseRecord {
  const mine = best(exercise.sets)
  const shared = {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    best: mine,
    previousBest: previous?.topSet ?? null,
  }

  if (!previous || !mine) {
    return { ...shared, weightUpKg: null, repsUp: null, timeUpSec: null, volumeUpKg: null, first: !previous }
  }

  const theirs = previous.topSet
  const timed = mine.durationSec != null || theirs.durationSec != null

  return {
    ...shared,
    weightUpKg: timed ? null : up(mine.weightKg, theirs.weightKg),
    // Only when the weight itself held: 80×8 after 80×6 is progress, 82.5×3 after 80×8 is not "3 reps up".
    repsUp: timed || (mine.weightKg ?? 0) !== (theirs.weightKg ?? 0) ? null : up(mine.reps, theirs.reps),
    timeUpSec: timed ? up(mine.durationSec, theirs.durationSec) : null,
    volumeUpKg: timed ? null : up(volume(exercise.sets), volume(previous.sets)),
    first: false,
  }
}

/**
 * The one thing worth saying about an exercise, biggest win first: load beats
 * reps beats total work. Null when it did not beat last time — which is what
 * keeps the summary's red list honest.
 */
export function recordHeadline(record: ExerciseRecord, unit: Unit = 'kg'): string | null {
  if (record.weightUpKg !== null) return `+${formatWeight(record.weightUpKg, unit)}`
  if (record.repsUp !== null) return `+${record.repsUp} ${record.repsUp === 1 ? 'rep' : 'reps'}`
  if (record.timeUpSec !== null) return `+${formatMinutes(record.timeUpSec)}`
  if (record.volumeUpKg !== null) return `+${formatWeight(record.volumeUpKg, unit)} total`
  return null
}

/**
 * A set gone heavier than the best set last time. The red edge on a set square
 * and, before it is logged, the line under the steppers both ask this, so they
 * can never disagree. `previousTopKg` is null when there is nothing to beat —
 * a first time, or a timed exercise, where weight is not the measure.
 */
export function heavierThanLastTime(weightKg: number | null, previousTopKg: number | null): boolean {
  return weightKg !== null && previousTopKg !== null && weightKg > previousTopKg
}
