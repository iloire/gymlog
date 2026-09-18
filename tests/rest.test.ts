import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, type LocalSession, type LocalSetLog } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { clearRest, currentRest, extendRest, startRest } from '@/lib/rest'
import { deleteSession, finishSession } from '@/lib/sessions'

const USER = 'user-1'
const NOW = 1_000_000

const session: LocalSession = {
  id: 's1', userId: USER, programId: null, templateId: 'tplA', templateName: 'Full Body A',
  scheduledFor: '2026-09-14', startedAt: 1, completedAt: null, notes: null,
  createdAt: 1, updatedAt: 1, deletedAt: null,
}

const setLog = (id: string, completedAt: number | null, deletedAt: number | null = null): LocalSetLog => ({
  id, userId: USER, sessionId: 's1', exerciseId: 'ex-squat', exerciseName: 'Squat',
  position: 0, setIndex: 1, targetReps: 5, targetRepsMax: null, targetWeightKg: 60, restSec: 90,
  weightKg: completedAt ? 60 : null, reps: completedAt ? 5 : null, isWarmup: false,
  completedAt, performedAt: 1, notes: null, createdAt: 1, updatedAt: 1, deletedAt,
})

beforeEach(async () => {
  await destroyDb(USER)
  await writeRow(USER, 'sessions', session)
  // One set logged, one still to do: the ordinary mid-workout state.
  await writeRow(USER, 'setLogs', setLog('set-1', NOW))
  await writeRow(USER, 'setLogs', setLog('set-2', null))
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

  it('does not start after the last set of the workout', async () => {
    // Nothing left to rest for: Finish is what the screen offers instead.
    await writeRow(USER, 'setLogs', setLog('set-2', NOW))
    await startRest(USER, 's1', 90, NOW)
    expect(await currentRest(USER, NOW + 1_000)).toBeNull()
  })

  it('ends the rest still running from the set before, once the last set is logged', async () => {
    await startRest(USER, 's1', 180, NOW)
    await writeRow(USER, 'setLogs', setLog('set-2', NOW + 20_000))
    await startRest(USER, 's1', 180, NOW + 20_000)
    expect(await currentRest(USER, NOW + 21_000)).toBeNull()
  })

  it('still starts when the only unlogged set is one you skipped earlier', async () => {
    await writeRow(USER, 'setLogs', setLog('set-2', NOW))
    await writeRow(USER, 'setLogs', setLog('set-3', null))
    await startRest(USER, 's1', 90, NOW)
    expect(await currentRest(USER, NOW + 1_000)).not.toBeNull()
  })

  it('ignores removed sets when deciding whether anything is left', async () => {
    await writeRow(USER, 'setLogs', setLog('set-2', null, NOW))
    await startRest(USER, 's1', 90, NOW)
    expect(await currentRest(USER, NOW + 1_000)).toBeNull()
  })

  it('is per account', async () => {
    await startRest(USER, 's1', 90, NOW)
    expect(await currentRest('user-2', NOW + 1_000)).toBeNull()
  })
})

describe('extendRest', () => {
  it('adds 30 s to the clock and to the bar’s full width', async () => {
    await startRest(USER, 's1', 90, NOW)
    await extendRest(USER, NOW + 60_000)
    expect(await currentRest(USER, NOW + 61_000)).toEqual({
      sessionId: 's1',
      endsAt: NOW + 120_000,
      totalSec: 120,
    })
  })

  it('does nothing once the rest is over', async () => {
    await startRest(USER, 's1', 90, NOW)
    // A stale +30 s must not resurrect a rest that already ended and beeped.
    await extendRest(USER, NOW + 95_000)
    expect(await currentRest(USER, NOW + 96_000)).toBeNull()
  })
})
