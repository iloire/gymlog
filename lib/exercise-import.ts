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
