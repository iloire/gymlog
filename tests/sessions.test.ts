import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { bodyWeightId, sessionId, setLogId } from '@/lib/id'
import { dateToEpoch } from '@/lib/queries'
import { currentRest, startRest } from '@/lib/rest'
import {
  activeSet,
  addSet,
  addToSession,
  canSelectSet,
  deleteSession,
  doExerciseToday,
  finishSession,
  logSet,
  recordBodyWeight,
  removeFromSession,
  reopenSession,
  rescheduleSession,
  restoreSet,
  skipSet,
  startSession,
  unlogSet,
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

  it('saves a note on the exercise without touching the set logged on the same row', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)
    await logSet(USER, set!, { weightKg: 100, reps: 3 })

    // Exactly the write the note field makes.
    await writeRow(USER, 'setLogs', { id: set!.id, notes: 'Close to my limit' })

    expect(await getDb(USER).setLogs.get(set!.id)).toMatchObject({
      weightKg: 100,
      reps: 3,
      completedAt: expect.any(Number),
      notes: 'Close to my limit',
    })
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

  it('takes a logged set back to still-to-do, keeping the prescription and the note', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)
    await logSet(USER, set!, { weightKg: 60, reps: 5 })
    await writeRow(USER, 'setLogs', { id: set!.id, effort: 'hard', notes: 'Belt on' })

    await unlogSet(USER, (await getDb(USER).setLogs.get(set!.id))!)

    expect(await getDb(USER).setLogs.get(set!.id)).toMatchObject({
      weightKg: null,
      reps: null,
      effort: null,
      completedAt: null,
      targetWeightKg: 60,
      targetReps: 5,
      notes: 'Belt on',
      deletedAt: null,
    })
    expect(await getDb(USER).outbox.get(mutationKey('setLogs', set!.id))).toBeDefined()
    expect(activeSet(await logsFor(id), null)?.id).toBe(set!.id)
  })

  it('ends the rest the undone set started', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)
    await logSet(USER, set!, { weightKg: 60, reps: 5 })
    await startRest(USER, id, 180)
    expect(await currentRest(USER)).not.toBeNull()

    await unlogSet(USER, set!)

    expect(await currentRest(USER)).toBeNull()
  })

  it('finishes a session', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    await finishSession(USER, (await getDb(USER).sessions.get(id))!)
    expect((await getDb(USER).sessions.get(id))?.completedAt).toBeTypeOf('number')
  })

  it('reopens a finished session, keeping its sets', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [set] = await logsFor(id)
    await logSet(USER, set!, { weightKg: 60, reps: 5 })
    await finishSession(USER, (await getDb(USER).sessions.get(id))!)

    await reopenSession(USER, (await getDb(USER).sessions.get(id))!)

    expect((await getDb(USER).sessions.get(id))?.completedAt).toBeNull()
    expect(await getDb(USER).setLogs.get(set!.id)).toMatchObject({ weightKg: 60, reps: 5 })
  })
})

describe('cardio', () => {
  const stairmaster = { id: 'Stairmaster', userId: null, name: 'Stairmaster', slug: 'stairmaster', category: 'cardio' }

  it('snapshots the minutes a workout prescribes, and logs time instead of weight × reps', async () => {
    await writeRow(USER, 'exercises', stairmaster)
    await writeRow(USER, 'templateItems', {
      id: 'i0', templateId: 'tpl', exerciseId: 'Stairmaster', position: 0,
      sets: 1, targetReps: 1, targetRepsMax: null, targetWeightKg: null, targetDurationSec: 600, restSec: 60,
    })
    const id = await startSession(USER, 'tpl', null, DATE)
    const [warmUp, squat] = await logsFor(id)

    expect(warmUp).toMatchObject({ exerciseId: 'Stairmaster', targetDurationSec: 600, durationSec: null })
    expect(squat).toMatchObject({ exerciseId: 'Squat', targetDurationSec: null })

    await logSet(USER, warmUp!, { weightKg: null, reps: null, durationSec: 480 })
    expect(await getDb(USER).setLogs.get(warmUp!.id)).toMatchObject({ durationSec: 480, completedAt: expect.any(Number) })
  })

  it('adds cardio to a session under way as one timed set at the end, and never twice', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const session = (await getDb(USER).sessions.get(id))!
    await writeRow(USER, 'exercises', stairmaster)
    const exercise = (await getDb(USER).exercises.get('Stairmaster'))!

    expect(await addToSession(USER, session, exercise)).toBe(3)
    expect(await addToSession(USER, session, exercise)).toBe(3)

    const added = (await logsFor(id)).filter((log) => log.exerciseId === 'Stairmaster')
    expect(added).toEqual([
      expect.objectContaining({
        id: setLogId(id, 'Stairmaster', 1),
        position: 3,
        restSec: null,
        performedAt: dateToEpoch(DATE),
        completedAt: null,
      }),
    ])
    expect(await getDb(USER).outbox.get(mutationKey('setLogs', added[0]!.id))).toBeDefined()
  })

  it('adds any other exercise as three sets with rest', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const session = (await getDb(USER).sessions.get(id))!
    await writeRow(USER, 'exercises', { id: 'Row', userId: null, name: 'Barbell Row', slug: 'row', category: 'strength' })

    await addToSession(USER, session, (await getDb(USER).exercises.get('Row'))!)

    const added = (await logsFor(id)).filter((log) => log.exerciseId === 'Row')
    expect(added.map((log) => [log.setIndex, log.restSec])).toEqual([[1, 90], [2, 90], [3, 90]])
  })
})

describe('addSet', () => {
  it('adds a fourth set after the third, with its prescription and a deterministic id', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const squats = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')

    const added = await addSet(USER, squats)

    expect(added.id).toBe(setLogId(id, 'Squat', 4))
    expect(added).toMatchObject({
      setIndex: 4,
      position: 1,
      exerciseName: 'Barbell Squat',
      targetReps: 5,
      targetWeightKg: 60,
      restSec: 180,
      completedAt: null,
      performedAt: squats[0]!.performedAt,
    })
    expect((await logsFor(id)).filter((log) => log.exerciseId === 'Squat')).toHaveLength(4)
    expect(await getDb(USER).outbox.get(mutationKey('setLogs', added.id))).toBeDefined()
  })

  it('takes an added set back, and brings the same row back when it is added again', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const squats = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')
    const added = await addSet(USER, squats)

    await skipSet(USER, added)
    expect((await getDb(USER).setLogs.get(added.id))?.deletedAt).toBeTypeOf('number')

    const again = await addSet(USER, squats)
    expect(again.id).toBe(added.id)
    expect(again.deletedAt).toBeNull()
  })
})

describe('skipSet', () => {
  it('soft-deletes the set and keeps the rest running while sets are left', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first, second] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })
    await startRest(USER, id, 180)

    await skipSet(USER, second!)

    expect((await getDb(USER).setLogs.get(second!.id))?.deletedAt).toBeTypeOf('number')
    expect(await currentRest(USER)).not.toBeNull()
    expect(activeSet(await logsFor(id).then((logs) => logs.filter((log) => log.deletedAt === null)), null)?.setIndex).toBe(3)
  })

  it('comes back on Undo, still to do, and stays skipped when the workout is opened again', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [, second] = await logsFor(id)
    await skipSet(USER, second!)

    await startSession(USER, 'tpl', null, DATE)
    expect((await getDb(USER).setLogs.get(second!.id))?.deletedAt).toBeTypeOf('number')

    await restoreSet(USER, second!.id)
    expect(await getDb(USER).setLogs.get(second!.id)).toMatchObject({ deletedAt: null, completedAt: null })
  })

  it('ends the rest once the skipped set was the last one to do', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const logs = await logsFor(id)
    for (const log of logs.slice(0, -1)) await logSet(USER, log!, { weightKg: 60, reps: 5 })
    await startRest(USER, id, 180)
    expect(await currentRest(USER)).not.toBeNull()

    await skipSet(USER, logs.at(-1)!)

    expect(await currentRest(USER)).toBeNull()
  })
})

describe('removeFromSession', () => {
  it('soft-deletes every set of the exercise, logged or not, and queues each for sync', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })

    await removeFromSession(USER, id, 'Squat')

    const logs = await logsFor(id)
    const squats = logs.filter((log) => log.exerciseId === 'Squat')
    expect(squats).toHaveLength(3)
    expect(squats.every((log) => typeof log.deletedAt === 'number')).toBe(true)
    for (const log of squats) {
      expect((await getDb(USER).outbox.get(mutationKey('setLogs', log.id)))?.row.deletedAt).toBe(log.deletedAt)
    }
    expect(logs.filter((log) => log.exerciseId === 'Bench').map((log) => log.deletedAt)).toEqual([null, null])
  })

  it('stays removed when the workout is opened again', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    await removeFromSession(USER, id, 'Squat')

    await startSession(USER, 'tpl', null, DATE)

    const live = (await logsFor(id)).filter((log) => log.deletedAt === null)
    expect(live.map((log) => log.exerciseId)).toEqual(['Bench', 'Bench'])
  })

  it('comes back as fresh sets when the exercise is added again', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })
    await removeFromSession(USER, id, 'Squat')

    const session = (await getDb(USER).sessions.get(id))!
    await addToSession(USER, session, (await getDb(USER).exercises.get('Squat'))!)

    const squats = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')
    expect(squats.map((log) => [log.deletedAt, log.position, log.completedAt, log.weightKg])).toEqual([
      [null, 3, null, null],
      [null, 3, null, null],
      [null, 3, null, null],
    ])
  })
})

describe('deleteSession', () => {
  it('soft-deletes the session with every set in it, and queues each for sync', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })

    await deleteSession(USER, id)

    const session = (await getDb(USER).sessions.get(id))!
    expect(session.deletedAt).toBeTypeOf('number')
    expect((await getDb(USER).outbox.get(mutationKey('sessions', id)))?.row.deletedAt).toBe(session.deletedAt)
    for (const log of await logsFor(id)) {
      expect(log.deletedAt).toBeTypeOf('number')
      expect((await getDb(USER).outbox.get(mutationKey('setLogs', log.id)))?.row.deletedAt).toBe(log.deletedAt)
    }
  })

  it('comes back as a fresh workout when the same one is started again', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first] = await logsFor(id)
    await logSet(USER, first!, { weightKg: 60, reps: 5 })
    await finishSession(USER, (await getDb(USER).sessions.get(id))!)
    await deleteSession(USER, id)

    expect(await startSession(USER, 'tpl', null, DATE)).toBe(id)

    expect(await getDb(USER).sessions.get(id)).toMatchObject({ deletedAt: null, completedAt: null })
    const live = (await logsFor(id)).filter((log) => log.deletedAt === null)
    expect(live).toHaveLength(5)
    expect(live.every((log) => log.completedAt === null && log.weightKg === null)).toBe(true)
  })
})

describe('doExerciseToday', () => {
  const curl = async () => {
    await writeRow(USER, 'exercises', { id: 'Curl', userId: null, name: 'Barbell Curl', slug: 'curl', category: 'strength' })
    return (await getDb(USER).exercises.get('Curl'))!
  }

  it('opens an Extra session for today when none is open, leaving the plan alone', async () => {
    const templateItemsBefore = await getDb(USER).templateItems.toArray()

    const { sessionId: id, position } = await doExerciseToday(USER, await curl(), DATE)

    expect(id).toBe(sessionId(USER, DATE, 'extra'))
    expect(await getDb(USER).sessions.get(id)).toMatchObject({
      templateId: null,
      programId: null,
      templateName: 'Extra',
      scheduledFor: DATE,
      completedAt: null,
    })
    expect((await logsFor(id)).map((log) => [log.exerciseId, log.position])).toEqual([
      ['Curl', position], ['Curl', position], ['Curl', position],
    ])
    expect(await getDb(USER).templateItems.toArray()).toEqual(templateItemsBefore)
    expect(await getDb(USER).programs.count()).toBe(0)
  })

  it('reuses the day’s Extra session for the next exercise', async () => {
    const first = await doExerciseToday(USER, await curl(), DATE)
    await writeRow(USER, 'exercises', { id: 'Row', userId: null, name: 'Barbell Row', slug: 'row' })
    const second = await doExerciseToday(USER, (await getDb(USER).exercises.get('Row'))!, DATE)

    expect(second.sessionId).toBe(first.sessionId)
    expect(second.position).toBe(first.position + 1)
  })

  it('joins the workout already open today instead, but not a finished one or another day', async () => {
    const workout = await startSession(USER, 'tpl', null, DATE)
    expect((await doExerciseToday(USER, await curl(), DATE)).sessionId).toBe(workout)

    await finishSession(USER, (await getDb(USER).sessions.get(workout))!)
    await writeRow(USER, 'exercises', { id: 'Row', userId: null, name: 'Barbell Row', slug: 'row' })
    const row = (await getDb(USER).exercises.get('Row'))!
    expect((await doExerciseToday(USER, row, DATE)).sessionId).toBe(sessionId(USER, DATE, 'extra'))
    expect((await doExerciseToday(USER, row, '2026-09-16')).sessionId).toBe(sessionId(USER, '2026-09-16', 'extra'))
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

  it('will not skip ahead: a set past the next one to do cannot be picked', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const [first, second, third] = await logsFor(id)
    const squat = [first!, second!, third!]

    expect(canSelectSet(squat, third!)).toBe(false)
    expect(activeSet(squat, third!.id)?.id).toBe(first!.id)

    await logSet(USER, first!, { weightKg: 60, reps: 5 })
    const after = (await logsFor(id)).filter((log) => log.exerciseId === 'Squat')
    expect(canSelectSet(after, after[0]!)).toBe(true)
    expect(canSelectSet(after, after[1]!)).toBe(true)
    expect(activeSet(after, third!.id)?.id).toBe(second!.id)
  })

  it('ignores a selection left over from another exercise', async () => {
    const id = await startSession(USER, 'tpl', null, DATE)
    const logs = await logsFor(id)
    const squat = logs.filter((log) => log.exerciseId === 'Squat')
    const bench = logs.filter((log) => log.exerciseId === 'Bench')

    expect(activeSet(bench, squat[0]!.id)?.id).toBe(bench[0]!.id)
  })
})
