import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exercises, sessions, setLogs, users } from '@/db/schema'
import { weekStart } from '@/lib/calendar'

import { createTestDb, insertUser, type TestDb } from './helpers/server-db'

// The admin layer reads `db` and the signed-in user through these modules. Both
// are swapped for a real migrated SQLite database and a controllable user id.
const state = vi.hoisted(() => ({ db: null as unknown, userId: null as string | null }))

vi.mock('@/db', () => ({
  db: new Proxy({}, { get: (_target, prop) => Reflect.get(state.db as object, prop) }),
}))
vi.mock('@/lib/auth', () => ({ currentUserId: async () => state.userId }))

const { adminOverview, adminUserDetail, requireAdmin } = await import('@/lib/admin')

const today = new Date().toISOString().slice(0, 10)
const now = Date.now()
const row = { createdAt: now, updatedAt: now, deletedAt: null, rev: 1 }

let db: TestDb
let cleanup: () => void

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ digest: expect.stringContaining('404') })
}

beforeEach(async () => {
  ;({ db, cleanup } = await createTestDb())
  state.db = db
  state.userId = null
  await insertUser(db, 'boss')
  await insertUser(db, 'lifter')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, 'boss'))
  await db.insert(exercises).values({ ...row, id: 'bench', userId: null, name: 'Bench', slug: 'bench' })
})

afterEach(() => cleanup())

describe('requireAdmin', () => {
  it('404s a signed-out request', async () => {
    await expectNotFound(requireAdmin())
  })

  it('404s a regular account', async () => {
    state.userId = 'lifter'
    await expectNotFound(adminOverview())
    await expectNotFound(adminUserDetail('boss'))
  })

  it('reads the role from the database on every call, so demotion is immediate', async () => {
    state.userId = 'boss'
    await expect(requireAdmin()).resolves.toBe('boss')

    await db.update(users).set({ role: 'user' }).where(eq(users.id, 'boss'))
    await expectNotFound(requireAdmin())
  })
})

describe('admin reads', () => {
  beforeEach(async () => {
    state.userId = 'boss'
    await db.insert(sessions).values([
      { ...row, id: 's-done', userId: 'lifter', templateName: 'Push', scheduledFor: today },
      // Started but no set completed — not a workout yet.
      { ...row, id: 's-empty', userId: 'lifter', templateName: 'Pull', scheduledFor: today },
      { ...row, id: 's-gone', userId: 'lifter', templateName: 'Legs', scheduledFor: today, deletedAt: now },
    ])
    const set = { ...row, userId: 'lifter', exerciseId: 'bench', exerciseName: 'Bench', position: 0, performedAt: now }
    await db.insert(setLogs).values([
      { ...set, id: 'w', sessionId: 's-done', setIndex: 1, weightKg: 40, reps: 10, isWarmup: true, completedAt: now },
      { ...set, id: 'a', sessionId: 's-done', setIndex: 2, weightKg: 80, reps: 5, completedAt: now },
      { ...set, id: 'b', sessionId: 's-done', setIndex: 3, weightKg: 80, reps: 5, completedAt: null },
      { ...set, id: 'c', sessionId: 's-gone', setIndex: 1, weightKg: 100, reps: 1, completedAt: now },
    ])
  })

  it('counts only trained, undeleted workouts and completed sets', async () => {
    const { users: rows, totals } = await adminOverview()
    const lifter = rows.find((r) => r.id === 'lifter')

    expect(lifter).toMatchObject({ workouts: 1, sets: 2, lastActiveAt: now })
    expect(lifter?.weeks).toHaveLength(12)
    expect(lifter?.weeks.at(-1)).toEqual({ weekOf: weekStart(today), days: 1 })
    expect(rows.find((r) => r.id === 'boss')).toMatchObject({ workouts: 0, lastActiveAt: null })
    expect(totals).toEqual({ accounts: 2, workouts: 1, sets: 2, activeThisWeek: 1 })
  })

  it("shows one account's sessions with working-set volume and no password hash", async () => {
    const detail = await adminUserDetail('lifter')

    expect(detail.user).not.toHaveProperty('passwordHash')
    expect(detail.sessions.map((s) => s.id).sort()).toEqual(['s-done', 's-empty'])
    expect(detail.sessions.find((s) => s.id === 's-done')).toMatchObject({ setsDone: 2, volumeKg: 400 })
  })

  it('404s an unknown account', async () => {
    await expectNotFound(adminUserDetail('nobody'))
  })
})
