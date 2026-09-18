/**
 * Kilograms or pounds, for display and entry only.
 *
 * Every weight in the database is kilograms (`weightKg`), and stays so: the
 * unit is `users.unit`, one choice per account, applied at the edge — the
 * steppers, the squares, the charts, the plates. A phone reads it from `meta`
 * (see `readUnit` in `lib/sync/client.ts`), which sync keeps in step with the
 * server. Pure, so the rounding is a unit test.
 */

export const UNITS = ['kg', 'lb'] as const
export type Unit = (typeof UNITS)[number]

export const DEFAULT_UNIT: Unit = 'kg'

const LB_PER_KG = 2.20462262185

export function parseUnit(value: unknown): Unit {
  return UNITS.includes(value as Unit) ? (value as Unit) : DEFAULT_UNIT
}

/** Kilograms as the unit sees them, unrounded. */
export function toUnit(kg: number, unit: Unit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg
}

/**
 * A number typed or stepped in the unit, as the kilograms to store. Rounded to
 * a gram so 135 lb entered on two phones is the same row, and comes back out
 * as 135 and not 134.99999.
 */
export function fromUnit(value: number, unit: Unit): number {
  const kg = unit === 'lb' ? value / LB_PER_KG : value
  return Number(kg.toFixed(3))
}

/** The figure to print: kilograms in the unit, to one decimal — 77.5, 170.9, 135. */
export function displayWeight(kg: number, unit: Unit): number {
  return Number(toUnit(kg, unit).toFixed(1))
}

/**
 * A weight to suggest, made loadable in the unit. A prescription or a history
 * written in the other unit lands between the plates — an empty 20 kg bar is
 * 44.1 lb, under the 45 lb bar — so anything that is not a whole or a half in
 * the unit is moved to the nearest 2.5 lb or 0.5 kg. A weight already clean
 * in the unit is left exactly as it is, so nothing changes for a kilogram
 * lifter with kilogram history.
 */
export function tidyWeight(kg: number, unit: Unit): number {
  const value = toUnit(kg, unit)
  if (Number.isInteger(value * 2)) return kg
  const grain = unit === 'lb' ? 2.5 : 0.5
  return fromUnit(Math.max(0, Math.round(value / grain) * grain), unit)
}

/** '4,250 kg', '135 lb'. */
export function formatWeight(kg: number, unit: Unit): string {
  return `${displayWeight(kg, unit).toLocaleString('en-GB')} ${unit}`
}

export const UNIT_NAMES: Record<Unit, string> = { kg: 'Kilograms', lb: 'Pounds' }
