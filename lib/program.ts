'use client'

import { getDb } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { newId } from '@/lib/id'
import { activeProgram, today } from '@/lib/queries'

/**
 * Writing the week: which workout goes on which day, under the active
 * programme. Assigning a day with no programme yet quietly starts one, so
 * the first tap on a day cell needs no setup screen first.
 */

/** The active programme's id, creating a first one if there is none. */
export async function ensureProgram(userId: string): Promise<string> {
  const current = await activeProgram(userId)
  if (current) return current.id
  const id = newId()
  await writeRow(userId, 'programs', {
    id,
    name: 'My programme',
    stage: 'beginner',
    startedOn: today(),
    endedOn: null,
    notes: null,
  })
  return id
}

/** Put a workout on a weekday (0 = Monday), or clear the day with null. */
export async function assignDay(userId: string, weekday: number, templateId: string | null): Promise<void> {
  const programId = await ensureProgram(userId)
  const existing = (await getDb(userId).programDays.where('programId').equals(programId).toArray()).find(
    (day) => day.dayOfWeek === weekday && day.deletedAt === null,
  )

  if (templateId === null) {
    if (existing) await deleteRow(userId, 'programDays', existing.id)
    return
  }

  await writeRow(userId, 'programDays', {
    id: existing?.id ?? newId(),
    programId,
    dayOfWeek: weekday,
    templateId,
  })
}

/**
 * Moving up a stage ends the current programme and starts an empty new one.
 * Old sessions keep pointing at the old programme, so the history stays
 * intact; only what you train next changes.
 */
export async function startNewStage(userId: string, name: string): Promise<string> {
  const current = await activeProgram(userId)
  if (current) await writeRow(userId, 'programs', { ...current, endedOn: today() })
  const id = newId()
  await writeRow(userId, 'programs', { id, name, stage: null, startedOn: today(), endedOn: null, notes: null })
  return id
}
