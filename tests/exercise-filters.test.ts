import { describe, expect, it } from 'vitest'

import { facetOptions, filterExercises, NO_FILTER } from '@/components/exercise-filters'
import type { LocalExercise } from '@/lib/db/dexie'
import { NO_RANK } from '@/lib/queries'

const exercise = (name: string, fields: Partial<LocalExercise>) =>
  ({
    id: name.replaceAll(' ', '_'),
    name,
    equipment: null,
    category: 'strength',
    level: 'beginner',
    mechanic: 'compound',
    force: 'push',
    primaryMuscles: ['chest'],
    deletedAt: null,
    ...fields,
  }) as LocalExercise

const library = [
  exercise('Barbell Bench Press', { equipment: 'barbell', level: 'intermediate' }),
  exercise('Dumbbell Flyes', { equipment: 'dumbbell', mechanic: 'isolation' }),
  exercise('Pushups', { equipment: 'body only' }),
  exercise('Band Press', { equipment: 'bands', deletedAt: 1 }),
  exercise('Chest Stretch', { category: 'stretching', mechanic: null, force: 'static' }),
  exercise('Barbell Row', { equipment: 'barbell', force: 'pull', primaryMuscles: ['middle back'], level: 'expert' }),
  exercise('Cable Crossover', { equipment: 'cable', deletedAt: 1 }),
]

const names = (filter: Partial<typeof NO_FILTER>, query = '', have: Set<string> | null = null) =>
  filterExercises(library, { ...NO_FILTER, ...filter }, query, new Set(), have).map((e) => e.name)

describe('filterExercises', () => {
  it('matches any value within a group and every group together', () => {
    expect(names({ equipment: ['barbell', 'dumbbell'] })).toEqual([
      'Barbell Bench Press',
      'Barbell Row',
      'Dumbbell Flyes',
    ])
    expect(names({ equipment: ['barbell', 'dumbbell'], force: ['push'], mechanic: ['compound'] })).toEqual([
      'Barbell Bench Press',
    ])
  })

  it('reads an empty equipment field and body only as bodyweight', () => {
    expect(names({ equipment: ['bodyweight'] })).toEqual(['Chest Stretch', 'Pushups'])
  })

  it('combines panel groups with the muscle chip and search', () => {
    expect(names({ muscle: 'chest', category: ['strength'] }, 'press')).toEqual(['Barbell Bench Press'])
    expect(names({ level: ['expert'] })).toEqual(['Barbell Row'])
  })

  it('finds every word of a search in any order', () => {
    expect(names({}, 'press bench')).toEqual(['Barbell Bench Press'])
    expect(names({}, '  barbell   row ')).toEqual(['Barbell Row'])
  })

  it('keeps only what your equipment allows, and ignores the chip before equipment is chosen', () => {
    expect(names({ myEquipment: true }, '', new Set(['dumbbell']))).toEqual([
      'Chest Stretch',
      'Dumbbell Flyes',
      'Pushups',
    ])
    expect(names({ myEquipment: true }, '', null)).toHaveLength(5)
  })
})

describe('facetOptions', () => {
  it('offers the values in the library, levels easiest first, deleted exercises left out', () => {
    const options = facetOptions(library)
    expect(options.level).toEqual(['beginner', 'intermediate', 'expert'])
    // By the name shown, so "bands" would sort as Resistance bands.
    expect(options.equipment).toEqual(['barbell', 'bodyweight', 'dumbbell'])
    expect(facetOptions([...library, exercise('Band Pull Apart', { equipment: 'bands' })]).equipment).toEqual([
      'barbell',
      'bodyweight',
      'dumbbell',
      'bands',
    ])
    expect(options.mechanic).toEqual(['compound', 'isolation'])
    expect(options.force).toEqual(['pull', 'push', 'static'])
  })
})

describe('library order', () => {
  const order = (favorites: string[], programme: string[], lastDone: [string, number][], query = '') =>
    filterExercises(
      library,
      NO_FILTER,
      query,
      new Set(favorites),
      null,
      { programme: new Set(programme), lastDone: new Map(lastDone) },
    ).map((e) => e.id)

  it('opens alphabetically with nothing to go on', () => {
    expect(filterExercises(library, NO_FILTER, '', new Set(), null, NO_RANK).map((e) => e.name)).toEqual([
      'Barbell Bench Press',
      'Barbell Row',
      'Chest Stretch',
      'Dumbbell Flyes',
      'Pushups',
    ])
  })

  it('puts favourites, then the programme, then what was done recently before the rest', () => {
    expect(
      order(['Pushups'], ['Dumbbell_Flyes', 'Pushups'], [
        ['Barbell_Row', 100],
        ['Chest_Stretch', 300],
        ['Pushups', 200],
      ]),
    ).toEqual(['Pushups', 'Dumbbell_Flyes', 'Chest_Stretch', 'Barbell_Row', 'Barbell_Bench_Press'])
  })

  it('orders recently done by most recent, everything else by name', () => {
    expect(order([], ['Dumbbell_Flyes', 'Barbell_Row'], [['Barbell_Bench_Press', 1], ['Pushups', 2]])).toEqual([
      'Barbell_Row',
      'Dumbbell_Flyes',
      'Pushups',
      'Barbell_Bench_Press',
      'Chest_Stretch',
    ])
  })

  it('keeps the order under a search', () => {
    expect(order([], [], [['Barbell_Row', 1]], 'barbell')).toEqual(['Barbell_Row', 'Barbell_Bench_Press'])
  })
})
