'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ExerciseFrames } from '@/components/exercise-frames'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'

export default function ExercisesPage() {
  const userId = useUserId()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)

  const exercises = useLiveQuery(
    async () => (userId ? getDb(userId).exercises.toArray() : []),
    [userId],
    [],
  )

  const muscles = useMemo(() => {
    const set = new Set<string>()
    for (const exercise of exercises) {
      for (const name of exercise.primaryMuscles ?? []) set.add(name)
    }
    return [...set].sort()
  }, [exercises])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return exercises
      .filter((exercise) => exercise.deletedAt === null)
      .filter((exercise) => !muscle || (exercise.primaryMuscles ?? []).includes(muscle))
      .filter((exercise) => !needle || exercise.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, query, muscle])

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

        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setMuscle(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              muscle === null ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
            }`}
          >
            All
          </button>
          {muscles.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setMuscle(name === muscle ? null : name)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm capitalize ${
                muscle === name ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-3">
          {results.slice(0, 200).map((exercise) => (
            <li key={exercise.id}>
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
