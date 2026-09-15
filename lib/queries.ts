'use client'

import { getDb, type LocalProgram, type LocalSetLog, type LocalTemplateItem } from '@/lib/db/dexie'

/** Local calendar date, 'YYYY-MM-DD'. Never derive this from a UTC timestamp. */
export function today(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 0 = Monday … 6 = Sunday (JS getDay() is Sunday-first). */
export function dayOfWeek(date = new Date()): number {
  return (date.getDay() + 6) % 7
}

/** Midnight local time for a 'YYYY-MM-DD' date, as epoch ms. */
export function dateToEpoch(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime()
}

const alive = <T extends { deletedAt: number | null }>(row: T) => row.deletedAt === null

export async function activeProgram(userId: string): Promise<LocalProgram | undefined> {
  const programs = await getDb(userId).programs.toArray()
  return programs
    .filter((program) => alive(program) && program.endedOn === null)
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0]
}

/** The template scheduled for a given weekday under the active program, if any. */
export async function templateForDay(
  userId: string,
  weekday = dayOfWeek(),
): Promise<{ templateId: string; programId: string } | null> {
  const program = await activeProgram(userId)
  if (!program) return null

  const days = await getDb(userId)
    .programDays.where('[programId+dayOfWeek]')
    .equals([program.id, weekday])
    .toArray()

  const day = days.find(alive)
  return day ? { templateId: day.templateId, programId: program.id } : null
}

export async function templateItems(
  userId: string,
  templateId: string,
): Promise<LocalTemplateItem[]> {
  const items = await getDb(userId)
    .templateItems.where('templateId')
    .equals(templateId)
    .toArray()
  return items.filter(alive).sort((a, b) => a.position - b.position)
}

export type LastPerformance = {
  performedAt: number
  sets: LocalSetLog[]
  topSet: LocalSetLog
  bestE1rm: number
}

/**
 * What you lifted the last time you did this exercise.
 *
 * Runs entirely against IndexedDB — this is the number read while standing at
 * the bar with no signal, so it must never touch the network. The
 * `[exerciseId+performedAt]` index makes it one reverse range scan; the
 * `performedAt` denormalisation on set_logs exists for exactly this query.
 *
 * `beforeSessionId` excludes the session in progress, so mid-workout the
 * prefill still shows *last* time rather than the set just logged.
 */
export async function lastPerformance(
  userId: string,
  exerciseId: string,
  beforeSessionId?: string,
): Promise<LastPerformance | null> {
  const recent = await getDb(userId)
    .setLogs.where('[exerciseId+performedAt]')
    .between([exerciseId, -Infinity], [exerciseId, Infinity])
    .reverse()
    .filter(
      (log) =>
        alive(log) &&
        log.completedAt !== null &&
        !log.isWarmup &&
        log.reps !== null &&
        log.sessionId !== beforeSessionId,
    )
    .limit(60)
    .toArray()

  const mostRecent = recent[0]
  if (!mostRecent) return null

  const sets = recent
    .filter((log) => log.sessionId === mostRecent.sessionId)
    .sort((a, b) => a.setIndex - b.setIndex)

  const topSet = sets.reduce((best, log) => ((log.weightKg ?? 0) > (best.weightKg ?? 0) ? log : best))

  // Epley: an estimate, only ever compared against itself over time.
  const bestE1rm = Math.max(
    ...sets.map((log) => (log.weightKg ?? 0) * (1 + (log.reps ?? 0) / 30)),
  )

  return { performedAt: mostRecent.performedAt, sets, topSet, bestE1rm }
}

/** Bodyweight series, oldest first, with a trailing 7-day rolling average. */
export async function bodyWeightSeries(
  userId: string,
): Promise<{ measuredOn: string; weightKg: number; rolling: number }[]> {
  const rows = (await getDb(userId).bodyWeights.toArray())
    .filter(alive)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))

  return rows.map((row, index) => {
    const window = rows.slice(Math.max(0, index - 6), index + 1)
    const rolling = window.reduce((sum, w) => sum + w.weightKg, 0) / window.length
    return { measuredOn: row.measuredOn, weightKg: row.weightKg, rolling }
  })
}
