/**
 * Pure rules for importing free-exercise-db into the global library. Kept out
 * of scripts/import-exercises.ts so they can be tested without a network
 * download (and because scripts/ is excluded from the Vercel build).
 */

export type SourceExercise = {
  id: string
  name: string
  force: string | null
  level: string
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

export type ExerciseFilter = {
  levels: string[]
  categories: string[]
  equipment: string[]
  requireImages: boolean
}

/** "Barbell Bench Press - Medium Grip" → "barbell-bench-press-medium-grip". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** An empty list means "no restriction" on that field. */
export function matchesFilter(exercise: SourceExercise, filter: ExerciseFilter): boolean {
  if (filter.levels.length && !filter.levels.includes(exercise.level)) return false
  if (filter.categories.length && !filter.categories.includes(exercise.category)) return false
  if (filter.equipment.length && !filter.equipment.includes(exercise.equipment ?? '')) return false
  // Two photos are the start and end of the movement; one is not an animation.
  if (filter.requireImages && exercise.images.length < 2) return false
  return true
}

/**
 * Slugs are unique per owner, and the whole global library shares one owner.
 * Prefer disambiguating by equipment ("curl-dumbbell"), then fall back to a
 * counter. Adds the chosen slug to `used`.
 */
export function uniqueSlug(name: string, equipment: string | null, used: Set<string>): string {
  const base = slugify(name)
  let slug = base
  if (used.has(slug)) slug = `${base}-${slugify(equipment ?? 'alt')}`
  let suffix = 2
  while (used.has(slug)) slug = `${base}-${suffix++}`
  used.add(slug)
  return slug
}

/**
 * A global exercise the source library lacks — a plain two-hand kettlebell
 * swing, say — written by hand in `data/exercise-extras.json`. It has no
 * photos, and it is otherwise a seed row: the same fields, `userId IS NULL`,
 * shared and read-only.
 */
export type ExtraExercise = Omit<SourceExercise, 'images' | 'level' | 'category'> & {
  level: string | null
  category: string | null
}

export type SeedExercise = ExtraExercise & { slug: string; images: string[] }

/**
 * The extras go in after the source library, so a re-import keeps them and
 * their slugs still cannot clash with a library one. An extra whose id the
 * library already has is a mistake, not an override: the row would be seeded
 * twice under one id.
 */
export function withExtras(seeds: SeedExercise[], extras: ExtraExercise[]): SeedExercise[] {
  const ids = new Set(seeds.map((seed) => seed.id))
  const used = new Set(seeds.map((seed) => seed.slug))
  const added = extras.map((extra) => {
    if (ids.has(extra.id)) throw new Error(`exercise-extras: ${extra.id} is already in the library`)
    ids.add(extra.id)
    const { id, name, ...rest } = extra
    return { id, name, slug: uniqueSlug(name, extra.equipment, used), ...rest, images: [] }
  })
  return [...seeds, ...added]
}
