import { isLowerBody } from '@/lib/body-parts'
import type { LocalExercise } from '@/lib/db/dexie'
import { DEFAULT_LOCALE, INTL_TAG, type Locale } from '@/lib/i18n'
import { displayWeight, fromUnit, type Unit } from '@/lib/units'

/**
 * How weight moves for each kind of equipment. One constant of 2.5 kg served
 * every movement, which is right for a barbell and wrong for everything else:
 * dumbbells go up in 2 kg pairs, a stack in 5 kg blocks, and a bodyweight
 * movement carries a plate on a belt if it carries anything at all.
 */
type Equipped = Pick<LocalExercise, 'equipment' | 'primaryMuscles'>

/**
 * The smallest useful change on the weight stepper, in the unit the stepper
 * shows. A pound gym's plates and stacks are not kilogram ones converted, so
 * each unit has its own table.
 */
export function weightStep(exercise?: Equipped | null, unit: Unit = 'kg'): number {
  const lb = unit === 'lb'
  switch (exercise?.equipment) {
    case 'barbell':
    case 'e-z curl bar':
      return lb ? 5 : 2.5 // the smallest pair of plates
    case 'dumbbell':
      return lb ? 5 : 2 // the next pair on the rack
    case 'kettlebells':
      return lb ? 8 : 4 // the next bell
    case 'machine':
    case 'cable':
      return lb ? 10 : 5 // one block on the stack
    default:
      return lb ? 2.5 : 1 // a plate on a belt, a heavier band
  }
}

/** `weightStep` as kilograms to store: one clean step in the unit, whatever the unit. */
export function weightStepKg(exercise?: Equipped | null, unit: Unit = 'kg'): number {
  return fromUnit(weightStep(exercise, unit), unit)
}

/**
 * What to add once every prescribed rep was hit: one stepper step, or two for
 * a barbell lift of the legs, which grows faster than the arms and shoulders.
 * Null for a movement that carries no weight — progression there is a rep.
 */
export function progressionIncrementKg(exercise?: Equipped | null, unit: Unit = 'kg'): number | null {
  const equipment = exercise?.equipment
  if (!equipment || equipment === 'body only' || equipment === 'bands' || equipment === 'other') return null
  if (equipment === 'foam roll' || equipment === 'exercise ball' || equipment === 'medicine ball') return null
  const step = weightStepKg(exercise, unit)
  return (equipment === 'barbell' || equipment === 'e-z curl bar') && isLowerBody(exercise) ? step * 2 : step
}

/** `value` rounded to the nearest multiple of `step`, never below zero. */
export function roundToStep(value: number, step: number): number {
  return Math.max(0, Math.round(value / step) * step)
}

/** A bodyweight to one decimal, always — '75.0', '75,0' in Spanish — so a column of readings lines up. */
export function displayOneDecimal(kg: number, unit: Unit, locale: Locale = DEFAULT_LOCALE): string {
  return displayWeight(kg, unit).toLocaleString(INTL_TAG[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
