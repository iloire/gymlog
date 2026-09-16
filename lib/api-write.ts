import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import {
  exercises,
  programDays,
  programs,
  syncedTables,
  templateItems,
  users,
  workoutTemplates,
  type SyncedTableName,
} from '@/db/schema'
import { apiProfile, apiWorkouts, isoDate, WEEKDAYS } from '@/lib/api'
import { ApiError, notFound } from '@/lib/api-route'
import { bodyWeightId, newId } from '@/lib/id'

/**
 * Writes through `/api/v1`, for `write` tokens.
 *
 * The server is just another client of the sync model here. Every row it
 * changes gets `updatedAt = now` (last-write-wins, same as a device's edit) and
 * a fresh `rev`, so each phone pulls the change on its next sync exactly as if
 * another of the user's devices had made it. Nothing is hard-deleted.
 *
 * Each operation validates first, then hands its rows to `commit()`, which
 * writes them all or none.
 */

type PendingRow = { table: SyncedTableName; row: { id: string } & Record<string, unknown> }

/**
 * Upsert rows for one user in one transaction, numbering them from the user's
 * sync counter. The counter is bumped by the transaction's first statement, so
 * a concurrent `/api/sync` cannot hand out the same revs.
 */
async function commit(userId: string, pending: PendingRow[]): Promise<void> {
  if (!pending.length) return
  const now = Date.now()

  await db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(users)
      .set({ syncRev: sql`${users.syncRev} + ${pending.length}` })
      .where(eq(users.id, userId))
      .returning({ syncRev: users.syncRev })
    if (!bumped) throw new ApiError(401, 'unauthorized', 'The account no longer exists.')

    let rev = bumped.syncRev - pending.length
    for (const { table: name, row } of pending) {
      rev += 1
      const table = syncedTables[name]
      const values = { createdAt: now, deletedAt: null, ...row, userId, updatedAt: now, rev }
      await tx
        .insert(table)
        .values(values as never)
        .onConflictDoUpdate({ target: table.id, set: values as never })
    }
  })
}

// ----------------------------------------------------------------- workouts

const workoutExercise = z
  .object({
    exerciseId: z.string().min(1),
    sets: z.number().int().min(1).max(20),
    targetReps: z.number().int().min(1).max(100),
    targetRepsMax: z.number().int().min(1).max(100).nullable().default(null),
    targetWeightKg: z.number().min(0).max(1000).nullable().default(null),
    targetDurationSec: z.number().int().min(1).max(4 * 3600).nullable().default(null),
    restSec: z.number().int().min(0).max(1800).default(90),
    notes: z.string().max(500).nullable().default(null),
  })
  .refine((item) => item.targetRepsMax === null || item.targetRepsMax >= item.targetReps, {
    message: 'targetRepsMax must be at least targetReps',
    path: ['targetRepsMax'],
  })

export const workoutInput = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().max(1000).nullable().default(null),
  exercises: z.array(workoutExercise).max(40),
})

export type WorkoutInput = z.infer<typeof workoutInput>

/** Every exercise must be in the shared library or the user's own, and not deleted. */
async function assertExercises(userId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)]
  if (!unique.length) return

  const found = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, unique),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
        isNull(exercises.deletedAt),
      ),
    )
  const known = new Set(found.map((row) => row.id))
  const missing = unique.filter((id) => !known.has(id))
  if (missing.length) {
    throw new ApiError(
      400,
      'unknown_exercise',
      'Find exercise ids with GET /exercises?q=…',
      missing.map((id) => `exerciseId: ${id}`),
    )
  }
}

/** The user's live, unarchived workout — the ones GET /workouts lists — or a 404. */
async function ownWorkout(userId: string, id: string) {
  const [template] = await db
    .select()
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.id, id),
        eq(workoutTemplates.userId, userId),
        isNull(workoutTemplates.deletedAt),
        isNull(workoutTemplates.archivedAt),
      ),
    )
    .limit(1)
  if (!template) throw notFound('workout')
  return template
}

async function workoutById(userId: string, id: string) {
  const [workout] = (await apiWorkouts(userId, id)).workouts
  if (!workout) throw notFound('workout')
  return workout
}

/**
 * Item rows for a workout's exercise list. Existing live items are reused in
 * position order so ids stay stable; any left over are tombstoned.
 */
function itemRows(
  templateId: string,
  input: WorkoutInput['exercises'],
  existing: { id: string; createdAt: number }[] = [],
): PendingRow[] {
  const rows: PendingRow[] = input.map((item, index) => ({
    table: 'templateItems',
    row: {
      ...(existing[index] ?? { id: newId() }),
      templateId,
      position: index + 1,
      ...item,
    },
  }))
  for (const stale of existing.slice(input.length)) {
    rows.push({ table: 'templateItems', row: { ...stale, deletedAt: Date.now() } })
  }
  return rows
}

export async function createWorkout(userId: string, input: WorkoutInput) {
  await assertExercises(
    userId,
    input.exercises.map((item) => item.exerciseId),
  )

  const id = newId()
  await commit(userId, [
    { table: 'workoutTemplates', row: { id, name: input.name, notes: input.notes, archivedAt: null } },
    ...itemRows(id, input.exercises),
  ])
  return workoutById(userId, id)
}

/** Replace a workout's name, notes and whole exercise list. Past sessions keep what they were. */
export async function replaceWorkout(userId: string, id: string, input: WorkoutInput) {
  const template = await ownWorkout(userId, id)
  await assertExercises(
    userId,
    input.exercises.map((item) => item.exerciseId),
  )

  const existing = await db
    .select()
    .from(templateItems)
    .where(and(eq(templateItems.templateId, id), isNull(templateItems.deletedAt)))
    .orderBy(templateItems.position)

  await commit(userId, [
    { table: 'workoutTemplates', row: { ...template, name: input.name, notes: input.notes } },
    ...itemRows(id, input.exercises, existing),
  ])
  return workoutById(userId, id)
}

/** Tombstone a workout, as deleting it in the app does. Logged sessions keep their snapshot. */
export async function deleteWorkout(userId: string, id: string) {
  const template = await ownWorkout(userId, id)
  await commit(userId, [{ table: 'workoutTemplates', row: { ...template, deletedAt: Date.now() } }])
  return { deleted: id }
}

// --------------------------------------------------------------------- week

export const weekInput = z.object({
  week: z
    .array(z.object({ day: z.enum(WEEKDAYS), workoutId: z.string().min(1) }))
    .max(7)
    .refine((days) => new Set(days.map((d) => d.day)).size === days.length, 'each day at most once'),
})

/**
 * Set which workout is on each weekday of the current programme; days left
 * out become rest days. With no current programme one is started, as the
 * Week screen does.
 *
 * A (programme, weekday) row is reused even when tombstoned: the unique index
 * on that pair counts deleted rows, so a new id for a cleared day would be
 * refused.
 */
export async function setWeek(userId: string, input: z.infer<typeof weekInput>, today: string) {
  const workoutIds = [...new Set(input.week.map((d) => d.workoutId))]
  const found = workoutIds.length
    ? await db
        .select({ id: workoutTemplates.id })
        .from(workoutTemplates)
        .where(
          and(
            inArray(workoutTemplates.id, workoutIds),
            eq(workoutTemplates.userId, userId),
            isNull(workoutTemplates.deletedAt),
            isNull(workoutTemplates.archivedAt),
          ),
        )
    : []
  const missing = workoutIds.filter((id) => !found.some((row) => row.id === id))
  if (missing.length) {
    throw new ApiError(
      400,
      'unknown_workout',
      'List workout ids with GET /workouts.',
      missing.map((id) => `workoutId: ${id}`),
    )
  }

  const pending: PendingRow[] = []

  const [current] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), isNull(programs.endedOn), isNull(programs.deletedAt)))
    .orderBy(desc(programs.startedOn))
    .limit(1)
  const programId = current?.id ?? newId()
  if (!current) {
    pending.push({
      table: 'programs',
      row: { id: programId, name: 'My programme', stage: 'beginner', startedOn: today, endedOn: null, notes: null },
    })
  }

  const existing = current
    ? await db.select().from(programDays).where(eq(programDays.programId, programId))
    : []

  for (const [dayOfWeek, day] of WEEKDAYS.entries()) {
    const wanted = input.week.find((d) => d.day === day)?.workoutId
    const row = existing.find((d) => d.dayOfWeek === dayOfWeek)

    if (wanted) {
      if (row && row.deletedAt === null && row.templateId === wanted) continue
      pending.push({
        table: 'programDays',
        row: { ...(row ?? { id: newId() }), programId, dayOfWeek, templateId: wanted, deletedAt: null },
      })
    } else if (row && row.deletedAt === null) {
      pending.push({ table: 'programDays', row: { ...row, deletedAt: Date.now() } })
    }
  }

  await commit(userId, pending)
  return (await apiProfile(userId)).currentProgramme
}

// --------------------------------------------------------------- bodyweight

export const bodyweightInput = z.object({
  date: isoDate,
  weightKg: z.number().min(20).max(400),
  notes: z.string().max(500).nullable().default(null),
})

/**
 * One row per day under the same deterministic id the app uses, so a weigh-in
 * from the API and one typed on the phone for that day are the same row.
 */
export async function recordBodyweight(userId: string, input: z.infer<typeof bodyweightInput>) {
  const id = bodyWeightId(userId, input.date)
  const [existing] = await db
    .select({ createdAt: syncedTables.bodyWeights.createdAt })
    .from(syncedTables.bodyWeights)
    .where(and(eq(syncedTables.bodyWeights.id, id), eq(syncedTables.bodyWeights.userId, userId)))
    .limit(1)

  await commit(userId, [
    {
      table: 'bodyWeights',
      row: {
        id,
        ...(existing && { createdAt: existing.createdAt }),
        measuredOn: input.date,
        weightKg: input.weightKg,
        notes: input.notes,
      },
    },
  ])
  return { date: input.date, weightKg: input.weightKg, notes: input.notes }
}
