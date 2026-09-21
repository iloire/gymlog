'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Star, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { useEquipment } from '@/components/equipment-picker'
import { useUserId } from '@/components/session-boot'
import { useLocale } from '@/components/locale-provider'
import {
  ExerciseFilterChips,
  facetOptions,
  filterExercises,
  NO_FILTER,
  bodyPartOptions,
  useLibraryLabel,
} from '@/components/exercise-filters'
import { ExerciseThumb } from '@/components/exercise-frames'
import { getDb, type LocalExercise } from '@/lib/db/dexie'
import { exerciseEquipment } from '@/lib/equipment'
import { exerciseName } from '@/lib/exercise-i18n'
import { favoriteExerciseIds } from '@/lib/favorites'
import { exerciseRank, NO_RANK } from '@/lib/queries'

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exercise: LocalExercise) => void
  onClose: () => void
}) {
  const userId = useUserId()
  const t = useTranslations('plan.picker')
  const label = useLibraryLabel()
  const locale = useLocale()
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
    () => filterExercises(exercises, filter, query, favorites, have, rank, (part) => label('bodyPart', part), locale).slice(0, 80),
    [exercises, filter, query, favorites, have, rank, label, locale],
  )

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-ground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3">
          <Search size={18} className="text-ink-dim" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="w-full bg-transparent outline-none"
          />
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')} className="p-2 text-ink-dim">
          <X size={22} aria-hidden />
        </button>
      </header>

      <ExerciseFilterChips
        parts={parts}
        options={options}
        filter={filter}
        onChange={setFilter}
        hasEquipment={equipment !== null}
        className="border-b border-line px-4 py-3"
        panelClassName="max-h-[45vh] overflow-y-auto border-b border-line bg-surface px-4 py-3"
      />

      <ul className="flex-1 divide-y divide-line overflow-y-auto">
        {results.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => onPick(exercise)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <ExerciseThumb exercise={exercise} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{exerciseName(exercise, locale)}</span>
                <span className="block truncate text-sm capitalize text-ink-dim">
                  {label('equipment', exerciseEquipment(exercise))}
                </span>
              </span>
              {favorites.has(exercise.id) && (
                <Star
                  size={16}
                  aria-label={t('favourite')}
                  className="shrink-0 fill-plate-yellow text-plate-yellow"
                />
              )}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-8 text-center text-ink-dim">
            {filter.favoritesOnly && favorites.size === 0
              ? t('noFavourites')
              : query.trim()
                ? t('noMatch', { query })
                : t('noMatchFilters')}
          </li>
        )}
      </ul>
    </div>
  )
}
