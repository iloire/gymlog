/**
 * The plates to put on each side of the bar for a weight. Pure, so it is a
 * unit test; the rail under the weight stepper only draws what this returns.
 */

/** Competition plates and the change plates most racks hold, heaviest first, in kg. */
export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const

export type Plate = (typeof PLATES)[number]

/** Bars you can pick on the rail: the men's 20 kg and the women's 15 kg. */
export const BARS = [20, 15] as const

export type Bar = (typeof BARS)[number]

export type Loading = {
  /** Per side, heaviest first — empty for the bar alone. */
  perSide: Plate[]
  /** The weight those plates actually make, with the bar. Equals the target when `exact`. */
  totalKg: number
  /** False when no combination of the plates makes the target — 61 kg on 1.25s. */
  exact: boolean
}

/**
 * Greedy from the heaviest plate down, which is how the bar is loaded and is
 * optimal for this set of plates (every plate is a multiple of the ones below).
 * A weight under the bar loads nothing; a weight the plates cannot make comes
 * back rounded down to the nearest one they can, flagged as not exact.
 */
export function loadBar(targetKg: number, bar: Bar = 20): Loading {
  const perSide: Plate[] = []
  let left = Math.max(0, targetKg - bar) / 2

  for (const plate of PLATES) {
    while (left + 1e-9 >= plate) {
      perSide.push(plate)
      left -= plate
    }
  }

  const totalKg = bar + perSide.reduce((sum, plate) => sum + plate, 0) * 2
  return { perSide, totalKg, exact: Math.abs(totalKg - targetKg) < 1e-9 && targetKg >= bar }
}

// ------------------------------------------------------------- storage

const STORAGE_KEY = 'gymlog:bar'

/** The bar this device loads, a per-gym fact kept in localStorage like the equipment. */
export function readBar(): Bar {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return BARS.includes(stored as Bar) ? (stored as Bar) : 20
  } catch {
    return 20
  }
}

export function saveBar(bar: Bar): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(bar))
  } catch {
    // Blocked storage: the choice lasts the session.
  }
}
