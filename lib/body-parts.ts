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
