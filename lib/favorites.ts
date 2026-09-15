'use client'

import { getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { exerciseNoteId } from '@/lib/id'

/**
 * A favourite is `favoritedAt` on the user's notes row for that exercise — the
 * row already exists per (user, exercise) with a deterministic id, so starring
 * on two offline devices merges instead of duplicating. `writeRow` merges into
 * the stored row, so starring never clobbers the user's cues and vice versa.
 */
export async function setFavorite(
  userId: string,
  exerciseId: string,
  favorite: boolean,
): Promise<void> {
  await writeRow(userId, 'exerciseNotes', {
    id: exerciseNoteId(userId, exerciseId),
    exerciseId,
    favoritedAt: favorite ? Date.now() : null,
  })
}

export async function favoriteExerciseIds(userId: string): Promise<Set<string>> {
  const notes = await getDb(userId).exerciseNotes.toArray()
  return new Set(
    notes
      .filter((note) => note.deletedAt === null && note.favoritedAt != null)
      .map((note) => note.exerciseId),
  )
}
