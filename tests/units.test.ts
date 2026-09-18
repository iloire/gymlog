import { describe, expect, it } from 'vitest'

import { displayWeight, formatWeight, fromUnit, parseUnit, tidyWeight, toUnit } from '@/lib/units'
import { weightStep } from '@/lib/weights'

describe('units', () => {
  it('falls back to kilograms for anything it does not know', () => {
    expect(parseUnit('lb')).toBe('lb')
    expect(parseUnit('kg')).toBe('kg')
    expect(parseUnit('st')).toBe('kg')
    expect(parseUnit(undefined)).toBe('kg')
  })

  it('leaves kilograms alone', () => {
    expect(toUnit(77.5, 'kg')).toBe(77.5)
    expect(fromUnit(77.5, 'kg')).toBe(77.5)
    expect(displayWeight(77.5, 'kg')).toBe(77.5)
  })

  it('brings a pound figure back out exactly as it was typed', () => {
    for (const lb of [45, 95, 135, 137.5, 185, 225, 315, 405]) {
      expect(displayWeight(fromUnit(lb, 'lb'), 'lb')).toBe(lb)
    }
  })

  it('stores a typed pound weight to the gram, so two phones write the same row', () => {
    expect(fromUnit(135, 'lb')).toBe(61.235)
    expect(fromUnit(225, 'lb')).toBe(102.058)
  })

  it('shows kilogram history in pounds to one decimal', () => {
    expect(displayWeight(100, 'lb')).toBe(220.5)
    expect(displayWeight(77.5, 'lb')).toBe(170.9)
    expect(displayWeight(2.5, 'lb')).toBe(5.5)
  })

  it('formats with the unit, grouping thousands and dropping a zero decimal', () => {
    expect(formatWeight(4250, 'kg')).toBe('4,250 kg')
    expect(formatWeight(62.5, 'kg')).toBe('62.5 kg')
    expect(formatWeight(60.04, 'kg')).toBe('60 kg')
    expect(formatWeight(61.235, 'lb')).toBe('135 lb')
    expect(formatWeight(4250, 'lb')).toBe('9,369.6 lb')
  })

  it('steps a pound gym in pound plates, not converted kilograms', () => {
    expect(weightStep({ equipment: 'barbell', primaryMuscles: null }, 'lb')).toBe(5)
    expect(weightStep({ equipment: 'machine', primaryMuscles: null }, 'lb')).toBe(10)
    expect(weightStep({ equipment: 'body only', primaryMuscles: null }, 'lb')).toBe(2.5)
    expect(weightStep({ equipment: 'barbell', primaryMuscles: null }, 'kg')).toBe(2.5)
  })

  it('moves a weight written in the other unit onto the plates, and leaves a clean one alone', () => {
    // The empty 20 kg bar of a premade programme, in a pound gym.
    expect(displayWeight(tidyWeight(20, 'lb'), 'lb')).toBe(45)
    expect(displayWeight(tidyWeight(62.5, 'lb'), 'lb')).toBe(137.5)
    expect(displayWeight(tidyWeight(77.5, 'lb'), 'lb')).toBe(170)
    // A pound prescription, seen in kilograms.
    expect(displayWeight(tidyWeight(fromUnit(137.5, 'lb'), 'kg'), 'kg')).toBe(62.5)
    // Already clean: untouched, to the gram.
    expect(tidyWeight(15, 'kg')).toBe(15)
    expect(tidyWeight(77.5, 'kg')).toBe(77.5)
    expect(tidyWeight(fromUnit(135, 'lb'), 'lb')).toBe(fromUnit(135, 'lb'))
  })
})
