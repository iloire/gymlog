import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { templateItems } from '@/lib/queries'
import { mutationKey } from '@/lib/sync/types'
import { duplicateWorkout } from '@/lib/workouts'

const USER = 'user-1'

async function seedWorkout() {
  await writeRow(USER, 'workoutTemplates', { id: 'push', name: 'Push', notes: 'Heavy', archivedAt: null })
  const item = (id: string, exerciseId: string, position: number) =>
    writeRow(USER, 'templateItems', {
      id,
      templateId: 'push',
      exerciseId,
      position,
      sets: 5,
      targetReps: 5,
      targetRepsMax: 8,
      targetWeightKg: 60,
      restSec: 180,
      notes: 'Pause at the bottom',
    })
  await item('i-bench', 'Bench', 1)
  await item('i-ohp', 'Overhead Press', 2)
  await item('i-dips', 'Dips', 3)
  await deleteRow(USER, 'templateItems', 'i-dips')
}

beforeEach(async () => {
  await destroyDb(USER)
})

describe('duplicateWorkout', () => {
  it('copies the workout and its live exercises, in order, under new ids', async () => {
    await seedWorkout()

    const copyId = await duplicateWorkout(USER, 'push')

    expect(copyId).not.toBe('push')
    expect(await getDb(USER).workoutTemplates.get(copyId)).toMatchObject({
      name: 'Push (copy)',
      notes: 'Heavy',
      userId: USER,
      deletedAt: null,
    })

    const copied = await templateItems(USER, copyId)
    expect(copied.map((item) => item.exerciseId)).toEqual(['Bench', 'Overhead Press'])
    expect(copied[0]).toMatchObject({
      sets: 5,
      targetReps: 5,
      targetRepsMax: 8,
      targetWeightKg: 60,
      restSec: 180,
      notes: 'Pause at the bottom',
    })
    expect(copied.map((item) => item.id)).not.toContain('i-bench')
  })

  it('leaves the original untouched', async () => {
    await seedWorkout()

    await duplicateWorkout(USER, 'push')

    expect((await templateItems(USER, 'push')).map((item) => item.id)).toEqual(['i-bench', 'i-ohp'])
    expect(await getDb(USER).workoutTemplates.get('push')).toMatchObject({ name: 'Push' })
  })

  it('queues every copied row for sync', async () => {
    await seedWorkout()

    const copyId = await duplicateWorkout(USER, 'push')

    const outbox = getDb(USER).outbox
    expect(await outbox.get(mutationKey('workoutTemplates', copyId))).toBeDefined()
    for (const item of await templateItems(USER, copyId)) {
      expect(await outbox.get(mutationKey('templateItems', item.id))).toBeDefined()
    }
  })
})
