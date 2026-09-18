'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useEquipment } from '@/components/equipment-picker'
import { ExerciseFrames } from '@/components/exercise-frames'
import type { ExerciseFilter } from '@/components/exercise-filters'
import {
  bodyPartOptions,
  ExerciseFilterChips,
  facetOptions,
  filterExercises,
  isFiltered,
  NO_FILTER,
  rankTier,
} from '@/components/exercise-filters'
import { FavoriteButton } from '@/components/favorite-button'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { BODY_PARTS, bodyPartsOf } from '@/lib/body-parts'
import { getDb, type LocalExercise } from '@/lib/db/dexie'
import { exerciseEquipment } from '@/lib/equipment'
import { favoriteExerciseIds } from '@/lib/favorites'
import { exerciseRank, NO_RANK } from '@/lib/queries'

/**
 * The grid grows a page at a time. All 873 movements at once is a 23,000px
 * page of images; a flat cap is worse, because it stops without saying so.
 */
const PAGE = 60

export default function ExercisesPage() {
  const userId = useUserId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(NO_FILTER)
  const equipment = useEquipment()

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

  const rank = useLiveQuery(async () => (userId ? exerciseRank(userId) : NO_RANK), [userId], NO_RANK)

  const parts = useMemo(() => bodyPartOptions(exercises), [exercises])
  const options = useMemo(() => facetOptions(exercises), [exercises])
  const have = useMemo(() => (equipment ? new Set(equipment) : null), [equipment])

  const results = useMemo(
    () => filterExercises(exercises, filter, query, favorites, have, rank),
    [exercises, filter, query, favorites, have, rank],
  )
  const narrowed = isFiltered(filter) || query.trim() !== ''

  const [shown, setShown] = useState(PAGE)
  const more = useRef<HTMLButtonElement>(null)

  // Unnarrowed, the grid is sections: your exercises first, then the rest of
  // the library under the body part each is mostly about. Narrowed, one grid.
  const sections = useMemo(() => {
    if (narrowed) return [{ title: null, exercises: results }]
    const yours = results.filter((exercise) => rankTier(exercise, favorites, rank) < 3)
    const groups = new Map<string, LocalExercise[]>()
    for (const exercise of results) {
      if (rankTier(exercise, favorites, rank) < 3) continue
      const part = bodyPartsOf(exercise)[0] ?? 'Other'
      groups.set(part, [...(groups.get(part) ?? []), exercise])
    }
    const ordered: string[] = [...BODY_PARTS, 'Other']
    return [
      ...(yours.length ? [{ title: 'Yours', exercises: yours }] : []),
      ...ordered.flatMap((part) => (groups.has(part) ? [{ title: part, exercises: groups.get(part)! }] : [])),
    ]
  }, [narrowed, results, favorites, rank])

  // The pages count across sections, so "Show more" grows the grid as before.
  const shownSections = useMemo(() => {
    let left = shown
    return sections.flatMap((section) => {
      if (left <= 0) return []
      const exercises = section.exercises.slice(0, left)
      left -= exercises.length
      return [{ ...section, exercises }]
    })
  }, [sections, shown])


  // Narrowing starts the grid again from the first page. Doing it here rather
  // than off the results means starring an exercise does not scroll you up.
  const search = (text: string) => {
    setQuery(text)
    setShown(PAGE)
  }
  const narrow = (next: ExerciseFilter) => {
    setFilter(next)
    setShown(PAGE)
  }

  // The button loads the next page when it comes into view, so scrolling is
  // enough; tapping it does the same where there is no observer.
  useEffect(() => {
    const node = more.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((n) => n + PAGE)
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [shown, results.length])

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Exercises</h1>
        <p className="mt-2 text-sm text-ink-dim">
          {exercises.length
            ? `${exercises.length} exercises. Search, or start from a body part.`
            : 'Fetching the library…'}
        </p>

        <div className="mt-6 flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-3">
          <Search size={18} className="text-ink-dim" aria-hidden />
          <input
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder="Search"
            aria-label="Search exercises"
            className="w-full bg-transparent outline-none"
          />
        </div>

        <ExerciseFilterChips
          parts={parts}
          options={options}
          filter={filter}
          onChange={narrow}
          hasEquipment={equipment !== null}
          className="-mx-5 mt-3 px-5 pb-1"
          panelClassName="mt-3 rounded-md border border-line bg-surface p-4"
        />

        {narrowed && exercises.length > 0 && (
          <p className="mt-4 flex items-baseline justify-between text-sm text-ink-dim">
            {results.length === 1 ? '1 exercise' : `${results.length} exercises`}
            {isFiltered(filter) && (
              <button type="button" onClick={() => narrow(NO_FILTER)} className="text-ink underline">
                Clear filters
              </button>
            )}
          </p>
        )}

        {results.length === 0 && exercises.length > 0 && (
          <p className="mt-6 border-y border-line py-6 text-[15px] text-ink-dim">
            {filter.favoritesOnly && favorites.size === 0
              ? 'Tap the star on an exercise to keep it here, and in the picker when you build a workout.'
              : 'Nothing matches. Try fewer filters.'}
          </p>
        )}

        {shownSections.map((section) => (
          <section key={section.title ?? 'all'} className="mt-5">
            {section.title && (
              <h2 className="mb-3 flex items-baseline gap-2 text-sm text-ink-dim">
                <span className="text-ink">{section.title}</span>
                <span className="figure">{section.exercises.length}</span>
              </h2>
            )}
            <ul className="grid grid-cols-2 gap-3">
              {section.exercises.map((exercise) => (
                <li key={exercise.id} className="relative">
                  {userId && (
                    <FavoriteButton
                      userId={userId}
                      exerciseId={exercise.id}
                      exerciseName={exercise.name}
                      favorite={favorites.has(exercise.id)}
                      className="absolute top-1.5 right-1.5 z-10 rounded-full bg-ground/70 p-2 text-ink backdrop-blur-sm"
                    />
                  )}
                  <Link href={`/exercises/${exercise.id}`} className="block">
                    <ExerciseFrames exercise={exercise} className="aspect-square w-full" />
                    <span className="mt-2 block text-sm leading-snug">{exercise.name}</span>
                    <span className="block text-xs capitalize text-ink-dim">
                      {exerciseEquipment(exercise)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {shown < results.length && (
          <button
            ref={more}
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-md border border-line bg-surface text-sm text-ink-dim"
          >
            Show more — {shown} of {results.length}
          </button>
        )}
      </main>
      <Nav />
    </>
  )
}
