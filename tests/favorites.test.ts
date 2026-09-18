import { beforeEach, describe, expect, it } from 'vitest'

import { filterExercises, NO_FILTER } from '@/components/exercise-filters'
import { destroyDb, getDb, type LocalExercise } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { favoriteExerciseIds, setFavorite } from '@/lib/favorites'
import { exerciseNoteId } from '@/lib/id'
import { mutationKey } from '@/lib/sync/types'

const USER = 'user-1'

beforeEach(async () => {
  await destroyDb(USER)
})

describe('setFavorite', () => {
  it('stars and unstars an exercise', async () => {
    await setFavorite(USER, 'Squat', true)
    await setFavorite(USER, 'Bench', true)
    expect(await favoriteExerciseIds(USER)).toEqual(new Set(['Squat', 'Bench']))

    await setFavorite(USER, 'Squat', false)
    expect(await favoriteExerciseIds(USER)).toEqual(new Set(['Bench']))
  })

  it('queues the notes row for sync under its deterministic id', async () => {
    await setFavorite(USER, 'Squat', true)

    const id = exerciseNoteId(USER, 'Squat')
    const queued = await getDb(USER).outbox.get(mutationKey('exerciseNotes', id))
    expect(queued?.row).toMatchObject({ exerciseId: 'Squat', favoritedAt: expect.any(Number) })
  })

  it('keeps the cues when starring, and the star when editing cues', async () => {
    const id = exerciseNoteId(USER, 'Squat')
    await writeRow(USER, 'exerciseNotes', { id, exerciseId: 'Squat', notes: 'Knees out' })

    await setFavorite(USER, 'Squat', true)
    expect(await getDb(USER).exerciseNotes.get(id)).toMatchObject({ notes: 'Knees out' })

    // The exercise page saves cues with exactly this write.
    await writeRow(USER, 'exerciseNotes', { id, exerciseId: 'Squat', notes: 'Brace first' })
    expect(await favoriteExerciseIds(USER)).toEqual(new Set(['Squat']))
  })

  it('ignores deleted notes rows and rows written before favourites existed', async () => {
    await setFavorite(USER, 'Squat', true)
    await writeRow(USER, 'exerciseNotes', {
      id: exerciseNoteId(USER, 'Bench'),
      exerciseId: 'Bench',
      notes: 'old row, no favoritedAt field',
    })
    await writeRow(USER, 'exerciseNotes', { id: exerciseNoteId(USER, 'Squat'), deletedAt: 5 })

    expect(await favoriteExerciseIds(USER)).toEqual(new Set())
  })
})

describe('filterExercises', () => {
  const exercise = (id: string, primaryMuscles: string[]) =>
    ({ id, name: id, primaryMuscles, deletedAt: null }) as unknown as LocalExercise
  const library = [
    exercise('Squat', ['quadriceps']),
    exercise('Leg Press', ['quadriceps']),
    exercise('Curl', ['biceps']),
  ]
  const favorites = new Set(['Squat', 'Curl'])
  const names = (list: LocalExercise[]) => list.map((e) => e.id)

  it('narrows to favourites, combined with a body part and search', () => {
    expect(names(filterExercises(library, { ...NO_FILTER, favoritesOnly: true }, '', favorites))).toEqual([
      'Curl',
      'Squat',
    ])
    expect(
      names(filterExercises(library, { ...NO_FILTER, part: 'Legs', favoritesOnly: true }, '', favorites)),
    ).toEqual(['Squat'])
    expect(names(filterExercises(library, { ...NO_FILTER, favoritesOnly: true }, 'cu', favorites))).toEqual([
      'Curl',
    ])
  })

  it('shows everything when favourites are not filtered, favourites first', () => {
    expect(names(filterExercises(library, NO_FILTER, '', favorites))).toEqual(['Curl', 'Squat', 'Leg Press'])
  })
})
