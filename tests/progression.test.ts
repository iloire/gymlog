import { describe, expect, it } from 'vitest'

import type { LocalSetLog } from '@/lib/db/dexie'
import { suggestNext } from '@/lib/progression'
import { displayWeight } from '@/lib/units'
import { progressionIncrementKg, roundToStep, weightStepKg } from '@/lib/weights'

let next = 0
const set = (weightKg: number | null, reps: number | null, extra: Partial<LocalSetLog> = {}): LocalSetLog => ({
  id: `set-${(next += 1)}`,
  userId: 'u1',
  sessionId: 's1',
  exerciseId: 'squat',
  exerciseName: 'Squat',
  position: 0,
  setIndex: 1,
  targetReps: 5,
  targetRepsMax: null,
  targetWeightKg: null,
  restSec: 120,
  weightKg,
  reps,
  isWarmup: false,
  completedAt: 1,
  performedAt: 1,
  notes: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ...extra,
})

const threeByFive = { targetReps: 5, targetRepsMax: null, targetWeightKg: null }
const barbell = { incrementKg: 2.5, stepKg: 2.5 }

describe('suggestNext', () => {
  it('adds the increment once every prescribed rep was hit', () => {
    const result = suggestNext({
      previous: [set(60, 5), set(60, 5), set(60, 5)],
      prescription: threeByFive,
      ...barbell,
    })

    expect(result).toEqual({ weightKg: 62.5, reps: 5, reason: 'All 3×5 at 60 kg last time → 62.5 kg' })
  })

  it('repeats the weight after a missed rep', () => {
    const result = suggestNext({
      previous: [set(60, 5), set(60, 5), set(60, 4)],
      prescription: threeByFive,
      ...barbell,
    })

    expect(result).toMatchObject({ weightKg: 60, reps: 5, reason: 'Missed reps at 60 kg last time, repeat it' })
  })

  it('drops 10% after missing twice at the same weight, rounded to a loadable weight', () => {
    const result = suggestNext({
      previous: [set(60, 5), set(60, 4)],
      before: [set(60, 5), set(60, 3)],
      prescription: threeByFive,
      ...barbell,
    })

    // 54 rounds to 55 on 2.5 kg plates.
    expect(result).toMatchObject({ weightKg: 55, reason: 'Missed twice at 60 kg → drop 10% to 55 kg' })
  })

  it('does not deload when the earlier miss was at a different weight', () => {
    const result = suggestNext({
      previous: [set(60, 4)],
      before: [set(57.5, 4)],
      prescription: threeByFive,
      ...barbell,
    })

    expect(result.weightKg).toBe(60)
  })

  it('treats a set marked failed as a miss even when the reps were there', () => {
    const result = suggestNext({
      previous: [set(60, 5), set(60, 5, { effort: 'failed' })],
      prescription: threeByFive,
      ...barbell,
    })

    expect(result.weightKg).toBe(60)
  })

  it('climbs the reps of a range before adding weight, then starts the range again', () => {
    const range = { targetReps: 8, targetRepsMax: 12, targetWeightKg: null }

    expect(suggestNext({ previous: [set(20, 9), set(20, 8)], prescription: range, incrementKg: 2, stepKg: 2 })).toEqual({
      weightKg: 20,
      reps: 9,
      reason: '20 kg again, aim for 9 on every set',
    })

    expect(suggestNext({ previous: [set(20, 12), set(20, 12)], prescription: range, incrementKg: 2, stepKg: 2 })).toEqual({
      weightKg: 22,
      reps: 8,
      reason: 'All 2×12 at 20 kg last time → 22 kg from 8',
    })
  })

  it('adds a rep instead of weight to a movement that carries none', () => {
    const result = suggestNext({
      previous: [set(null, 8), set(null, 8), set(null, 8)],
      prescription: { targetReps: 8, targetRepsMax: null, targetWeightKg: null },
      incrementKg: null,
      stepKg: 1,
    })

    expect(result).toEqual({ weightKg: null, reps: 9, reason: 'All 3×8 last time → try 9' })
  })

  it('falls back to the prescription the first time', () => {
    const result = suggestNext({
      previous: null,
      prescription: { targetReps: 5, targetRepsMax: null, targetWeightKg: 20 },
      ...barbell,
    })

    expect(result).toEqual({ weightKg: 20, reps: 5, reason: null })
  })

  it('has nothing to say about a timed set or a set with no rep target', () => {
    expect(
      suggestNext({ previous: [set(null, null, { durationSec: 600 })], prescription: threeByFive, ...barbell }).reason,
    ).toBeNull()
    expect(
      suggestNext({
        previous: [set(60, 5)],
        prescription: { targetReps: null, targetRepsMax: null, targetWeightKg: null },
        ...barbell,
      }).weightKg,
    ).toBeNull()
  })

  it('ignores warm-ups and sets never completed', () => {
    const result = suggestNext({
      previous: [set(20, 10, { isWarmup: true }), set(60, 5), set(60, 5, { completedAt: null })],
      prescription: threeByFive,
      ...barbell,
    })

    expect(result.weightKg).toBe(62.5)
  })
})

describe('weight steps', () => {
  it('follows the equipment', () => {
    expect(weightStepKg({ equipment: 'barbell', primaryMuscles: null })).toBe(2.5)
    expect(weightStepKg({ equipment: 'dumbbell', primaryMuscles: null })).toBe(2)
    expect(weightStepKg({ equipment: 'machine', primaryMuscles: null })).toBe(5)
    expect(weightStepKg({ equipment: 'body only', primaryMuscles: null })).toBe(1)
    expect(weightStepKg(null)).toBe(1)
  })

  it('progresses a barbell leg lift twice as fast as an upper-body one', () => {
    expect(progressionIncrementKg({ equipment: 'barbell', primaryMuscles: ['quadriceps'] })).toBe(5)
    expect(progressionIncrementKg({ equipment: 'barbell', primaryMuscles: ['chest'] })).toBe(2.5)
    expect(progressionIncrementKg({ equipment: 'dumbbell', primaryMuscles: ['quadriceps'] })).toBe(2)
  })

  it('has no weight increment for a movement that carries none', () => {
    expect(progressionIncrementKg({ equipment: 'body only', primaryMuscles: ['lats'] })).toBeNull()
    expect(progressionIncrementKg({ equipment: 'bands', primaryMuscles: null })).toBeNull()
  })

  it('rounds to a loadable weight', () => {
    expect(roundToStep(54, 2.5)).toBe(55)
    expect(roundToStep(53.5, 2.5)).toBe(52.5)
    expect(roundToStep(-1, 2.5)).toBe(0)
  })

  it('steps in whole pounds for a pound gym, stored as kilograms', () => {
    const squat = { equipment: 'barbell', primaryMuscles: ['quadriceps'] }
    expect(weightStepKg(squat, 'lb')).toBeCloseTo(2.268, 3)
    expect(progressionIncrementKg(squat, 'lb')).toBeCloseTo(4.536, 3)
    expect(progressionIncrementKg({ equipment: 'machine', primaryMuscles: ['chest'] }, 'lb')).toBeCloseTo(4.536, 3)
  })
})

describe('suggestNext in pounds', () => {
  it('speaks in the unit and lands on a weight the plates make', () => {
    // 135 lb, logged from a pound gym, is 61.235 kg on disk.
    const result = suggestNext({
      previous: [set(61.235, 5), set(61.235, 5), set(61.235, 5)],
      prescription: threeByFive,
      incrementKg: progressionIncrementKg({ equipment: 'barbell', primaryMuscles: ['quadriceps'] }, 'lb'),
      stepKg: weightStepKg({ equipment: 'barbell', primaryMuscles: ['quadriceps'] }, 'lb'),
      unit: 'lb',
    })
    expect(result.reason).toBe('All 3×5 at 135 lb last time → 145 lb')
    expect(displayWeight(result.weightKg ?? 0, 'lb')).toBe(145)
  })

  it('lands kilogram history on a pound weight the plates make', () => {
    const result = suggestNext({
      previous: [set(77.5, 5), set(77.5, 5), set(77.5, 5)],
      prescription: threeByFive,
      incrementKg: 4.536,
      stepKg: 2.268,
      unit: 'lb',
    })
    // 77.5 kg is 170.9 lb; plus 10 lb is 180.9, which no bar makes → 180.
    expect(result.reason).toBe('All 3×5 at 170.9 lb last time → 180 lb')
  })

  it('starts a kilogram prescription on the pound bar', () => {
    const result = suggestNext({
      previous: null,
      prescription: { ...threeByFive, targetWeightKg: 20 },
      incrementKg: 4.536,
      stepKg: 2.268,
      unit: 'lb',
    })
    expect(displayWeight(result.weightKg ?? 0, 'lb')).toBe(45)
  })
})
