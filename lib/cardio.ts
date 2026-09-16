import type { LocalExercise } from '@/lib/db/dexie'

/**
 * Cardio — a stair machine, a bike, a rower — is logged as minutes, not
 * weight × reps. A set log is timed when it carries `durationSec`; this decides
 * which kind of set a new row starts as, from the library's own category.
 */
export function isCardio(exercise: Pick<LocalExercise, 'category'> | null | undefined): boolean {
  return exercise?.category === 'cardio'
}

/** A new cardio item in a workout: one 10-minute block and a minute to get to the next thing. */
export const CARDIO_ITEM = { sets: 1, targetReps: 1, targetDurationSec: 10 * 60, restSec: 60 } as const
