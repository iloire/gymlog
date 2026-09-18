'use client'

import { getDb } from '@/lib/db/dexie'

const META_REST = 'rest'

/** The rest under way. `totalSec` is kept so the bar drains from the same width on every screen. */
export type Rest = { sessionId: string; endsAt: number; totalSec: number }

/** What the +30 s button on the bar adds. */
export const EXTEND_SEC = 30

/**
 * The rest between sets lives in `meta`, not in the session screen's state, so
 * opening an exercise's instructions mid-rest — or the phone killing the app —
 * does not lose the clock. Local-only: a rest is a fact about this phone, and
 * signing out wipes it with the database.
 *
 * It is a rest *between* sets: once every set of the workout is logged there is
 * nothing to rest for, so the last set starts none — and ends one still running
 * from the set before, or the bar would count down past the workout. Finish is
 * what the screen offers instead.
 */
export async function startRest(
  userId: string,
  sessionId: string,
  restSec: number,
  now = Date.now(),
): Promise<void> {
  const db = getDb(userId)
  const left = await db.setLogs
    .where('sessionId')
    .equals(sessionId)
    .filter((log) => log.deletedAt === null && log.completedAt === null)
    .count()
  if (left === 0) {
    await db.meta.delete(META_REST)
    return
  }

  const rest: Rest = {
    sessionId,
    endsAt: now + restSec * 1000,
    totalSec: restSec,
  }
  await db.meta.put({ key: META_REST, value: rest })
}

/**
 * Thirty more seconds on the rest under way. `totalSec` grows with it so the bar
 * keeps draining from full rather than sitting past its right edge.
 */
export async function extendRest(userId: string, now = Date.now()): Promise<void> {
  const rest = await currentRest(userId, now)
  if (!rest) return
  await getDb(userId).meta.put({
    key: META_REST,
    value: {
      ...rest,
      endsAt: rest.endsAt + EXTEND_SEC * 1000,
      totalSec: rest.totalSec + EXTEND_SEC,
    } satisfies Rest,
  })
}

/** Skip the rest, or let it end: either way the bar goes and nothing beeps. */
export async function clearRest(userId: string): Promise<void> {
  await getDb(userId).meta.delete(META_REST)
}

/**
 * The rest to show, or null. A rest that ran out while the app was closed is
 * not one — it must not beep at you when you open the app an hour later — and
 * neither is one whose workout has since been finished or deleted.
 */
export async function currentRest(userId: string, now = Date.now()): Promise<Rest | null> {
  const db = getDb(userId)
  const rest = (await db.meta.get(META_REST))?.value as Rest | undefined
  if (!rest || rest.endsAt <= now) return null

  const session = await db.sessions.get(rest.sessionId)
  if (!session || session.deletedAt !== null || session.completedAt !== null) return null
  return rest
}
