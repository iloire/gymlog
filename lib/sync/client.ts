'use client'

import { getDb, type GymlogDexie } from '@/lib/db/dexie'
import { newId } from '@/lib/id'
import {
  SYNC_TABLES,
  mutationKey,
  type Mutation,
  type SyncResponse,
  type SyncRow,
  type SyncTable,
} from '@/lib/sync/types'

const META_CURSOR = 'cursor'
const META_GLOBAL_CURSOR = 'globalCursor'
const META_CLIENT_ID = 'clientId'
const META_CLOCK_OFFSET = 'clockOffset'
const META_LAST_SYNC = 'lastSyncAt'

async function meta<T>(db: GymlogDexie, key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

async function setMeta(db: GymlogDexie, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Stable per-device id, minted once and kept in IndexedDB. */
export async function clientId(db: GymlogDexie): Promise<string> {
  const existing = await meta<string | null>(db, META_CLIENT_ID, null)
  if (existing) return existing
  const id = newId()
  await setMeta(db, META_CLIENT_ID, id)
  return id
}

/**
 * The corrected wall clock. A device whose clock runs four minutes fast would
 * otherwise win every last-write-wins conflict forever.
 */
export async function now(db: GymlogDexie): Promise<number> {
  const offset = await meta<number>(db, META_CLOCK_OFFSET, 0)
  return Date.now() + offset
}

/**
 * Queue a local write. The caller is responsible for writing the row itself in
 * the *same* Dexie transaction — see `lib/db/write.ts`.
 */
export function mutationFor(table: SyncTable, row: SyncRow): Mutation {
  return { id: mutationKey(table, row.id), table, rowId: row.id, row, queuedAt: Date.now() }
}

export type SyncResult =
  | { ok: true; pushed: number; pulled: number; rejected: number }
  | { ok: false; reason: 'offline' | 'unauthorized' | 'error' }

let inFlight: Promise<SyncResult> | null = null

/** Push the outbox and pull changes. Safe to call often; never runs twice at once. */
export async function sync(userId: string): Promise<SyncResult> {
  inFlight ??= run(userId).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(userId: string): Promise<SyncResult> {
  const db = getDb(userId)

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, reason: 'offline' }
  }

  // One mutation per row by construction (see Mutation.id), oldest first so a
  // session row is written before the set logs that reference it.
  const mutations = await db.outbox.orderBy('queuedAt').toArray()

  const body = {
    cursor: await meta<number>(db, META_CURSOR, 0),
    globalCursor: await meta<number>(db, META_GLOBAL_CURSOR, 0),
    clientId: await clientId(db),
    mutations,
  }

  let response: Response
  try {
    response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, reason: 'offline' }
  }

  if (response.status === 401) return { ok: false, reason: 'unauthorized' }
  if (!response.ok) return { ok: false, reason: 'error' }

  const result: SyncResponse = await response.json()
  let pulled = 0

  await db.transaction('rw', db.tables, async () => {
    for (const table of SYNC_TABLES) {
      const rows = result.changes[table]
      if (!rows?.length) continue

      // Never overwrite a row that still has an unsent local edit.
      const pending = new Set(
        (await db.outbox.where('table').equals(table).toArray()).map((m) => m.rowId),
      )
      const incoming = rows.filter((row) => !pending.has(row.id))
      if (!incoming.length) continue

      await db.table(table).bulkPut(incoming)
      pulled += incoming.length
    }

    // Everything the server accepted, plus everything it rejected as stale, is
    // settled — drop it either way. Only if it has not been re-queued since we
    // sent it: an edit made mid-flight must survive.
    const sent = new Map(mutations.map((m) => [m.id, m.queuedAt]))
    const settled = [...result.applied, ...result.rejected.map((r) => r.mutationId)]

    for (const id of settled) {
      const current = await db.outbox.get(id)
      if (current && current.queuedAt === sent.get(id)) await db.outbox.delete(id)
    }

    const globalMax = (result.changes.exercises ?? [])
      .filter((row) => row.userId === null)
      .reduce((max, row) => Math.max(max, Number(row.updatedAt) || 0), 0)

    await setMeta(db, META_CURSOR, result.cursor)
    if (globalMax) await setMeta(db, META_GLOBAL_CURSOR, globalMax)
    await setMeta(db, META_CLOCK_OFFSET, result.serverTime - Date.now())
    await setMeta(db, META_LAST_SYNC, result.serverTime)
  })

  return {
    ok: true,
    pushed: result.applied.length,
    pulled,
    rejected: result.rejected.length,
  }
}

export async function lastSyncAt(userId: string): Promise<number | null> {
  return meta<number | null>(getDb(userId), META_LAST_SYNC, null)
}

export async function pendingCount(userId: string): Promise<number> {
  return getDb(userId).outbox.count()
}
