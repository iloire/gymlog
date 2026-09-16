'use client'

import { isCardio } from '@/lib/cardio'
import { getDb, type LocalExercise, type LocalSession, type LocalSetLog } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { bodyWeightId, sessionId, setLogId } from '@/lib/id'
import { dateToEpoch, templateItems, today } from '@/lib/queries'

/**
 * Start (or re-open) the session for a template on a date.
 *
 * The session id is deterministic, so starting the same day's workout on the
 * phone and on the laptop produces one session that merges, not two. Every
 * prescribed set is pre-created as a row with `completedAt: null`, which makes
 * logging a set an update to a row that already exists — no inserts, no
 * ordering questions, and the whole workout is visible offline before you
 * touch it.
 */
export async function startSession(
  userId: string,
  templateId: string,
  programId: string | null,
  date = today(),
): Promise<string> {
  const db = getDb(userId)
  const id = sessionId(userId, date, templateId)

  const template = await db.workoutTemplates.get(templateId)
  const items = await templateItems(userId, templateId)
  const existing = await db.sessions.get(id)
  const startedAt = existing?.startedAt ?? Date.now()

  await writeRow(userId, 'sessions', {
    id,
    programId,
    templateId,
    // Snapshot: renaming the template later must not rewrite this session.
    templateName: template?.name ?? 'Workout',
    scheduledFor: date,
    startedAt,
    completedAt: existing?.completedAt ?? null,
    notes: existing?.notes ?? null,
  })

  const performedAt = dateToEpoch(date)

  for (const item of items) {
    const exercise = await db.exercises.get(item.exerciseId)

    for (let setIndex = 1; setIndex <= item.sets; setIndex += 1) {
      const logId = setLogId(id, item.exerciseId, setIndex)
      if (await db.setLogs.get(logId)) continue

      await writeRow(userId, 'setLogs', {
        id: logId,
        sessionId: id,
        exerciseId: item.exerciseId,
        exerciseName: exercise?.name ?? 'Exercise',
        position: item.position,
        setIndex,
        targetReps: item.targetReps,
        targetRepsMax: item.targetRepsMax,
        targetWeightKg: item.targetWeightKg,
        targetDurationSec: item.targetDurationSec ?? null,
        restSec: item.restSec,
        weightKg: null,
        reps: null,
        durationSec: null,
        isWarmup: false,
        completedAt: null,
        performedAt,
        notes: null,
      })
    }
  }

  return id
}

/**
 * The set the steppers are editing: the one you tapped, else the first set
 * with nothing logged, else the last set. A selection left over from another
 * exercise is ignored rather than trusted.
 */
export function activeSet(logs: LocalSetLog[], selectedId: string | null): LocalSetLog | undefined {
  return (
    logs.find((log) => log.id === selectedId) ??
    logs.find((log) => log.completedAt === null) ??
    logs.at(-1)
  )
}

export async function logSet(
  userId: string,
  log: LocalSetLog,
  values: { weightKg: number | null; reps: number | null; durationSec?: number | null },
): Promise<void> {
  await writeRow(userId, 'setLogs', {
    ...log,
    ...values,
    // Correcting a set later keeps when it was done, not when it was fixed.
    completedAt: log.completedAt ?? Date.now(),
  })
}

/**
 * Add an exercise to a session that is already under way — the stair machine
 * you warmed up on, which is not in the workout. It goes last, as one timed
 * set for cardio or three sets otherwise, and returns its position. The
 * set-log ids are the usual deterministic ones, so an exercise already in the
 * session is not added twice: its position comes back instead.
 */
export async function addToSession(
  userId: string,
  session: LocalSession,
  exercise: LocalExercise,
): Promise<number> {
  const db = getDb(userId)
  const logs = (await db.setLogs.where('sessionId').equals(session.id).toArray()).filter(
    (log) => log.deletedAt === null,
  )
  const already = logs.find((log) => log.exerciseId === exercise.id)
  if (already) return already.position

  const position = Math.max(0, ...logs.map((log) => log.position)) + 1
  const cardio = isCardio(exercise)

  await db.transaction('rw', [db.setLogs, db.outbox, db.meta], async () => {
    for (let setIndex = 1; setIndex <= (cardio ? 1 : 3); setIndex += 1) {
      await writeRow(userId, 'setLogs', {
        id: setLogId(session.id, exercise.id, setIndex),
        sessionId: session.id,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        position,
        setIndex,
        // No prescription: the steppers start from last time instead.
        targetReps: null,
        targetRepsMax: null,
        targetWeightKg: null,
        targetDurationSec: null,
        restSec: cardio ? null : 90,
        weightKg: null,
        reps: null,
        durationSec: null,
        isWarmup: false,
        completedAt: null,
        performedAt: dateToEpoch(session.scheduledFor),
        notes: null,
      })
    }
  })
  return position
}

export async function clearSet(userId: string, log: LocalSetLog): Promise<void> {
  await writeRow(userId, 'setLogs', { ...log, completedAt: null })
}

export async function finishSession(userId: string, session: LocalSession): Promise<void> {
  await writeRow(userId, 'sessions', { ...session, completedAt: Date.now() })
}

/**
 * Moving a session to another date must move its set logs too: `performedAt`
 * is denormalised onto every set so the "last time" query can avoid a join.
 * This is the only place allowed to change it.
 */
export async function rescheduleSession(
  userId: string,
  session: LocalSession,
  date: string,
): Promise<void> {
  const performedAt = dateToEpoch(date)
  const logs = await getDb(userId).setLogs.where('sessionId').equals(session.id).toArray()

  await writeRow(userId, 'sessions', { ...session, scheduledFor: date })
  for (const log of logs) {
    await writeRow(userId, 'setLogs', { ...log, performedAt })
  }
}

export async function recordBodyWeight(
  userId: string,
  weightKg: number,
  measuredOn = today(),
): Promise<void> {
  await writeRow(userId, 'bodyWeights', {
    id: bodyWeightId(userId, measuredOn),
    measuredOn,
    weightKg,
    notes: null,
  })
}
