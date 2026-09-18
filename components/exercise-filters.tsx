import { SlidersHorizontal, Star } from 'lucide-react'
import { useState } from 'react'

import type { LocalExercise } from '@/lib/db/dexie'
import { equipmentName, exerciseEquipment, missingEquipment } from '@/lib/equipment'
import { type ExerciseRank, NO_RANK } from '@/lib/queries'

/**
 * One facet of the library a filter panel group narrows on. Several values in
 * a group match any of them; groups combine, so "barbell or dumbbell, compound".
 */
const FACETS = [
  {
    key: 'equipment',
    label: 'Equipment',
    value: exerciseEquipment,
    name: (value: string) => (value === 'bodyweight' ? 'Bodyweight' : equipmentName(value)),
  },
  { key: 'category', label: 'Type', value: (exercise: LocalExercise) => exercise.category },
  {
    key: 'level',
    label: 'Level',
    value: (exercise: LocalExercise) => exercise.level,
    order: ['beginner', 'intermediate', 'expert'],
  },
  { key: 'mechanic', label: 'Movement', value: (exercise: LocalExercise) => exercise.mechanic },
  { key: 'force', label: 'Push or pull', value: (exercise: LocalExercise) => exercise.force },
] as const

type FacetKey = (typeof FACETS)[number]['key']

export type ExerciseFilter = {
  muscle: string | null
  favoritesOnly: boolean
  /** Only exercises the equipment chosen on this device allows. */
  myEquipment: boolean
} & Record<FacetKey, string[]>

export const NO_FILTER: ExerciseFilter = {
  muscle: null,
  favoritesOnly: false,
  myEquipment: false,
  equipment: [],
  category: [],
  level: [],
  mechanic: [],
  force: [],
}

/**
 * Shared by the Exercises page and the picker, so both filter and order the
 * same way. Favourites come first, then what the programme has you doing, then
 * what you have logged (most recent first), then the rest of the library
 * alphabetically — 873 movements from 3/4 Sit-Up is no way to open a library.
 */
export function filterExercises(
  exercises: LocalExercise[],
  filter: ExerciseFilter,
  query: string,
  favorites: ReadonlySet<string>,
  have: ReadonlySet<string> | null = null,
  rank: ExerciseRank = NO_RANK,
): LocalExercise[] {
  const tier = (exercise: LocalExercise) =>
    favorites.has(exercise.id) ? 0 : rank.programme.has(exercise.id) ? 1 : rank.lastDone.has(exercise.id) ? 2 : 3
  const recency = (exercise: LocalExercise) => rank.lastDone.get(exercise.id) ?? 0

  // Every word must appear, in any order: "incline press" finds "Barbell Incline Bench Press".
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return exercises
    .filter((exercise) => exercise.deletedAt === null)
    .filter((exercise) => !filter.favoritesOnly || favorites.has(exercise.id))
    .filter((exercise) => !filter.myEquipment || !have || missingEquipment(exercise, have).length === 0)
    .filter((exercise) => !filter.muscle || (exercise.primaryMuscles ?? []).includes(filter.muscle))
    .filter((exercise) =>
      FACETS.every(({ key, value }) => {
        const wanted = filter[key]
        return wanted.length === 0 || wanted.includes(value(exercise) ?? '')
      }),
    )
    .filter((exercise) => {
      const name = exercise.name.toLowerCase()
      return words.every((word) => name.includes(word))
    })
    .sort((a, b) => {
      if (tier(a) !== tier(b)) return tier(a) - tier(b)
      if (tier(a) === 2 && recency(a) !== recency(b)) return recency(b) - recency(a)
      return a.name.localeCompare(b.name)
    })
}

export function primaryMuscles(exercises: LocalExercise[]): string[] {
  const set = new Set<string>()
  for (const exercise of exercises) {
    for (const name of exercise.primaryMuscles ?? []) set.add(name)
  }
  return [...set].sort()
}

function valueName(facet: (typeof FACETS)[number], value: string): string {
  return 'name' in facet ? facet.name(value) : value
}

export type FacetOptions = Record<FacetKey, string[]>

/** The values each panel group offers, taken from the library so a new one shows up by itself. */
export function facetOptions(exercises: LocalExercise[]): FacetOptions {
  const live = exercises.filter((exercise) => exercise.deletedAt === null)
  return Object.fromEntries(
    FACETS.map((facet) => {
      const values = [...new Set(live.map((exercise) => facet.value(exercise)))].filter(
        (value): value is string => !!value,
      )
      const order: readonly string[] = 'order' in facet ? facet.order : []
      const rank = (value: string) => (order.includes(value) ? order.indexOf(value) : order.length)
      return [
        facet.key,
        values.sort((a, b) => rank(a) - rank(b) || valueName(facet, a).localeCompare(valueName(facet, b))),
      ]
    }),
  ) as FacetOptions
}

/** How many filters the panel holds, for the badge on its button. */
export function panelFilterCount(filter: ExerciseFilter): number {
  return FACETS.reduce((count, { key }) => count + filter[key].length, 0)
}

export function isFiltered(filter: ExerciseFilter): boolean {
  return (
    filter.muscle !== null || filter.favoritesOnly || filter.myEquipment || panelFilterCount(filter) > 0
  )
}

const chip = (active: boolean) =>
  `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm capitalize ${
    active ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
  }`

/**
 * A row of quick chips — the panel toggle, favourites, your equipment, muscles —
 * and, when open, a panel of every other facet.
 */
export function ExerciseFilterChips({
  muscles,
  options,
  filter,
  onChange,
  hasEquipment,
  className = '',
  panelClassName = '',
}: {
  muscles: string[]
  options: FacetOptions
  filter: ExerciseFilter
  onChange: (next: ExerciseFilter) => void
  /** Whether equipment has been chosen on this device; the chip is hidden until it has. */
  hasEquipment: boolean
  className?: string
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const count = panelFilterCount(filter)

  function toggle(key: FacetKey, value: string) {
    const current = filter[key]
    onChange({
      ...filter,
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    })
  }

  return (
    <>
      <div className={`flex gap-2 overflow-x-auto [scrollbar-width:none] ${className}`}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={chip(open || count > 0)}
        >
          <SlidersHorizontal size={14} aria-hidden />
          Filters{count > 0 && ` · ${count}`}
        </button>
        <button
          type="button"
          onClick={() => onChange(NO_FILTER)}
          className={chip(!isFiltered(filter))}
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
        {hasEquipment && (
          <button
            type="button"
            aria-pressed={filter.myEquipment}
            onClick={() => onChange({ ...filter, myEquipment: !filter.myEquipment })}
            className={chip(filter.myEquipment)}
          >
            My equipment
          </button>
        )}
        {muscles.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter.muscle === name}
            onClick={() => onChange({ ...filter, muscle: name === filter.muscle ? null : name })}
            className={chip(filter.muscle === name)}
          >
            {name}
          </button>
        ))}
      </div>

      {open && (
        <div className={panelClassName}>
          {FACETS.map((facet) =>
            options[facet.key].length === 0 ? null : (
              <fieldset key={facet.key} className="mb-4 last:mb-0">
                <legend className="mb-2 text-sm text-ink-dim">{facet.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {options[facet.key].map((value) => {
                    const active = filter[facet.key].includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggle(facet.key, value)}
                        className={chip(active)}
                      >
                        {valueName(facet, value)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ),
          )}
        </div>
      )}
    </>
  )
}
