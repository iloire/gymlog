/**
 * Calendar arithmetic on 'YYYY-MM-DD' dates, done in UTC so a DST change never
 * shifts a day. Pure and free of Dexie, so the History screen and the admin
 * panel count weeks the same way.
 */

const DAY_MS = 86_400_000

/** The date `days` after `isoDate` (negative for before). */
export function addDays(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' for the Monday starting the week that holds `isoDate`. */
export function weekStart(isoDate: string): string {
  const offset = (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(isoDate, -offset)
}

/** The 'YYYY-MM' `months` after `month` (negative for before). */
export function addMonths(month: string, months: number): string {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (index ?? 1) - 1 + months, 1)).toISOString().slice(0, 7)
}

/**
 * A month laid out Monday-first, one array per week row. Days belonging to the
 * previous or next month are null, so the grid lines up without showing them.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`
  const days: (string | null)[] = Array.from({ length: (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 }, () => null)
  for (let date = first; date.startsWith(month); date = addDays(date, 1)) days.push(date)
  while (days.length % 7 !== 0) days.push(null)
  return Array.from({ length: days.length / 7 }, (_, row) => days.slice(row * 7, row * 7 + 7))
}

export type Streak = {
  /** Weeks in a row with a workout, up to this week — or last week, while this one is still open. */
  current: number
  /** The longest such run ever. */
  best: number
  /** Distinct days trained this week. */
  thisWeek: number
}

/**
 * Consistency counted in weeks, not days: rest days are part of training, so a
 * day off never breaks a streak. A week with no workout does, but only once it
 * is over — on Monday last week's run is still alive.
 */
export function weekStreak(dates: Iterable<string>, today: string): Streak {
  const trainedDays = new Set([...dates].filter((date) => date <= today))
  const weeks = new Set([...trainedDays].map(weekStart))
  const thisWeekOf = weekStart(today)

  let current = 0
  let week = weeks.has(thisWeekOf) ? thisWeekOf : addDays(thisWeekOf, -7)
  while (weeks.has(week)) {
    current += 1
    week = addDays(week, -7)
  }

  let best = 0
  let run = 0
  let previous: string | null = null
  for (const weekOf of [...weeks].sort()) {
    run = previous !== null && addDays(previous, 7) === weekOf ? run + 1 : 1
    best = Math.max(best, run)
    previous = weekOf
  }

  return {
    current,
    best,
    thisWeek: [...trainedDays].filter((date) => weekStart(date) === thisWeekOf).length,
  }
}

/**
 * One encouraging line under the streak count — what keeps it going, never
 * what was missed. The count itself is shown beside it, so this never repeats it.
 */
export function streakMessage({ current, best, thisWeek }: Streak): string {
  if (thisWeek === 0) {
    return current === 0 ? 'One workout this week starts a new streak.' : `One workout this week makes it ${current + 1}.`
  }
  if (current === 1) return 'Streak started. Train next week to keep it going.'
  if (current === best) return 'Your best run yet.'
  return `Your best is ${best} weeks.`
}
