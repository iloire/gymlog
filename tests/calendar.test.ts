import { describe, expect, it } from 'vitest'

import { addDays, addMonths, monthGrid, streakHint, weekStart, weekStreak } from '@/lib/calendar'

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart('2026-09-15')).toBe('2026-09-14')
    expect(weekStart('2026-09-14')).toBe('2026-09-14')
    expect(weekStart('2026-09-20')).toBe('2026-09-14')
  })
})

describe('addDays and addMonths', () => {
  it('cross month and year ends, and the DST change', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
})

describe('monthGrid', () => {
  it('lays a month out Monday-first with blanks for other months', () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const grid = monthGrid('2026-09')
    expect(grid).toHaveLength(5)
    expect(grid[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(grid.at(-1)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null])
    expect(grid.flat().filter(Boolean)).toHaveLength(30)
  })

  it('needs no leading blank when the 1st is a Monday', () => {
    expect(monthGrid('2026-06')[0]?.[0]).toBe('2026-06-01')
  })
})

describe('weekStreak', () => {
  // Wednesday.
  const today = '2026-09-16'

  it('counts weeks in a row with a workout, however many rest days between', () => {
    const streak = weekStreak(['2026-09-14', '2026-09-15', '2026-09-07', '2026-08-31'], today)
    expect(streak).toEqual({ current: 3, best: 3, thisWeek: 2 })
  })

  it('keeps last week’s run alive while this week is still open', () => {
    expect(weekStreak(['2026-09-10', '2026-09-01'], today)).toMatchObject({ current: 2, thisWeek: 0 })
  })

  it('breaks on a whole week without training, and remembers the best run', () => {
    const dates = ['2026-09-15', '2026-08-26', '2026-08-19', '2026-08-12']
    expect(weekStreak(dates, today)).toEqual({ current: 1, best: 3, thisWeek: 1 })
    expect(weekStreak(['2026-08-31'], today).current).toBe(0)
  })

  it('ignores dates after today', () => {
    expect(weekStreak(['2026-09-22'], today)).toEqual({ current: 0, best: 0, thisWeek: 0 })
  })

  it('counts a day with two workouts once', () => {
    expect(weekStreak(['2026-09-15', '2026-09-15'], today).thisWeek).toBe(1)
  })
})

describe('streakHint', () => {
  it('names what keeps the streak going', () => {
    expect(streakHint({ current: 0, best: 4, thisWeek: 0 })).toEqual({ key: 'newStreak', count: 0 })
    expect(streakHint({ current: 3, best: 4, thisWeek: 0 })).toEqual({ key: 'nextMakes', count: 4 })
    expect(streakHint({ current: 1, best: 1, thisWeek: 2 })).toEqual({ key: 'started', count: 1 })
    expect(streakHint({ current: 5, best: 5, thisWeek: 1 })).toEqual({ key: 'bestYet', count: 5 })
    expect(streakHint({ current: 2, best: 6, thisWeek: 1 })).toEqual({ key: 'bestIs', count: 6 })
  })
})
