import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { createExercise, deleteExercise } from '@/lib/exercises'
import { mutationKey } from '@/lib/sync/types'

const USER = 'user-1'

const swing = { name: 'Kettlebell Swings', equipment: 'kettlebells', category: 'strength', primaryMuscle: 'hamstrings' }

beforeEach(async () => {
  await destroyDb(USER)
})

describe('createExercise', () => {
  it('writes the row as the user’s own and queues it for sync in the same breath', async () => {
    const exercise = await createExercise(USER, swing)

    expect(exercise).toMatchObject({
      userId: USER,
      name: 'Kettlebell Swings',
      slug: 'kettlebell-swings',
      equipment: 'kettlebells',
      primaryMuscles: ['hamstrings'],
      images: [],
      deletedAt: null,
    })
    const queued = await getDb(USER).outbox.get(mutationKey('exercises', exercise.id))
    expect(queued?.row).toMatchObject({ id: exercise.id, slug: 'kettlebell-swings' })
  })

  it('keeps the slug clear of the library and of your other exercises', async () => {
    await writeRow(USER, 'exercises', { id: 'Lib', userId: null, name: 'Kettlebell Swings', slug: 'kettlebell-swings' })

    const first = await createExercise(USER, swing)
    const second = await createExercise(USER, { ...swing, name: ' Kettlebell Swings ' })

    expect(first.slug).toBe('kettlebell-swings-kettlebells')
    expect(second.slug).toBe('kettlebell-swings-2')
    expect(second.name).toBe('Kettlebell Swings')
  })

  it('files an exercise with no muscle under nothing rather than inventing one', async () => {
    const exercise = await createExercise(USER, { ...swing, primaryMuscle: null })
    expect(exercise.primaryMuscles).toEqual([])
  })

  it('refuses a blank name', async () => {
    await expect(createExercise(USER, { ...swing, name: '  ' })).rejects.toThrow(/name/)
  })
})

describe('deleteExercise', () => {
  it('leaves a tombstone that is queued, never a hole', async () => {
    const exercise = await createExercise(USER, swing)
    await deleteExercise(USER, exercise.id)

    const row = await getDb(USER).exercises.get(exercise.id)
    expect(row?.deletedAt).toEqual(expect.any(Number))
    expect((await getDb(USER).outbox.get(mutationKey('exercises', exercise.id)))?.row.deletedAt).toBe(row?.deletedAt)
  })
})
