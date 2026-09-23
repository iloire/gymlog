import { describe, expect, it } from 'vitest'

import { describeDay, planWeek, workoutLetters, type ScheduledDay, type TrainedDay } from '@/lib/week'

// Monday 14 September 2026 through Sunday the 20th.
const MONDAY = '2026-09-14'
const WEDNESDAY = '2026-09-16'
const THURSDAY = '2026-09-17'
const FRIDAY = '2026-09-18'

const A: ScheduledDay = { templateId: 'a', name: 'Full body A' }
const B: ScheduledDay = { templateId: 'b', name: 'Full body B' }

/** The Beginner week: A on Monday, B on Wednesday, A again on Friday. */
const schedule = () =>
  new Map<number, ScheduledDay>([
    [0, A],
    [2, B],
    [4, A],
  ])

const did = (date: string, day: ScheduledDay): TrainedDay => ({ date, templateId: day.templateId, name: day.name })

const states = (today: string, trained: TrainedDay[] = []) =>
  planWeek({ today, schedule: schedule(), trained }).days.map((day) => day.state)

describe('planWeek', () => {
  it('runs Monday to Sunday from the week holding today', () => {
    const { days } = planWeek({ today: THURSDAY, schedule: schedule(), trained: [] })
    expect(days).toHaveLength(7)
    expect(days[0]?.date).toBe(MONDAY)
    expect(days[6]?.date).toBe('2026-09-20')
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual([THURSDAY])
  })

  it('marks a trained day done and names what was trained', () => {
    const { days } = planWeek({ today: MONDAY, schedule: schedule(), trained: [did(MONDAY, A)] })
    expect(days[0]?.state).toBe('done')
    expect(days[0]?.name).toBe('Full body A')
  })

  it('names the workout you actually did, not the one on the programme', () => {
    const { days } = planWeek({ today: WEDNESDAY, schedule: schedule(), trained: [did(WEDNESDAY, A)] })
    expect(days[2]).toMatchObject({ state: 'done', templateId: 'a', name: 'Full body A' })
  })

  it('leaves today planned — the day is not over yet', () => {
    expect(states(WEDNESDAY)).toEqual(['missed', 'rest', 'planned', 'rest', 'planned', 'rest', 'rest'])
  })

  it('marks a planned day that went by untrained as missed', () => {
    expect(states(FRIDAY, [did(MONDAY, A)])).toEqual([
      'done',
      'rest',
      'missed',
      'rest',
      'planned',
      'rest',
      'rest',
    ])
  })

  it('never marks a day off as missed', () => {
    expect(states(FRIDAY)[1]).toBe('rest')
    expect(states(FRIDAY)[3]).toBe('rest')
  })
})

describe('planWeek — the workout to catch up on', () => {
  it('offers Wednesday’s workout on a Thursday it was not done', () => {
    const { missed } = planWeek({ today: THURSDAY, schedule: schedule(), trained: [did(MONDAY, A)] })
    expect(missed).toMatchObject({ weekday: 2, templateId: 'b', name: 'Full body B' })
  })

  it('offers nothing once that workout has been done on another day', () => {
    // Wednesday's Full body B, trained on Thursday: the day is empty, the
    // workout is not. Friday has nothing to catch up on.
    const { days, missed } = planWeek({
      today: FRIDAY,
      schedule: schedule(),
      trained: [did(MONDAY, A), did(THURSDAY, B)],
    })
    expect(days[2]?.state).toBe('missed')
    expect(missed).toBeNull()
  })

  it('offers the most recent of several missed days', () => {
    const { missed } = planWeek({ today: '2026-09-19', schedule: schedule(), trained: [] })
    expect(missed?.weekday).toBe(4)
  })

  it('offers nothing the programme already has you doing today', () => {
    // Monday's Full body A missed, and Friday is Full body A again: Start
    // workout and Do it today would open the very same session.
    const { days, missed } = planWeek({ today: FRIDAY, schedule: schedule(), trained: [did(WEDNESDAY, B)] })
    expect(days[0]?.state).toBe('missed')
    expect(missed).toBeNull()
  })

  it('offers nothing on a week with a clean sheet so far', () => {
    expect(planWeek({ today: MONDAY, schedule: schedule(), trained: [] }).missed).toBeNull()
  })

  it('offers nothing without a programme', () => {
    expect(planWeek({ today: FRIDAY, schedule: new Map(), trained: [] }).missed).toBeNull()
  })
})

describe('describeDay', () => {
  const day = (today: string, index: number) => planWeek({ today, schedule: schedule(), trained: [] }).days[index]!

  it('says the weekday, the workout and how it went', () => {
    expect(describeDay(day(FRIDAY, 2))).toBe('Wednesday, Full body B, missed')
  })

  it('marks today as today', () => {
    expect(describeDay(day(FRIDAY, 4))).toBe('Friday, today, Full body A, planned')
  })

  it('calls a day off a rest day', () => {
    expect(describeDay(day(FRIDAY, 1))).toBe('Tuesday, rest day')
  })

  it('speaks Spanish when asked', () => {
    expect(describeDay(day(FRIDAY, 2), 'es')).toBe('miércoles, Full body B, pendiente')
    expect(describeDay(day(FRIDAY, 4), 'es')).toBe('viernes, hoy, Full body A, previsto')
    expect(describeDay(day(FRIDAY, 1), 'es')).toBe('martes, descanso')
  })
})

describe('workoutLetters', () => {
  const template = (id: string, over: { deletedAt?: number; archivedAt?: number } = {}) => ({
    id,
    deletedAt: over.deletedAt ?? null,
    archivedAt: over.archivedAt ?? null,
  })

  it('letters the workouts A, B, C in the order Plan lists them', () => {
    const letters = workoutLetters([template('a'), template('b'), template('c')])
    expect([...letters]).toEqual([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
    ])
  })

  it('leaves out a deleted or archived workout without shifting the rest', () => {
    // Plan lists neither, so lettering them would give Today a B that Plan
    // never shows — and the letter is only worth anything if it is the same one.
    const letters = workoutLetters([
      template('a'),
      template('gone', { deletedAt: 1 }),
      template('old', { archivedAt: 1 }),
      template('b'),
    ])
    expect([...letters]).toEqual([
      ['a', 'A'],
      ['b', 'B'],
    ])
  })
})
