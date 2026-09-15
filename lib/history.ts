'use client'

import { getDb, type LocalSession, type LocalSetLog, type LocalWorkoutTemplate } from '@/lib/db/dexie'
import { dateToEpoch, today } from '@/lib/queries'

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
    durationMs,
    exercises,
  }
}

/**
 * Every session you actually trained, newest first. A session opened and
 * abandoned without logging a set is not history.
 */
export async function sessionHistory(userId: string): Promise<HistoryEntry[]> {
  const db = getDb(userId)
  const sessions = (await db.sessions.toArray()).filter(alive)
  const logs = await db.setLogs.toArray()

  const bySession = new Map<string, LocalSetLog[]>()
  for (const log of logs) {
    const list = bySession.get(log.sessionId)
    if (list) list.push(log)
    else bySession.set(log.sessionId, [log])
  }

  return sessions
    .map((session) => summariseSession(session, bySession.get(session.id) ?? []))
    .filter((entry) => entry.setsDone > 0)
    .sort(
      (a, b) =>
        b.session.scheduledFor.localeCompare(a.session.scheduledFor) ||
        (b.session.startedAt ?? 0) - (a.session.startedAt ?? 0),
    )
}

export type Rotation = { template: LocalWorkoutTemplate; lastDone: string | null }

/**
 * Your current workouts, the one you have gone longest without first — never
 * done before ever done, then oldest date. In a programme of several workouts
 * the top of this list is the one that is due.
 *
 * Takes history newest-first, as `sessionHistory` returns it.
 */
export function rotation(templates: LocalWorkoutTemplate[], history: HistoryEntry[]): Rotation[] {
  return templates
    .filter((template) => alive(template) && template.archivedAt === null)
    .map((template) => ({
      template,
      lastDone:
        history.find((entry) => entry.session.templateId === template.id)?.session.scheduledFor ??
        null,
    }))
    .sort((a, b) => {
      if (a.lastDone === b.lastDone) return a.template.name.localeCompare(b.template.name)
      if (a.lastDone === null) return -1
      if (b.lastDone === null) return 1
      return a.lastDone.localeCompare(b.lastDone)
    })
}

/** Whole calendar days from one 'YYYY-MM-DD' to another; rounds away a DST hour. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToEpoch(to) - dateToEpoch(from)) / 86_400_000)
}

/** 'today', 'yesterday', '4 days ago' for a calendar date. */
export function daysAgo(date: string, now = today()): string {
  const days = daysBetween(date, now)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
