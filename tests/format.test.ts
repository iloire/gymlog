import { describe, expect, it } from 'vitest'

import { formatDay, formatDuration, formatSet, parseNumber } from '@/lib/format'

describe('formatDay', () => {
  it('shows one format for a calendar date and for a timestamp', () => {
    expect(formatDay('2026-09-17')).toBe('17 Sept 2026')
    expect(formatDay('2026-01-05')).toBe('5 Jan 2026')
    expect(formatDay(Date.UTC(2026, 8, 17, 23, 30))).toBe('17 Sept 2026')
  })

  it('does not shift a calendar date into the day before, whatever the timezone', () => {
    expect(formatDay('2026-03-01')).toBe('1 Mar 2026')
  })
})

describe('formatDuration', () => {
  it('shows minutes, then hours and minutes', () => {
    expect(formatDuration(52 * 60_000)).toBe('52 min')
    expect(formatDuration(60 * 60_000)).toBe('1 h')
    expect(formatDuration(65 * 60_000 + 20_000)).toBe('1 h 5 min')
  })
})

describe('formatSet', () => {
  it('shows time for cardio, weight × reps, or reps alone for bodyweight', () => {
    expect(formatSet({ weightKg: null, reps: null, durationSec: 480 })).toBe('8 min')
    expect(formatSet({ weightKg: null, reps: null, durationSec: 450 })).toBe('7.5 min')
    expect(formatSet({ weightKg: 80, reps: 5 })).toBe('80×5')
    expect(formatSet({ weightKg: null, reps: 12, durationSec: null })).toBe('12 reps')
  })

  it('shows the weight in pounds when asked, still from the stored kilograms', () => {
    expect(formatSet({ weightKg: 61.235, reps: 5 }, 'lb')).toBe('135×5')
    expect(formatSet({ weightKg: 80, reps: 5 }, 'lb')).toBe('176.4×5')
    expect(formatSet({ weightKg: null, reps: 12 }, 'lb')).toBe('12 reps')
  })
})

describe('parseNumber', () => {
  it('reads a decimal typed with a point or a comma, and one still being typed', () => {
    expect(parseNumber('42.5')).toBe(42.5)
    expect(parseNumber('42,5')).toBe(42.5)
    expect(parseNumber('42.')).toBe(42)
    expect(parseNumber(' 100 ')).toBe(100)
  })

  it('is null until there is a number', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('.')).toBeNull()
    expect(parseNumber('-')).toBeNull()
    expect(parseNumber('4x')).toBeNull()
  })
})
