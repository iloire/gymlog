import { and, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db'
import {
  bodyWeights,
  exerciseNotes,
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
import { SYNC_TABLES, type RejectedMutation, type SyncRow, type SyncTable } from '@/lib/sync/types'

/** Tables a client may write. `exercises` is writable only for its own rows. */
const tables = {
  exercises,
  exerciseNotes,
  workoutTemplates,
  templateItems,
  programs,
  programDays,
  sessions,
  setLogs,
  bodyWeights,
} as const

const mutationSchema = z.object({
  id: z.string().min(1),
  table: z.enum(SYNC_TABLES),
  rowId: z.string().min(1),
  row: z.record(z.string(), z.unknown()),
})

const requestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  /** Max `updatedAt` of the global exercise library the client already holds. */
  globalCursor: z.number().int().nonnegative().default(0),
  clientId: z.string().min(1),
  mutations: z.array(mutationSchema).max(2000),
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

  const { cursor, globalCursor, mutations } = parsed.data
  const applied: string[] = []
  const rejected: RejectedMutation[] = []

  const [user] = await db
    .select({ syncRev: users.syncRev })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Validated up front so the transaction below can never need a rollback.
  if (mutations.some((m) => !Number.isFinite(Number((m.row as SyncRow).updatedAt)))) {
    return NextResponse.json({ error: 'bad_request', issues: ['row.updatedAt'] }, { status: 400 })
  }

  let rev = user.syncRev

  // --- push (one transaction: either every mutation lands, or none) ----
  await db.transaction(async (tx) => {
    for (const mutation of mutations) {
      const table = tables[mutation.table]
      const incoming = mutation.row as SyncRow
      const updatedAt = Number(incoming.updatedAt)

      const [existing] = await tx.select().from(table).where(eq(table.id, mutation.rowId)).limit(1)

      const reject = (reason: RejectedMutation['reason']) =>
        rejected.push({
          mutationId: mutation.id,
          table: mutation.table,
          rowId: mutation.rowId,
          reason,
          // Never echo another user's row back to the caller.
          winner: reason === 'forbidden' ? { id: mutation.rowId, updatedAt: 0 } : (existing as SyncRow),
        })

      // A row owned by someone else is not ours to touch, and a global library
      // row (userId NULL) is read-only to every client.
      if (existing && (existing as { userId: string | null }).userId !== userId) {
        reject('forbidden')
        continue
      }

      // Last-write-wins on updatedAt. On an exact tie the stored row stands.
      if (existing && Number((existing as { updatedAt: number }).updatedAt) >= updatedAt) {
        reject('stale')
        continue
      }

      rev += 1
      // userId always comes from the JWT — never from the payload.
      const values = { ...incoming, id: mutation.rowId, userId, rev } as Record<string, unknown>

      if (existing) {
        await tx.update(table).set(values).where(eq(table.id, mutation.rowId))
      } else {
        await tx.insert(table).values(values as never)
      }
      applied.push(mutation.id)
    }

    if (rev !== user.syncRev) {
      await tx.update(users).set({ syncRev: rev }).where(eq(users.id, userId))
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
    changes,
    applied,
    rejected,
  })
}

export const dynamic = 'force-dynamic'
