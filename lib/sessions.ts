'use client'

import { isCardio } from '@/lib/cardio'
import { getDb, type LocalExercise, type LocalSession, type LocalSetLog } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { bodyWeightId, sessionId, setLogId } from '@/lib/id'
import { dateToEpoch, templateItems, today } from '@/lib/queries'
import { clearRest, currentRest } from '@/lib/rest'

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
  // Starting a workout you deleted brings it back rather than leaving an empty
  // shell: the ids are deterministic, so its rows are these rows.
  const restarting = existing != null && existing.deletedAt !== null

  await writeRow(userId, 'sessions', {
    id,
    programId,
    templateId,
    // Snapshot: renaming the template later must not rewrite this session.
    templateName: template?.name ?? 'Workout',
    scheduledFor: date,
    startedAt,
    completedAt: restarting ? null : (existing?.completedAt ?? null),
    notes: existing?.notes ?? null,
    deletedAt: null,
  })

  const performedAt = dateToEpoch(date)

  for (const item of items) {
    const exercise = await db.exercises.get(item.exerciseId)

    for (let setIndex = 1; setIndex <= item.sets; setIndex += 1) {
      const logId = setLogId(id, item.exerciseId, setIndex)
      const log = await db.setLogs.get(logId)
      // A set that is already there is left alone — including one you removed
      // with the exercise, which re-opening the workout must not bring back.
      // Only restarting a deleted workout restores its sets.
      if (log && !(restarting && log.deletedAt !== null)) continue

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
        deletedAt: null,
      })
    }
  }

  return id
}

/**
 * Where a workout opens when you come back to it — after the phone killed the
 * app, or from Today's Continue: the exercise you were doing, not the first in
 * the list. That is the exercise of the most recently logged set; once every
 * set of it is done, the next exercise with a set still to do, as logging its
 * last set would have moved you on; nothing logged yet, the first exercise;
 * everything done, the one you did last. An index into the sorted positions.
 */
export function resumePosition(logs: LocalSetLog[]): number {
  const positions = [...new Set(logs.map((log) => log.position))].sort((a, b) => a - b)
  const todo = (at: number) => logs.some((log) => log.position === at && log.completedAt === null)
  const latest = logs
    .filter((log) => log.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]
  if (!latest) return 0

  const from = positions.indexOf(latest.position)
  if (todo(latest.position)) return from
  const after = positions.findIndex((at, index) => index > from && todo(at))
  if (after !== -1) return after
  const any = positions.findIndex(todo)
  return any !== -1 ? any : from
}

/** The next set to do: the first with nothing logged. */
export function nextSet(logs: LocalSetLog[]): LocalSetLog | undefined {
  return logs.find((log) => log.completedAt === null)
}

export type OpenWorkout = {
  /** The next set to do, and how many sets its exercise has; null once every set is logged. */
  next: { exerciseId: string; exerciseName: string; setIndex: number; sets: number } | null
}

/**
 * What the now-playing bar says of a workout under way, from its live set rows
 * in workout order — or null when it is not worth showing. A workout opened
 * and left with nothing logged is not under way: Today and Plan both treat it
 * as never touched, and the bar must not be the one screen that disagrees.
 * The exercise's set count is its highest set number, not its live rows, so
 * skipping sets 1 and 2 still reads "set 3 of 3" rather than "set 3 of 1".
 */
export function openWorkout(logs: LocalSetLog[]): OpenWorkout | null {
  if (!logs.some((log) => log.completedAt !== null)) return null
  const next = nextSet(logs)
  if (!next) return { next: null }
  const sets = Math.max(...logs.filter((log) => log.exerciseId === next.exerciseId).map((log) => log.setIndex))
  return { next: { exerciseId: next.exerciseId, exerciseName: next.exerciseName, setIndex: next.setIndex, sets } }
}

/**
 * Sets are done in order, so only a logged set (to correct it) or the next one
 * to do can be picked — logging set 3 over an empty 1 and 2 records nothing real.
 */
export function canSelectSet(logs: LocalSetLog[], log: LocalSetLog): boolean {
  return log.completedAt !== null || log.id === nextSet(logs)?.id
}

/**
 * The set the steppers are editing: the one you tapped, else the first set
 * with nothing logged, else the last set. A selection left over from another
 * exercise, or of a set that cannot be picked yet, is ignored rather than trusted.
 */
export function activeSet(logs: LocalSetLog[], selectedId: string | null): LocalSetLog | undefined {
  const selected = logs.find((log) => log.id === selectedId)
  return (selected && canSelectSet(logs, selected) ? selected : undefined) ?? nextSet(logs) ?? logs.at(-1)
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
 * Take a logged set back to still-to-do — Log tapped before the set was done,
 * or on the wrong set. Its figures, how it felt and when it was done all go;
 * the prescription and the exercise's note on the row stay. The rest the set
 * started ends with it: there is no set to rest from, and the steppers come
 * back for the set instead of the clock.
 */
export async function unlogSet(userId: string, log: LocalSetLog): Promise<void> {
  await writeRow(userId, 'setLogs', {
    id: log.id,
    weightKg: null,
    reps: null,
    durationSec: null,
    effort: null,
    completedAt: null,
  })
  const rest = await currentRest(userId)
  if (rest?.sessionId === log.sessionId) await clearRest(userId)
}

/**
 * One more set of an exercise mid-workout — the template said three and there
 * is a fourth in you. `logs` are the exercise's sets in the session, in order.
 * The new set takes the prescription and rest of the last one, and the usual
 * deterministic id, so a set added on the phone and on the laptop is one row
 * and a set added, taken back and added again comes back as the same row.
 */
export async function addSet(userId: string, logs: LocalSetLog[]): Promise<LocalSetLog> {
  const last = logs.at(-1)
  if (!last) throw new Error('addSet needs the exercise\'s sets')
  const setIndex = last.setIndex + 1
  return (await writeRow(userId, 'setLogs', {
    id: setLogId(last.sessionId, last.exerciseId, setIndex),
    sessionId: last.sessionId,
    exerciseId: last.exerciseId,
    exerciseName: last.exerciseName,
    position: last.position,
    setIndex,
    targetReps: last.targetReps,
    targetRepsMax: last.targetRepsMax,
    targetWeightKg: last.targetWeightKg,
    targetDurationSec: last.targetDurationSec ?? null,
    restSec: last.restSec,
    weightKg: null,
    reps: null,
    durationSec: null,
    effort: null,
    isWarmup: false,
    completedAt: null,
    performedAt: last.performedAt,
    notes: null,
    deletedAt: null,
  })) as LocalSetLog
}

/**
 * Take a set still to do out of the workout — skipped, or added by mistake.
 * Soft-deleted like everything else, so the other phone learns of it and
 * re-opening the workout does not bring it back. A rest running for the
 * session ends if that was the last set to do: there is nothing to rest for.
 */
export async function skipSet(userId: string, log: LocalSetLog): Promise<void> {
  await deleteRow(userId, 'setLogs', log.id)
  const db = getDb(userId)
  const left = await db.setLogs
    .where('sessionId')
    .equals(log.sessionId)
    .filter((row) => row.deletedAt === null && row.completedAt === null)
    .count()
  if (left === 0 && (await currentRest(userId))?.sessionId === log.sessionId) await clearRest(userId)
}

/** The Undo of skipSet(): the set is back, still to do. */
export async function restoreSet(userId: string, id: string): Promise<void> {
  await writeRow(userId, 'setLogs', { id, deletedAt: null })
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
        // Brings back sets left by an earlier removeFromSession().
        deletedAt: null,
      })
    }
  })
  return position
}

/**
 * Take an exercise out of a session — a wrong pick, or one you skipped. Its
 * sets are soft-deleted, logged or not, so it leaves History and "last time"
 * everywhere once synced. Re-opening the workout does not bring it back: the
 * rows still exist, so startSession() skips them.
 */
export async function removeFromSession(
  userId: string,
  sessionId: string,
  exerciseId: string,
): Promise<void> {
  const db = getDb(userId)
  await db.transaction('rw', [db.setLogs, db.outbox, db.meta], async () => {
    const logs = await db.setLogs.where('sessionId').equals(sessionId).toArray()
    for (const log of logs) {
      if (log.exerciseId === exerciseId && log.deletedAt === null) {
        await deleteRow(userId, 'setLogs', log.id)
      }
    }
  })
}

/** The template key of the one "Extra" session a day holds for exercises done off-plan. */
const EXTRA = 'extra'

/**
 * "Do this now" from an exercise's page: log it today without touching the
 * programme or any workout. It joins the session you have open today — the
 * unfinished one started last — or, with none open, today's *Extra* session,
 * which belongs to no workout and is created under a deterministic id so two
 * devices share it. Returns where to go on the gym screen.
 */
export async function doExerciseToday(
  userId: string,
  exercise: LocalExercise,
  date = today(),
): Promise<{ sessionId: string; position: number }> {
  const db = getDb(userId)
  const open = (await db.sessions.where('scheduledFor').equals(date).toArray())
    .filter((session) => session.deletedAt === null && session.completedAt === null)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]

  const session =
    open ??
    (await db.sessions.get(sessionId(userId, date, EXTRA))) ??
    ((await writeRow(userId, 'sessions', {
      id: sessionId(userId, date, EXTRA),
      programId: null,
      templateId: null,
      templateName: 'Extra',
      scheduledFor: date,
      startedAt: Date.now(),
      completedAt: null,
      notes: null,
    })) as LocalSession)

  return { sessionId: session.id, position: await addToSession(userId, session, exercise) }
}

export async function finishSession(userId: string, session: LocalSession): Promise<void> {
  await writeRow(userId, 'sessions', { ...session, completedAt: Date.now() })
}

/**
 * Throw away a whole logged workout — the wrong one started, or the same
 * session logged twice on two phones. The session and every set in it are
 * soft-deleted in one transaction, so the deletion syncs and History, the
 * calendar and "last time" all stop counting it.
 */
export async function deleteSession(userId: string, id: string): Promise<void> {
  const db = getDb(userId)
  await db.transaction('rw', [db.sessions, db.setLogs, db.outbox, db.meta], async () => {
    const logs = await db.setLogs.where('sessionId').equals(id).toArray()
    for (const log of logs) {
      if (log.deletedAt === null) await deleteRow(userId, 'setLogs', log.id)
    }
    await deleteRow(userId, 'sessions', id)
  })
}

/**
 * Un-finish a workout: finished by accident, or there is one more exercise in
 * you. The sets stay as they are — only the session stops counting as done, so
 * it goes back to being the workout you are training today.
 */
export async function reopenSession(userId: string, session: LocalSession): Promise<void> {
  await writeRow(userId, 'sessions', { ...session, completedAt: null })
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
