/**
 * What to try next time, and why.
 *
 * The core mechanic of beginner training is linear progression: hit every
 * prescribed rep and the bar goes up a little; miss and it stays; miss twice
 * and it comes down. The gym screen used to open on last time's weight and
 * leave the decision to you; now it opens on the next step, with the reason
 * in one line under the steppers. Pure and free of Dexie, so every rule here
 * is a unit test.
 */
import type { LocalSetLog } from '@/lib/db/dexie'
import { formatWeight, tidyWeight, type Unit } from '@/lib/units'
import { roundToStep } from '@/lib/weights'

export type Suggestion = {
  weightKg: number | null
  reps: number | null
  /** 'All 3×10 at 75 kg last time → 77.5 kg'; null when there is nothing to say. */
  reason: string | null
}

/** The prescription for the set about to be done. */
export type Prescription = {
  targetReps: number | null
  targetRepsMax: number | null
  targetWeightKg: number | null
}

const NOTHING: Suggestion = { weightKg: null, reps: null, reason: null }

const working = (set: LocalSetLog) => !set.isWarmup && set.completedAt !== null

/** The heaviest weight over a session's working sets — what "last time's weight" means. */
function topWeight(sets: LocalSetLog[]): number {
  return Math.max(0, ...sets.map((set) => set.weightKg ?? 0))
}

/** Every working set reached `reps` and none was marked failed. */
function allHit(sets: LocalSetLog[], reps: number): boolean {
  return sets.length > 0 && sets.every((set) => (set.reps ?? 0) >= reps && set.effort !== 'failed')
}

/**
 * The next step for one exercise.
 *
 * `previous` is last time's sets, `before` the time before that (for the
 * deload rule); both are working sets only, in set order, as
 * `recentPerformances` returns them. `incrementKg` is what a hit adds, null
 * for a movement that carries no weight, where a hit adds a rep instead.
 * `stepKg` rounds a deload to a weight you can actually load. `unit` is only
 * for the reason's wording; the weights themselves stay kilograms.
 */
export function suggestNext({
  previous,
  before = null,
  prescription,
  incrementKg,
  stepKg,
  unit = 'kg',
}: {
  previous: LocalSetLog[] | null
  before?: LocalSetLog[] | null
  prescription: Prescription
  incrementKg: number | null
  stepKg: number
  unit?: Unit
}): Suggestion {
  const kg = (value: number) => formatWeight(value, unit)
  const last = (previous ?? []).filter(working)
  const { targetReps, targetRepsMax } = prescription

  // Nothing to build on: the prescription is the plan, on a weight the plates make.
  if (last.length === 0) {
    const target = prescription.targetWeightKg
    return { weightKg: target === null ? null : tidyWeight(target, unit), reps: targetReps, reason: null }
  }

  // A timed set, or a prescription with no rep target: repeat what you did.
  if (last.some((set) => set.durationSec != null) || targetReps === null) return NOTHING

  const weight = topWeight(last)
  const sets = last.length
  const min = targetReps
  const max = targetRepsMax !== null && targetRepsMax > min ? targetRepsMax : null
  const loaded = weight > 0 && incrementKg !== null

  // Double progression over a rep range: reps climb to the top of the range,
  // then the weight goes up and the reps start again from the bottom.
  if (max !== null) {
    if (allHit(last, max)) {
      if (!loaded) return { weightKg: weight || null, reps: max + 1, reason: `All ${sets}×${max} last time → try ${max + 1}` }
      const next = tidyWeight(weight + incrementKg, unit)
      return { weightKg: next, reps: min, reason: `All ${sets}×${max} at ${kg(weight)} last time → ${kg(next)} from ${min}` }
    }
    if (allHit(last, min)) {
      const lowest = Math.min(...last.map((set) => set.reps ?? 0))
      const reps = Math.min(max, lowest + 1)
      return { weightKg: weight || null, reps, reason: `${kg(weight)} again, aim for ${reps} on every set` }
    }
    return missed(before, weight, min, stepKg, loaded, kg)
  }

  if (allHit(last, min)) {
    if (!loaded) return { weightKg: weight || null, reps: min + 1, reason: `All ${sets}×${min} last time → try ${min + 1}` }
    const next = tidyWeight(weight + incrementKg, unit)
    return { weightKg: next, reps: min, reason: `All ${sets}×${min} at ${kg(weight)} last time → ${kg(next)}` }
  }

  return missed(before, weight, min, stepKg, loaded, kg)
}

/**
 * Reps were missed last time: the weight stays. Missed at the same weight the
 * time before as well, and it comes down 10%, rounded to a loadable weight.
 */
function missed(
  before: LocalSetLog[] | null,
  weight: number,
  reps: number,
  stepKg: number,
  loaded: boolean,
  kg: (value: number) => string,
): Suggestion {
  if (!loaded) return { weightKg: weight || null, reps, reason: `Missed reps last time, go for ${reps} again` }

  const earlier = (before ?? []).filter(working)
  const twice = earlier.length > 0 && topWeight(earlier) === weight && !allHit(earlier, reps)
  if (twice) {
    const lighter = roundToStep(weight * 0.9, stepKg)
    if (lighter < weight) {
      return { weightKg: lighter, reps, reason: `Missed twice at ${kg(weight)} → drop 10% to ${kg(lighter)}` }
    }
  }
  return { weightKg: weight, reps, reason: `Missed reps at ${kg(weight)} last time, repeat it` }
}

export type Values = { weightKg: number | null; reps: number | null; durationSec: number | null }

/**
 * What the steppers open on for a set, most specific first:
 *   1. what you already logged for this set (editing it),
 *   2. the set you just did in this session — after two sets at 77.5 kg for 8
 *      the third should say 77.5 and 8, not last week's numbers or the plan's,
 *   3. the progression's next step, worked out from last time,
 *   4. the same set number last time, then any set last time,
 *   5. the prescription.
 * `sets` are this exercise's sets in this session, in set order, whatever
 * their state; `previous` last time's; `suggestion` the progression's.
 */
export function openingValues({
  log,
  sets,
  previous,
  suggestion,
  unit,
}: {
  log: LocalSetLog
  sets: LocalSetLog[]
  previous: LocalSetLog[] | null
  suggestion: Suggestion | null
  unit: Unit
}): Values {
  const justDone = sets.filter((set) => set.completedAt !== null && set.setIndex < log.setIndex).at(-1)
  const lastSame = previous?.find((set) => set.setIndex === log.setIndex)
  const lastAny = previous?.at(-1)
  return {
    weightKg:
      log.weightKg ??
      justDone?.weightKg ??
      suggestion?.weightKg ??
      lastSame?.weightKg ??
      lastAny?.weightKg ??
      (log.targetWeightKg === null ? null : tidyWeight(log.targetWeightKg, unit)),
    reps: log.reps ?? justDone?.reps ?? suggestion?.reps ?? log.targetReps ?? lastSame?.reps ?? null,
    durationSec:
      log.durationSec ??
      log.targetDurationSec ??
      justDone?.durationSec ??
      lastSame?.durationSec ??
      lastAny?.durationSec ??
      null,
  }
}
