import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { bodyWeightId, sessionId, setLogId } from '@/lib/id'
import { dateToEpoch } from '@/lib/queries'
import {
  activeSet,
  clearSet,
  finishSession,
  logSet,
  recordBodyWeight,
  rescheduleSession,
  startSession,
} from '@/lib/sessions'
import { mutationKey } from '@/lib/sync/types'

const USER = 'user-1'
const DATE = '2026-09-15'

async function givenWorkout() {
  await writeRow(USER, 'exercises', { id: 'Squat', userId: null, name: 'Barbell Squat', slug: 'squat' })
  await writeRow(USER, 'exercises', { id: 'Bench', userId: null, name: 'Bench Press', slug: 'bench' })
  await writeRow(USER, 'workoutTemplates', { id: 'tpl', name: 'Full Body A', archivedAt: null })
  await writeRow(USER, 'templateItems', {
    id: 'i1', templateId: 'tpl', exerciseId: 'Squat', position: 1,
    sets: 3, targetReps: 5, targetRepsMax: null, targetWeightKg: 60, restSec: 180,
  })
  await writeRow(USER, 'templateItems', {
    id: 'i2', templateId: 'tpl', exerciseId: 'Bench', position: 2,
    sets: 2, targetReps: 8, targetRepsMax: 12, targetWeightKg: null, restSec: 90,
  })
}

const logsFor = async (id: string) =>
  (await getDb(USER).setLogs.where('sessionId').equals(id).toArray()).sort(
    (a, b) => a.position - b.position || a.setIndex - b.setIndex,
  )

beforeEach(async () => {
  await destroyDb(USER)
  await givenWorkout()
})

describe('startSession', () => {
  it('creates the session under its deterministic id', async () => {
    const id = await startSession(USER, 'tpl', 'prog', DATE)

    expect(id).toBe(sessionId(USER, DATE, 'tpl'))
    expect(await getDb(USER).sessions.get(id)).toMatchObject({
      templateId: 'tpl',
      programId: 'prog',
      scheduledFor: DATE,
      completedAt: null,
    })
  })

  it('pre-creates one pending row per prescribed set', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const logs = await logsFor(id)

    expect(logs).toHaveLength(5) // 3 squat + 2 bench
    expect(logs.every((log) => log.completedAt === null)).toBe(true)
    expect(logs.map((log) => `${log.exerciseId}#${log.setIndex}`)).toEqual([
      'Squat#1', 'Squat#2', 'Squat#3', 'Bench#1', 'Bench#2',
    ])
  })

  it('uses deterministic set ids so two devices merge rather than duplicate', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const logs = await logsFor(id)

    expect(logs[0]?.id).toBe(setLogId(id, 'Squat', 1))
  })

  it('snapshots the prescription onto each set', async () => {
    const logs = await logsFor(await startSession(USER, 'tpl', null, DATE))

    expect(logs[0]).toMatchObject({ targetReps: 5, targetWeightKg: 60, restSec: 180 })
    expect(logs[3]).toMatchObject({ targetReps: 8, targetRepsMax: 12, restSec: 90 })
  })

  it('snapshots names, so renaming things later does not rewrite history', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    await writeRow(USER, 'workoutTemplates', { id: 'tpl', name: 'Renamed' })
    await writeRow(USER, 'exercises', { id: 'Squat', name: 'Renamed Squat' })

    expect((await getDb(USER).sessions.get(id))?.templateName).toBe('Full Body A')
    expect((await logsFor(id))[0]?.exerciseName).toBe('Barbell Squat')
  })

  it('stamps every set with the local midnight of the session date', async () => {
    const logs = await logsFor(await startSession(USER, 'tpl', null, DATE))
    expect(new Set(logs.map((log) => log.performedAt))).toEqual(new Set([dateToEpoch(DATE)]))
  })

  it('is idempotent: re-opening keeps logged sets and adds no duplicates', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })
    const startedAt = (await getDb(USER).sessions.get(id))?.startedAt

    await startSession(USER, 'tpl', null, DATE)

    const logs = await logsFor(id)
    expect(logs).toHaveLength(5)
    expect(logs[0]).toMatchObject({ weightKg: 60, reps: 5 })
    expect((await getDb(USER).sessions.get(id))?.startedAt).toBe(startedAt)
  })

  it('adds sets for an exercise appended to the template after starting', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    await writeRow(USER, 'exercises', { id: 'Row', name: 'Row', slug: 'row' })
    await writeRow(USER, 'templateItems', {
      id: 'i3', templateId: 'tpl', exerciseId: 'Row', position: 3,
      sets: 1, targetReps: 10, targetRepsMax: null, targetWeightKg: null, restSec: 60,
    })

    await startSession(USER, 'tpl', null, DATE)

    expect(await logsFor(id)).toHaveLength(6)
  })

  it('ignores exercises removed from the template', async () => {
    await writeRow(USER, 'templateItems', { id: 'i2', deletedAt: 1 })

    const logs = await logsFor(await startSession(USER, 'tpl', null, DATE))

    expect(logs.map((log) => log.exerciseId)).toEqual(['Squat', 'Squat', 'Squat'])
  })

  it('gives the same template on another day its own session', async () => {
    const a = await startSession(USER, 'tpl', null, '2026-09-15')
    const b = await startSession(USER, 'tpl', null, '2026-09-17')
    expect(a).not.toBe(b)
  })
})

describe('logging sets', () => {
  it('records weight, reps and completion, and queues it for sync', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)

    await logSet(USER, set!, { weightKg: 62.5, reps: 5 })

    const saved = await getDb(USER).setLogs.get(set!.id)
    expect(saved).toMatchObject({ weightKg: 62.5, reps: 5 })
    expect(saved?.completedAt).toBeTypeOf('number')
    expect(await getDb(USER).outbox.get(mutationKey('setLogs', set!.id))).toBeDefined()
  })

  it('undoes a set by clearing its completion but keeping the numbers', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)
    await logSet(USER, set!, { weightKg: 60, reps: 5 })

    await clearSet(USER, (await getDb(USER).setLogs.get(set!.id))!)

    expect(await getDb(USER).setLogs.get(set!.id)).toMatchObject({ completedAt: null, weightKg: 60 })
  })

  it('keeps when a set was done when it is corrected later', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)
    await logSet(USER, set!, { weightKg: 60, reps: 8 })
    const logged = (await getDb(USER).setLogs.get(set!.id))!

    await logSet(USER, logged, { weightKg: 60, reps: 6 })

    expect(await getDb(USER).setLogs.get(set!.id)).toMatchObject({
      reps: 6,
      completedAt: logged.completedAt,
    })
  })

  it('finishes a session', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    await finishSession(USER, (await getDb(USER).sessions.get(id))!)
    expect((await getDb(USER).sessions.get(id))?.completedAt).toBeTypeOf('number')
  })
})

describe('rescheduleSession', () => {
  it('moves the session and every set, keeping "last time" queries correct', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const session = (await getDb(USER).sessions.get(id))!

    await rescheduleSession(USER, session, '2026-09-14')

    expect((await getDb(USER).sessions.get(id))?.scheduledFor).toBe('2026-09-14')
    const performed = new Set((await logsFor(id)).map((log) => log.performedAt))
    expect(performed).toEqual(new Set([dateToEpoch('2026-09-14')]))
  })
})

describe('recordBodyWeight', () => {
  it('keeps one entry per day — re-entering corrects it', async () => {
    await recordBodyWeight(USER, 80.4, DATE)
    await recordBodyWeight(USER, 79.9, DATE)

    const rows = await getDb(USER).bodyWeights.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: bodyWeightId(USER, DATE), weightKg: 79.9 })
  })

  it('keeps separate days separate', async () => {
    await recordBodyWeight(USER, 80, '2026-09-14')
    await recordBodyWeight(USER, 79.8, '2026-09-15')
    expect(await getDb(USER).bodyWeights.count()).toBe(2)
  })
})

describe('activeSet', () => {
  it('edits the next set to do, then the last set once all are done', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first, second, third] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })

    const squat = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')
    expect(activeSet(squat, null)?.id).toBe(second!.id)

    await logSet(USER, squat[1]!, { weightKg: 60, reps: 5 })
    await logSet(USER, squat[2]!, { weightKg: 60, reps: 5 })
    const done = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')
    expect(activeSet(done, null)?.id).toBe(third!.id)
  })

  it('edits a tapped set that is already logged', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })
    const squat = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')

    expect(activeSet(squat, first!.id)?.id).toBe(first!.id)
  })

  it('ignores a selection left over from another exercise', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const logs = await logsFor(id)
    const squat = logs.filter((log) => log.exerciseId === 'Squat')
    const bench = logs.filter((log) => log.exerciseId === 'Bench')

    expect(activeSet(bench, squat[0]!.id)?.id).toBe(bench[0]!.id)
  })
})
