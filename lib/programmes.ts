'use client'

import { z } from 'zod'

import dumbbells3Day from '@/data/programmes/dumbbells-3-day.json'
import fullBody3Day from '@/data/programmes/full-body-3-day.json'
import upperLower4Day from '@/data/programmes/upper-lower-4-day.json'
import { getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { missingEquipment, type EquipmentExercise } from '@/lib/equipment'
import { DEFAULT_LOCALE, type Locale, localize, localizedSchema } from '@/lib/i18n'
import { newId } from '@/lib/id'
import { activeProgram, today } from '@/lib/queries'

/**
 * Premade programmes: JSON files in `data/programmes/`, bundled with the app so
 * the catalogue works with no signal. Schema: `data/README.md`.
 *
 * Adopting one *copies* it into ordinary workouts (and, optionally, your week).
 * From then on they are yours to edit, and a later change to the file never
 * rewrites anyone's plan.
 */

const Slot = z.object({
  exercise: z.string(),
  /** Tried in order when you lack the equipment for `exercise`. */
  alternatives: z.array(z.string()).default([]),
  sets: z.int().min(1),
  reps: z.int().min(1),
  restSec: z.int().min(0),
  /** Starting weight for `exercise` only — never applied to an alternative. */
  startKg: z.number().positive().optional(),
  notes: z.string().optional(),
})

const Programme = z
  .object({
    id: z.string(),
    name: localizedSchema,
    level: z.enum(['beginner', 'novice', 'intermediate']),
    summary: localizedSchema,
    /** Monday … Sunday: a workout key, or null for a rest day. */
    week: z.array(z.string().nullable()).length(7),
    workouts: z.record(z.string(), z.object({ name: localizedSchema, exercises: z.array(Slot).min(1) })),
  })
  .refine((p) => p.week.every((key) => key === null || key in p.workouts), {
    message: 'week names a workout that does not exist',
  })

export type ProgrammeSlot = z.infer<typeof Slot>
export type Programme = z.infer<typeof Programme>

/** Add a new file to this list; a test fails if one in the folder is missing. */
export const PROGRAMMES: Programme[] = [fullBody3Day, upperLower4Day, dumbbells3Day].map((file) =>
  Programme.parse(file),
)

export function programmeById(id: string): Programme | undefined {
  return PROGRAMMES.find((programme) => programme.id === id)
}

export function trainingDays(week: readonly (string | null)[]): number {
  return week.filter((key) => key !== null).length
}

/** Move the whole week later by `by` days, wrapping Sunday into Monday. */
export function shiftWeek<T>(week: readonly T[], by: number): T[] {
  return week.map((_, day) => week[(((day - by) % 7) + 7) % 7] as T)
}

// ------------------------------------------------------------ fitting

export type Choice = {
  slot: ProgrammeSlot
  exerciseId: string
  /** Not the exercise the programme names. */
  swapped: boolean
  /** Doable with your equipment. When false, `missing` says what the nearest option lacks. */
  doable: boolean
  missing: string[]
}

export type FittedWorkout = { key: string; name: string; choices: Choice[] }

export type Fit = {
  workouts: FittedWorkout[]
  doable: boolean
  swaps: number
  /** Every item that would make the programme doable as fitted. */
  missing: string[]
}

/**
 * The first option in a slot you can do. Failing that, the option missing the
 * fewest items, so what the picker says you need is the least you would buy.
 */
export function chooseExercise(
  slot: ProgrammeSlot,
  have: ReadonlySet<string>,
  library: ReadonlyMap<string, EquipmentExercise>,
): Choice {
  let nearest: { id: string; missing: string[] } | null = null

  for (const id of [slot.exercise, ...slot.alternatives]) {
    const exercise = library.get(id)
    if (!exercise) continue
    const missing = missingEquipment(exercise, have)
    if (missing.length === 0) {
      return { slot, exerciseId: id, swapped: id !== slot.exercise, doable: true, missing }
    }
    if (!nearest || missing.length < nearest.missing.length) nearest = { id, missing }
  }

  const id = nearest?.id ?? slot.exercise
  return { slot, exerciseId: id, swapped: id !== slot.exercise, doable: false, missing: nearest?.missing ?? [] }
}

export function fitProgramme(
  programme: Programme,
  have: ReadonlySet<string>,
  library: ReadonlyMap<string, EquipmentExercise>,
  /** The workouts are copied under their names in this language. */
  locale: Locale = DEFAULT_LOCALE,
): Fit {
  const workouts = Object.entries(programme.workouts).map(([key, workout]) => ({
    key,
    name: localize(workout.name, locale),
    choices: workout.exercises.map((slot) => chooseExercise(slot, have, library)),
  }))
  const choices = workouts.flatMap((workout) => workout.choices)

  return {
    workouts,
    doable: choices.every((choice) => choice.doable),
    swaps: choices.filter((choice) => choice.swapped).length,
    missing: [...new Set(choices.flatMap((choice) => choice.missing))],
  }
}

// ----------------------------------------------------------- adopting

/**
 * Copy a fitted programme into the user's workouts, and with `schedule` onto
 * their week as the active programme — ending the current one, exactly as
 * "Moved up a stage?" does. Everything goes in one transaction (each
 * `writeRow` joins it), so a closed tab cannot leave half a programme.
 */
export async function adoptProgramme(
  userId: string,
  programme: Programme,
  fit: Fit,
  {
    schedule,
    shift = 0,
    startedOn = today(),
    locale = DEFAULT_LOCALE,
  }: { schedule: boolean; shift?: number; startedOn?: string; locale?: Locale },
): Promise<{ programId: string | null; templateIds: Record<string, string> }> {
  const db = getDb(userId)
  const templateIds: Record<string, string> = {}
  let programId: string | null = null

  await db.transaction(
    'rw',
    [db.programs, db.programDays, db.workoutTemplates, db.templateItems, db.outbox, db.meta],
    async () => {
      for (const workout of fit.workouts) {
        const templateId = newId()
        templateIds[workout.key] = templateId
        await writeRow(userId, 'workoutTemplates', {
          id: templateId,
          name: workout.name,
          notes: null,
          archivedAt: null,
        })

        for (const [index, { slot, exerciseId, swapped }] of workout.choices.entries()) {
          await writeRow(userId, 'templateItems', {
            id: newId(),
            templateId,
            exerciseId,
            position: index + 1,
            sets: slot.sets,
            targetReps: slot.reps,
            targetRepsMax: null,
            // 20 kg is an empty barbell, not a sensible dumbbell or machine weight.
            targetWeightKg: swapped ? null : (slot.startKg ?? null),
            targetDurationSec: null,
            restSec: slot.restSec,
            notes: slot.notes ?? null,
          })
        }
      }

      if (!schedule) return

      const current = await activeProgram(userId)
      if (current) await writeRow(userId, 'programs', { ...current, endedOn: startedOn })

      programId = newId()
      await writeRow(userId, 'programs', {
        id: programId,
        name: localize(programme.name, locale),
        stage: programme.level,
        startedOn,
        endedOn: null,
        notes: null,
      })

      for (const [dayOfWeek, key] of shiftWeek(programme.week, shift).entries()) {
        const templateId = key === null ? undefined : templateIds[key]
        if (!templateId) continue
        await writeRow(userId, 'programDays', { id: newId(), programId, dayOfWeek, templateId })
      }
    },
  )

  return { programId, templateIds }
}
