import { beforeEach, describe, expect, it } from 'vitest'

import { getDb, destroyDb } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { mutationKey } from '@/lib/sync/types'

const USER = 'user-1'

describe('outbox', () => {
  beforeEach(async () => {
    await destroyDb(USER)
  })

  it('keeps one queued mutation per row, however often the row is edited', async () => {
    // The bug this guards: a new outbox entry per edit means five supersed
    // copies of one set, re-sent and rejected as stale on every sync, and a
    // "changes waiting" count that never reaches zero.
    for (const weightKg of [60, 62.5, 65, 67.5, 70]) {
      await writeRow(USER, 'setLogs', { id: 'set-1', weightKg, reps: 8 })
    }

    const db = getDb(USER)
    const queued = await db.outbox.toArray()

    expect(queued).toHaveLength(1)
    expect(queued[0]?.id).toBe(mutationKey('setLogs', 'set-1'))
    expect(queued[0]?.row.weightKg).toBe(70)
  })

  it('writes the row and its mutation together', async () => {
    await writeRow(USER, 'bodyWeights', { id: 'bw-1', measuredOn: '2026-09-15', weightKg: 78.4 })

    const db = getDb(USER)
    expect(await db.bodyWeights.get('bw-1')).toMatchObject({ weightKg: 78.4, userId: USER })
    expect(await db.outbox.get(mutationKey('bodyWeights', 'bw-1'))).toBeDefined()
  })

  it('queues a delete as a tombstone, never removing the row locally', async () => {
    await writeRow(USER, 'workoutTemplates', { id: 'tpl-1', name: 'Full Body A' })
    await deleteRow(USER, 'workoutTemplates', 'tpl-1')

    const db = getDb(USER)
    const row = await db.workoutTemplates.get('tpl-1')
    const queued = await db.outbox.get(mutationKey('workoutTemplates', 'tpl-1'))

    // An offline device has to learn about the deletion, so it must travel.
    expect(row?.deletedAt).toBeTypeOf('number')
    expect(queued?.row.deletedAt).toBe(row?.deletedAt)
  })

  it('preserves createdAt across edits but moves updatedAt', async () => {
    const first = await writeRow(USER, 'setLogs', { id: 'set-2', reps: 5 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await writeRow(USER, 'setLogs', { id: 'set-2', reps: 6 })

    expect(second.createdAt).toBe(first.createdAt)
    expect(Number(second.updatedAt)).toBeGreaterThan(Number(first.updatedAt))
  })
})
