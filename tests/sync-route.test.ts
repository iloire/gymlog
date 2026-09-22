import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '@/db/schema'
import type { Mutation, SyncResponse, SyncRow, SyncTable } from '@/lib/sync/types'

import { createTestDb, insertUser, type TestDb } from './helpers/server-db'

// The route reads `db` and the signed-in user through these modules. Both are
// swapped for a real migrated SQLite database and a controllable user id.
const state = vi.hoisted(() => ({ db: null as unknown, userId: null as string | null }))

vi.mock('@/db', () => ({
  db: new Proxy({}, { get: (_target, prop) => Reflect.get(state.db as object, prop) }),
}))
vi.mock('@/lib/auth', () => ({ currentUserId: async () => state.userId }))

const { POST } = await import('@/app/api/sync/route')

const ALICE = 'user-alice'
const BOB = 'user-bob'

let db: TestDb
let cleanup: () => void

beforeEach(async () => {
  ;({ db, cleanup } = await createTestDb())
  state.db = db
  state.userId = ALICE
  await insertUser(db, ALICE)
  await insertUser(db, BOB)
})

afterEach(() => cleanup())

let seq = 0
function mutation(table: SyncTable, row: Record<string, unknown>): Mutation {
  seq += 1
  return {
    id: `${table}:${row.id}`,
    table,
    rowId: String(row.id),
    row: { createdAt: 1, updatedAt: 1000, deletedAt: null, ...row } as unknown as SyncRow,
    queuedAt: seq,
  }
}

async function sync(
  mutations: Mutation[] = [],
  {
    cursor = 0,
    globalCursor = 0,
    unit,
    locale,
  }: { cursor?: number; globalCursor?: number; unit?: string; locale?: string } = {},
): Promise<{ status: number; body: SyncResponse }> {
  const response = await POST(
    new Request('http://test/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        cursor,
        globalCursor,
        clientId: 'device-1',
        mutations,
        ...(unit ? { unit } : {}),
        ...(locale ? { locale } : {}),
      }),
    }),
  )
  return { status: response.status, body: await response.json() }
}

const template = (id: string, extra: Record<string, unknown> = {}) =>
  mutation('workoutTemplates', { id, name: 'Full Body A', notes: null, archivedAt: null, ...extra })

const session = (id: string, extra: Record<string, unknown> = {}) =>
  mutation('sessions', {
    id,
    programId: null,
    templateId: null,
    templateName: 'Full Body A',
    scheduledFor: '2026-09-15',
    startedAt: 1,
    completedAt: null,
    notes: null,
    ...extra,
  })

async function insertExercise(id: string, userId: string | null = null, updatedAt = 1) {
  await db.insert(schema.exercises).values({
    id,
    userId,
    name: id,
    slug: id.toLowerCase(),
    createdAt: 1,
    updatedAt,
  })
}

const setLog = (id: string, sessionId: string, extra: Record<string, unknown> = {}) =>
  mutation('setLogs', {
    id,
    sessionId,
    exerciseId: 'Barbell_Squat',
    exerciseName: 'Barbell Squat',
    position: 1,
    setIndex: 1,
    weightKg: 60,
    reps: 5,
    isWarmup: false,
    completedAt: 1,
    performedAt: 1,
    notes: null,
    ...extra,
  })

describe('POST /api/sync — access', () => {
  it('rejects a request with no signed-in user', async () => {
    state.userId = null
    expect((await sync()).status).toBe(401)
  })

  it('rejects a user id that no longer exists', async () => {
    state.userId = 'ghost'
    expect((await sync()).status).toBe(401)
  })

  it('rejects a malformed body', async () => {
    const response = await POST(
      new Request('http://test/api/sync', { method: 'POST', body: JSON.stringify({ cursor: -1 }) }),
    )
    expect(response.status).toBe(400)
  })

  it('rejects a mutation whose row has no numeric updatedAt', async () => {
    const bad = template('t1')
    bad.row = { ...bad.row, updatedAt: 'yesterday' as unknown as number }
    const { status } = await sync([bad])
    expect(status).toBe(400)
  })
})

describe('POST /api/sync — push', () => {
  it('inserts a new row and stamps it with the next rev', async () => {
    const { body } = await sync([template('t1')])

    expect(body.applied).toEqual(['workoutTemplates:t1'])
    expect(body.cursor).toBe(1)
    const [row] = await db.select().from(schema.workoutTemplates)
    expect(row).toMatchObject({ id: 't1', userId: ALICE, rev: 1 })
  })

  it('takes userId from the session, never from the payload', async () => {
    await sync([template('t1', { userId: BOB })])

    const [row] = await db.select().from(schema.workoutTemplates)
    expect(row?.userId).toBe(ALICE)
  })

  it('advances the user sync counter once per applied row', async () => {
    await sync([template('t1'), template('t2'), template('t3')])

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ALICE))
    expect(user?.syncRev).toBe(3)
  })

  it('applies a newer edit of an existing row', async () => {
    await sync([template('t1', { name: 'Old', updatedAt: 1000 })])
    const { body } = await sync([template('t1', { name: 'New', updatedAt: 2000 })])

    expect(body.applied).toHaveLength(1)
    const [row] = await db.select().from(schema.workoutTemplates)
    expect(row?.name).toBe('New')
  })

  it('rejects an older edit as stale and returns the stored winner', async () => {
    await sync([template('t1', { name: 'Kept', updatedAt: 2000 })])
    const { body } = await sync([template('t1', { name: 'Lost', updatedAt: 1000 })])

    expect(body.applied).toEqual([])
    expect(body.rejected).toMatchObject([{ reason: 'stale', rowId: 't1' }])
    expect(body.rejected[0]?.winner).toMatchObject({ name: 'Kept' })
  })

  it('takes an exact updatedAt tie as the same write arriving again', async () => {
    // The reply to the first push was lost and the device retried. The row is
    // already stored: applied, not "overwritten by another device".
    await sync([template('t1', { name: 'First', updatedAt: 1500 })])
    const { body } = await sync([template('t1', { name: 'Second', updatedAt: 1500 })])

    expect(body.applied).toEqual(['workoutTemplates:t1'])
    expect(body.rejected).toEqual([])
    const [row] = await db.select().from(schema.workoutTemplates)
    expect(row?.name).toBe('First')
    expect(await db.select().from(schema.syncConflicts)).toHaveLength(0)
  })

  it('never lets a fresh copy of a set blank one that was done', async () => {
    // Logged on the phone; then the laptop, which never heard of it, opens the
    // same workout and pre-creates the same set, empty, with a newer timestamp.
    await insertExercise('Barbell_Squat')
    await sync([session('session-1'), setLog('set-1', 'session-1', { weightKg: 60, reps: 5 })])
    const blank = setLog('set-1', 'session-1', {
      weightKg: null,
      reps: null,
      completedAt: null,
      createdAt: 5000,
      updatedAt: 5000,
    })

    const { body } = await sync([blank])

    expect(body.rejected).toMatchObject([{ rowId: 'set-1', reason: 'stale' }])
    expect(body.rejected[0]?.winner).toMatchObject({ weightKg: 60, reps: 5 })
    const [row] = await db.select().from(schema.setLogs)
    expect(row).toMatchObject({ weightKg: 60, reps: 5 })
    // A set nobody did is not worth a conflict row.
    expect(await db.select().from(schema.syncConflicts)).toHaveLength(0)
  })

  it('never lets a fresh session reopen one that was finished', async () => {
    await sync([session('session-1', { completedAt: 5 })])
    const fresh = session('session-1', { completedAt: null, createdAt: 5000, updatedAt: 5000 })

    const { body } = await sync([fresh])

    expect(body.rejected).toMatchObject([{ rowId: 'session-1', reason: 'stale' }])
    const [row] = await db.select().from(schema.sessions)
    expect(row?.completedAt).toBe(5)
  })

  it('keeps a lost edit whole, with the device that sent it', async () => {
    await sync([template('t1', { name: 'Kept', updatedAt: 2000 })])
    await sync([template('t1', { name: 'Lost', updatedAt: 1000 })])

    const conflicts = await db.select().from(schema.syncConflicts)
    expect(conflicts).toMatchObject([
      { userId: ALICE, clientId: 'device-1', table: 'workoutTemplates', rowId: 't1', reason: 'stale', winnerUpdatedAt: 2000 },
    ])
    expect(conflicts[0]?.lost).toMatchObject({ id: 't1', name: 'Lost', updatedAt: 1000 })
  })

  it("refuses to overwrite another user's row, without leaking it", async () => {
    state.userId = BOB
    await sync([template('shared-id', { name: "Bob's secret plan", updatedAt: 1000 })])

    state.userId = ALICE
    const { body } = await sync([template('shared-id', { name: 'Hijacked', updatedAt: 9_999_999 })])

    expect(body.applied).toEqual([])
    expect(body.rejected[0]?.reason).toBe('forbidden')
    expect(JSON.stringify(body.rejected[0]?.winner)).not.toContain("Bob's secret plan")
    const [row] = await db.select().from(schema.workoutTemplates)
    expect(row).toMatchObject({ name: "Bob's secret plan", userId: BOB })
  })

  it('treats the global exercise library as read-only', async () => {
    await insertExercise('Barbell_Squat', null)

    const { body } = await sync([
      mutation('exercises', { id: 'Barbell_Squat', name: 'Renamed', slug: 'x', updatedAt: 9_999_999 }),
    ])

    expect(body.rejected[0]?.reason).toBe('forbidden')
    const [row] = await db.select().from(schema.exercises)
    expect(row?.name).toBe('Barbell_Squat')
  })

  it("accepts an exercise of the user's own beside the read-only library, and pulls it back", async () => {
    await insertExercise('Barbell_Squat', null)

    const { body } = await sync([
      mutation('exercises', {
        id: 'own-1',
        name: 'Kettlebell Swings',
        slug: 'kettlebell-swings',
        equipment: 'kettlebells',
        primaryMuscles: ['hamstrings'],
        images: [],
        updatedAt: 1000,
      }),
    ])

    expect(body.applied).toEqual(['exercises:own-1'])
    const own = await db.select().from(schema.exercises).where(eq(schema.exercises.id, 'own-1'))
    expect(own[0]).toMatchObject({ userId: ALICE, name: 'Kettlebell Swings', rev: 1 })

    const pulled = await sync([], { cursor: 0 })
    expect(pulled.body.changes.exercises?.map((row) => row.id).sort()).toEqual(['Barbell_Squat', 'own-1'])
  })

  it('stores a delete as a tombstone', async () => {
    await sync([template('t1', { updatedAt: 1000 })])
    await sync([template('t1', { updatedAt: 2000, deletedAt: 2000 })])

    const [row] = await db.select().from(schema.workoutTemplates)
    expect(row?.deletedAt).toBe(2000)
  })

  it('applies children queued before their parent', async () => {
    // Real sequence: start a session offline (session, then its sets are
    // queued), log the sets (sets re-queued), tap Finish (the session is
    // re-queued LAST). The outbox now holds the sets ahead of the session they
    // reference — and Turso enforces foreign keys.
    await insertExercise('Barbell_Squat')
    const child = setLog('set-1', 'session-1')
    const parent = session('session-1', { completedAt: 5 })
    parent.queuedAt = child.queuedAt + 1

    const { status, body } = await sync([child, parent])

    expect(status).toBe(200)
    expect(body.applied.sort()).toEqual(['sessions:session-1', 'setLogs:set-1'])
    expect(await db.select().from(schema.setLogs)).toHaveLength(1)
  })

  it('rejects a genuinely orphaned row without blocking the rest of the push', async () => {
    // A child whose parent never existed anywhere must not wedge the outbox:
    // everything else in the same push still lands.
    await insertExercise('Barbell_Squat')
    const { status, body } = await sync([
      setLog('orphan', 'no-such-session'),
      template('t1'),
    ])

    expect(status).toBe(200)
    expect(body.applied).toEqual(['workoutTemplates:t1'])
    expect(body.rejected).toMatchObject([{ rowId: 'orphan', reason: 'invalid' }])
    expect(await db.select().from(schema.setLogs)).toHaveLength(0)
    // ...but the set itself is not lost.
    expect(await db.select().from(schema.syncConflicts)).toMatchObject([{ rowId: 'orphan', reason: 'invalid' }])
  })
})

describe('POST /api/sync — pull', () => {
  it('returns only rows newer than the cursor', async () => {
    await sync([template('t1')])
    const first = await sync()
    await sync([template('t2')])

    const { body } = await sync([], { cursor: first.body.cursor })

    expect(body.changes.workoutTemplates?.map((row) => row.id)).toEqual(['t2'])
  })

  it("never returns another user's rows", async () => {
    state.userId = BOB
    await sync([template('bob-template')])

    state.userId = ALICE
    const { body } = await sync()

    expect(body.changes.workoutTemplates).toBeUndefined()
  })

  it('delivers tombstones so other devices learn about deletions', async () => {
    await sync([template('t1', { updatedAt: 1000 })])
    const { body: before } = await sync()
    await sync([template('t1', { updatedAt: 2000, deletedAt: 2000 })])

    const { body } = await sync([], { cursor: before.cursor })

    expect(body.changes.workoutTemplates).toMatchObject([{ id: 't1', deletedAt: 2000 }])
  })

  it('sends the global exercise library on bootstrap, and only changes after', async () => {
    await insertExercise('Old_Lift', null, 100)
    await insertExercise('New_Lift', null, 500)

    const bootstrap = await sync([], { globalCursor: 0 })
    const later = await sync([], { globalCursor: 100 })
    const upToDate = await sync([], { globalCursor: 500 })

    expect(bootstrap.body.changes.exercises).toHaveLength(2)
    expect(later.body.changes.exercises?.map((row) => row.id)).toEqual(['New_Lift'])
    expect(upToDate.body.changes.exercises).toBeUndefined()
  })

  it('round-trips a favourite star on a global exercise', async () => {
    await insertExercise('Barbell_Squat')
    await sync([
      mutation('exerciseNotes', {
        id: 'note-1',
        exerciseId: 'Barbell_Squat',
        notes: 'Knees out',
        favoritedAt: 1500,
      }),
    ])

    const { body } = await sync()

    expect(body.changes.exerciseNotes).toMatchObject([
      { id: 'note-1', notes: 'Knees out', favoritedAt: 1500 },
    ])
  })

  it('round-trips a timed cardio set', async () => {
    await insertExercise('Barbell_Squat')
    await sync([session('s-1'), setLog('sl-1', 's-1', { weightKg: null, reps: null, targetDurationSec: 600, durationSec: 480 })])

    const { body } = await sync()

    expect(body.changes.setLogs).toMatchObject([{ id: 'sl-1', targetDurationSec: 600, durationSec: 480, reps: null }])
  })

  it('includes the server clock for skew correction', async () => {
    const before = Date.now()
    const { body } = await sync()
    expect(body.serverTime).toBeGreaterThanOrEqual(before)
  })
})

describe('POST /api/sync — language', () => {
  it('reports the account language on every sync, English until chosen', async () => {
    const { body } = await sync()
    expect(body.locale).toBe('en')
  })

  it('stores a language chosen on the device and reports it back to every device', async () => {
    const chosen = await sync([], { locale: 'es' })
    expect(chosen.body.locale).toBe('es')

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ALICE))
    expect(user?.locale).toBe('es')
    // Not a row: the sync counter does not move for it.
    expect(user?.syncRev).toBe(0)

    const other = await sync()
    expect(other.body.locale).toBe('es')
  })

  it('refuses a language it does not have', async () => {
    const { status } = await sync([], { locale: 'fr' })
    expect(status).toBe(400)
  })
})

describe('POST /api/sync — display unit', () => {
  it('reports the account unit on every sync, kilograms until chosen', async () => {
    const { body } = await sync()
    expect(body.unit).toBe('kg')
  })

  it('stores a unit chosen on the device and reports it back to every device', async () => {
    const chosen = await sync([], { unit: 'lb' })
    expect(chosen.body.unit).toBe('lb')

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, ALICE))
    expect(user?.unit).toBe('lb')
    // The unit is not a row: the sync counter does not move for it.
    expect(user?.syncRev).toBe(0)

    const other = await sync()
    expect(other.body.unit).toBe('lb')
  })

  it('refuses a unit it does not know', async () => {
    const { status } = await sync([], { unit: 'st' })
    expect(status).toBe(400)
  })

  it("never lets one user's choice reach another", async () => {
    await sync([], { unit: 'lb' })
    state.userId = BOB
    const { body } = await sync()
    expect(body.unit).toBe('kg')
  })
})
