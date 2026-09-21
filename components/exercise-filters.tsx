import { SlidersHorizontal, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'

import { BODY_PARTS, bodyPartsOf, labelKey } from '@/lib/body-parts'
import type { LocalExercise } from '@/lib/db/dexie'
import { exerciseEquipment, missingEquipment } from '@/lib/equipment'
import { type ExerciseRank, NO_RANK } from '@/lib/queries'

/**
 * One facet of the library a filter panel group narrows on. Several values in
 * a group match any of them; groups combine, so "barbell or dumbbell, compound".
 * Values are the library's own ids; their names are in `data.json`.
 */
const FACETS = [
  { key: 'equipment', value: exerciseEquipment },
  { key: 'category', value: (exercise: LocalExercise) => exercise.category },
  {
    key: 'level',
    value: (exercise: LocalExercise) => exercise.level,
    order: ['beginner', 'intermediate', 'expert'],
  },
  { key: 'mechanic', value: (exercise: LocalExercise) => exercise.mechanic },
  { key: 'force', value: (exercise: LocalExercise) => exercise.force },
] as const

type FacetKey = (typeof FACETS)[number]['key']

/** The library's enumerated fields that have a display name per language. */
export type LibraryFacet = FacetKey | 'bodyPart' | 'muscle'

/** A library id's name in the current language, or the id itself for one `data.json` lacks. */
export type LibraryLabel = (facet: LibraryFacet, value: string) => string

export function useLibraryLabel(): LibraryLabel {
  const t = useTranslations('data')
  return useCallback(
    (facet, value) => {
      const key = `${facet}.${labelKey(value)}` as Parameters<typeof t>[0]
      return t.has(key) ? t(key) : value
    },
    [t],
  )
}

export type ExerciseFilter = {
  /** One of BODY_PARTS — Legs, Chest, Back… — or null for every part. */
  part: string | null
  favoritesOnly: boolean
  /** Only exercises the equipment chosen on this device allows. */
  myEquipment: boolean
} & Record<FacetKey, string[]>

export const NO_FILTER: ExerciseFilter = {
  part: null,
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
/**
 * A search word as typed, then without a plural's s or es, so "leg raises"
 * finds "Hanging Leg Raise" and "flyes" finds "Dumbbell Flye"; the other way
 * round, "crunch" is simply inside "Crunches". Short stems are left out —
 * "abs" must not find every Cable exercise through "ab".
 */
function forms(word: string): string[] {
  const stems = [word.replace(/s$/, ''), word.replace(/es$/, '')].filter((stem) => stem.length >= 3)
  return [...new Set([word, ...stems])]
}

export function filterExercises(
  exercises: LocalExercise[],
  filter: ExerciseFilter,
  query: string,
  favorites: ReadonlySet<string>,
  have: ReadonlySet<string> | null = null,
  rank: ExerciseRank = NO_RANK,
  /** A body part's name in the current language, so "piernas" finds the legs too. */
  partLabel: (part: string) => string = (part) => part,
): LocalExercise[] {
  const tier = (exercise: LocalExercise) => rankTier(exercise, favorites, rank)
  const recency = (exercise: LocalExercise) => rank.lastDone.get(exercise.id) ?? 0

  // Every word must appear, in any order: "incline press" finds "Barbell Incline Bench Press".
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(forms)
  return exercises
    .filter((exercise) => exercise.deletedAt === null)
    .filter((exercise) => !filter.favoritesOnly || favorites.has(exercise.id))
    .filter((exercise) => !filter.myEquipment || !have || missingEquipment(exercise, have).length === 0)
    .filter((exercise) => !filter.part || bodyPartsOf(exercise).includes(filter.part))
    .filter((exercise) =>
      FACETS.every(({ key, value }) => {
        const wanted = filter[key]
        return wanted.length === 0 || wanted.includes(value(exercise) ?? '')
      }),
    )
    .filter((exercise) => {
      // A body part counts as a word of the name: "abs" finds every Abs exercise.
      const name = exercise.name.toLowerCase()
      const parts = bodyPartsOf(exercise).flatMap((part) => [part.toLowerCase(), partLabel(part).toLowerCase()])
      return words.every((word) => word.some((form) => name.includes(form) || parts.includes(form)))
    })
    .sort((a, b) => {
      if (tier(a) !== tier(b)) return tier(a) - tier(b)
      if (tier(a) === 2 && recency(a) !== recency(b)) return recency(b) - recency(a)
      return a.name.localeCompare(b.name)
    })
}

/**
 * Where an exercise ranks: 0 a favourite, 1 in a workout the programme
 * schedules, 2 logged before, 3 the rest of the library. The Exercises page
 * draws the first three as "yours" and files the rest under body parts.
 */
export function rankTier(exercise: LocalExercise, favorites: ReadonlySet<string>, rank: ExerciseRank): 0 | 1 | 2 | 3 {
  return favorites.has(exercise.id) ? 0 : rank.programme.has(exercise.id) ? 1 : rank.lastDone.has(exercise.id) ? 2 : 3
}

/** The body parts the library covers, in their fixed order — nobody at a gym thinks in adductors. */
export function bodyPartOptions(exercises: LocalExercise[]): string[] {
  const present = new Set(exercises.filter((exercise) => exercise.deletedAt === null).flatMap(bodyPartsOf))
  return BODY_PARTS.filter((part) => present.has(part))
}

export type FacetOptions = Record<FacetKey, string[]>

/**
 * The values each panel group offers, taken from the library so a new one
 * shows up by itself, in the order of their names in the current language.
 */
export function facetOptions(exercises: LocalExercise[], label: LibraryLabel = (_, value) => value): FacetOptions {
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
        values.sort((a, b) => rank(a) - rank(b) || label(facet.key, a).localeCompare(label(facet.key, b))),
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
    filter.part !== null || filter.favoritesOnly || filter.myEquipment || panelFilterCount(filter) > 0
  )
}

const chip = (active: boolean) =>
  `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm capitalize ${
    active ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
  }`

/**
 * A row of quick chips — the panel toggle, favourites, your equipment, body parts —
 * and, when open, a panel of every other facet.
 */
export function ExerciseFilterChips({
  parts,
  options,
  filter,
  onChange,
  hasEquipment,
  className = '',
  panelClassName = '',
}: {
  parts: string[]
  options: FacetOptions
  filter: ExerciseFilter
  onChange: (next: ExerciseFilter) => void
  /** Whether equipment has been chosen on this device; the chip is hidden until it has. */
  hasEquipment: boolean
  className?: string
  panelClassName?: string
}) {
  const t = useTranslations('exercises.filters')
  const label = useLibraryLabel()
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
          {count > 0 ? t('panelCount', { count }) : t('panel')}
        </button>
        <button
          type="button"
          onClick={() => onChange(NO_FILTER)}
          className={chip(!isFiltered(filter))}
        >
          {t('all')}
        </button>
        <button
          type="button"
          aria-pressed={filter.favoritesOnly}
          onClick={() => onChange({ ...filter, favoritesOnly: !filter.favoritesOnly })}
          className={chip(filter.favoritesOnly)}
        >
          <Star size={14} aria-hidden className={filter.favoritesOnly ? 'fill-current' : ''} />
          {t('favorites')}
        </button>
        {hasEquipment && (
          <button
            type="button"
            aria-pressed={filter.myEquipment}
            onClick={() => onChange({ ...filter, myEquipment: !filter.myEquipment })}
            className={chip(filter.myEquipment)}
          >
            {t('myEquipment')}
          </button>
        )}
        {parts.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter.part === name}
            onClick={() => onChange({ ...filter, part: name === filter.part ? null : name })}
            className={chip(filter.part === name)}
          >
            {label('bodyPart', name)}
          </button>
        ))}
      </div>

      {open && (
        <div className={panelClassName}>
          {FACETS.map((facet) =>
            options[facet.key].length === 0 ? null : (
              <fieldset key={facet.key} className="mb-4 last:mb-0">
                <legend className="mb-2 text-sm text-ink-dim">{t(`facet.${facet.key}`)}</legend>
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
                        {label(facet.key, value)}
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
