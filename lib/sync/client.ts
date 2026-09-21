'use client'

import { getDb, type GymlogDexie } from '@/lib/db/dexie'
import { newId } from '@/lib/id'
import { type Locale, parseLocale } from '@/lib/i18n'
import { DEFAULT_UNIT, parseUnit, type Unit } from '@/lib/units'
import {
  MAX_PUSH,
  SYNC_TABLES,
  isBlankRow,
  mutationKey,
  type Mutation,
  type RejectedMutation,
  type SyncRequest,
  type SyncResponse,
  type SyncRow,
  type SyncTable,
} from '@/lib/sync/types'

const META_CURSOR = 'cursor'
const META_GLOBAL_CURSOR = 'globalCursor'
const META_CLIENT_ID = 'clientId'
const META_CLOCK_OFFSET = 'clockOffset'
const META_LAST_SYNC = 'lastSyncAt'
const META_REJECTIONS = 'rejections'
/**
 * The account settings a device can change: the display unit and the
 * language. Each is kept in `meta` under its own name, plus a `…Pending` copy
 * of a choice made here and not yet pushed, cleared once the server has it.
 */
const PREFERENCES = ['unit', 'locale'] as const
type Preference = (typeof PREFERENCES)[number]
type PreferenceValue = { unit: Unit; locale: Locale }
const pendingKey = (pref: Preference) => `${pref}Pending`
/**
 * Set once the device has re-pulled everything and re-queued what it held that
 * the server did not. Before winners were applied on a stale rejection, a
 * device kept its losing rows and pulled nothing to replace them, so its copy
 * drifted from the server's for good; see `repair` in run().
 */
const META_REPAIRED = 'repaired'

/** How many rejections to keep for the badge; older ones roll off. */
const MAX_REJECTIONS = 20

/**
 * A change the server refused, kept so the badge can say so. `stale` means
 * another device wrote the same row later and won; `invalid` and `forbidden`
 * mean the row can never sync as it is, and the local copy still shows it.
 */
export type Rejection = { table: SyncTable; rowId: string; reason: RejectedMutation['reason']; at: number }

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
  // session row is written before the set logs that reference it, and never
  // more than the server accepts in one request.
  const mutations = await db.outbox.orderBy('queuedAt').limit(MAX_PUSH).toArray()
  const pending = await pendingPreferences(db)
  const cursor = await meta<number>(db, META_CURSOR, 0)
  // One full pull to catch up a device that drifted (see META_REPAIRED). Rows
  // the server sends from before the cursor are ones this device should hold
  // exactly; a local copy that differs is a change the server never took.
  const repair = !(await meta<boolean>(db, META_REPAIRED, false))

  const body: SyncRequest = {
    cursor: repair ? 0 : cursor,
    globalCursor: await meta<number>(db, META_GLOBAL_CURSOR, 0),
    clientId: await clientId(db),
    mutations,
    ...pending,
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
  let worthTellingCount = 0

  await db.transaction('rw', db.tables, async () => {
    for (const table of SYNC_TABLES) {
      const rows = result.changes[table]
      if (!rows?.length) continue

      // Never overwrite a row that still has an unsent local edit.
      const pending = new Set(
        (await db.outbox.where('table').equals(table).toArray()).map((m) => m.rowId),
      )
      const incoming: SyncRow[] = []
      for (const row of rows) {
        if (pending.has(row.id)) continue
        if (repair && Number(row.rev) <= cursor) {
          // Already pulled once. A local copy that differs lost a push while
          // rejections were dropped on the floor: it goes back in the outbox,
          // so the server logs it and sends the winner, and the device converges.
          const local = (await db.table(table).get(row.id)) as SyncRow | undefined
          if (local && Number(local.updatedAt) !== Number(row.updatedAt)) {
            await db.outbox.put(mutationFor(table, local))
            continue
          }
        }
        incoming.push(row)
      }
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

    // The stored row won: take it, so this device shows what the other one
    // did instead of a version the server will never hold. Not if the row was
    // edited again mid-flight — that edit goes up next and settles it.
    for (const r of result.rejected) {
      if (r.reason !== 'stale') continue
      const current = await db.outbox.get(r.mutationId)
      if (current && current.queuedAt !== sent.get(r.mutationId)) continue
      await db.table(r.table).put(r.winner)
    }

    const globalMax = (result.changes.exercises ?? [])
      .filter((row) => row.userId === null)
      .reduce((max, row) => Math.max(max, Number(row.updatedAt) || 0), 0)

    // What was refused stays on record until the badge is dismissed: a set
    // overwritten by another phone, or a row the server cannot store, must
    // not vanish from the outbox in silence. A blank row — a pre-created set
    // nobody did — lost nothing and is not worth a word.
    const sentRow = new Map(mutations.map((m) => [m.id, m.row]))
    const worthTelling = result.rejected.filter((r) => {
      const row = sentRow.get(r.mutationId)
      return !row || !isBlankRow(r.table, row)
    })
    worthTellingCount = worthTelling.length
    if (worthTelling.length) {
      const kept = await meta<Rejection[]>(db, META_REJECTIONS, [])
      const fresh = worthTelling.map((r) => ({ table: r.table, rowId: r.rowId, reason: r.reason, at: Date.now() }))
      await setMeta(db, META_REJECTIONS, [...kept, ...fresh].slice(-MAX_REJECTIONS))
    }

    // The server's unit is every device's unit, and the same for the language
    // — unless this one chose again while the request was in flight, in which
    // case that choice still stands and goes up with the next sync.
    for (const pref of PREFERENCES) {
      const stillPending = await meta<string | null>(db, pendingKey(pref), null)
      if (result[pref] !== undefined && (stillPending === null || stillPending === pending[pref])) {
        await setMeta(db, pref, result[pref])
        if (stillPending !== null) await db.meta.delete(pendingKey(pref))
      }
    }

    await setMeta(db, META_CURSOR, result.cursor)
    if (repair) await setMeta(db, META_REPAIRED, true)
    if (globalMax) await setMeta(db, META_GLOBAL_CURSOR, globalMax)
    await setMeta(db, META_CLOCK_OFFSET, result.serverTime - Date.now())
    await setMeta(db, META_LAST_SYNC, result.serverTime)
  })

  return {
    ok: true,
    pushed: result.applied.length,
    pulled,
    rejected: worthTellingCount,
  }
}

export async function lastSyncAt(userId: string): Promise<number | null> {
  return meta<number | null>(getDb(userId), META_LAST_SYNC, null)
}

export async function pendingCount(userId: string): Promise<number> {
  return getDb(userId).outbox.count()
}

/** Changes the server refused since the badge was last dismissed, oldest first. */
export async function rejections(userId: string): Promise<Rejection[]> {
  return meta<Rejection[]>(getDb(userId), META_REJECTIONS, [])
}

export async function clearRejections(userId: string): Promise<void> {
  await getDb(userId).meta.delete(META_REJECTIONS)
}

/** The choices made here and not yet pushed, in the shape the request carries them. */
async function pendingPreferences(db: GymlogDexie): Promise<Partial<PreferenceValue>> {
  const out: Partial<PreferenceValue> = {}
  const unit = await meta<Unit | null>(db, pendingKey('unit'), null)
  if (unit) out.unit = unit
  const locale = await meta<Locale | null>(db, pendingKey('locale'), null)
  if (locale) out.locale = locale
  return out
}

/**
 * Choose a preference on this device. It applies at once, offline or not, and
 * the next sync carries it to the account so the other phone follows.
 */
async function setPreference<P extends Preference>(userId: string, pref: P, value: PreferenceValue[P]): Promise<void> {
  const db = getDb(userId)
  await db.transaction('rw', db.meta, async () => {
    await setMeta(db, pref, value)
    await setMeta(db, pendingKey(pref), value)
  })
}

/** The unit weights are shown in, as last synced or chosen here; kilograms until then. */
export async function readUnit(userId: string): Promise<Unit> {
  return parseUnit(await meta<unknown>(getDb(userId), 'unit', DEFAULT_UNIT))
}

export const setUnit = (userId: string, unit: Unit): Promise<void> => setPreference(userId, 'unit', unit)

/**
 * The language, as last synced or chosen here — or null when this device has
 * never heard: then the cookie the proxy set from the browser stands, rather
 * than English overriding it before the first sync.
 */
export async function readLocale(userId: string): Promise<Locale | null> {
  const value = await meta<unknown>(getDb(userId), 'locale', null)
  return value === null ? null : parseLocale(value)
}

export const setLocale = (userId: string, locale: Locale): Promise<void> => setPreference(userId, 'locale', locale)
