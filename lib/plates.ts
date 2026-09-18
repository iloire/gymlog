/**
 * The plates to put on each side of the bar for a weight. Pure, so it is a
 * unit test; the rail under the weight stepper only draws what this returns.
 *
 * Everything here is in the unit the rail shows: a pound gym has pound plates,
 * and 20 kg on a bar is not "44.1 lb" but 45. The rail converts the stored
 * kilograms once, at the door.
 */
import type { Unit } from '@/lib/units'

/**
 * Competition plates and the change plates most racks hold, heaviest first,
 * and the bars you can pick on the rail — the men's and the women's.
 */
export const PLATE_SETS: Record<Unit, { plates: readonly number[]; bars: readonly number[] }> = {
  kg: { plates: [25, 20, 15, 10, 5, 2.5, 1.25], bars: [20, 15] },
  lb: { plates: [45, 35, 25, 10, 5, 2.5], bars: [45, 35] },
}

export type Loading = {
  /** Per side, heaviest first — empty for the bar alone. */
  perSide: number[]
  /** The weight those plates actually make, with the bar. Equals the target when `exact`. */
  total: number
  /** False when no combination of the plates makes the target — 61 kg on 1.25s. */
  exact: boolean
}

/**
 * Greedy from the heaviest plate down, which is how the bar is loaded and is
 * optimal for both sets of plates (every plate is a multiple of the ones below,
 * bar the 35, which greedy never needs wrongly). A weight under the bar loads
 * nothing; a weight the plates cannot make comes back rounded down to the
 * nearest one they can, flagged as not exact.
 */
export function loadBar(target: number, bar: number = PLATE_SETS.kg.bars[0]!, unit: Unit = 'kg'): Loading {
  const perSide: number[] = []
  let left = Math.max(0, target - bar) / 2

  for (const plate of PLATE_SETS[unit].plates) {
    while (left + 1e-9 >= plate) {
      perSide.push(plate)
      left -= plate
    }
  }

  const total = bar + perSide.reduce((sum, plate) => sum + plate, 0) * 2
  return { perSide, total, exact: Math.abs(total - target) < 1e-9 && target >= bar }
}

// ------------------------------------------------------------- storage

const STORAGE_KEY = 'gymlog:bar'

/**
 * The bar this device loads, a per-gym fact kept in localStorage like the
 * equipment. A bar stored in the other unit is not this gym's bar, so the
 * unit's first bar stands in for it.
 */
export function readBar(unit: Unit = 'kg'): number {
  const { bars } = PLATE_SETS[unit]
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return bars.includes(stored) ? stored : bars[0]!
  } catch {
    return bars[0]!
  }
}

export function saveBar(bar: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(bar))
  } catch {
    // Blocked storage: the choice lasts the session.
  }
}
