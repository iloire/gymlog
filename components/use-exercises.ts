'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { useUserId } from '@/components/session-boot'
import { getDb, type LocalExercise } from '@/lib/db/dexie'

const NONE = new Map<string, LocalExercise>()

/**
 * The exercises behind a list of ids, for rows built from set logs or records:
 * those carry the exercise's name but not its photos. Empty for the first
 * frame, so the thumbnail's box is there before the picture is.
 */
export function useExercises(ids: string[]): Map<string, LocalExercise> {
  const userId = useUserId()
  const key = [...new Set(ids)].join('\n')
  return useLiveQuery(
    async () => {
      if (!userId || key === '') return NONE
      const rows = await getDb(userId).exercises.bulkGet(key.split('\n'))
      return new Map(rows.flatMap((row) => (row ? [[row.id, row] as const] : [])))
    },
    [userId, key],
    NONE,
  )
}
