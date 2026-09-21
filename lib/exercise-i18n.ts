/**
 * The library in Spanish, as an overlay rather than a column.
 *
 * The 873 library exercises are English rows in the synced `exercises` table.
 * A `name_es` column would mean a migration, a sync change and a reseed for
 * every language ever added, so instead `data/exercise-names.es.json` maps a
 * library id to its Spanish name and is applied at display time. A user's own
 * exercise has no entry and shows as typed. The names are small and bundled;
 * the instructions are ~560 kB and load on demand from the exercise dialog
 * and page only, as a chunk the service worker then caches like any other.
 *
 * Search matches both names, so "press de banca" and "bench press" find the
 * same row whichever language the screen is in.
 */
import names from '@/data/exercise-names.es.json'
import { type Locale } from '@/lib/i18n'

type Named = { id: string; name: string }

const NAMES: Record<Locale, Record<string, string>> = { en: {}, es: names }

/** The exercise's name in the language, or as typed when the library has no word for it. */
export function exerciseName(exercise: Named, locale: Locale): string {
  return NAMES[locale][exercise.id] ?? exercise.name
}

/** Both names, for search: the one on screen and the library's English one. */
export function exerciseNames(exercise: Named, locale: Locale): string[] {
  const shown = exerciseName(exercise, locale)
  return shown === exercise.name ? [shown] : [shown, exercise.name]
}

/** Sort by what is on screen, in the language's own order (accents, ñ). */
export function compareExerciseNames(locale: Locale): (a: Named, b: Named) => number {
  const collator = new Intl.Collator(locale)
  return (a, b) => collator.compare(exerciseName(a, locale), exerciseName(b, locale))
}

type Instructed = { id: string; instructions?: string[] | null }

/**
 * The how-to in the language. English is on the row already; Spanish is a
 * chunk fetched the first time it is needed, and the library's English is
 * shown for an exercise it has not translated yet.
 */
export async function exerciseInstructions(exercise: Instructed, locale: Locale): Promise<string[]> {
  const own = exercise.instructions ?? []
  if (locale === 'en') return own
  const { default: translated } = await import('@/data/exercise-instructions.es.json')
  return (translated as Record<string, string[]>)[exercise.id] ?? own
}
