import { Star } from 'lucide-react'

import type { LocalExercise } from '@/lib/db/dexie'

export type ExerciseFilter = { muscle: string | null; favoritesOnly: boolean }

export const NO_FILTER: ExerciseFilter = { muscle: null, favoritesOnly: false }

/** Shared by the Exercises page and the picker, so both filter the same way. */
export function filterExercises(
  exercises: LocalExercise[],
  { muscle, favoritesOnly }: ExerciseFilter,
  query: string,
  favorites: Set<string>,
): LocalExercise[] {
  const needle = query.trim().toLowerCase()
  return exercises
    .filter((exercise) => exercise.deletedAt === null)
    .filter((exercise) => !favoritesOnly || favorites.has(exercise.id))
    .filter((exercise) => !muscle || (exercise.primaryMuscles ?? []).includes(muscle))
    .filter((exercise) => !needle || exercise.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function primaryMuscles(exercises: LocalExercise[]): string[] {
  const set = new Set<string>()
  for (const exercise of exercises) {
    for (const name of exercise.primaryMuscles ?? []) set.add(name)
  }
  return [...set].sort()
}

const chip = (active: boolean) =>
  `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm capitalize ${
    active ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
  }`

export function ExerciseFilterChips({
  muscles,
  filter,
  onChange,
  className = '',
}: {
  muscles: string[]
  filter: ExerciseFilter
  onChange: (next: ExerciseFilter) => void
  className?: string
}) {
  return (
    <div className={`flex gap-2 overflow-x-auto [scrollbar-width:none] ${className}`}>
      <button
        type="button"
        onClick={() => onChange(NO_FILTER)}
        className={chip(filter.muscle === null && !filter.favoritesOnly)}
      >
        All
      </button>
      <button
        type="button"
        aria-pressed={filter.favoritesOnly}
        onClick={() => onChange({ ...filter, favoritesOnly: !filter.favoritesOnly })}
        className={chip(filter.favoritesOnly)}
      >
        <Star size={14} aria-hidden className={filter.favoritesOnly ? 'fill-current' : ''} />
        Favourites
      </button>
      {muscles.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange({ ...filter, muscle: name === filter.muscle ? null : name })}
          className={chip(filter.muscle === name)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}
