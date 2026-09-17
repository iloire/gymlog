import { and, desc, eq, getTableName, gte, inArray, isNull, sql, type Column } from 'drizzle-orm'
import { notFound } from 'next/navigation'

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
import { currentUserId } from '@/lib/auth'
import { addDays, weekStart } from '@/lib/calendar'

/**
 * The admin data access layer. Everything under /admin reads through here, and
 * every export checks the caller's role against the database first — not the
 * JWT, so promoting or demoting an account takes effect on the next request,
 * and not the layout, which Next does not re-render on every navigation.
 *
 * These are server reads by design: /admin is used at a desk, never at the
 * bar, so the local-first rule does not apply to it. Nothing here is written
 * to IndexedDB or the outbox, and the service worker never caches /admin.
 */

/**
 * `"table"."column"`. Drizzle drops the table prefix when a select reads from a
 * single table, which inside a correlated subquery silently binds `id` to the
 * inner table instead of the outer row — so every column in raw SQL below is
 * qualified by hand.
 */
function q(column: Column) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`
}

/**
 * The caller's user id when they are an admin, else null — the one place the
 * role is read. `/api/admin/me` answers Profile with it, so the Admin link
 * shows for admins only.
 */
export async function adminUserId(): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return user?.role === 'admin' ? userId : null
}

/**
 * The caller's user id when they are an admin. Anyone else — signed out, or a
 * regular account — gets a plain 404, so the panel's existence is not
 * advertised.
 */
export async function requireAdmin(): Promise<string> {
  const userId = await adminUserId()
  if (!userId) notFound()

  return userId
}

/** A session counts as trained once at least one of its sets is done. */
const trained = sql`exists (
  select 1 from ${setLogs}
  where ${q(setLogs.sessionId)} = ${q(sessions.id)}
    and ${q(setLogs.completedAt)} is not null
    and ${q(setLogs.deletedAt)} is null
)`

export type WeekActivity = { weekOf: string; days: number }

/** The last `weeks` Mondays, oldest first, each with how many days were trained. */
function bucketWeeks(dates: string[], today: string, weeks: number): WeekActivity[] {
  const counts = new Map<string, Set<string>>()
  for (const date of dates) {
    const week = weekStart(date)
    counts.set(week, (counts.get(week) ?? new Set()).add(date))
  }

  const thisWeek = weekStart(today)
  return Array.from({ length: weeks }, (_, i) => {
    const weekOf = addDays(thisWeek, -(weeks - 1 - i) * 7)
    return { weekOf, days: counts.get(weekOf)?.size ?? 0 }
  })
}

/** Server calendar date. Close enough for a desk view; screens use the device's. */
function serverToday(): string {
  return new Date().toISOString().slice(0, 10)
}

// --------------------------------------------------------------- overview

export type AdminUserRow = {
  id: string
  email: string
  name: string | null
  role: 'user' | 'admin'
  createdAt: number
  workouts: number
  sets: number
  /** Latest `updatedAt` across the user's sessions, sets and bodyweight, or null. */
  lastActiveAt: number | null
  weeks: WeekActivity[]
}

export type AdminOverview = {
  users: AdminUserRow[]
  totals: { accounts: number; workouts: number; sets: number; activeThisWeek: number }
}

const OVERVIEW_WEEKS = 12

export async function adminOverview(): Promise<AdminOverview> {
  await requireAdmin()

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      workouts: sql<number>`(
        select count(*) from ${sessions}
        where ${q(sessions.userId)} = ${q(users.id)} and ${q(sessions.deletedAt)} is null and ${trained}
      )`,
      sets: sql<number>`(
        select count(*) from ${setLogs}
        where ${q(setLogs.userId)} = ${q(users.id)}
          and ${q(setLogs.completedAt)} is not null and ${q(setLogs.deletedAt)} is null
          and exists (
            select 1 from ${sessions}
            where ${q(sessions.id)} = ${q(setLogs.sessionId)} and ${q(sessions.deletedAt)} is null
          )
      )`,
      // SQLite's scalar max() is NULL if any argument is, hence the coalesces.
      lastActiveAt: sql<number>`max(
        coalesce((select max(${q(sessions.updatedAt)}) from ${sessions} where ${q(sessions.userId)} = ${q(users.id)}), 0),
        coalesce((select max(${q(setLogs.updatedAt)}) from ${setLogs} where ${q(setLogs.userId)} = ${q(users.id)}), 0),
        coalesce((select max(${q(bodyWeights.updatedAt)}) from ${bodyWeights} where ${q(bodyWeights.userId)} = ${q(users.id)}), 0)
      )`,
    })
    .from(users)
    .orderBy(desc(users.createdAt))

  const today = serverToday()
  const since = weekStart(addDays(today, -(OVERVIEW_WEEKS - 1) * 7))

  const trainedDays = await db
    .selectDistinct({ userId: sessions.userId, date: sessions.scheduledFor })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), gte(sessions.scheduledFor, since), trained))

  const datesByUser = new Map<string, string[]>()
  for (const { userId, date } of trainedDays) {
    datesByUser.set(userId, [...(datesByUser.get(userId) ?? []), date])
  }

  const overviewUsers = rows.map((row) => ({
    ...row,
    lastActiveAt: row.lastActiveAt > 0 ? row.lastActiveAt : null,
    weeks: bucketWeeks(datesByUser.get(row.id) ?? [], today, OVERVIEW_WEEKS),
  }))

  return {
    users: overviewUsers,
    totals: {
      accounts: rows.length,
      workouts: rows.reduce((sum, row) => sum + row.workouts, 0),
      sets: rows.reduce((sum, row) => sum + row.sets, 0),
      activeThisWeek: overviewUsers.filter((row) => (row.weeks.at(-1)?.days ?? 0) > 0).length,
    },
  }
}

// ------------------------------------------------------------ one account

const DETAIL_WEEKS = 26
const RECENT_SESSIONS = 20
const RECENT_WEIGHTS = 14

export async function adminUserDetail(userId: string) {
  await requireAdmin()

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      unit: users.unit,
      syncRev: users.syncRev,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) notFound()

  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), isNull(programs.endedOn), isNull(programs.deletedAt)))
    .orderBy(desc(programs.startedOn))
    .limit(1)

  const week = program
    ? await db
        .select({ dayOfWeek: programDays.dayOfWeek, template: workoutTemplates.name })
        .from(programDays)
        .innerJoin(workoutTemplates, eq(workoutTemplates.id, programDays.templateId))
        .where(and(eq(programDays.programId, program.id), isNull(programDays.deletedAt)))
    : []

  const templates = await db
    .select({
      id: workoutTemplates.id,
      name: workoutTemplates.name,
      archivedAt: workoutTemplates.archivedAt,
      exercises: sql<number>`(
        select count(*) from ${templateItems}
        where ${q(templateItems.templateId)} = ${q(workoutTemplates.id)} and ${q(templateItems.deletedAt)} is null
      )`,
    })
    .from(workoutTemplates)
    .where(and(eq(workoutTemplates.userId, userId), isNull(workoutTemplates.deletedAt)))
    .orderBy(workoutTemplates.name)

  const recentSessions = await db
    .select({
      id: sessions.id,
      templateName: sessions.templateName,
      scheduledFor: sessions.scheduledFor,
      completedAt: sessions.completedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.scheduledFor))
    .limit(RECENT_SESSIONS)

  const sets = recentSessions.length
    ? await db
        .select({
          sessionId: setLogs.sessionId,
          exerciseName: setLogs.exerciseName,
          position: setLogs.position,
          setIndex: setLogs.setIndex,
          weightKg: setLogs.weightKg,
          reps: setLogs.reps,
          durationSec: setLogs.durationSec,
          isWarmup: setLogs.isWarmup,
          completedAt: setLogs.completedAt,
        })
        .from(setLogs)
        .where(
          and(
            inArray(
              setLogs.sessionId,
              recentSessions.map((s) => s.id),
            ),
            isNull(setLogs.deletedAt),
          ),
        )
        .orderBy(setLogs.position, setLogs.setIndex)
    : []

  const today = serverToday()
  const trainedDays = await db
    .selectDistinct({ date: sessions.scheduledFor })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.deletedAt),
        gte(sessions.scheduledFor, weekStart(addDays(today, -(DETAIL_WEEKS - 1) * 7))),
        trained,
      ),
    )

  const weights = await db
    .select({ measuredOn: bodyWeights.measuredOn, weightKg: bodyWeights.weightKg })
    .from(bodyWeights)
    .where(and(eq(bodyWeights.userId, userId), isNull(bodyWeights.deletedAt)))
    .orderBy(desc(bodyWeights.measuredOn))
    .limit(RECENT_WEIGHTS)

  const ownExercises = await db
    .select({ id: exercises.id, name: exercises.name, equipment: exercises.equipment })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), isNull(exercises.deletedAt)))
    .orderBy(exercises.name)

  return {
    user,
    program: program ? { ...program, week } : null,
    templates,
    sessions: recentSessions.map((session) => {
      const own = sets.filter((set) => set.sessionId === session.id)
      const done = own.filter((set) => set.completedAt !== null)
      return {
        ...session,
        sets: own,
        setsDone: done.length,
        volumeKg: done
          .filter((set) => !set.isWarmup)
          .reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
      }
    }),
    weeks: bucketWeeks(
      trainedDays.map((d) => d.date),
      today,
      DETAIL_WEEKS,
    ),
    weights,
    ownExercises,
  }
}

export type AdminUserDetail = Awaited<ReturnType<typeof adminUserDetail>>
