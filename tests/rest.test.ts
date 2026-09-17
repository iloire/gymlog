import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, type LocalSession } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { clearRest, currentRest, startRest } from '@/lib/rest'
import { deleteSession, finishSession } from '@/lib/sessions'

const USER = 'user-1'
const NOW = 1_000_000

const session: LocalSession = {
  id: 's1', userId: USER, programId: null, templateId: 'tplA', templateName: 'Full Body A',
  scheduledFor: '2026-09-14', startedAt: 1, completedAt: null, notes: null,
  createdAt: 1, updatedAt: 1, deletedAt: null,
}

beforeEach(async () => {
  await destroyDb(USER)
  await writeRow(USER, 'sessions', session)
})

describe('currentRest', () => {
  it('outlives the screen that started it', async () => {
    await startRest(USER, 's1', 90, NOW)

    // Nothing but the database is asked, so any screen — or a reopened app — sees the same rest.
    expect(await currentRest(USER, NOW + 30_000)).toEqual({
      sessionId: 's1',
      endsAt: NOW + 90_000,
      totalSec: 90,
    })
  })

  it('is over once the time is up, so reopening the app later does not beep', async () => {
    await startRest(USER, 's1', 90, NOW)
    expect(await currentRest(USER, NOW + 90_000)).toBeNull()
  })

  it('is replaced by the next set’s rest', async () => {
    await startRest(USER, 's1', 90, NOW)
    await startRest(USER, 's1', 120, NOW + 60_000)
    expect(await currentRest(USER, NOW + 61_000)).toMatchObject({ endsAt: NOW + 180_000, totalSec: 120 })
  })

  it('ends with the workout, finished or deleted', async () => {
    await startRest(USER, 's1', 90, NOW)
    await finishSession(USER, session)
    expect(await currentRest(USER, NOW + 1_000)).toBeNull()

    await writeRow(USER, 'sessions', session)
    expect(await currentRest(USER, NOW + 1_000)).not.toBeNull()
    await deleteSession(USER, 's1')
    expect(await currentRest(USER, NOW + 1_000)).toBeNull()
  })

  it('clears', async () => {
    await startRest(USER, 's1', 90, NOW)
    await clearRest(USER)
    expect(await currentRest(USER, NOW + 1_000)).toBeNull()
  })

  it('is per account', async () => {
    await startRest(USER, 's1', 90, NOW)
    expect(await currentRest('user-2', NOW + 1_000)).toBeNull()
  })
})
