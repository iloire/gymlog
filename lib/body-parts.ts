import type { LocalExercise } from '@/lib/db/dexie'

/**
 * The library tags exercises with 17 muscles; at a glance you want to know
 * "legs day" or "chest and arms". Each muscle folds into one broad body part.
 */
const BODY_PART: Record<string, string> = {
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  adductors: 'Legs',
  abductors: 'Legs',
  chest: 'Chest',
  lats: 'Back',
  'middle back': 'Back',
  'lower back': 'Back',
  traps: 'Back',
  shoulders: 'Shoulders',
  neck: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  abdominals: 'Core',
}

/** Every body part, in the order the library's chips and headers show them. */
export const BODY_PARTS = ['Legs', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Cardio'] as const

/**
 * The body parts one exercise works, by its primary muscles — its first
 * muscle first, so the part it files under is the one it is mostly about.
 * Cardio is its own part. An untagged exercise belongs to none.
 */
export function bodyPartsOf(exercise: Pick<LocalExercise, 'category' | 'primaryMuscles'>): string[] {
  if (exercise.category === 'cardio') return ['Cardio']
  const parts = (exercise.primaryMuscles ?? []).map((muscle) => BODY_PART[muscle]).filter((part) => part !== undefined)
  return [...new Set(parts)]
}

/** The broad body part a library muscle belongs to, or undefined for one it does not know. */
export function bodyPartOf(muscle: string): string | undefined {
  return BODY_PART[muscle]
}

/** A movement of the legs — squats, deadlifts, lunges — which progresses faster than the arms. */
export function isLowerBody(exercise?: Pick<LocalExercise, 'primaryMuscles'> | null): boolean {
  return (exercise?.primaryMuscles ?? []).some((muscle) => BODY_PART[muscle] === 'Legs')
}

type Worked = { exercise: Pick<LocalExercise, 'category' | 'primaryMuscles'> | undefined; sets: number }

/**
 * The body parts a session worked, most sets first. An exercise counts once per
 * body part its primary muscles reach; cardio is its own part. Exercises with
 * no muscles — your own, untagged — are left out rather than guessed.
 */
export function bodyParts(worked: Worked[]): string[] {
  const sets = new Map<string, number>()
  for (const { exercise, sets: count } of worked) {
    const parts =
      exercise?.category === 'cardio'
        ? ['Cardio']
        : (exercise?.primaryMuscles ?? []).map((muscle) => BODY_PART[muscle]).filter((part) => part !== undefined)
    for (const part of new Set(parts)) sets.set(part, (sets.get(part) ?? 0) + count)
  }
  return [...sets].sort((a, b) => b[1] - a[1]).map(([part]) => part)
}
