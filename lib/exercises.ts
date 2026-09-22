'use client'

import { getDb, type LocalExercise } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { uniqueSlug } from '@/lib/exercise-import'
import { newId } from '@/lib/id'

/**
 * An exercise of your own — one the library lacks, a plain two-hand swing or
 * the odd machine at your gym. It is a row in the same table as the library,
 * with your `userId`, so it syncs, backs up, files under its body part and
 * shows in every picker like any other; it just has no photos.
 */

/** The library's own equipment values, what you can train with first. */
export const OWN_EQUIPMENT = [
  'body only',
  'barbell',
  'dumbbell',
  'kettlebells',
  'cable',
  'machine',
  'bands',
  'e-z curl bar',
  'exercise ball',
  'medicine ball',
  'foam roll',
  'other',
] as const

/** The library's categories. Cardio is the one that matters: its sets are timed, not weight × reps. */
export const OWN_CATEGORIES = [
  'strength',
  'cardio',
  'stretching',
  'plyometrics',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
] as const

export type OwnExerciseInput = {
  name: string
  equipment: string
  category: string
  /** The muscle it is mostly about, which decides the body part it files under; null files it under Other. */
  primaryMuscle: string | null
}

/**
 * Writes the exercise and queues it for sync in one transaction. The slug is
 * kept clear of every exercise on the device, the library's included, the way
 * the importer keeps the library's own apart: `(userId, slug)` is unique on
 * the server, and a backup merges by slug.
 */
export async function createExercise(userId: string, input: OwnExerciseInput): Promise<LocalExercise> {
  const name = input.name.trim()
  if (!name) throw new Error('an exercise needs a name')

  const used = new Set((await getDb(userId).exercises.toArray()).map((exercise) => exercise.slug))
  const row = await writeRow(userId, 'exercises', {
    id: newId(),
    name,
    slug: uniqueSlug(name, input.equipment, used),
    category: input.category,
    level: null,
    force: null,
    mechanic: null,
    equipment: input.equipment,
    primaryMuscles: input.primaryMuscle ? [input.primaryMuscle] : [],
    secondaryMuscles: [],
    instructions: [],
    images: [],
  })
  return row as unknown as LocalExercise
}

/**
 * A tombstone, like every delete. The sets logged against it keep their own
 * copy of the name, and a workout that still lists it keeps finding the row,
 * so nothing that was done or planned goes with it.
 */
export async function deleteExercise(userId: string, id: string): Promise<void> {
  await deleteRow(userId, 'exercises', id)
}
