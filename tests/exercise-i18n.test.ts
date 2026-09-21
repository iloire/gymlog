import { describe, expect, it } from 'vitest'

import instructions from '@/data/exercise-instructions.es.json'
import names from '@/data/exercise-names.es.json'
import seeds from '@/db/seed-exercises.json'
import { compareExerciseNames, exerciseInstructions, exerciseName, exerciseNames } from '@/lib/exercise-i18n'

const library = new Map(seeds.map((e) => [e.id, e]))

describe('data/exercise-names.es.json', () => {
  it('names only exercises the library has, and never with nothing', () => {
    for (const [id, name] of Object.entries(names as Record<string, string>)) {
      expect(library.has(id), id).toBe(true)
      expect(name.trim(), id).not.toBe('')
    }
  })
})

describe('data/exercise-instructions.es.json', () => {
  it('instructs only exercises the library has, step for step', () => {
    for (const [id, steps] of Object.entries(instructions as Record<string, string[]>)) {
      const source = library.get(id)
      expect(source, id).toBeDefined()
      expect(steps.length, id).toBe(source?.instructions.length)
      // A step is empty only where the library's own step is (one exercise ships one).
      steps.forEach((step, i) => expect(step.trim() === '', `${id} #${i}`).toBe(source?.instructions[i]?.trim() === ''))
    }
  })
})

describe('exerciseName', () => {
  const squat = { id: 'Barbell_Squat', name: 'Barbell Squat' }
  const own = { id: '0192a-own', name: 'Farmer carry (my gym)' }

  it('shows the library name in the language and a user-typed name as typed', () => {
    expect(exerciseName(squat, 'en')).toBe('Barbell Squat')
    expect(exerciseName(own, 'es')).toBe('Farmer carry (my gym)')
    const es = (names as Record<string, string>)[squat.id]
    expect(exerciseName(squat, 'es')).toBe(es ?? 'Barbell Squat')
  })

  it('searches both names, so an English query still finds a Spanish row', () => {
    expect(exerciseNames(own, 'es')).toEqual(['Farmer carry (my gym)'])
    const both = exerciseNames(squat, 'es')
    expect(both.at(-1)).toBe('Barbell Squat')
  })

  it('sorts by what is on screen, accents and all', () => {
    const rows = [
      { id: 'x', name: 'Zancada' },
      { id: 'y', name: 'Élevación' },
      { id: 'z', name: 'Curl' },
    ]
    expect(rows.sort(compareExerciseNames('es')).map((r) => r.name)).toEqual(['Curl', 'Élevación', 'Zancada'])
  })

  it('falls back to the English how-to until an exercise is translated', async () => {
    const steps = ['Stand up.', 'Sit down.']
    expect(await exerciseInstructions({ id: 'nope', instructions: steps }, 'es')).toEqual(steps)
    expect(await exerciseInstructions({ id: 'nope', instructions: null }, 'es')).toEqual([])
  })
})
