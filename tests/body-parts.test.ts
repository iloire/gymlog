import { describe, expect, it } from 'vitest'

import { bodyParts, labelKey } from '@/lib/body-parts'

const lift = (primaryMuscles: string[] | null, sets = 3, category = 'strength') => ({
  exercise: { category, primaryMuscles },
  sets,
})

describe('bodyParts', () => {
  it('folds muscles into body parts, most sets first', () => {
    expect(
      bodyParts([
        lift(['quadriceps'], 4),
        lift(['lower back'], 3),
        lift(['hamstrings'], 3),
        lift(['quadriceps'], 3),
      ]),
    ).toEqual(['Legs', 'Back'])
  })

  it('counts an exercise once per body part, and keeps workout order on a tie', () => {
    expect(bodyParts([lift(['chest', 'triceps'], 3), lift(['biceps', 'forearms'], 2), lift(['chest'], 2)])).toEqual([
      'Chest',
      'Arms',
    ])
    expect(bodyParts([lift(['shoulders'], 3), lift(['abdominals'], 3)])).toEqual(['Shoulders', 'Abs'])
  })

  it('calls cardio cardio, and skips exercises with no muscles', () => {
    expect(
      bodyParts([lift(['quadriceps'], 1, 'cardio'), lift(null), lift([]), { exercise: undefined, sets: 5 }]),
    ).toEqual(['Cardio'])
  })
})

describe('labelKey', () => {
  it('turns a library value into the camelCase key its display name lives under', () => {
    expect(labelKey('Legs')).toBe('legs')
    expect(labelKey('middle back')).toBe('middleBack')
    expect(labelKey('e-z curl bar')).toBe('eZCurlBar')
    expect(labelKey('olympic weightlifting')).toBe('olympicWeightlifting')
    expect(labelKey('body only')).toBe('bodyOnly')
  })
})
