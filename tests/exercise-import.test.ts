import { describe, expect, it } from 'vitest'

import seeds from '@/db/seed-exercises.json'
import filterConfig from '@/data/exercise-filter.json'
import extras from '@/data/exercise-extras.json'
import { matchesFilter, slugify, uniqueSlug, withExtras, type SeedExercise, type SourceExercise } from '@/lib/exercise-import'

const exercise = (overrides: Partial<SourceExercise> = {}): SourceExercise => ({
  id: 'Barbell_Squat',
  name: 'Barbell Squat',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: [],
  instructions: [],
  category: 'strength',
  images: ['Barbell_Squat/0.jpg', 'Barbell_Squat/1.jpg'],
  ...overrides,
})

const noFilter = { levels: [], categories: [], equipment: [], requireImages: false }

describe('slugify', () => {
  it.each([
    ['Barbell Squat', 'barbell-squat'],
    ['Barbell Bench Press - Medium Grip', 'barbell-bench-press-medium-grip'],
    ['3/4 Sit-Up', '3-4-sit-up'],
    ['90/90 Hamstring', '90-90-hamstring'],
    ['  Leading and trailing  ', 'leading-and-trailing'],
    ['Élévation latérale', 'elevation-laterale'],
    ["Farmer's Walk", 'farmer-s-walk'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug)
  })
})

describe('matchesFilter', () => {
  it('passes everything when no field is restricted', () => {
    expect(matchesFilter(exercise({ level: 'expert', equipment: null }), noFilter)).toBe(true)
  })

  it('restricts by level', () => {
    const filter = { ...noFilter, levels: ['beginner'] }
    expect(matchesFilter(exercise({ level: 'beginner' }), filter)).toBe(true)
    expect(matchesFilter(exercise({ level: 'expert' }), filter)).toBe(false)
  })

  it('restricts by category', () => {
    const filter = { ...noFilter, categories: ['strength'] }
    expect(matchesFilter(exercise({ category: 'cardio' }), filter)).toBe(false)
  })

  it('restricts by equipment, and exercises with none fail a restriction', () => {
    const filter = { ...noFilter, equipment: ['barbell', 'dumbbell'] }
    expect(matchesFilter(exercise({ equipment: 'dumbbell' }), filter)).toBe(true)
    expect(matchesFilter(exercise({ equipment: 'kettlebells' }), filter)).toBe(false)
    expect(matchesFilter(exercise({ equipment: null }), filter)).toBe(false)
  })

  it('requires both start and end photos when asked, since one photo cannot animate', () => {
    const filter = { ...noFilter, requireImages: true }
    expect(matchesFilter(exercise({ images: ['a/0.jpg'] }), filter)).toBe(false)
    expect(matchesFilter(exercise({ images: [] }), filter)).toBe(false)
    expect(matchesFilter(exercise(), filter)).toBe(true)
  })
})

describe('uniqueSlug', () => {
  it('uses the plain slug when it is free', () => {
    expect(uniqueSlug('Barbell Curl', 'barbell', new Set())).toBe('barbell-curl')
  })

  it('disambiguates a clash by equipment first', () => {
    const used = new Set(['curl'])
    expect(uniqueSlug('Curl', 'dumbbell', used)).toBe('curl-dumbbell')
  })

  it('falls back to a counter when equipment does not settle it', () => {
    const used = new Set<string>()
    expect(uniqueSlug('Curl', 'cable', used)).toBe('curl')
    expect(uniqueSlug('Curl', 'cable', used)).toBe('curl-cable')
    expect(uniqueSlug('Curl', 'cable', used)).toBe('curl-2')
    expect(uniqueSlug('Curl', 'cable', used)).toBe('curl-3')
  })

  it('records what it hands out', () => {
    const used = new Set<string>()
    uniqueSlug('Row', null, used)
    expect(used.has('row')).toBe(true)
  })
})

describe('the committed exercise library', () => {
  it('has unique ids and unique slugs, as the database requires', () => {
    expect(new Set(seeds.map((s) => s.id)).size).toBe(seeds.length)
    expect(new Set(seeds.map((s) => s.slug)).size).toBe(seeds.length)
  })

  it('gives every library exercise its start and end photo', () => {
    const extraIds = new Set(extras.map((extra) => extra.id))
    const missing = seeds.filter((s) => !extraIds.has(s.id) && s.images.length !== 2)
    expect(missing).toEqual([])
  })

  it('ends with data/exercise-extras.json as written, so editing that file without re-importing fails here', () => {
    const library = seeds.slice(0, seeds.length - extras.length) as SeedExercise[]
    expect(seeds.slice(-extras.length)).toEqual(withExtras(library, extras).slice(-extras.length))
  })

  it('only contains what data/exercise-filter.json allows', () => {
    const outside = seeds.filter(
      (s) =>
        !matchesFilter(
          { ...s, level: s.level ?? '', category: s.category ?? '' },
          { ...filterConfig, requireImages: false },
        ),
    )
    expect(outside.map((s) => s.id)).toEqual([])
  })

  it('points photos at /exercise-media, never at the /exercises route', () => {
    const wrong = seeds.flatMap((s) => s.images).filter((p) => !p.startsWith('exercise-media/'))
    expect(wrong).toEqual([])
  })
})

describe('withExtras', () => {
  const library: SeedExercise[] = [
    { id: 'Swing', name: 'Kettlebell Swings', slug: 'kettlebell-swings', category: 'strength', level: 'beginner', force: 'pull', mechanic: 'compound', equipment: 'kettlebells', primaryMuscles: [], secondaryMuscles: [], instructions: [], images: ['a', 'b'] },
  ]
  const extra = { id: 'Swing_2h', name: 'Kettlebell Swings', category: 'strength', level: null, force: null, mechanic: null, equipment: 'kettlebells', primaryMuscles: ['hamstrings'], secondaryMuscles: [], instructions: [] }

  it('appends after the library, with a slug that stays clear of its slugs and no photos', () => {
    const all = withExtras(library, [extra])
    expect(all.map((row) => row.id)).toEqual(['Swing', 'Swing_2h'])
    expect(all[1]).toMatchObject({ slug: 'kettlebell-swings-kettlebells', images: [] })
  })

  it('refuses an extra whose id the library already has', () => {
    expect(() => withExtras(library, [{ ...extra, id: 'Swing' }])).toThrow(/already in the library/)
  })
})
