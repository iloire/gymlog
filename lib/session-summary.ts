import type { LocalSession, LocalSetLog } from '@/lib/db/dexie'

/**
 * Reducing a session and its set logs to what history shows. Pure and free of
 * Dexie, so the History screen (reading IndexedDB) and the `/api/v1` history
 * endpoint (reading Turso) summarise a workout the same way — server rows have
 * the same shape as local ones, plus `rev`.
 */

export type HistoryExercise = {
  exerciseId: string
  name: string
  /** Logged sets only, in order. */
  sets: LocalSetLog[]
}

export type HistoryEntry = {
  session: LocalSession
  setsDone: number
  setsPlanned: number
  /** Sum of weight × reps over logged working sets, in kg. */
  volumeKg: number
  /** Sum of logged timed sets (cardio), in seconds. */
  cardioSec: number
  /** First logged set to last, or null with fewer than two sets. */
  durationMs: number | null
  exercises: HistoryExercise[]
}

const alive = <T extends { deletedAt: number | null }>(row: T) => row.deletedAt === null

/**
 * One past session, reduced to what the history list shows.
 *
 * Duration is measured between the first and last logged set rather than from
 * `startedAt`: a session is started when you open it, which may be hours
 * before the first lift, and re-opening it next week keeps the old `startedAt`.
 */
export function summariseSession(session: LocalSession, logs: LocalSetLog[]): HistoryEntry {
  const ordered = logs
    .filter(alive)
    .sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)
  const done = ordered.filter((log) => log.completedAt !== null)

  const exercises: HistoryExercise[] = []
  for (const log of done) {
    const last = exercises.at(-1)
    if (last?.exerciseId === log.exerciseId) last.sets.push(log)
    else exercises.push({ exerciseId: log.exerciseId, name: log.exerciseName, sets: [log] })
  }

  const times = done.map((log) => log.completedAt as number)
  const durationMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : null

  return {
    session,
    setsDone: done.length,
    setsPlanned: ordered.length,
    volumeKg: done
      .filter((log) => !log.isWarmup)
      .reduce((sum, log) => sum + (log.weightKg ?? 0) * (log.reps ?? 0), 0),
    cardioSec: done.reduce((sum, log) => sum + (log.durationSec ?? 0), 0),
    durationMs,
    exercises,
  }
}

