import { describe, expect, it } from 'vitest'

import type { LocalSetLog } from '@/lib/db/dexie'
import { e1rm, personalRecords, strengthSeries, weekProgress } from '@/lib/progress'
import type { HistoryEntry } from '@/lib/session-summary'
import type { WeekDay } from '@/lib/week'

let next = 0
const set = (
  sessionId: string,
  performedAt: number,
  weightKg: number | null,
  reps: number | null,
  extra: Partial<LocalSetLog> = {},
): LocalSetLog => ({
  id: `set-${(next += 1)}`,
  userId: 'u1',
  sessionId,
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
  completedAt: performedAt,
  performedAt,
  notes: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ...extra,
})

describe('strengthSeries', () => {
  it('gives one point per session, oldest first, with the top set and best e1RM', () => {
    const series = strengthSeries([
      set('s2', 200, 65, 5),
      set('s2', 200, 67.5, 3),
      set('s1', 100, 60, 5),
      set('s1', 100, 60, 8),
    ])

    expect(series.map((point) => point.performedAt)).toEqual([100, 200])
    expect(series[0]).toMatchObject({ topKg: 60, topReps: 8, e1rmKg: e1rm(60, 8) })
    expect(series[1]).toMatchObject({ topKg: 67.5, topReps: 3 })
    // 65×5 estimates higher than 67.5×3.
    expect(series[1]?.e1rmKg).toBeCloseTo(e1rm(65, 5))
  })

  it('ignores warm-ups, bodyweight sets, tombstones and sets never done', () => {
    const series = strengthSeries([
      set('s1', 100, 100, 10, { isWarmup: true }),
      set('s1', 100, null, 10),
      set('s1', 100, 90, 1, { deletedAt: 5 }),
      set('s1', 100, 80, 1, { completedAt: null }),
      set('s1', 100, 60, 5),
    ])

    expect(series).toEqual([{ performedAt: 100, topKg: 60, topReps: 5, e1rmKg: e1rm(60, 5) }])
  })
})

describe('personalRecords', () => {
  it('finds the heaviest set per exercise, ties to more reps then the earliest', () => {
    const records = personalRecords([
      set('s1', 100, 80, 5),
      set('s2', 200, 80, 6),
      set('s3', 300, 80, 6),
      set('s3', 300, 40, 12, { exerciseId: 'curl', exerciseName: 'Curl' }),
    ])

    expect(records.map((record) => record.name)).toEqual(['Squat', 'Curl'])
    expect(records[0]).toMatchObject({ weightKg: 80, reps: 6, performedAt: 200, sessions: 3 })
    expect(records[0]?.bestE1rmKg).toBeCloseTo(e1rm(80, 6))
  })

  it('puts the lifts done most often first', () => {
    const records = personalRecords([
      set('s1', 100, 100, 1),
      set('s1', 100, 40, 12, { exerciseId: 'curl', exerciseName: 'Curl' }),
      set('s2', 200, 40, 12, { exerciseId: 'curl', exerciseName: 'Curl' }),
    ])

    expect(records.map((record) => record.name)).toEqual(['Curl', 'Squat'])
  })
})

describe('weekProgress', () => {
  const day = (weekday: number, state: WeekDay['state']): WeekDay => ({
    date: `2026-09-${14 + weekday}`,
    weekday,
    state,
    templateId: state === 'rest' ? null : 'tpl',
    name: state === 'rest' ? null : 'A',
    isToday: weekday === 2,
  })
  const entry = (date: string, volumeKg: number) =>
    ({ session: { scheduledFor: date }, volumeKg }) as unknown as HistoryEntry

  it('counts days done over days planned and sums the week’s kilos', () => {
    const days = [day(0, 'done'), day(1, 'rest'), day(2, 'missed'), day(3, 'rest'), day(4, 'planned'), day(5, 'rest'), day(6, 'rest')]

    expect(weekProgress(days, [entry('2026-09-14', 1200), entry('2026-09-07', 999)])).toEqual({
      done: 1,
      planned: 3,
      volumeKg: 1200,
    })
  })
})
