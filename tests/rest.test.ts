import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb, type LocalSession, type LocalSetLog, type LocalTemplateItem } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { changeRest, clearRest, currentRest, extendRest, startRest } from '@/lib/rest'
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

const item: LocalTemplateItem = {
  id: 'item-squat', userId: USER, templateId: 'tplA', exerciseId: 'ex-squat', position: 0,
  sets: 2, targetReps: 5, targetRepsMax: null, targetWeightKg: 60, targetDurationSec: null, restSec: 90,
  notes: null, createdAt: 1, updatedAt: 1, deletedAt: null,
}

beforeEach(async () => {
  await destroyDb(USER)
  await writeRow(USER, 'templateItems', item)
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

describe('changeRest', () => {
  it('lands on the exercise’s sets, its template item and the clock under way', async () => {
    await startRest(USER, 's1', 90, NOW)
    await changeRest(USER, setLog('set-2', null), 120, NOW + 60_000)

    const db = getDb(USER)
    expect((await db.setLogs.get('set-1'))?.restSec).toBe(120)
    expect((await db.setLogs.get('set-2'))?.restSec).toBe(120)
    // The next session starts from the new rest, and the other phone hears of it.
    expect((await db.templateItems.get('item-squat'))?.restSec).toBe(120)
    expect(await db.outbox.count()).toBeGreaterThan(0)
    // 30 s more to rest, from the same place in the bar.
    expect(await currentRest(USER, NOW + 61_000)).toEqual({ sessionId: 's1', endsAt: NOW + 120_000, totalSec: 120 })
  })

  it('ends the rest quietly when shortened past the time already spent', async () => {
    await startRest(USER, 's1', 90, NOW)
    await changeRest(USER, setLog('set-2', null), 30, NOW + 60_000)
    expect(await currentRest(USER, NOW + 61_000)).toBeNull()
    expect((await getDb(USER).setLogs.get('set-2'))?.restSec).toBe(30)
  })

  it('leaves other exercises, removed sets and another session’s rest alone', async () => {
    await writeRow(USER, 'setLogs', { ...setLog('set-3', null), exerciseId: 'ex-bench', exerciseName: 'Bench' })
    await writeRow(USER, 'setLogs', setLog('set-4', null, NOW))
    await writeRow(USER, 'templateItems', { ...item, id: 'item-bench', exerciseId: 'ex-bench', position: 1 })
    await writeRow(USER, 'sessions', { ...session, id: 's2', scheduledFor: '2026-09-15' })
    await writeRow(USER, 'setLogs', { ...setLog('set-5', null), sessionId: 's2' })
    await startRest(USER, 's2', 90, NOW)

    await changeRest(USER, setLog('set-2', null), 120, NOW + 10_000)

    const db = getDb(USER)
    expect((await db.setLogs.get('set-3'))?.restSec).toBe(90)
    expect((await db.setLogs.get('set-4'))?.restSec).toBe(90)
    expect((await db.setLogs.get('set-5'))?.restSec).toBe(90)
    expect((await db.templateItems.get('item-bench'))?.restSec).toBe(90)
    expect(await currentRest(USER, NOW + 11_000)).toMatchObject({ sessionId: 's2', endsAt: NOW + 90_000 })
  })

  it('changes only today’s sets for a workout started without a template', async () => {
    await writeRow(USER, 'sessions', { ...session, templateId: null })
    await changeRest(USER, setLog('set-2', null), 120, NOW)
    const db = getDb(USER)
    expect((await db.setLogs.get('set-2'))?.restSec).toBe(120)
    expect((await db.templateItems.get('item-squat'))?.restSec).toBe(90)
  })
})
