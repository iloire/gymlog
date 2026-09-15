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
