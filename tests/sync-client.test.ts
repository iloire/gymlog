import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { clearRejections, clientId, now, readLocale, readUnit, rejections, setLocale, setUnit, sync } from '@/lib/sync/client'
import { MAX_PUSH, mutationKey, type SyncRequest, type SyncResponse } from '@/lib/sync/types'

const USER = 'user-1'

function response(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return { cursor: 0, serverTime: Date.now(), unit: 'kg', locale: 'en', changes: {}, applied: [], rejected: [], ...overrides }
}

/** Stub fetch; `reply` builds the server response from the parsed request. */
function server(
  reply: (request: SyncRequest) => SyncResponse | Response | Promise<SyncResponse | Response>,
) {
  const calls: SyncRequest[] = []
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as SyncRequest
    calls.push(request)
    const result = await reply(request)
    return result instanceof Response ? result : new Response(JSON.stringify(result), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

/** Accept everything that was pushed. */
const acceptAll = (request: SyncRequest) =>
  response({ applied: request.mutations.map((m) => m.id), cursor: request.mutations.length })

beforeEach(async () => {
  await destroyDb(USER)
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sync — when it cannot run', () => {
  it('reports offline without touching the network', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { fetchMock } = server(acceptAll)

    expect(await sync(USER)).toEqual({ ok: false, reason: 'offline' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a network failure as offline and keeps the outbox', async () => {
    await writeRow(USER, 'bodyWeights', { id: 'bw-1', measuredOn: '2026-09-15', weightKg: 80 })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    expect(await sync(USER)).toEqual({ ok: false, reason: 'offline' })
    expect(await getDb(USER).outbox.count()).toBe(1)
  })

  it('reports an expired session and keeps the outbox', async () => {
    await writeRow(USER, 'bodyWeights', { id: 'bw-1', measuredOn: '2026-09-15', weightKg: 80 })
    server(() => new Response('{}', { status: 401 }))

    expect(await sync(USER)).toEqual({ ok: false, reason: 'unauthorized' })
    expect(await getDb(USER).outbox.count()).toBe(1)
  })

  it('reports a server error and keeps the outbox', async () => {
    await writeRow(USER, 'bodyWeights', { id: 'bw-1', measuredOn: '2026-09-15', weightKg: 80 })
    server(() => new Response('boom', { status: 500 }))

    expect(await sync(USER)).toEqual({ ok: false, reason: 'error' })
    expect(await getDb(USER).outbox.count()).toBe(1)
  })
})

describe('sync — push', () => {
  it('sends queued mutations oldest first, with cursors and a device id', async () => {
    await writeRow(USER, 'sessions', { id: 's1', templateName: 'A', scheduledFor: '2026-09-15' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    await writeRow(USER, 'setLogs', { id: 'l1', sessionId: 's1' })
    const { calls } = server(acceptAll)

    await sync(USER)

    expect(calls[0]?.mutations.map((m) => m.rowId)).toEqual(['s1', 'l1'])
    expect(calls[0]).toMatchObject({ cursor: 0, globalCursor: 0 })
    expect(calls[0]?.clientId).toMatch(/[0-9a-f-]{36}/)
  })

  it('never sends more than the server accepts, and drains the rest next time', async () => {
    // An import can queue thousands of rows at once. The server refuses a
    // larger request outright, and a push that is always refused never drains.
    const db = getDb(USER)
    const rows = Array.from({ length: MAX_PUSH + 10 }, (_, index) => ({
      id: `m-${index}`,
      table: 'bodyWeights' as const,
      rowId: `bw-${index}`,
      row: { id: `bw-${index}`, updatedAt: 1 },
      queuedAt: index,
    }))
    await db.outbox.bulkPut(rows)
    const { calls } = server(acceptAll)

    await sync(USER)
    expect(calls[0]?.mutations).toHaveLength(MAX_PUSH)
    expect(await db.outbox.count()).toBe(10)

    await sync(USER)
    expect(await db.outbox.count()).toBe(0)
  })

  it('empties the outbox once the server accepts', async () => {
    await writeRow(USER, 'bodyWeights', { id: 'bw-1', measuredOn: '2026-09-15', weightKg: 80 })
    server(acceptAll)

    const result = await sync(USER)

    expect(result).toMatchObject({ ok: true, pushed: 1 })
    expect(await getDb(USER).outbox.count()).toBe(0)
  })

  it('keeps a record of what was refused until it is dismissed', async () => {
    await writeRow(USER, 'workoutTemplates', { id: 't1', name: 'A', archivedAt: null })
    await writeRow(USER, 'bodyWeights', { id: 'bw-1', measuredOn: '2026-09-15', weightKg: 80 })
    server((request) =>
      response({
        applied: [mutationKey('bodyWeights', 'bw-1')],
        rejected: [
          {
            mutationId: mutationKey('workoutTemplates', 't1'),
            table: 'workoutTemplates',
            rowId: 't1',
            reason: 'stale',
            winner: { id: 't1', updatedAt: request.mutations[0]?.row.updatedAt as number },
          },
        ],
      }),
    )

    await sync(USER)

    expect(await rejections(USER)).toMatchObject([{ table: 'workoutTemplates', rowId: 't1', reason: 'stale' }])
    await clearRejections(USER)
    expect(await rejections(USER)).toEqual([])
  })

  it('drops rejected mutations too, so they are not retried forever', async () => {
    await writeRow(USER, 'workoutTemplates', { id: 't1', name: 'Mine' })
    const key = mutationKey('workoutTemplates', 't1')
    server(() =>
      response({
        rejected: [{ mutationId: key, table: 'workoutTemplates', rowId: 't1', reason: 'stale', winner: { id: 't1', updatedAt: 9 } }],
      }),
    )

    const result = await sync(USER)

    expect(result).toMatchObject({ ok: true, rejected: 1 })
    expect(await getDb(USER).outbox.count()).toBe(0)
  })

  it('takes the winner when the stored row stood, so the devices agree', async () => {
    await writeRow(USER, 'workoutTemplates', { id: 't1', name: 'Mine' })
    server(() =>
      response({
        rejected: [
          {
            mutationId: mutationKey('workoutTemplates', 't1'),
            table: 'workoutTemplates',
            rowId: 't1',
            reason: 'stale',
            winner: { id: 't1', name: 'Theirs', updatedAt: 9, deletedAt: null },
          },
        ],
      }),
    )

    await sync(USER)

    expect((await getDb(USER).workoutTemplates.get('t1'))?.name).toBe('Theirs')
    expect(await getDb(USER).outbox.count()).toBe(0)
  })

  it('keeps an edit made while the request was in flight over the winner', async () => {
    await writeRow(USER, 'setLogs', { id: 'l1', weightKg: 60 })
    server(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      await writeRow(USER, 'setLogs', { id: 'l1', weightKg: 62.5 })
      return response({
        rejected: [
          { mutationId: mutationKey('setLogs', 'l1'), table: 'setLogs', rowId: 'l1', reason: 'stale', winner: { id: 'l1', weightKg: 50, updatedAt: 9 } },
        ],
      })
    })

    await sync(USER)

    expect((await getDb(USER).setLogs.get('l1'))?.weightKg).toBe(62.5)
    expect((await getDb(USER).outbox.get(mutationKey('setLogs', 'l1')))?.row.weightKg).toBe(62.5)
  })

  it('says nothing about a blank set that lost to one that was done', async () => {
    // Opening a workout pre-creates its sets; the other phone had already done this one.
    await writeRow(USER, 'setLogs', { id: 'l1', weightKg: null, reps: null, durationSec: null, completedAt: null })
    server(() =>
      response({
        rejected: [
          {
            mutationId: mutationKey('setLogs', 'l1'),
            table: 'setLogs',
            rowId: 'l1',
            reason: 'stale',
            winner: { id: 'l1', weightKg: 60, reps: 5, completedAt: 1, updatedAt: 9 },
          },
        ],
      }),
    )

    const result = await sync(USER)

    expect(result).toMatchObject({ ok: true, rejected: 0 })
    expect(await rejections(USER)).toEqual([])
    expect((await getDb(USER).setLogs.get('l1'))?.weightKg).toBe(60)
  })

  it('keeps an edit made while the request was in flight', async () => {
    await writeRow(USER, 'setLogs', { id: 'l1', weightKg: 60 })
    server(async (request) => {
      // The user taps + again before the server answers. The pause guarantees
      // the re-queue lands in a later millisecond than the original.
      await new Promise((resolve) => setTimeout(resolve, 5))
      await writeRow(USER, 'setLogs', { id: 'l1', weightKg: 62.5 })
      return acceptAll(request)
    })

    await sync(USER)

    const queued = await getDb(USER).outbox.get(mutationKey('setLogs', 'l1'))
    expect(queued?.row.weightKg).toBe(62.5)
  })
})

describe('sync — pull', () => {
  it('writes pulled rows into the local tables', async () => {
    server(() =>
      response({
        cursor: 7,
        changes: { workoutTemplates: [{ id: 't9', name: 'From laptop', updatedAt: 5, deletedAt: null }] },
      }),
    )

    const result = await sync(USER)

    expect(result).toMatchObject({ ok: true, pulled: 1 })
    expect(await getDb(USER).workoutTemplates.get('t9')).toMatchObject({ name: 'From laptop' })
  })

  it('never overwrites a row that still has an unsent local edit', async () => {
    await writeRow(USER, 'setLogs', { id: 'l1', weightKg: 100 })
    server(() =>
      response({
        // The server's older copy arrives, but the local edit was not accepted.
        changes: { setLogs: [{ id: 'l1', weightKg: 50, updatedAt: 1, deletedAt: null }] },
      }),
    )

    await sync(USER)

    expect((await getDb(USER).setLogs.get('l1'))?.weightKg).toBe(100)
  })

  it('re-pulls everything once and re-queues what it held that the server did not', async () => {
    // A device from before winners were applied: it kept the rows it lost and
    // the server holds different ones. Its outbox is empty and its cursor at 10.
    const db = getDb(USER)
    await db.meta.put({ key: 'cursor', value: 10 })
    await db.table('setLogs').put({ id: 'l1', weightKg: 55, updatedAt: 100, deletedAt: null })
    await db.table('setLogs').put({ id: 'l2', weightKg: 80, updatedAt: 100, deletedAt: null })
    const { calls } = server(() =>
      response({
        cursor: 12,
        changes: {
          setLogs: [
            // Before the cursor and different: this device lost a push for it.
            { id: 'l1', weightKg: 60, updatedAt: 200, rev: 3, deletedAt: null },
            // Before the cursor and the same write: nothing to do.
            { id: 'l2', weightKg: 80, updatedAt: 100, rev: 4, deletedAt: null },
            // After the cursor: an ordinary change from the other device.
            { id: 'l3', weightKg: 70, updatedAt: 200, rev: 12, deletedAt: null },
          ],
        },
      }),
    )

    await sync(USER)
    await sync(USER)

    expect(calls[0]?.cursor).toBe(0)
    expect((await db.setLogs.get('l1'))?.weightKg).toBe(55)
    expect(calls[1]?.mutations.map((m) => [m.rowId, m.row.weightKg])).toEqual([['l1', 55]])
    expect((await db.setLogs.get('l3'))?.weightKg).toBe(70)
    expect(calls[1]?.cursor).toBe(12)
  })

  it('remembers the cursor and sends it next time', async () => {
    const { calls } = server(() => response({ cursor: 42 }))

    await sync(USER)
    await sync(USER)

    expect(calls[1]?.cursor).toBe(42)
  })

  it('tracks the newest global library row separately from the user cursor', async () => {
    const { calls } = server(() =>
      response({
        changes: {
          exercises: [
            { id: 'a', userId: null, updatedAt: 300, deletedAt: null },
            { id: 'b', userId: null, updatedAt: 900, deletedAt: null },
            { id: 'mine', userId: USER, updatedAt: 5000, deletedAt: null },
          ],
        },
      }),
    )

    await sync(USER)
    await sync(USER)

    // The user's own exercise must not advance the global cursor.
    expect(calls[1]?.globalCursor).toBe(900)
  })

  it('records the server clock offset and corrects local timestamps with it', async () => {
    const skew = 4 * 60 * 1000 // this phone runs four minutes slow
    server(() => response({ serverTime: Date.now() + skew }))

    await sync(USER)

    const corrected = await now(getDb(USER))
    expect(corrected - Date.now()).toBeGreaterThan(skew - 1000)
    expect(corrected - Date.now()).toBeLessThan(skew + 1000)
  })

  it('stamps writes with the corrected clock', async () => {
    const skew = 60 * 60 * 1000
    server(() => response({ serverTime: Date.now() + skew }))
    await sync(USER)

    const saved = await writeRow(USER, 'bodyWeights', { id: 'bw', measuredOn: '2026-09-15', weightKg: 80 })

    expect(Number(saved.updatedAt)).toBeGreaterThan(Date.now() + skew - 1000)
  })
})

describe('sync — display unit', () => {
  it('is kilograms until the server or the user says otherwise', async () => {
    expect(await readUnit(USER)).toBe('kg')
  })

  it('takes the unit the server reports, so the other phone follows a choice made here', async () => {
    server(() => response({ unit: 'lb' }))
    await sync(USER)
    expect(await readUnit(USER)).toBe('lb')
  })

  it('applies a choice at once, pushes it on the next sync, and then stops sending it', async () => {
    await setUnit(USER, 'lb')
    expect(await readUnit(USER)).toBe('lb')

    // The server keeps what it was told, like the real one.
    let stored: 'kg' | 'lb' = 'kg'
    const { calls } = server((request) => response({ unit: (stored = request.unit ?? stored) }))
    await sync(USER)
    await sync(USER)

    expect(calls[0]?.unit).toBe('lb')
    expect(calls[1]?.unit).toBeUndefined()
    expect(await readUnit(USER)).toBe('lb')
  })

  it('keeps a choice made while the request was in flight, over what the server answered', async () => {
    await setUnit(USER, 'lb')
    const { calls } = server(async (request) => {
      await setUnit(USER, 'kg')
      return response({ unit: request.unit ?? 'kg' })
    })

    await sync(USER)
    expect(await readUnit(USER)).toBe('kg')

    await sync(USER)
    expect(calls[1]?.unit).toBe('kg')
  })

  it('sends nothing about the unit when nothing was chosen', async () => {
    const { calls } = server(acceptAll)
    await sync(USER)
    expect(calls[0]).not.toHaveProperty('unit')
  })
})

describe('sync — language', () => {
  it('has no opinion until the server or the user says, so the cookie the browser chose stands', async () => {
    expect(await readLocale(USER)).toBeNull()
  })

  it('takes the language the server reports, so the other phone follows a choice made here', async () => {
    server(() => response({ locale: 'es' }))
    await sync(USER)
    expect(await readLocale(USER)).toBe('es')
  })

  it('applies a choice at once, pushes it on the next sync, and then stops sending it', async () => {
    await setLocale(USER, 'es')
    expect(await readLocale(USER)).toBe('es')

    let stored: 'en' | 'es' = 'en'
    const { calls } = server((request) => response({ locale: (stored = request.locale ?? stored) }))
    await sync(USER)
    await sync(USER)

    expect(calls[0]?.locale).toBe('es')
    expect(calls[1]?.locale).toBeUndefined()
    expect(await readLocale(USER)).toBe('es')
  })

  it('keeps a choice made while the request was in flight, over what the server answered', async () => {
    await setLocale(USER, 'es')
    const { calls } = server(async (request) => {
      await setLocale(USER, 'en')
      return response({ locale: request.locale ?? 'en' })
    })

    await sync(USER)
    expect(await readLocale(USER)).toBe('en')

    await sync(USER)
    expect(calls[1]?.locale).toBe('en')
  })

  it('carries the unit and the language in one push, and neither when nothing was chosen', async () => {
    const { calls } = server(acceptAll)
    await sync(USER)
    expect(calls[0]).not.toHaveProperty('locale')

    await setUnit(USER, 'lb')
    await setLocale(USER, 'es')
    await sync(USER)
    expect(calls[1]).toMatchObject({ unit: 'lb', locale: 'es' })
  })
})

describe('sync — device identity and concurrency', () => {
  it('keeps the same device id across syncs', async () => {
    const db = getDb(USER)
    expect(await clientId(db)).toBe(await clientId(db))
  })

  it('collapses overlapping sync calls into one request', async () => {
    const { fetchMock } = server(acceptAll)

    await Promise.all([sync(USER), sync(USER), sync(USER)])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
