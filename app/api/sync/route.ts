import { and, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db'
import { exercises, syncConflicts, syncedTables as tables, users } from '@/db/schema'
import { currentUserId } from '@/lib/auth'
import {
  MAX_PUSH,
  SYNC_TABLES,
  isBlankRow,
  isFreshRow,
  type RejectedMutation,
  type SyncRow,
  type SyncTable,
} from '@/lib/sync/types'
import { LOCALES } from '@/lib/i18n'
import { UNITS } from '@/lib/units'

/**
 * Parents before children. The outbox holds one entry per row and a re-edit
 * moves that entry to the back, so a client can legitimately send set logs
 * ahead of the session they belong to (log sets offline, then tap Finish).
 * Turso enforces foreign keys, so the server applies in dependency order
 * rather than trusting the order it was sent.
 */
const TABLE_ORDER = new Map(SYNC_TABLES.map((name, index) => [name, index]))

const mutationSchema = z.object({
  id: z.string().min(1),
  table: z.enum(SYNC_TABLES),
  rowId: z.string().min(1),
  row: z.record(z.string(), z.unknown()),
  queuedAt: z.number().default(0),
})

const requestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  /** Max `updatedAt` of the global exercise library the client already holds. */
  globalCursor: z.number().int().nonnegative().default(0),
  clientId: z.string().min(1),
  mutations: z.array(mutationSchema).max(MAX_PUSH),
  /** A display unit chosen on the device; absent when it has not changed. */
  unit: z.enum(UNITS).optional(),
  /** The language chosen on the device; absent when it has not changed. */
  locale: z.enum(LOCALES).optional(),
})

export async function POST(request: Request) {
  const userId = await currentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = requestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 })
  }

  const { cursor, globalCursor, clientId, mutations, unit: chosenUnit, locale: chosenLocale } = parsed.data
  const applied: string[] = []
  const rejected: RejectedMutation[] = []

  const [user] = await db
    .select({ syncRev: users.syncRev, unit: users.unit, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const unit = chosenUnit ?? user.unit
  const locale = chosenLocale ?? user.locale

  // Validated up front so the transaction below can never need a rollback.
  if (mutations.some((m) => !Number.isFinite(Number((m.row as SyncRow).updatedAt)))) {
    return NextResponse.json({ error: 'bad_request', issues: ['row.updatedAt'] }, { status: 400 })
  }

  let base = user.syncRev
  let rev = base

  const ordered = [...mutations].sort(
    (a, b) => (TABLE_ORDER.get(a.table) ?? 0) - (TABLE_ORDER.get(b.table) ?? 0) || a.queuedAt - b.queuedAt,
  )

  // --- push ---------------------------------------------------------------
  await db.transaction(async (tx) => {
    // Re-read inside the (write-locked) transaction: a token write through
    // /api/v1, or another device's sync, may have moved the counter since the
    // read above, and reusing its revs would hide rows from delta pulls.
    const [fresh] = await tx
      .select({ syncRev: users.syncRev })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    base = rev = fresh?.syncRev ?? base

    for (const mutation of ordered) {
      const table = tables[mutation.table]
      const incoming = mutation.row as SyncRow
      const updatedAt = Number(incoming.updatedAt)

      const [existing] = await tx.select().from(table).where(eq(table.id, mutation.rowId)).limit(1)

      const reject = async (reason: RejectedMutation['reason']) => {
        rejected.push({
          mutationId: mutation.id,
          table: mutation.table,
          rowId: mutation.rowId,
          reason,
          // Never echo another user's row back; an invalid row has no winner.
          winner: reason === 'stale' ? (existing as SyncRow) : { id: mutation.rowId, updatedAt: 0 },
        })
        // Nothing a device sent is thrown away: the losing row is kept whole,
        // to be recovered from by hand. A blank one has nothing to recover.
        if (isBlankRow(mutation.table, incoming)) return
        try {
          await tx.insert(syncConflicts).values({
            id: crypto.randomUUID(),
            userId,
            clientId,
            table: mutation.table,
            rowId: mutation.rowId,
            reason,
            lost: incoming,
            winnerUpdatedAt: reason === 'stale' ? Number((existing as SyncRow).updatedAt) : null,
            createdAt: Date.now(),
          })
        } catch (error) {
          // The log must never be what breaks a sync — say so and carry on.
          console.error(`sync: could not log conflict ${mutation.table}/${mutation.rowId}`, error)
        }
      }

      // A row owned by someone else is not ours to touch, and a global library
      // row (userId NULL) is read-only to every client.
      if (existing && (existing as { userId: string | null }).userId !== userId) {
        await reject('forbidden')
        continue
      }

      const stored = existing ? Number((existing as { updatedAt: number }).updatedAt) : null

      // The same write arriving again — the reply to the first one was lost and
      // the device retried. It is already stored; say so, and no device is told
      // its own change was overwritten.
      if (stored === updatedAt) {
        applied.push(mutation.id)
        continue
      }

      // A device that did not know the row existed wrote its own from scratch.
      // Whatever is stored was put there on purpose; the fresh copy never
      // replaces it, however new its timestamp. Otherwise last-write-wins.
      if (stored !== null && (stored > updatedAt || isFreshRow(incoming))) {
        await reject('stale')
        continue
      }

      // userId always comes from the JWT — never from the payload.
      const values = { ...incoming, id: mutation.rowId, userId, rev: rev + 1 } as Record<string, unknown>

      try {
        if (existing) {
          await tx.update(table).set(values).where(eq(table.id, mutation.rowId))
        } else {
          await tx.insert(table).values(values as never)
        }
      } catch (error) {
        // A constraint failure aborts only this statement, not the transaction.
        console.error(`sync: refused ${mutation.table}/${mutation.rowId}`, error)
        await reject('invalid')
        continue
      }

      rev += 1
      applied.push(mutation.id)
    }

    if (rev !== base || chosenUnit || chosenLocale) {
      await tx.update(users).set({ syncRev: rev, unit, locale }).where(eq(users.id, userId))
    }
  })

  // --- pull -----------------------------------------------------------
  const changes: Partial<Record<SyncTable, SyncRow[]>> = {}

  for (const name of SYNC_TABLES) {
    const table = tables[name]
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.rev, cursor)))
    if (rows.length) changes[name] = rows as SyncRow[]
  }

  // The global library has no per-user rev, so it is pulled by updatedAt —
  // which also delivers a re-import of the exercise data to existing clients.
  const globalExercises = await db
    .select()
    .from(exercises)
    .where(and(isNull(exercises.userId), gt(exercises.updatedAt, globalCursor)))

  if (globalExercises.length) {
    changes.exercises = [...(changes.exercises ?? []), ...(globalExercises as SyncRow[])]
  }

  return NextResponse.json({
    cursor: rev,
    serverTime: Date.now(),
    unit,
    locale,
    changes,
    applied,
    rejected,
  })
}

export const dynamic = 'force-dynamic'
