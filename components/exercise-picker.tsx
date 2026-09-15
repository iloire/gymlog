'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useUserId } from '@/components/session-boot'
import { ExerciseFrames } from '@/components/exercise-frames'
import { getDb, type LocalExercise } from '@/lib/db/dexie'

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exercise: LocalExercise) => void
  onClose: () => void
}) {
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
      .slice(0, 80)
  }, [exercises, query, muscle])

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

      <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3 [scrollbar-width:none]">
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

      <ul className="flex-1 divide-y divide-line overflow-y-auto">
        {results.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <ExerciseFrames exercise={exercise} className="h-14 w-14 shrink-0" animate={false} />
              <span className="min-w-0">
                <span className="block truncate text-[15px]">{exercise.name}</span>
                <span className="block truncate text-sm capitalize text-ink-dim">
                  {exercise.equipment ?? 'bodyweight'}
                </span>
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-8 text-center text-ink-dim">
            Nothing matches “{query}”.
          </li>
        )}
      </ul>
    </div>
  )
}
