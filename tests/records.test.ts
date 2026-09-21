import { describe, expect, it } from 'vitest'

import type { LocalSetLog } from '@/lib/db/dexie'
import { bestSet, compareExercise, heavierThanLastTime, recordHeadline, type Previous } from '@/lib/records'
import type { HistoryExercise } from '@/lib/session-summary'

let next = 0
const set = (extra: Partial<LocalSetLog> = {}): LocalSetLog => ({
  id: `set-${(next += 1)}`,
  userId: 'u1',
  sessionId: 's1',
  exerciseId: 'bench',
  exerciseName: 'Bench press',
  position: 0,
  setIndex: 1,
  targetReps: 5,
  targetRepsMax: null,
  targetWeightKg: null,
  restSec: 120,
  weightKg: 80,
  reps: 5,
  isWarmup: false,
  completedAt: 1,
  performedAt: 1,
  notes: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ...extra,
})

const exercise = (sets: LocalSetLog[]): HistoryExercise => ({
  exerciseId: 'bench',
  name: 'Bench press',
  sets,
  notes: null,
})

const lastTime = (sets: LocalSetLog[]): Previous => ({
  sets,
  topSet: sets.reduce((top, one) => ((one.weightKg ?? 0) > (top.weightKg ?? 0) ? one : top)),
})

describe('compareExercise', () => {
  it('counts the kilos added to last time’s heaviest set', () => {
    const record = compareExercise(
      exercise([set({ weightKg: 82.5, reps: 5 })]),
      lastTime([set({ weightKg: 80, reps: 5 })]),
    )

    expect(record.weightUpKg).toBe(2.5)
    expect(recordHeadline(record)).toBe('+2.5 kg')
    expect(recordHeadline(record, 'kg', 'es')).toBe('+2,5 kg')
    expect(record.previousBest?.weightKg).toBe(80)
  })

  it('says nothing when every measure went down', () => {
    const record = compareExercise(
      exercise([set({ weightKg: 75, reps: 4 })]),
      lastTime([set({ weightKg: 80, reps: 5 })]),
    )

    expect(record.weightUpKg).toBeNull()
    expect(record.repsUp).toBeNull()
    expect(record.volumeUpKg).toBeNull()
    expect(recordHeadline(record)).toBeNull()
  })

  it('still counts a lighter day that did more total work', () => {
    // 75×8 is 600 kg against 400. The bar was lighter; the work was not.
    const record = compareExercise(
      exercise([set({ weightKg: 75, reps: 8 })]),
      lastTime([set({ weightKg: 80, reps: 5 })]),
    )

    expect(record.weightUpKg).toBeNull()
    expect(recordHeadline(record)).toBe('+200 kg total')
  })

  it('counts reps only when the weight held — a rep range is progress at the same load', () => {
    const record = compareExercise(
      exercise([set({ weightKg: 80, reps: 8 })]),
      lastTime([set({ weightKg: 80, reps: 6 })]),
    )

    expect(record.repsUp).toBe(2)
    expect(recordHeadline(record)).toBe('+2 reps')
  })

  it('does not call 82.5×3 after 80×8 a rep gain', () => {
    const record = compareExercise(
      exercise([set({ weightKg: 82.5, reps: 3 })]),
      lastTime([set({ weightKg: 80, reps: 8 })]),
    )

    expect(record.repsUp).toBeNull()
    expect(record.weightUpKg).toBe(2.5)
  })

  it('falls back to total work when neither the top weight nor its reps moved', () => {
    // Same top set, one extra set of it: more work done, and worth saying so.
    const record = compareExercise(
      exercise([set({ weightKg: 80, reps: 5 }), set({ setIndex: 2, weightKg: 80, reps: 5 })]),
      lastTime([set({ weightKg: 80, reps: 5 })]),
    )

    expect(record.weightUpKg).toBeNull()
    expect(record.repsUp).toBeNull()
    expect(record.volumeUpKg).toBe(400)
    expect(recordHeadline(record)).toBe('+400 kg total')
  })

  it('ignores warm-up sets on both sides', () => {
    const record = compareExercise(
      exercise([set({ weightKg: 100, reps: 10, isWarmup: true }), set({ setIndex: 2, weightKg: 80, reps: 5 })]),
      lastTime([set({ weightKg: 80, reps: 5 })]),
    )

    expect(record.best?.weightKg).toBe(80)
    expect(recordHeadline(record)).toBeNull()
  })

  it('compares a timed exercise on time, never on weight', () => {
    const run = (durationSec: number) => set({ exerciseId: 'row', weightKg: null, reps: null, durationSec })
    const record = compareExercise(exercise([run(600)]), lastTime([run(480)]))

    expect(record.timeUpSec).toBe(120)
    expect(record.weightUpKg).toBeNull()
    expect(record.volumeUpKg).toBeNull()
    expect(recordHeadline(record)).toBe('+2 min')
  })

  it('marks an exercise never done before, and claims nothing for it', () => {
    const record = compareExercise(exercise([set({ weightKg: 80, reps: 5 })]), null)

    expect(record.first).toBe(true)
    expect(record.previousBest).toBeNull()
    expect(recordHeadline(record)).toBeNull()
  })

  it('takes the heaviest set as the best one, not the last', () => {
    const record = compareExercise(
      exercise([set({ weightKg: 85, reps: 3 }), set({ setIndex: 2, weightKg: 70, reps: 10 })]),
      lastTime([set({ weightKg: 80, reps: 5 })]),
    )

    expect(record.best?.weightKg).toBe(85)
    expect(record.weightUpKg).toBe(5)
  })
})

describe('bestSet', () => {
  it('takes the heaviest working set, ties to more reps, and skips warm-ups', () => {
    const sets = [set({ weightKg: 80, reps: 5 }), set({ weightKg: 85, reps: 3 }), set({ weightKg: 85, reps: 4 })]
    expect(bestSet([...sets, set({ weightKg: 100, reps: 10, isWarmup: true })])).toBe(sets[2])
  })

  it('takes the most reps of a bodyweight exercise and the longest of a timed one', () => {
    expect(bestSet([set({ weightKg: null, reps: 8 }), set({ weightKg: null, reps: 12 })])).toMatchObject({ reps: 12 })
    expect(
      bestSet([set({ weightKg: null, reps: null, durationSec: 600 }), set({ weightKg: null, reps: null, durationSec: 900 })]),
    ).toMatchObject({ durationSec: 900 })
  })

  it('is null when every set was a warm-up', () => {
    expect(bestSet([set({ isWarmup: true })])).toBeNull()
  })
})

describe('heavierThanLastTime', () => {
  it('is the red edge: over last time’s top set, and only over', () => {
    expect(heavierThanLastTime(82.5, 80)).toBe(true)
    expect(heavierThanLastTime(80, 80)).toBe(false)
    expect(heavierThanLastTime(77.5, 80)).toBe(false)
  })

  it('claims nothing with nothing to beat — a first time, or a timed exercise', () => {
    expect(heavierThanLastTime(80, null)).toBe(false)
    expect(heavierThanLastTime(null, 80)).toBe(false)
  })

  it('counts loading a bodyweight movement that carried nothing last time', () => {
    expect(heavierThanLastTime(10, 0)).toBe(true)
  })
})
