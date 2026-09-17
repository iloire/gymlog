import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import {
  bodyWeightSeries,
  dateToEpoch,
  dayOfWeek,
  epochToDate,
  lastPerformance,
  planPreview,
  today,
  weekSchedule,
} from '@/lib/queries'

const USER = 'user-1'
const SQUAT = 'Barbell_Squat'

async function loggedSet(
  sessionId: string,
  setIndex: number,
  weightKg: number,
  reps: number,
  performedAt: number,
  extra: Record<string, unknown> = {},
) {
  await writeRow(USER, 'setLogs', {
    id: `${sessionId}-${setIndex}`,
    sessionId,
    exerciseId: SQUAT,
    exerciseName: 'Barbell Squat',
    position: 1,
    setIndex,
    weightKg,
    reps,
    isWarmup: false,
    completedAt: performedAt,
    performedAt,
    ...extra,
  })
}

describe('dates', () => {
  it('formats a local calendar date, not a UTC one', () => {
    // 00:30 local on the 15th is still the 15th, even where UTC says the 14th.
    expect(today(new Date(2026, 8, 15, 0, 30))).toBe('2026-09-15')
    expect(today(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })

  it('counts weekdays from Monday', () => {
    expect(dayOfWeek(new Date(2026, 8, 14))).toBe(0) // Monday
    expect(dayOfWeek(new Date(2026, 8, 20))).toBe(6) // Sunday
  })

  it('round-trips a date through midnight local time', () => {
    expect(today(new Date(dateToEpoch('2026-09-15')))).toBe('2026-09-15')
    expect(epochToDate(dateToEpoch('2026-09-15'))).toBe('2026-09-15')
    // A timestamp late in the day still belongs to that day, not the next one.
    expect(epochToDate(dateToEpoch('2026-09-15') + 23 * 3_600_000)).toBe('2026-09-15')
  })
})

describe('lastPerformance', () => {
  beforeEach(async () => {
    await destroyDb(USER)
  })

  it('returns the most recent session only, in set order', async () => {
    const older = dateToEpoch('2026-09-01')
    const newer = dateToEpoch('2026-09-08')

    await loggedSet('s-old', 1, 60, 8, older)
    await loggedSet('s-old', 2, 60, 8, older)
    await loggedSet('s-new', 2, 67.5, 6, newer)
    await loggedSet('s-new', 1, 65, 8, newer)

    const result = await lastPerformance(USER, SQUAT)

    expect(result?.performedAt).toBe(newer)
    expect(result?.sets.map((set) => set.weightKg)).toEqual([65, 67.5])
    expect(result?.topSet.weightKg).toBe(67.5)
  })

  it('ignores warm-ups, tombstones and sets that were never completed', async () => {
    const when = dateToEpoch('2026-09-08')
    await loggedSet('s-1', 1, 20, 10, when, { isWarmup: true })
    await loggedSet('s-1', 2, 60, 5, when)
    await loggedSet('s-1', 3, 999, 1, when, { completedAt: null })
    await loggedSet('s-1', 4, 888, 1, when, { deletedAt: when })

    const result = await lastPerformance(USER, SQUAT)

    expect(result?.sets.map((set) => set.weightKg)).toEqual([60])
  })

  it('excludes the session in progress, so mid-workout it still shows last time', async () => {
    await loggedSet('s-old', 1, 60, 8, dateToEpoch('2026-09-01'))
    await loggedSet('s-today', 1, 80, 3, dateToEpoch('2026-09-15'))

    const result = await lastPerformance(USER, SQUAT, 's-today')

    expect(result?.sets.map((set) => set.weightKg)).toEqual([60])
  })

  it('counts a timed set, which has minutes and no reps', async () => {
    const day = dateToEpoch('2026-09-08')
    await loggedSet('s-cardio', 1, 0, 0, day, { weightKg: null, reps: null, durationSec: 480 })

    expect((await lastPerformance(USER, SQUAT))?.sets.map((set) => set.durationSec)).toEqual([480])
  })

  it('returns null for an exercise never logged', async () => {
    expect(await lastPerformance(USER, 'Never_Done')).toBeNull()
  })
})

describe('bodyWeightSeries', () => {
  beforeEach(async () => {
    await destroyDb(USER)
  })

  it('orders oldest first and smooths over a trailing 7-day window', async () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03']
    const weights = [80, 82, 84]

    for (const [index, measuredOn] of days.entries()) {
      await writeRow(USER, 'bodyWeights', {
        id: `bw-${measuredOn}`,
        measuredOn,
        weightKg: weights[index],
      })
    }

    const series = await bodyWeightSeries(USER)

    expect(series.map((entry) => entry.measuredOn)).toEqual(days)
    expect(series[0]?.rolling).toBe(80)
    expect(series[2]?.rolling).toBe(82) // (80 + 82 + 84) / 3
  })

  it('drops deleted entries', async () => {
    await writeRow(USER, 'bodyWeights', {
      id: 'bw-1',
      measuredOn: '2026-09-01',
      weightKg: 80,
      deletedAt: 1,
    })
    expect(await bodyWeightSeries(USER)).toHaveLength(0)
  })
})

describe('weekSchedule', () => {
  beforeEach(async () => {
    await destroyDb(USER)
    await writeRow(USER, 'programs', {
      id: 'beginner',
      name: 'Beginner',
      stage: null,
      startedOn: '2026-06-01',
      endedOn: null,
      notes: null,
    })
  })

  it('is null without an active programme', async () => {
    await destroyDb(USER)
    expect(await weekSchedule(USER)).toBeNull()
  })

  it('maps every training weekday to its workout in one read', async () => {
    await writeRow(USER, 'programDays', { id: 'd-0', programId: 'beginner', dayOfWeek: 0, templateId: 'a' })
    await writeRow(USER, 'programDays', { id: 'd-2', programId: 'beginner', dayOfWeek: 2, templateId: 'b' })
    await writeRow(USER, 'programDays', { id: 'd-4', programId: 'beginner', dayOfWeek: 4, templateId: 'a' })

    const schedule = await weekSchedule(USER)

    expect(schedule?.programId).toBe('beginner')
    expect([...(schedule?.days ?? [])]).toEqual([
      [0, 'a'],
      [2, 'b'],
      [4, 'a'],
    ])
  })

  it('leaves out a day taken off the programme', async () => {
    await writeRow(USER, 'programDays', { id: 'd-2', programId: 'beginner', dayOfWeek: 2, templateId: 'b', deletedAt: 1 })
    expect((await weekSchedule(USER))?.days.size).toBe(0)
  })
})

describe('planPreview', () => {
  beforeEach(async () => {
    await destroyDb(USER)
    await writeRow(USER, 'exercises', { id: SQUAT, userId: null, name: 'Barbell Squat', slug: 'barbell-squat' })
    await writeRow(USER, 'templateItems', {
      id: 'ti-1',
      templateId: 'workout-a',
      exerciseId: SQUAT,
      position: 1,
      sets: 3,
      targetReps: 5,
      targetRepsMax: null,
      targetWeightKg: null,
      restSec: 120,
      notes: null,
    })
  })

  it('names each exercise, what it asks for, and what you lifted there last', async () => {
    await loggedSet('s-old', 1, 57.5, 5, dateToEpoch('2026-09-01'))
    await loggedSet('s-last', 1, 60, 5, dateToEpoch('2026-09-08'))

    const { lines, estimateMs } = await planPreview(USER, 'workout-a')

    expect(lines).toEqual([{ exerciseId: SQUAT, name: 'Barbell Squat', target: '3×5', last: '60 kg' }])
    expect(estimateMs).toBe((3 * (45 + 120) - 120) * 1000)
  })

  it('has no last for an exercise never done', async () => {
    expect((await planPreview(USER, 'workout-a')).lines[0]?.last).toBeNull()
  })

  it('leaves out an exercise removed from the workout', async () => {
    await writeRow(USER, 'templateItems', { id: 'ti-1', deletedAt: 1 })
    expect(await planPreview(USER, 'workout-a')).toEqual({ lines: [], estimateMs: 0 })
  })
})

describe('getDb isolation', () => {
  it('gives each user their own database', async () => {
    await destroyDb('user-a')
    await destroyDb('user-b')

    await writeRow('user-a', 'bodyWeights', { id: 'x', measuredOn: '2026-09-01', weightKg: 80 })

    // A shared phone must never show one account's log to another.
    expect(await getDb('user-b').bodyWeights.count()).toBe(0)
    expect(await getDb('user-a').bodyWeights.count()).toBe(1)
  })
})
