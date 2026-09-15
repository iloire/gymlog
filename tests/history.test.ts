import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, type LocalSession, type LocalSetLog, type LocalWorkoutTemplate } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { daysAgo, daysBetween, rotation, sessionHistory, summariseSession } from '@/lib/history'
import { setLogId } from '@/lib/id'
import { logSet, startSession } from '@/lib/sessions'

const USER = 'user-1'

const session = (overrides: Partial<LocalSession> = {}): LocalSession => ({
  id: 's1', userId: USER, programId: null, templateId: 'tplA', templateName: 'Full Body A',
  scheduledFor: '2026-09-14', startedAt: 1, completedAt: null, notes: null,
  createdAt: 1, updatedAt: 1, deletedAt: null, ...overrides,
})

const set = (overrides: Partial<LocalSetLog>): LocalSetLog => ({
  id: `${overrides.exerciseId}-${overrides.setIndex}`, userId: USER, sessionId: 's1',
  exerciseId: 'Squat', exerciseName: 'Barbell Squat', position: 1, setIndex: 1,
  targetReps: 5, targetRepsMax: null, targetWeightKg: null, restSec: 90,
  weightKg: null, reps: null, isWarmup: false, completedAt: null, performedAt: 0, notes: null,
  createdAt: 1, updatedAt: 1, deletedAt: null, ...overrides,
})

const template = (id: string, name: string, overrides: Partial<LocalWorkoutTemplate> = {}): LocalWorkoutTemplate => ({
  id, userId: USER, name, notes: null, archivedAt: null, createdAt: 1, updatedAt: 1, deletedAt: null,
  ...overrides,
})

describe('summariseSession', () => {
  it('counts logged sets against planned, and sums working volume', () => {
    const entry = summariseSession(session(), [
      set({ exerciseId: 'Squat', setIndex: 1, weightKg: 60, reps: 5, completedAt: 1_000 }),
      set({ exerciseId: 'Squat', setIndex: 2, weightKg: 20, reps: 10, completedAt: 500, isWarmup: true }),
      set({ exerciseId: 'Squat', setIndex: 3 }),
      set({ exerciseId: 'Bench', exerciseName: 'Bench Press', position: 2, setIndex: 1, weightKg: 40, reps: 8, completedAt: 400_000 }),
    ])

    expect(entry.setsDone).toBe(3)
    expect(entry.setsPlanned).toBe(4)
    expect(entry.volumeKg).toBe(60 * 5 + 40 * 8)
    expect(entry.durationMs).toBe(400_000 - 500)
  })

  it('groups logged sets by exercise in workout order, skipping unlogged and deleted sets', () => {
    const entry = summariseSession(session(), [
      set({ exerciseId: 'Bench', exerciseName: 'Bench Press', position: 2, setIndex: 1, reps: 8, completedAt: 3 }),
      set({ exerciseId: 'Squat', setIndex: 2, reps: 5, completedAt: 2 }),
      set({ exerciseId: 'Squat', setIndex: 1, reps: 5, completedAt: 1 }),
      set({ exerciseId: 'Squat', setIndex: 3, reps: 5, completedAt: 4, deletedAt: 9 }),
      set({ exerciseId: 'Row', exerciseName: 'Row', position: 3, setIndex: 1 }),
    ])

    expect(entry.exercises.map((e) => [e.name, e.sets.map((s) => s.setIndex)])).toEqual([
      ['Barbell Squat', [1, 2]],
      ['Bench Press', [1]],
    ])
  })

  it('has no duration with a single logged set', () => {
    const entry = summariseSession(session(), [set({ reps: 5, completedAt: 1 })])
    expect(entry.durationMs).toBeNull()
  })
})

describe('sessionHistory', () => {
  beforeEach(async () => {
    await destroyDb(USER)
    await writeRow(USER, 'exercises', { id: 'Squat', userId: null, name: 'Barbell Squat', slug: 'squat' })
    for (const id of ['tplA', 'tplB']) {
      await writeRow(USER, 'workoutTemplates', { id, name: id, archivedAt: null })
      await writeRow(USER, 'templateItems', {
        id: `${id}-1`, templateId: id, exerciseId: 'Squat', position: 1,
        sets: 2, targetReps: 5, targetRepsMax: null, targetWeightKg: null, restSec: 90,
      })
    }
  })

  const logFirstSet = async (sessionId: string) => {
    const { getDb } = await import('@/lib/db/dexie')
    const log = await getDb(USER).setLogs.get(setLogId(sessionId, 'Squat', 1))
    await logSet(USER, log!, { weightKg: 60, reps: 5 })
  }

  it('lists trained sessions newest first and leaves out ones never lifted in', async () => {
    const older = await startSession(USER, 'tplA', null, '2026-09-10')
    const newer = await startSession(USER, 'tplB', null, '2026-09-12')
    await startSession(USER, 'tplA', null, '2026-09-14') // opened, nothing logged
    await logFirstSet(older)
    await logFirstSet(newer)

    const history = await sessionHistory(USER)

    expect(history.map((entry) => entry.session.id)).toEqual([newer, older])
    expect(history[0]).toMatchObject({ setsDone: 1, setsPlanned: 2, volumeKg: 300 })
  })

  it('drops a deleted session', async () => {
    const id = await startSession(USER, 'tplA', null, '2026-09-10')
    await logFirstSet(id)
    await deleteRow(USER, 'sessions', id)

    expect(await sessionHistory(USER)).toEqual([])
  })
})

describe('rotation', () => {
  const entry = (templateId: string, scheduledFor: string) =>
    summariseSession(session({ id: `${templateId}-${scheduledFor}`, templateId, scheduledFor }), [])

  it('puts the workout you have gone longest without first', () => {
    // Newest first, as sessionHistory returns it: A was done most recently.
    const history = [entry('A', '2026-09-14'), entry('B', '2026-09-12'), entry('C', '2026-09-10'), entry('A', '2026-09-08')]

    const order = rotation([template('A', 'A'), template('B', 'B'), template('C', 'C')], history)

    expect(order.map((r) => [r.template.id, r.lastDone])).toEqual([
      ['C', '2026-09-10'],
      ['B', '2026-09-12'],
      ['A', '2026-09-14'],
    ])
  })

  it('puts never-done workouts first and hides archived and deleted ones', () => {
    const order = rotation(
      [
        template('A', 'Legs'),
        template('B', 'Arms'),
        template('C', 'Old', { archivedAt: 5 }),
        template('D', 'Gone', { deletedAt: 5 }),
      ],
      [entry('A', '2026-09-14')],
    )

    expect(order.map((r) => r.template.name)).toEqual(['Arms', 'Legs'])
  })
})

describe('daysAgo', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysAgo('2026-09-15', '2026-09-15')).toBe('today')
    expect(daysAgo('2026-09-14', '2026-09-15')).toBe('yesterday')
    expect(daysAgo('2026-09-01', '2026-09-15')).toBe('14 days ago')
  })

  it('is exact across a daylight-saving change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})
