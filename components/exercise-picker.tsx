'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Star, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useUserId } from '@/components/session-boot'
import {
  ExerciseFilterChips,
  filterExercises,
  NO_FILTER,
  primaryMuscles,
} from '@/components/exercise-filters'
import { ExerciseFrames } from '@/components/exercise-frames'
import { getDb, type LocalExercise } from '@/lib/db/dexie'
import { favoriteExerciseIds } from '@/lib/favorites'

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exercise: LocalExercise) => void
  onClose: () => void
}) {
  const userId = useUserId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(NO_FILTER)

  const exercises = useLiveQuery(
    async () => (userId ? getDb(userId).exercises.toArray() : []),
    [userId],
    [],
  )

  const favorites = useLiveQuery(
    async () => (userId ? favoriteExerciseIds(userId) : new Set<string>()),
    [userId],
    new Set<string>(),
  )

  const muscles = useMemo(() => primaryMuscles(exercises), [exercises])

  const results = useMemo(
    () => filterExercises(exercises, filter, query, favorites).slice(0, 80),
    [exercises, filter, query, favorites],
  )

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-ground">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3">
          <Search size={18} className="text-ink-dim" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className="w-full bg-transparent outline-none"
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-ink-dim">
          <X size={22} aria-hidden />
        </button>
      </header>

      <ExerciseFilterChips
        muscles={muscles}
        filter={filter}
        onChange={setFilter}
        className="border-b border-line px-4 py-3"
      />

      <ul className="flex-1 divide-y divide-line overflow-y-auto">
        {results.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <ExerciseFrames exercise={exercise} className="h-14 w-14 shrink-0" animate={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{exercise.name}</span>
                <span className="block truncate text-sm capitalize text-ink-dim">
                  {exercise.equipment ?? 'bodyweight'}
                </span>
              </span>
              {favorites.has(exercise.id) && (
                <Star
                  size={16}
                  aria-label="Favourite"
                  className="shrink-0 fill-plate-yellow text-plate-yellow"
                />
              )}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-8 text-center text-ink-dim">
            {filter.favoritesOnly && favorites.size === 0
              ? 'No favourites yet. Star exercises on the Exercises page.'
              : `Nothing matches “${query}”.`}
          </li>
        )}
      </ul>
    </div>
  )
}
