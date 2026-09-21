import { describe, expect, it } from 'vitest'

import { estimateWorkoutMs, formatEstimate, formatLast, formatTarget, planSummary } from '@/lib/plan'

const item = (extra: Partial<Parameters<typeof formatTarget>[0]> = {}) => ({
  sets: 3,
  targetReps: 5,
  targetRepsMax: null,
  restSec: 120,
  ...extra,
})

describe('formatTarget', () => {
  it('reads sets by reps', () => {
    expect(formatTarget(item())).toBe('3×5')
  })

  it('shows a rep range when there is one', () => {
    expect(formatTarget(item({ targetReps: 8, targetRepsMax: 12 }))).toBe('3×8–12')
  })

  it('ignores a maximum equal to the target — 5–5 is 5', () => {
    expect(formatTarget(item({ targetRepsMax: 5 }))).toBe('3×5')
  })

  it('gives a timed set its minutes, and no reps', () => {
    expect(formatTarget(item({ sets: 1, targetDurationSec: 600 }))).toBe('10 min')
    expect(formatTarget(item({ sets: 3, targetDurationSec: 90 }))).toBe('3×1.5 min')
  })
})

describe('estimateWorkoutMs', () => {
  it('counts every set as its work plus its rest', () => {
    // 3 sets × (45s work + 120s rest), less the rest that never gets taken.
    expect(estimateWorkoutMs([item()])).toBe((3 * 165 - 120) * 1000)
  })

  it('takes a timed set at its prescribed length', () => {
    expect(estimateWorkoutMs([item({ sets: 1, targetDurationSec: 600, restSec: 60 })])).toBe(600 * 1000)
  })

  it('adds up a whole workout, dropping only the last rest', () => {
    const ms = estimateWorkoutMs([item(), item({ sets: 4, restSec: 60 })])
    expect(ms).toBe((3 * 165 + 4 * 105 - 60) * 1000)
  })

  it('is zero for a workout with nothing in it', () => {
    expect(estimateWorkoutMs([])).toBe(0)
  })
})

describe('formatEstimate', () => {
  it('rounds to five minutes, because it is a guess', () => {
    expect(formatEstimate(23 * 60_000)).toBe('about 25 min')
    expect(formatEstimate(22 * 60_000)).toBe('about 20 min')
  })

  it('never promises no time at all', () => {
    expect(formatEstimate(30_000)).toBe('about 5 min')
  })

  it('rolls over into hours', () => {
    expect(formatEstimate(64 * 60_000)).toBe('about 1 h 5 min')
  })
})

describe('planSummary', () => {
  it('counts the exercises and the minutes', () => {
    expect(planSummary(5, 44 * 60_000)).toBe('5 exercises · about 45 min')
  })

  it('says exercise once', () => {
    expect(planSummary(1, 10 * 60_000)).toBe('1 exercise · about 10 min')
  })

  it('has nothing to estimate for an empty workout', () => {
    expect(planSummary(0, 0)).toBe('No exercises yet')
  })

  it('reads in Spanish', () => {
    expect(planSummary(5, 44 * 60_000, 'es')).toBe('5 ejercicios · unos 45 min')
    expect(planSummary(1, 10 * 60_000, 'es')).toBe('1 ejercicio · unos 10 min')
    expect(planSummary(0, 0, 'es')).toBe('Sin ejercicios todavía')
    expect(formatEstimate(64 * 60_000, 'es')).toBe('unos 1 h 5 min')
  })
})

describe('formatLast', () => {
  it('is the weight when there was one', () => {
    expect(formatLast({ weightKg: 60, reps: 5 })).toBe('60 kg')
    expect(formatLast({ weightKg: 62.5, reps: 5 })).toBe('62.5 kg')
  })

  it('is the reps for a bodyweight set, not 0 kg', () => {
    expect(formatLast({ weightKg: null, reps: 12 })).toBe('12 reps')
    expect(formatLast({ weightKg: 0, reps: 12 })).toBe('12 reps')
  })

  it('writes the weight with a decimal comma in Spanish', () => {
    expect(formatLast({ weightKg: 62.5, reps: 5 }, 'kg', 'es')).toBe('62,5 kg')
  })

  it('is the minutes for a timed set', () => {
    expect(formatLast({ weightKg: null, reps: null, durationSec: 480 })).toBe('8 min')
  })
})
