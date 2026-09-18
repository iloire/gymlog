/**
 * Progress, reduced from set logs: how a lift has moved over time, the
 * records behind it, and how this week is going. Pure and free of Dexie —
 * the Progress screen and the exercise page hand it rows and draw the result.
 */
import type { LocalSetLog } from '@/lib/db/dexie'
import type { HistoryEntry } from '@/lib/session-summary'
import type { WeekDay } from '@/lib/week'

/** A working set with a weight on the bar, logged and kept. */
const counts = (log: LocalSetLog) =>
  log.deletedAt === null && log.completedAt !== null && !log.isWarmup && (log.weightKg ?? 0) > 0 && (log.reps ?? 0) > 0

/** Epley: an estimate, only ever compared against itself over time. */
export function e1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30)
}

export type StrengthPoint = {
  /** Epoch ms of the session's day. */
  performedAt: number
  /** The heaviest working set that day. */
  topKg: number
  topReps: number
  /** The best estimated one-rep max that day. */
  e1rmKg: number
}

/**
 * One point per session for one exercise, oldest first: the top set and the
 * best e1RM of the day. Sessions without a weighted working set are left out.
 */
export function strengthSeries(logs: LocalSetLog[]): StrengthPoint[] {
  const bySession = new Map<string, LocalSetLog[]>()
  for (const log of logs) {
    if (!counts(log)) continue
    bySession.set(log.sessionId, [...(bySession.get(log.sessionId) ?? []), log])
  }

  return [...bySession.values()]
    .map((sets) => {
      const top = sets.reduce((best, set) =>
        (set.weightKg ?? 0) > (best.weightKg ?? 0) ||
        ((set.weightKg ?? 0) === (best.weightKg ?? 0) && (set.reps ?? 0) > (best.reps ?? 0))
          ? set
          : best,
      )
      return {
        performedAt: sets[0]?.performedAt ?? 0,
        topKg: top.weightKg ?? 0,
        topReps: top.reps ?? 0,
        e1rmKg: Math.max(...sets.map((set) => e1rm(set.weightKg ?? 0, set.reps ?? 0))),
      }
    })
    .sort((a, b) => a.performedAt - b.performedAt)
}

export type PersonalRecord = {
  exerciseId: string
  name: string
  /** The heaviest working set ever, ties to more reps, then the earliest. */
  weightKg: number
  reps: number
  performedAt: number
  bestE1rmKg: number
  /** How many sessions the exercise has been logged in. */
  sessions: number
}

/**
 * Every exercise's heaviest set and best e1RM, most sessions first — the
 * lifts you do most are the ones whose records mean something.
 */
export function personalRecords(logs: LocalSetLog[]): PersonalRecord[] {
  const byExercise = new Map<string, LocalSetLog[]>()
  for (const log of logs) {
    if (!counts(log)) continue
    byExercise.set(log.exerciseId, [...(byExercise.get(log.exerciseId) ?? []), log])
  }

  return [...byExercise.entries()]
    .map(([exerciseId, sets]) => {
      const heaviest = sets.reduce((best, set) => {
        const w = set.weightKg ?? 0
        const b = best.weightKg ?? 0
        if (w !== b) return w > b ? set : best
        if ((set.reps ?? 0) !== (best.reps ?? 0)) return (set.reps ?? 0) > (best.reps ?? 0) ? set : best
        return set.performedAt < best.performedAt ? set : best
      })
      return {
        exerciseId,
        name: sets.at(-1)?.exerciseName ?? 'Exercise',
        weightKg: heaviest.weightKg ?? 0,
        reps: heaviest.reps ?? 0,
        performedAt: heaviest.performedAt,
        bestE1rmKg: Math.max(...sets.map((set) => e1rm(set.weightKg ?? 0, set.reps ?? 0))),
        sessions: new Set(sets.map((set) => set.sessionId)).size,
      }
    })
    .sort((a, b) => b.sessions - a.sessions || b.weightKg - a.weightKg || a.name.localeCompare(b.name))
}

export type WeekProgress = {
  /** Days trained this week. */
  done: number
  /** Days with a workout on the programme, trained or not, plus any extra day trained. */
  planned: number
  /** Weight × reps over the week's working sets, in kg. */
  volumeKg: number
}

/**
 * This week against the plan: days done over days planned (a day trained off
 * the programme counts on both sides, so the fraction never exceeds one), and
 * the kilos moved.
 */
export function weekProgress(days: WeekDay[], history: HistoryEntry[]): WeekProgress {
  const dates = new Set(days.map((day) => day.date))
  const done = days.filter((day) => day.state === 'done').length
  const planned = days.filter((day) => day.state !== 'rest').length
  const volumeKg = history
    .filter((entry) => dates.has(entry.session.scheduledFor))
    .reduce((sum, entry) => sum + entry.volumeKg, 0)
  return { done, planned, volumeKg }
}
