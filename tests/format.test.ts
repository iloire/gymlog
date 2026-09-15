import { describe, expect, it } from 'vitest'

import { formatDuration, kg } from '@/lib/format'

describe('kg', () => {
  it('groups thousands and keeps one decimal only when there is one', () => {
    expect(kg(4250)).toBe('4,250 kg')
    expect(kg(62.5)).toBe('62.5 kg')
    expect(kg(60.04)).toBe('60 kg')
  })
})

describe('formatDuration', () => {
  it('shows minutes, then hours and minutes', () => {
    expect(formatDuration(52 * 60_000)).toBe('52 min')
    expect(formatDuration(60 * 60_000)).toBe('1 h')
    expect(formatDuration(65 * 60_000 + 20_000)).toBe('1 h 5 min')
  })
})
