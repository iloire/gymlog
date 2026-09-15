import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  apiTokens,
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
import type { TokenScope } from '@/lib/api-tokens'
import { bodyWeightId } from '@/lib/id'
import type { SyncResponse } from '@/lib/sync/types'

import { createTestDb, insertUser, type TestDb } from './helpers/server-db'

// Token management and /api/sync read the signed-in user; the API itself reads
// only the bearer token. Everything runs against a real migrated SQLite file.
const state = vi.hoisted(() => ({ db: null as unknown, userId: null as string | null }))

vi.mock('@/db', () => ({
  db: new Proxy({}, { get: (_target, prop) => Reflect.get(state.db as object, prop) }),
}))
vi.mock('@/lib/auth', () => ({ currentUserId: async () => state.userId }))

const { createApiToken, hashToken, listApiTokens, MAX_ACTIVE_TOKENS, revokeApiToken } = await import(
  '@/lib/api-tokens'
)
const { openApiSpec } = await import('@/lib/api-openapi')
const sync = await import('@/app/api/sync/route')

type Handler = (request: Request, context?: { params: Promise<Record<string, string>> }) => Promise<Response>
const routes: Record<string, Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE', Handler>>> = {
  '/profile': await import('@/app/api/v1/profile/route'),
  '/workouts': await import('@/app/api/v1/workouts/route'),
  '/workouts/{id}': (await import('@/app/api/v1/workouts/[id]/route')) as never,
  '/exercises': await import('@/app/api/v1/exercises/route'),
  '/history': await import('@/app/api/v1/history/route'),
  '/bodyweight': await import('@/app/api/v1/bodyweight/route'),
  '/programme/week': await import('@/app/api/v1/programme/week/route'),
}

const ALICE = 'alice'
const BOB = 'bob'
const row = { createdAt: 1, updatedAt: 1, deletedAt: null, rev: 1 }

let db: TestDb
let cleanup: () => void

beforeEach(async () => {
  ;({ db, cleanup } = await createTestDb())
  state.db = db
  state.userId = null
  await insertUser(db, ALICE)
  await insertUser(db, BOB)
  await db.insert(exercises).values([
    { ...row, id: 'squat', userId: null, name: 'Barbell Squat', slug: 'squat', equipment: 'barbell' },
    { ...row, id: 'bench', userId: null, name: 'Bench Press', slug: 'bench', equipment: 'barbell' },
    { ...row, id: 'bobs-move', userId: BOB, name: 'Bob Squat', slug: 'bobs-move', equipment: 'barbell' },
  ])
})

afterEach(() => cleanup())

async function tokenFor(userId: string, scope: TokenScope = 'read'): Promise<string> {
  state.userId = userId
  const result = await createApiToken('ChatGPT', scope)
  state.userId = null
  if (!result.ok) throw new Error(result.error)
  return result.token
}

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  token: string | null,
  { query = '', body, params = {} }: { query?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const handler = routes[path]?.[method]
  if (!handler) throw new Error(`no ${method} ${path}`)
  const url = `http://test/api/v1${path.replace('{id}', params.id ?? '')}${query}`
  const response = await handler(
    new Request(url, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  )
  return { status: response.status, body: await response.json() }
}

const get = (path: string, token: string | null, query = '') => call('GET', path, token, { query })

async function trainedSession(
  userId: string,
  id: string,
  scheduledFor: string,
  sets: { exerciseId: string; setIndex: number; weightKg: number; reps: number; isWarmup?: boolean }[],
) {
  await db.insert(sessions).values({ ...row, id, userId, templateName: 'Full body A', scheduledFor })
  for (const [position, set] of sets.entries()) {
    await db.insert(setLogs).values({
      ...row,
      id: `${id}-${set.exerciseId}-${set.setIndex}`,
      userId,
      sessionId: id,
      exerciseName: set.exerciseId === 'squat' ? 'Barbell Squat' : 'Bench Press',
      position: set.exerciseId === 'squat' ? 1 : 2,
      completedAt: 1_000 + position * 120_000,
      performedAt: 0,
      ...set,
    })
  }
}

const squatDay = {
  name: 'Squat day',
  exercises: [
    { exerciseId: 'squat', sets: 5, targetReps: 5, targetWeightKg: 60 },
    { exerciseId: 'bench', sets: 3, targetReps: 8, targetRepsMax: 12 },
  ],
}

// --------------------------------------------------------------------------

describe('tokens', () => {
  it('stores only a hash, and the token reads its owner’s data', async () => {
    const token = await tokenFor(ALICE)

    expect(token).toMatch(/^gymlog_[\w-]{43}$/)
    const [stored] = await db.select().from(apiTokens)
    expect(stored?.tokenHash).toBe(hashToken(token))
    expect(stored?.scope).toBe('read')
    expect(JSON.stringify(stored)).not.toContain(token.slice(12))
    expect(token.startsWith(stored?.prefix ?? '-')).toBe(true)

    expect((await get('/profile', token)).status).toBe(200)
    const [used] = await db.select().from(apiTokens)
    expect(used?.lastUsedAt).toEqual(expect.any(Number))
  })

  it('refuses a missing, unknown or malformed token', async () => {
    await tokenFor(ALICE)

    expect((await get('/profile', null)).status).toBe(401)
    expect((await get('/profile', 'gymlog_not-a-real-token')).status).toBe(401)
    expect((await get('/profile', 'something-else')).status).toBe(401)
  })

  it('needs a signed-in user, a name and a known scope to create one', async () => {
    expect(await createApiToken('ChatGPT')).toEqual({ ok: false, error: 'You are signed out.' })
    state.userId = ALICE
    expect((await createApiToken('   ')).ok).toBe(false)
    expect((await createApiToken('Sneaky', 'admin' as TokenScope)).ok).toBe(false)
  })

  it('stops working once revoked, and only its owner can revoke it', async () => {
    const token = await tokenFor(ALICE)
    state.userId = ALICE
    const [summary] = await listApiTokens()

    state.userId = BOB
    await revokeApiToken(summary!.id)
    expect((await get('/profile', token)).status).toBe(200)

    state.userId = ALICE
    await revokeApiToken(summary!.id)
    expect((await get('/profile', token)).status).toBe(401)
    expect(await listApiTokens()).toEqual([])
  })

  it('lists only your own tokens', async () => {
    await tokenFor(ALICE)
    await tokenFor(BOB, 'write')
    state.userId = ALICE
    expect(await listApiTokens()).toEqual([expect.objectContaining({ scope: 'read' })])
  })

  it(`caps active tokens at ${MAX_ACTIVE_TOKENS}`, async () => {
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) await tokenFor(ALICE)
    state.userId = ALICE
    expect((await createApiToken('one too many')).ok).toBe(false)
  })

  it('a read only token cannot write, and changes nothing trying', async () => {
    const token = await tokenFor(ALICE, 'read')

    const attempts = [
      await call('POST', '/workouts', token, { body: squatDay }),
      await call('PUT', '/bodyweight', token, { body: { date: '2026-09-01', weightKg: 80 } }),
      await call('PUT', '/programme/week', token, { body: { week: [] } }),
    ]

    expect(attempts.map((a) => a.status)).toEqual([403, 403, 403])
    expect(attempts[0]?.body.error).toBe('insufficient_scope')
    expect(await db.select().from(workoutTemplates)).toEqual([])
    expect(await db.select().from(bodyWeights)).toEqual([])
    expect(await db.select().from(programs)).toEqual([])
  })
})

// --------------------------------------------------------------------------

describe('GET /history', () => {
  it('returns only the token owner’s trained sessions, newest first, summarised', async () => {
    await trainedSession(ALICE, 'a1', '2026-09-01', [
      { exerciseId: 'squat', setIndex: 1, weightKg: 20, reps: 10, isWarmup: true },
      { exerciseId: 'squat', setIndex: 2, weightKg: 60, reps: 5 },
      { exerciseId: 'bench', setIndex: 1, weightKg: 40, reps: 8 },
    ])
    await trainedSession(ALICE, 'a2', '2026-09-03', [{ exerciseId: 'bench', setIndex: 1, weightKg: 42.5, reps: 8 }])
    await trainedSession(BOB, 'b1', '2026-09-02', [{ exerciseId: 'squat', setIndex: 1, weightKg: 200, reps: 1 }])
    // Opened and abandoned: not history.
    await db.insert(sessions).values({ ...row, id: 'a3', userId: ALICE, templateName: 'B', scheduledFor: '2026-09-04' })

    const { status, body } = await get('/history', await tokenFor(ALICE))

    expect(status).toBe(200)
    expect(body.sessions.map((s: { date: string }) => s.date)).toEqual(['2026-09-03', '2026-09-01'])
    const [, first] = body.sessions
    expect(first).toMatchObject({ workout: 'Full body A', volumeKg: 620, setsDone: 3, durationMin: 4 })
    expect(first.exercises).toEqual([
      expect.objectContaining({
        name: 'Barbell Squat',
        sets: [expect.objectContaining({ warmup: true }), expect.objectContaining({ weightKg: 60, reps: 5 })],
      }),
      expect.objectContaining({ name: 'Bench Press' }),
    ])
    expect(JSON.stringify(body)).not.toContain('"rev"')
  })

  it('leaves out deleted sessions and sets', async () => {
    await trainedSession(ALICE, 'a1', '2026-09-01', [
      { exerciseId: 'squat', setIndex: 1, weightKg: 60, reps: 5 },
      { exerciseId: 'squat', setIndex: 2, weightKg: 60, reps: 5 },
    ])
    await trainedSession(ALICE, 'a2', '2026-09-02', [{ exerciseId: 'squat', setIndex: 1, weightKg: 60, reps: 5 }])
    await db.update(setLogs).set({ deletedAt: 5 }).where(eq(setLogs.id, 'a1-squat-2'))
    await db.update(sessions).set({ deletedAt: 5 }).where(eq(sessions.id, 'a2'))

    const { body } = await get('/history', await tokenFor(ALICE))

    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0].setsDone).toBe(1)
  })

  it('filters by date and limit, and rejects a malformed query', async () => {
    for (const day of ['01', '02', '03', '04']) {
      await trainedSession(ALICE, `a${day}`, `2026-09-${day}`, [{ exerciseId: 'squat', setIndex: 1, weightKg: 60, reps: 5 }])
    }
    const token = await tokenFor(ALICE)
    const dates = async (query: string) =>
      (await get('/history', token, query)).body.sessions.map((s: { date: string }) => s.date)

    expect(await dates('?from=2026-09-02&to=2026-09-03')).toEqual(['2026-09-03', '2026-09-02'])
    expect(await dates('?limit=1')).toEqual(['2026-09-04'])
    expect((await get('/history', token, '?from=yesterday')).status).toBe(400)
    expect((await get('/history', token, '?limit=0')).status).toBe(400)
  })
})

describe('GET /workouts, /profile, /exercises, /bodyweight', () => {
  it('lists unarchived workouts with exercises in order, and the current programme’s week', async () => {
    await db.insert(workoutTemplates).values([
      { ...row, id: 'tA', userId: ALICE, name: 'Full body A' },
      { ...row, id: 'tOld', userId: ALICE, name: 'Old', archivedAt: 5 },
      { ...row, id: 'tBob', userId: BOB, name: 'Bob only' },
    ])
    await db.insert(templateItems).values([
      { ...row, id: 'i2', userId: ALICE, templateId: 'tA', exerciseId: 'bench', position: 2, sets: 3, targetReps: 8, targetRepsMax: 12 },
      { ...row, id: 'i1', userId: ALICE, templateId: 'tA', exerciseId: 'squat', position: 1, sets: 5, targetReps: 5 },
      { ...row, id: 'i3', userId: ALICE, templateId: 'tA', exerciseId: 'squat', position: 3, deletedAt: 5 },
    ])
    await db.insert(programs).values({ ...row, id: 'p1', userId: ALICE, name: 'Beginner', startedOn: '2026-09-01' })
    await db.insert(programDays).values([
      { ...row, id: 'd2', userId: ALICE, programId: 'p1', dayOfWeek: 2, templateId: 'tA' },
      { ...row, id: 'd0', userId: ALICE, programId: 'p1', dayOfWeek: 0, templateId: 'tA' },
    ])
    const token = await tokenFor(ALICE)

    const { body: workouts } = await get('/workouts', token)
    expect(workouts.workouts).toEqual([
      expect.objectContaining({
        id: 'tA',
        exercises: [
          expect.objectContaining({ exerciseId: 'squat', exercise: 'Barbell Squat', sets: 5, targetReps: 5 }),
          expect.objectContaining({ exercise: 'Bench Press', targetRepsMax: 12 }),
        ],
      }),
    ])
    expect((await call('GET', '/workouts/{id}', token, { params: { id: 'tBob' } })).status).toBe(404)

    const { body: profile } = await get('/profile', token)
    expect(profile).toMatchObject({ weightsAreIn: 'kg', preferredUnit: 'kg' })
    expect(profile.currentProgramme.week).toEqual([
      { day: 'Monday', workoutId: 'tA', workout: 'Full body A' },
      { day: 'Wednesday', workoutId: 'tA', workout: 'Full body A' },
    ])
  })

  it('searches the shared library and your own exercises, never someone else’s', async () => {
    const { body } = await get('/exercises', await tokenFor(ALICE), '?q=SQUAT')
    expect(body.exercises).toEqual([expect.objectContaining({ id: 'squat', own: false })])

    const { body: bobs } = await get('/exercises', await tokenFor(BOB), '?q=squat')
    expect(bobs.exercises.map((e: { id: string }) => e.id)).toEqual(['squat', 'bobs-move'])
  })

  it('returns live bodyweight in range, newest first', async () => {
    await db.insert(bodyWeights).values([
      { ...row, id: 'w1', userId: ALICE, measuredOn: '2026-09-01', weightKg: 80 },
      { ...row, id: 'w2', userId: ALICE, measuredOn: '2026-09-05', weightKg: 79.5 },
      { ...row, id: 'w3', userId: ALICE, measuredOn: '2026-09-06', weightKg: 1, deletedAt: 5 },
      { ...row, id: 'w4', userId: BOB, measuredOn: '2026-09-05', weightKg: 100 },
    ])

    const { body } = await get('/bodyweight', await tokenFor(ALICE), '?from=2026-09-02')

    expect(body.bodyweight).toEqual([{ date: '2026-09-05', weightKg: 79.5, notes: null }])
  })
})

// --------------------------------------------------------------------------

describe('writes', () => {
  it('creates a workout that reaches the phone on its next sync', async () => {
    const token = await tokenFor(ALICE, 'write')
    state.userId = ALICE
    const before = (await (await sync.POST(syncRequest(0))).json()) as SyncResponse

    const { status, body } = await call('POST', '/workouts', token, { body: squatDay })

    expect(status).toBe(201)
    expect(body).toMatchObject({ name: 'Squat day', exercises: [{ exerciseId: 'squat', targetWeightKg: 60, restSec: 90 }, { targetRepsMax: 12 }] })

    const pulled = (await (await sync.POST(syncRequest(before.cursor))).json()) as SyncResponse
    expect(pulled.changes.workoutTemplates).toEqual([expect.objectContaining({ id: body.id, userId: ALICE })])
    expect(pulled.changes.templateItems?.map((item) => item.position)).toEqual([1, 2])
    expect(pulled.cursor).toBe(before.cursor + 3)
  })

  it('replaces a workout, reusing item ids and tombstoning the ones left over', async () => {
    const token = await tokenFor(ALICE, 'write')
    const { body: created } = await call('POST', '/workouts', token, { body: squatDay })
    const [firstItem] = await db.select().from(templateItems).where(eq(templateItems.position, 1))

    const { status, body } = await call('PUT', '/workouts/{id}', token, {
      params: { id: created.id },
      body: { name: 'Bench day', exercises: [{ exerciseId: 'bench', sets: 4, targetReps: 6 }] },
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({ id: created.id, name: 'Bench day', exercises: [{ exerciseId: 'bench', sets: 4 }] })
    const items = await db.select().from(templateItems)
    expect(items.find((item) => item.deletedAt === null)?.id).toBe(firstItem?.id)
    expect(items.filter((item) => item.deletedAt !== null)).toHaveLength(1)
    const revs = items.map((item) => item.rev)
    expect(new Set(revs).size).toBe(revs.length)
  })

  it('refuses unknown or someone else’s exercises and workouts', async () => {
    const token = await tokenFor(ALICE, 'write')
    await db.insert(workoutTemplates).values({ ...row, id: 'tBob', userId: BOB, name: 'Bob only' })

    const foreign = await call('POST', '/workouts', token, {
      body: { name: 'X', exercises: [{ exerciseId: 'bobs-move', sets: 3, targetReps: 5 }, { exerciseId: 'nope', sets: 3, targetReps: 5 }] },
    })
    expect(foreign.status).toBe(400)
    expect(foreign.body.issues).toEqual(['exerciseId: bobs-move', 'exerciseId: nope'])

    expect((await call('PUT', '/workouts/{id}', token, { params: { id: 'tBob' }, body: squatDay })).status).toBe(404)
    expect((await call('DELETE', '/workouts/{id}', token, { params: { id: 'tBob' } })).status).toBe(404)
    expect((await call('PUT', '/programme/week', token, { body: { week: [{ day: 'Monday', workoutId: 'tBob' }] } })).status).toBe(400)
    const [bobs] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, 'tBob'))
    expect(bobs).toMatchObject({ name: 'Bob only', deletedAt: null })
  })

  it('rejects a malformed body with the issues', async () => {
    const token = await tokenFor(ALICE, 'write')

    expect((await call('POST', '/workouts', token, { body: 'not json' })).body.error).toBe('bad_request')
    const bad = await call('POST', '/workouts', token, {
      body: { name: 'X', exercises: [{ exerciseId: 'squat', sets: 3, targetReps: 10, targetRepsMax: 8 }] },
    })
    expect(bad.status).toBe(400)
    expect(bad.body.issues).toEqual([expect.stringContaining('exercises.0.targetRepsMax')])
  })

  it('deletes a workout as a tombstone', async () => {
    const token = await tokenFor(ALICE, 'write')
    const { body: created } = await call('POST', '/workouts', token, { body: squatDay })

    expect((await call('DELETE', '/workouts/{id}', token, { params: { id: created.id } })).status).toBe(200)

    const [stored] = await db.select().from(workoutTemplates)
    expect(stored?.deletedAt).toEqual(expect.any(Number))
    expect((await get('/workouts', token)).body.workouts).toEqual([])
  })

  it('sets the week, starting a programme if none runs, and clears unlisted days', async () => {
    const token = await tokenFor(ALICE, 'write')
    const { body: a } = await call('POST', '/workouts', token, { body: squatDay })
    const { body: b } = await call('POST', '/workouts', token, { body: { ...squatDay, name: 'B' } })

    const first = await call('PUT', '/programme/week', token, {
      body: { week: [{ day: 'Monday', workoutId: a.id }, { day: 'Friday', workoutId: b.id }] },
    })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ name: 'My programme', week: [{ day: 'Monday' }, { day: 'Friday' }] })

    const second = await call('PUT', '/programme/week', token, {
      body: { week: [{ day: 'Wednesday', workoutId: a.id }] },
    })
    expect(second.body.week).toEqual([{ day: 'Wednesday', workoutId: a.id, workout: 'Squat day' }])
    expect(await db.select().from(programs)).toHaveLength(1)
  })

  it('puts a cleared day back without tripping the one-row-per-weekday index', async () => {
    const token = await tokenFor(ALICE, 'write')
    const { body: a } = await call('POST', '/workouts', token, { body: squatDay })
    const monday = { week: [{ day: 'Monday', workoutId: a.id }] }

    await call('PUT', '/programme/week', token, { body: monday })
    await call('PUT', '/programme/week', token, { body: { week: [] } })
    const again = await call('PUT', '/programme/week', token, { body: monday })

    expect(again.status).toBe(200)
    expect(again.body.week).toEqual([expect.objectContaining({ day: 'Monday' })])
    expect(await db.select().from(programDays)).toHaveLength(1)
  })

  it('records bodyweight under the app’s id for that day, so a second call corrects it', async () => {
    const token = await tokenFor(ALICE, 'write')

    await call('PUT', '/bodyweight', token, { body: { date: '2026-09-01', weightKg: 80 } })
    const { status, body } = await call('PUT', '/bodyweight', token, { body: { date: '2026-09-01', weightKg: 79.2 } })

    expect(status).toBe(200)
    expect(body).toEqual({ date: '2026-09-01', weightKg: 79.2, notes: null })
    const stored = await db.select().from(bodyWeights)
    expect(stored).toEqual([expect.objectContaining({ id: bodyWeightId(ALICE, '2026-09-01'), weightKg: 79.2 })])
    const [alice] = await db.select().from(users).where(eq(users.id, ALICE))
    expect(alice?.syncRev).toBe(2)
  })
})

function syncRequest(cursor: number) {
  return new Request('http://test/api/sync', {
    method: 'POST',
    body: JSON.stringify({ cursor, globalCursor: Date.now(), clientId: 'phone', mutations: [] }),
  })
}

describe('openapi.json', () => {
  it('documents exactly the operations that exist', () => {
    const documented = Object.entries(openApiSpec('http://test').paths).flatMap(([path, operations]) =>
      Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
    )
    const exported = Object.entries(routes).flatMap(([path, module]) =>
      (['GET', 'POST', 'PUT', 'DELETE'] as const).filter((m) => module[m]).map((m) => `${m} ${path}`),
    )
    expect(documented.sort()).toEqual(exported.sort())
  })
})
