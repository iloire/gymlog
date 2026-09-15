'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ExerciseFrames } from '@/components/exercise-frames'
import {
  ExerciseFilterChips,
  filterExercises,
  NO_FILTER,
  primaryMuscles,
} from '@/components/exercise-filters'
import { FavoriteButton } from '@/components/favorite-button'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { favoriteExerciseIds } from '@/lib/favorites'

export default function ExercisesPage() {
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
    () => filterExercises(exercises, filter, query, favorites),
    [exercises, filter, query, favorites],
  )

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Exercises</h1>
        <p className="mt-2 text-sm text-ink-dim">
          {exercises.length
            ? `${exercises.length} movements, saved on this phone.`
            : 'Syncing the library…'}
        </p>

        <div className="mt-6 flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-3">
          <Search size={18} className="text-ink-dim" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search exercises"
            className="w-full bg-transparent outline-none"
          />
        </div>

        <ExerciseFilterChips
          muscles={muscles}
          filter={filter}
          onChange={setFilter}
          className="-mx-5 mt-3 px-5 pb-1"
        />

        {filter.favoritesOnly && results.length === 0 && (
          <p className="mt-6 border-y border-line py-6 text-[15px] text-ink-dim">
            Tap the star on an exercise to keep it here, and in the picker when you build a workout.
          </p>
        )}

        <ul className="mt-5 grid grid-cols-2 gap-3">
          {results.slice(0, 200).map((exercise) => (
            <li key={exercise.id} className="relative">
              {userId && (
                <FavoriteButton
                  userId={userId}
                  exerciseId={exercise.id}
                  exerciseName={exercise.name}
                  favorite={favorites.has(exercise.id)}
                  className="absolute top-1.5 right-1.5 z-10 rounded-full bg-ground/70 p-2 text-white backdrop-blur-sm"
                />
              )}
              <Link href={`/exercises/${exercise.id}`} className="block">
                <ExerciseFrames exercise={exercise} className="aspect-square w-full" />
                <span className="mt-2 block text-sm leading-snug">{exercise.name}</span>
                <span className="block text-xs capitalize text-ink-dim">
                  {exercise.equipment ?? 'bodyweight'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Nav />
    </>
  )
}
