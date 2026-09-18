import { displayWeight, type Unit } from '@/lib/units'

/**
 * Date formatting for server-rendered screens. Pinned to UTC so the server and
 * a hydrating client never disagree about which day a timestamp falls on.
 */
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** '15 Sept 2026' for epoch ms or a 'YYYY-MM-DD' calendar date. */
export function formatDay(value: number | string): string {
  return dayFormat.format(typeof value === 'number' ? value : new Date(`${value}T00:00:00Z`))
}

/** '3 days ago', 'today', or null for no timestamp. */
export function formatAgo(epochMs: number | null, now = Date.now()): string | null {
  if (epochMs === null) return null
  const days = Math.floor((now - epochMs) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days} days ago`
  return formatDay(epochMs)
}

/** '52 min' or '1 h 5 min'. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`
}

/** '8 min', '7.5 min'. Timed sets are stored in seconds and entered in minutes. */
export function formatMinutes(seconds: number): string {
  return `${Number((seconds / 60).toFixed(1))} min`
}

/**
 * One logged set: '8 min' when timed, '80×5' with a weight in the unit, '12 reps'
 * without — a bodyweight set, not a 0 kg one.
 */
export function formatSet(
  set: { weightKg: number | null; reps: number | null; durationSec?: number | null },
  unit: Unit = 'kg',
): string {
  if (set.durationSec != null) return formatMinutes(set.durationSec)
  return set.weightKg ? `${displayWeight(set.weightKg, unit)}×${set.reps ?? 0}` : `${set.reps ?? 0} reps`
}

/**
 * A number as someone types it: '42.5', '42,5' on a comma keypad, or '42.'
 * half way there. Null for anything that is not a number yet — '', '.', '-'.
 */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '' || trimmed === '.') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}
