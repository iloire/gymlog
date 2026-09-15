'use client'

import { getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { newId } from '@/lib/id'
import { templateItems } from '@/lib/queries'

/**
 * Copy a workout and its exercises under fresh ids, and return the copy's id.
 *
 * Every row goes in one outer transaction (each `writeRow` joins it), so a
 * closed tab cannot leave a copy with half its exercises. The copy is not put
 * on the programme — you duplicate a workout to change it.
 */
export async function duplicateWorkout(userId: string, templateId: string): Promise<string> {
  const db = getDb(userId)
  const id = newId()

  await db.transaction('rw', [db.workoutTemplates, db.templateItems, db.outbox, db.meta], async () => {
    const template = await db.workoutTemplates.get(templateId)
    if (!template) throw new Error(`No workout ${templateId}`)

    await writeRow(userId, 'workoutTemplates', {
      id,
      name: `${template.name} (copy)`,
      notes: template.notes,
      archivedAt: null,
    })

    for (const item of await templateItems(userId, templateId)) {
      await writeRow(userId, 'templateItems', {
        id: newId(),
        templateId: id,
        exerciseId: item.exerciseId,
        position: item.position,
        sets: item.sets,
        targetReps: item.targetReps,
        targetRepsMax: item.targetRepsMax,
        targetWeightKg: item.targetWeightKg,
        restSec: item.restSec,
        notes: item.notes,
      })
    }
  })

  return id
}
