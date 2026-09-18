'use client'

import { getDb, type LocalProgram, type LocalSetLog, type LocalTemplateItem } from '@/lib/db/dexie'
import { estimateWorkoutMs, formatLast, formatTarget, type PlanLine } from '@/lib/plan'

/** Local calendar date, 'YYYY-MM-DD'. Never derive this from a UTC timestamp. */
export function today(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** The local calendar date a timestamp falls on — the inverse of dateToEpoch. */
export function epochToDate(epochMs: number): string {
  return today(new Date(epochMs))
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

/** The active programme's whole week: weekday index (0 = Monday) to template id. */
export type WeekSchedule = { programId: string; days: Map<number, string> }

/**
 * The active programme as a week. Read once and asked seven times, rather than
 * seven reads of `programs` — Today draws the strip off this.
 */
export async function weekSchedule(userId: string): Promise<WeekSchedule | null> {
  const program = await activeProgram(userId)
  if (!program) return null

  const days = await getDb(userId).programDays.where('programId').equals(program.id).toArray()

  return {
    programId: program.id,
    days: new Map(days.filter(alive).map((day) => [day.dayOfWeek, day.templateId])),
  }
}

/** The template scheduled for a given weekday under the active program, if any. */
export async function templateForDay(
  userId: string,
  weekday = dayOfWeek(),
): Promise<{ templateId: string; programId: string } | null> {
  const schedule = await weekSchedule(userId)
  const templateId = schedule?.days.get(weekday)
  return schedule && templateId ? { templateId, programId: schedule.programId } : null
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

/** A planned workout as Today shows it, before a set of it has been logged. */
export type PlanPreview = { lines: PlanLine[]; estimateMs: number }

/**
 * What a workout is going to ask of you: each exercise with its sets and reps
 * and what you lifted there last time, plus how long the whole thing runs.
 *
 * One `lastPerformance` scan per exercise, all of it against IndexedDB — this
 * is read standing in the doorway of a gym with no signal.
 */
export async function planPreview(userId: string, templateId: string): Promise<PlanPreview> {
  const db = getDb(userId)
  const items = await templateItems(userId, templateId)

  const lines = await Promise.all(
    items.map(async (item) => {
      const exercise = await db.exercises.get(item.exerciseId)
      const last = await lastPerformance(userId, item.exerciseId)
      return {
        exerciseId: item.exerciseId,
        name: exercise?.name ?? 'Exercise',
        target: formatTarget(item),
        last: last ? formatLast(last.topSet) : null,
      }
    }),
  )

  return { lines, estimateMs: estimateWorkoutMs(items) }
}

/**
 * What puts an exercise near the top of the library: it is in a workout the
 * active programme schedules, or it has been logged, and when. Favourites are
 * the third signal and come from `favoriteExerciseIds`.
 */
export type ExerciseRank = {
  /** Exercise ids in a workout scheduled under the active programme. */
  programme: ReadonlySet<string>
  /** When each exercise was last logged, epoch ms — only exercises ever done. */
  lastDone: ReadonlyMap<string, number>
}

export const NO_RANK: ExerciseRank = { programme: new Set(), lastDone: new Map() }

/**
 * One read of the schedule, its workouts and every set log: 873 movements is
 * too many to open alphabetically, so the library puts what you actually lift
 * first. A set counts once it is completed — a warm-up or a set never finished
 * does not make an exercise "recently done".
 */
export async function exerciseRank(userId: string): Promise<ExerciseRank> {
  const schedule = await weekSchedule(userId)
  const templateIds = new Set(schedule?.days.values() ?? [])
  const items = await Promise.all([...templateIds].map((id) => templateItems(userId, id)))
  const programme = new Set(items.flat().map((item) => item.exerciseId))

  const lastDone = new Map<string, number>()
  await getDb(userId)
    .setLogs.filter(
      (log) =>
        alive(log) && log.completedAt !== null && !log.isWarmup && (log.reps !== null || log.durationSec != null),
    )
    .each((log) => {
      if (log.performedAt > (lastDone.get(log.exerciseId) ?? -Infinity)) {
        lastDone.set(log.exerciseId, log.performedAt)
      }
    })

  return { programme, lastDone }
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
        (log.reps !== null || log.durationSec != null) &&
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
