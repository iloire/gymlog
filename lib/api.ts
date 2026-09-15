import { and, asc, desc, eq, getTableName, gte, inArray, isNull, like, lte, or, sql, type Column } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import {
  bodyWeights,
  exercises,
  programDays,
  programs,
  sessions,
  setLogs,
  templateItems,
  users,
  workoutTemplates,
} from '@/db/schema'
import { summariseSession } from '@/lib/session-summary'

/**
 * The read layer behind `/api/v1`, the token-authenticated API a user points
 * an LLM or another tool at. Every function takes the `userId` its route
 * resolved from the bearer token and filters on it; writes live in
 * `lib/api-write.ts`.
 *
 * The shapes are for a reader, not a sync engine: names alongside the ids a
 * write needs, no `rev`/`updatedAt`, tombstoned rows left out, and weights
 * always in kg (the profile says which unit the person prefers to see).
 */

/** Index = `programDays.dayOfWeek` (0 = Monday). */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** See `lib/admin.ts`: raw SQL in a correlated subquery needs qualified columns. */
function q(column: Column) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`
}

// ------------------------------------------------------------ query strings

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const HISTORY_DEFAULT_LIMIT = 20
export const HISTORY_MAX_LIMIT = 200

export const historyQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
})

export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() })

export const EXERCISES_DEFAULT_LIMIT = 25
export const EXERCISES_MAX_LIMIT = 100

export const exercisesQuery = z.object({
  q: z.string().trim().max(80).optional(),
  equipment: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(EXERCISES_MAX_LIMIT).default(EXERCISES_DEFAULT_LIMIT),
})

// ------------------------------------------------------------------ profile

export async function apiProfile(userId: string) {
  const [user] = await db
    .select({ name: users.name, unit: users.unit })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), isNull(programs.endedOn), isNull(programs.deletedAt)))
    .orderBy(desc(programs.startedOn))
    .limit(1)

  const week = program
    ? await db
        .select({
          dayOfWeek: programDays.dayOfWeek,
          workoutId: workoutTemplates.id,
          workout: workoutTemplates.name,
        })
        .from(programDays)
        .innerJoin(workoutTemplates, eq(workoutTemplates.id, programDays.templateId))
        .where(
          and(
            eq(programDays.programId, program.id),
            isNull(programDays.deletedAt),
            isNull(workoutTemplates.deletedAt),
          ),
        )
        .orderBy(asc(programDays.dayOfWeek))
    : []

  return {
    name: user?.name ?? null,
    preferredUnit: user?.unit ?? 'kg',
    weightsAreIn: 'kg',
    currentProgramme: program
      ? {
          name: program.name,
          stage: program.stage,
          startedOn: program.startedOn,
          notes: program.notes,
          week: week.map((day) => ({
            day: WEEKDAYS[day.dayOfWeek],
            workoutId: day.workoutId,
            workout: day.workout,
          })),
        }
      : null,
  }
}

// ----------------------------------------------------------------- workouts

/** Workouts the user has not archived, each with its exercises in order — or just `onlyId`. */
export async function apiWorkouts(userId: string, onlyId?: string) {
  const templates = await db
    .select({ id: workoutTemplates.id, name: workoutTemplates.name, notes: workoutTemplates.notes })
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.userId, userId),
        isNull(workoutTemplates.deletedAt),
        isNull(workoutTemplates.archivedAt),
        onlyId ? eq(workoutTemplates.id, onlyId) : undefined,
      ),
    )
    .orderBy(asc(workoutTemplates.name))

  const items = templates.length
    ? await db
        .select({
          templateId: templateItems.templateId,
          item: {
            exerciseId: templateItems.exerciseId,
            exercise: exercises.name,
            equipment: exercises.equipment,
            primaryMuscles: exercises.primaryMuscles,
            sets: templateItems.sets,
            targetReps: templateItems.targetReps,
            targetRepsMax: templateItems.targetRepsMax,
            targetWeightKg: templateItems.targetWeightKg,
            restSec: templateItems.restSec,
            notes: templateItems.notes,
          },
        })
        .from(templateItems)
        .innerJoin(exercises, eq(exercises.id, templateItems.exerciseId))
        .where(
          and(
            eq(templateItems.userId, userId),
            inArray(
              templateItems.templateId,
              templates.map((t) => t.id),
            ),
            isNull(templateItems.deletedAt),
          ),
        )
        .orderBy(asc(templateItems.position))
    : []

  return {
    workouts: templates.map((template) => ({
      id: template.id,
      name: template.name,
      notes: template.notes,
      exercises: items
        .filter((row) => row.templateId === template.id)
        .map((row) => row.item),
    })),
  }
}

// ---------------------------------------------------------------- exercises

/**
 * Search the exercise library — the shared one and the user's own — so a
 * caller can find the `exerciseId`s a workout is built from.
 */
export async function apiExercises(userId: string, query: z.infer<typeof exercisesQuery>) {
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      equipment: exercises.equipment,
      primaryMuscles: exercises.primaryMuscles,
      level: exercises.level,
      userId: exercises.userId,
    })
    .from(exercises)
    .where(
      and(
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
        isNull(exercises.deletedAt),
        // SQLite's LIKE is case-insensitive for ASCII, which exercise names are.
        query.q ? like(exercises.name, `%${query.q.replace(/[%_]/g, '')}%`) : undefined,
        query.equipment ? eq(exercises.equipment, query.equipment) : undefined,
      ),
    )
    .orderBy(asc(exercises.name))
    .limit(query.limit)

  return {
    exercises: rows.map(({ userId: owner, ...row }) => ({ ...row, own: owner !== null })),
  }
}

// ------------------------------------------------------------------ history

/**
 * Trained sessions — at least one set logged — newest first, each with its
 * logged sets grouped by exercise. Summarised by the same function as the
 * History screen, so the numbers an LLM quotes match the app.
 */
export async function apiHistory(userId: string, query: z.infer<typeof historyQuery>) {
  const trained = sql`exists (
    select 1 from ${setLogs}
    where ${q(setLogs.sessionId)} = ${q(sessions.id)}
      and ${q(setLogs.completedAt)} is not null
      and ${q(setLogs.deletedAt)} is null
  )`

  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.deletedAt),
        query.from ? gte(sessions.scheduledFor, query.from) : undefined,
        query.to ? lte(sessions.scheduledFor, query.to) : undefined,
        trained,
      ),
    )
    .orderBy(desc(sessions.scheduledFor), desc(sessions.startedAt))
    .limit(query.limit)

  const logs = rows.length
    ? await db
        .select()
        .from(setLogs)
        .where(
          and(
            eq(setLogs.userId, userId),
            inArray(
              setLogs.sessionId,
              rows.map((row) => row.id),
            ),
          ),
        )
    : []

  return {
    sessions: rows.map((row) => {
      const entry = summariseSession(
        row,
        logs.filter((log) => log.sessionId === row.id),
      )
      return {
        date: row.scheduledFor,
        workout: row.templateName,
        finished: row.completedAt !== null,
        durationMin: entry.durationMs === null ? null : Math.round(entry.durationMs / 60_000),
        volumeKg: Math.round(entry.volumeKg * 10) / 10,
        setsDone: entry.setsDone,
        setsPlanned: entry.setsPlanned,
        notes: row.notes,
        exercises: entry.exercises.map((exercise) => ({
          name: exercise.name,
          sets: exercise.sets.map((set) => ({
            set: set.setIndex,
            weightKg: set.weightKg,
            reps: set.reps,
            warmup: set.isWarmup,
            targetReps: set.targetReps,
            targetRepsMax: set.targetRepsMax,
            targetWeightKg: set.targetWeightKg,
            notes: set.notes,
          })),
        })),
      }
    }),
  }
}

// --------------------------------------------------------------- bodyweight

export async function apiBodyweight(userId: string, query: z.infer<typeof rangeQuery>) {
  const rows = await db
    .select({ date: bodyWeights.measuredOn, weightKg: bodyWeights.weightKg, notes: bodyWeights.notes })
    .from(bodyWeights)
    .where(
      and(
        eq(bodyWeights.userId, userId),
        isNull(bodyWeights.deletedAt),
        query.from ? gte(bodyWeights.measuredOn, query.from) : undefined,
        query.to ? lte(bodyWeights.measuredOn, query.to) : undefined,
      ),
    )
    .orderBy(desc(bodyWeights.measuredOn))

  return { bodyweight: rows }
}
