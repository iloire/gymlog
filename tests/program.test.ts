import { beforeEach, describe, expect, it } from 'vitest'

import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { assignDay, startNewStage } from '@/lib/program'
import { activeProgram, templateForDay, templateItems } from '@/lib/queries'

const USER = 'user-1'
const MONDAY = 0
const WEDNESDAY = 2
const FRIDAY = 4

async function program(id: string, startedOn: string, extra: Record<string, unknown> = {}) {
  await writeRow(USER, 'programs', { id, name: id, stage: null, startedOn, endedOn: null, notes: null, ...extra })
}

async function day(id: string, programId: string, dayOfWeek: number, templateId: string, extra: Record<string, unknown> = {}) {
  await writeRow(USER, 'programDays', { id, programId, dayOfWeek, templateId, ...extra })
}

beforeEach(async () => {
  await destroyDb(USER)
})

describe('activeProgram', () => {
  it('is undefined before any programme exists', async () => {
    expect(await activeProgram(USER)).toBeUndefined()
  })

  it('ignores programmes that have ended', async () => {
    await program('beginner', '2026-06-01', { endedOn: '2026-09-01' })
    expect(await activeProgram(USER)).toBeUndefined()
  })

  it('ignores deleted programmes', async () => {
    await program('beginner', '2026-06-01', { deletedAt: 1 })
    expect(await activeProgram(USER)).toBeUndefined()
  })

  it('picks the most recently started open programme', async () => {
    await program('older', '2026-06-01')
    await program('newer', '2026-09-01')
    expect((await activeProgram(USER))?.id).toBe('newer')
  })
})

describe('templateForDay — the Beginner 3-day week', () => {
  beforeEach(async () => {
    await program('beginner', '2026-06-01')
    await day('d-mon', 'beginner', MONDAY, 'workout-a')
    await day('d-wed', 'beginner', WEDNESDAY, 'workout-b')
    await day('d-fri', 'beginner', FRIDAY, 'workout-a')
  })

  it('finds the workout for a training day', async () => {
    expect(await templateForDay(USER, MONDAY)).toEqual({ templateId: 'workout-a', programId: 'beginner' })
    expect(await templateForDay(USER, WEDNESDAY)).toMatchObject({ templateId: 'workout-b' })
    expect(await templateForDay(USER, FRIDAY)).toMatchObject({ templateId: 'workout-a' })
  })

  it('returns null on a rest day', async () => {
    expect(await templateForDay(USER, 1)).toBeNull()
    expect(await templateForDay(USER, 6)).toBeNull()
  })

  it('treats a cleared day as a rest day', async () => {
    await day('d-wed', 'beginner', WEDNESDAY, 'workout-b', { deletedAt: 5 })
    expect(await templateForDay(USER, WEDNESDAY)).toBeNull()
  })

  it('follows a move up to the next stage', async () => {
    await program('beginner', '2026-06-01', { endedOn: '2026-09-15' })
    await program('intermediate', '2026-09-15')
    await day('i-mon', 'intermediate', MONDAY, 'upper')
    await day('i-tue', 'intermediate', 1, 'lower')

    expect(await templateForDay(USER, MONDAY)).toEqual({ templateId: 'upper', programId: 'intermediate' })
    expect(await templateForDay(USER, 1)).toMatchObject({ templateId: 'lower' })
    // The old programme's Friday no longer schedules anything.
    expect(await templateForDay(USER, FRIDAY)).toBeNull()
  })

  it('returns null when there is no active programme at all', async () => {
    await program('beginner', '2026-06-01', { endedOn: '2026-09-01' })
    expect(await templateForDay(USER, MONDAY)).toBeNull()
  })
})

describe('templateItems', () => {
  it('returns exercises in programme order, without removed ones', async () => {
    const item = (id: string, position: number, extra: Record<string, unknown> = {}) =>
      writeRow(USER, 'templateItems', { id, templateId: 'tpl', exerciseId: id, position, sets: 3, targetReps: 5, restSec: 90, ...extra })

    await item('row', 3)
    await item('squat', 1)
    await item('curl', 4, { deletedAt: 1 })
    await item('bench', 2)
    await writeRow(USER, 'templateItems', { id: 'other', templateId: 'other-tpl', exerciseId: 'x', position: 1 })

    expect((await templateItems(USER, 'tpl')).map((i) => i.id)).toEqual(['squat', 'bench', 'row'])
  })
})

describe('assignDay and startNewStage', () => {
  it('starts a programme on the first assignment and puts the workout on the day', async () => {
    await assignDay(USER, MONDAY, 'workout-a')

    const created = await activeProgram(USER)
    expect(created?.name).toBe('My programme')
    expect(await templateForDay(USER, MONDAY)).toEqual({ templateId: 'workout-a', programId: created?.id })
  })

  it('replaces the workout on a day, and clears it with null', async () => {
    await assignDay(USER, MONDAY, 'workout-a')
    await assignDay(USER, MONDAY, 'workout-b')
    expect(await templateForDay(USER, MONDAY)).toMatchObject({ templateId: 'workout-b' })

    await assignDay(USER, MONDAY, null)
    expect(await templateForDay(USER, MONDAY)).toBeNull()
    expect(await templateForDay(USER, FRIDAY)).toBeNull()
  })

  it('ends the current programme and starts an empty one on a new stage', async () => {
    await assignDay(USER, MONDAY, 'workout-a')
    const first = await activeProgram(USER)

    const id = await startNewStage(USER, 'Intermediate 4-day')

    expect((await activeProgram(USER))?.id).toBe(id)
    expect((await activeProgram(USER))?.name).toBe('Intermediate 4-day')
    expect(await templateForDay(USER, MONDAY)).toBeNull()
    // The old programme is over, not gone.
    const ended = (await getDb(USER).programs.get(first!.id))!
    expect(ended.endedOn).not.toBeNull()
    expect(ended.deletedAt).toBeNull()
  })
})
