import { isLowerBody } from '@/lib/body-parts'
import type { LocalExercise } from '@/lib/db/dexie'

/**
 * How weight moves for each kind of equipment. One constant of 2.5 kg served
 * every movement, which is right for a barbell and wrong for everything else:
 * dumbbells go up in 2 kg pairs, a stack in 5 kg blocks, and a bodyweight
 * movement carries a plate on a belt if it carries anything at all.
 */
type Equipped = Pick<LocalExercise, 'equipment' | 'primaryMuscles'>

/** The smallest useful change on the weight stepper, in kg. */
export function weightStepKg(exercise?: Equipped | null): number {
  switch (exercise?.equipment) {
    case 'barbell':
    case 'e-z curl bar':
      return 2.5 // the smallest pair of plates
    case 'dumbbell':
      return 2 // the next pair on the rack
    case 'kettlebells':
      return 4 // the next bell
    case 'machine':
    case 'cable':
      return 5 // one block on the stack
    default:
      return 1 // a plate on a belt, a heavier band
  }
}

/**
 * What to add once every prescribed rep was hit: one stepper step, or two for
 * a barbell lift of the legs, which grows faster than the arms and shoulders.
 * Null for a movement that carries no weight — progression there is a rep.
 */
export function progressionIncrementKg(exercise?: Equipped | null): number | null {
  const equipment = exercise?.equipment
  if (!equipment || equipment === 'body only' || equipment === 'bands' || equipment === 'other') return null
  if (equipment === 'foam roll' || equipment === 'exercise ball' || equipment === 'medicine ball') return null
  const step = weightStepKg(exercise)
  return (equipment === 'barbell' || equipment === 'e-z curl bar') && isLowerBody(exercise) ? step * 2 : step
}

/** `value` rounded to the nearest multiple of `step`, never below zero. */
export function roundToStep(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step)
}
