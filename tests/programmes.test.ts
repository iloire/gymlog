import { readdirSync } from 'node:fs'

import { beforeEach, describe, expect, it } from 'vitest'

import seeds from '@/db/seed-exercises.json'
import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { EQUIPMENT, exerciseNeeds, parseEquipment, presetFor } from '@/lib/equipment'
import {
  adoptProgramme,
  chooseExercise,
  fitProgramme,
  programmeById,
  PROGRAMMES,
  shiftWeek,
  type Programme,
  type ProgrammeSlot,
} from '@/lib/programmes'
import { activeProgram, templateForDay, templateItems } from '@/lib/queries'
import { mutationKey } from '@/lib/sync/types'

const USER = 'user-1'
const library = new Map(seeds.map((exercise) => [exercise.id, exercise]))
const preset = (id: string) => new Set(EQUIPMENT.presets.find((p) => p.id === id)!.items)
const programme = (id: string) => programmeById(id)!

function slot(exercise: string, alternatives: string[] = [], extra: Partial<ProgrammeSlot> = {}): ProgrammeSlot {
  return { exercise, alternatives, sets: 3, reps: 5, restSec: 120, ...extra }
}

describe('data/programmes', () => {
  it('registers every file in the folder, under its file name', () => {
    const files = readdirSync('data/programmes')
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
    expect(PROGRAMMES.map((p) => p.id).sort()).toEqual(files.sort())
  })

  it.each(PROGRAMMES)('$id names only exercises in the library', (p) => {
    const named = Object.values(p.workouts).flatMap((w) =>
      w.exercises.flatMap((s) => [s.exercise, ...s.alternatives]),
    )
    expect(named.filter((id) => !library.has(id))).toEqual([])
  })

  it.each(PROGRAMMES)('$id puts every workout on the week', (p) => {
    expect(Object.keys(p.workouts).filter((key) => !p.week.includes(key))).toEqual([])
  })

  it.each(PROGRAMMES)('$id can be done in a full gym exactly as written', (p) => {
    const fit = fitProgramme(p, preset('full-gym'), library)
    expect(fit).toMatchObject({ doable: true, swaps: 0 })
  })
})

describe('data/equipment.json', () => {
  const items = new Set(EQUIPMENT.items.map((item) => item.id))

  it('presets and extra needs name only known items', () => {
    const named = [...EQUIPMENT.presets.flatMap((p) => p.items), ...Object.values(EQUIPMENT.needs).flat()]
    expect(named.filter((id) => !items.has(id))).toEqual([])
  })

  it('adds needs only to exercises in the library', () => {
    expect(Object.keys(EQUIPMENT.needs).filter((id) => !library.has(id))).toEqual([])
  })

  it('has an item for every library equipment value, so no exercise is out of reach', () => {
    const values = new Set(seeds.map((s) => s.equipment).filter((v) => v !== null && v !== 'body only'))
    expect([...values].filter((value) => !items.has(value))).toEqual([])
  })
})

describe('exerciseNeeds', () => {
  it('starts from the library field and adds the extras', () => {
    expect(exerciseNeeds({ id: 'Barbell_Squat', equipment: 'barbell' })).toEqual(['barbell', 'rack'])
    expect(exerciseNeeds({ id: 'Dumbbell_Bicep_Curl', equipment: 'dumbbell' })).toEqual(['dumbbell'])
  })

  it('needs nothing for body-only work, unless an extra says so', () => {
    expect(exerciseNeeds({ id: 'Pushups', equipment: 'body only' })).toEqual([])
    expect(exerciseNeeds({ id: 'Chin-Up', equipment: 'body only' })).toEqual(['pull-up-bar'])
  })
})

describe('chooseExercise', () => {
  const squat = slot('Barbell_Squat', ['Leg_Press', 'Split_Squat_with_Dumbbells', 'Bodyweight_Squat'])

  it('keeps the written exercise when you have what it needs', () => {
    expect(chooseExercise(squat, preset('home-rack'), library)).toMatchObject({
      exerciseId: 'Barbell_Squat',
      swapped: false,
      doable: true,
    })
  })

  it('takes the first alternative you can do, in the order written', () => {
    expect(chooseExercise(squat, new Set(['dumbbell', 'machine']), library)).toMatchObject({
      exerciseId: 'Leg_Press',
      swapped: true,
      doable: true,
    })
    expect(chooseExercise(squat, preset('nothing'), library)).toMatchObject({
      exerciseId: 'Bodyweight_Squat',
      doable: true,
    })
  })

  it('a barbell without a rack is not enough to squat', () => {
    expect(chooseExercise(slot('Barbell_Squat'), new Set(['barbell']), library)).toMatchObject({
      doable: false,
      missing: ['rack'],
    })
  })

  it('when nothing fits, offers the option missing the fewest items', () => {
    const row = slot('One-Arm_Dumbbell_Row', ['Bent_Over_Two-Dumbbell_Row'])
    expect(chooseExercise(row, preset('nothing'), library)).toMatchObject({
      exerciseId: 'Bent_Over_Two-Dumbbell_Row',
      swapped: true,
      doable: false,
      missing: ['dumbbell'],
    })
  })

  it('is not doable when the library does not have the exercise at all', () => {
    expect(chooseExercise(slot('Barbell_Squat'), preset('full-gym'), new Map())).toMatchObject({
      exerciseId: 'Barbell_Squat',
      doable: false,
    })
  })
})

describe('fitProgramme', () => {
  it('fits the barbell programme to dumbbells and a bench, by swapping', () => {
    const fit = fitProgramme(programme('full-body-3-day'), preset('dumbbells'), library)
    expect(fit.doable).toBe(true)
    expect(fit.swaps).toBeGreaterThan(0)
    expect(fit.workouts[0]?.choices.map((c) => c.exerciseId)).toEqual([
      'Split_Squat_with_Dumbbells',
      'Dumbbell_Bench_Press',
      'One-Arm_Dumbbell_Row',
    ])
  })

  it('says what is missing when a programme cannot be done', () => {
    const fit = fitProgramme(programme('dumbbells-3-day'), preset('nothing'), library)
    expect(fit.doable).toBe(false)
    expect(fit.missing).toEqual(['dumbbell'])
  })
})

describe('shiftWeek', () => {
  const week = ['a', null, 'b', null, 'a', null, null]

  it('moves Monday / Wednesday / Friday to Tuesday / Thursday / Saturday', () => {
    expect(shiftWeek(week, 1)).toEqual([null, 'a', null, 'b', null, 'a', null])
  })

  it('wraps the end of the week into Monday', () => {
    expect(shiftWeek(week, 3)).toEqual(['a', null, null, 'a', null, 'b', null])
    expect(shiftWeek(week, 0)).toEqual(week)
    expect(shiftWeek(week, 7)).toEqual(week)
  })
})

describe('parseEquipment', () => {
  it('is null until something valid has been chosen', () => {
    expect(parseEquipment(null)).toBeNull()
    expect(parseEquipment('not json')).toBeNull()
    expect(parseEquipment('{"barbell":true}')).toBeNull()
  })

  it('keeps known items in the config order and drops unknown ones', () => {
    expect(parseEquipment('["bench","kettlebell","barbell"]')).toEqual(['barbell', 'bench'])
    expect(parseEquipment('[]')).toEqual([])
  })

  it('recognises a preset whatever the order', () => {
    expect(presetFor(['bench', 'dumbbell'])?.id).toBe('dumbbells')
    expect(presetFor(['bench'])).toBeUndefined()
  })
})

describe('adoptProgramme', () => {
  beforeEach(async () => {
    await destroyDb(USER)
  })

  async function adopt(p: Programme, have: Set<string>, options: Parameters<typeof adoptProgramme>[3]) {
    return adoptProgramme(USER, p, fitProgramme(p, have, library), options)
  }

  it('copies each workout with its fitted exercises, in order', async () => {
    const { templateIds } = await adopt(programme('full-body-3-day'), preset('dumbbells'), { schedule: false })

    const db = getDb(USER)
    expect(await db.workoutTemplates.get(templateIds.a!)).toMatchObject({ name: 'Full body A', userId: USER })
    const items = await templateItems(USER, templateIds.a!)
    expect(items.map((i) => [i.exerciseId, i.sets, i.targetReps, i.restSec])).toEqual([
      ['Split_Squat_with_Dumbbells', 3, 5, 180],
      ['Dumbbell_Bench_Press', 3, 5, 180],
      ['One-Arm_Dumbbell_Row', 3, 5, 120],
    ])
  })

  it('starts the written lift at its weight, and a swapped one at nothing', async () => {
    const written = await adopt(programme('full-body-3-day'), preset('home-rack'), { schedule: false })
    expect((await templateItems(USER, written.templateIds.b!)).map((i) => i.targetWeightKg)).toEqual([20, 20, 40, null])

    const swapped = await adopt(programme('full-body-3-day'), preset('dumbbells'), { schedule: false })
    expect((await templateItems(USER, swapped.templateIds.a!)).map((i) => i.targetWeightKg)).toEqual([null, null, null])
  })

  it('without schedule, leaves the week alone', async () => {
    const { programId } = await adopt(programme('dumbbells-3-day'), preset('dumbbells'), { schedule: false })
    expect(programId).toBeNull()
    expect(await activeProgram(USER)).toBeUndefined()
  })

  it('with schedule, becomes the active programme on the chosen days', async () => {
    const { programId, templateIds } = await adopt(programme('full-body-3-day'), preset('full-gym'), {
      schedule: true,
      shift: 1,
      startedOn: '2026-09-15',
    })

    expect(await activeProgram(USER)).toMatchObject({
      id: programId,
      name: 'Full body, 3 days',
      stage: 'beginner',
      startedOn: '2026-09-15',
    })
    expect(await templateForDay(USER, 0)).toBeNull()
    expect(await templateForDay(USER, 1)).toEqual({ templateId: templateIds.a, programId })
    expect(await templateForDay(USER, 3)).toMatchObject({ templateId: templateIds.b })
    expect(await templateForDay(USER, 5)).toMatchObject({ templateId: templateIds.a })
  })

  it('ends the programme you were on, keeping it', async () => {
    await writeRow(USER, 'programs', {
      id: 'mine',
      name: 'My programme',
      stage: null,
      startedOn: '2026-06-01',
      endedOn: null,
      notes: null,
    })

    const { programId } = await adopt(programme('upper-lower-4-day'), preset('full-gym'), {
      schedule: true,
      startedOn: '2026-09-15',
    })

    expect(await getDb(USER).programs.get('mine')).toMatchObject({ endedOn: '2026-09-15', deletedAt: null })
    expect((await activeProgram(USER))?.id).toBe(programId)
  })

  it('queues every row it writes for sync', async () => {
    await adopt(programme('full-body-3-day'), preset('full-gym'), { schedule: true })

    const db = getDb(USER)
    const rows = [
      ...(await db.workoutTemplates.toArray()).map((r) => mutationKey('workoutTemplates', r.id)),
      ...(await db.templateItems.toArray()).map((r) => mutationKey('templateItems', r.id)),
      ...(await db.programs.toArray()).map((r) => mutationKey('programs', r.id)),
      ...(await db.programDays.toArray()).map((r) => mutationKey('programDays', r.id)),
    ]
    expect(rows).toHaveLength(2 + 7 + 1 + 3)
    for (const key of rows) expect(await db.outbox.get(key), key).toBeDefined()
  })
})
