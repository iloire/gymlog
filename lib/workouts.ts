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
        targetDurationSec: item.targetDurationSec ?? null,
        restSec: item.restSec,
        notes: item.notes,
      })
    }
  })

  return id
}

/**
 * Bring back an exercise taken out of a workout — the editor's Undo.
 *
 * It returns to the place it left, unless an exercise added since sits there
 * now: then it goes to the end, because two items on one position cannot be
 * reordered (the arrows swap positions, and swapping equals changes nothing).
 */
export async function restoreTemplateItem(userId: string, itemId: string): Promise<void> {
  const db = getDb(userId)

  await db.transaction('rw', [db.templateItems, db.outbox, db.meta], async () => {
    const item = await db.templateItems.get(itemId)
    if (!item || item.deletedAt === null) return

    const live = await templateItems(userId, item.templateId)
    const taken = live.some((other) => other.position === item.position)

    await writeRow(userId, 'templateItems', {
      id: item.id,
      position: taken ? (live.at(-1)?.position ?? 0) + 1 : item.position,
      deletedAt: null,
    })
  })
}

/**
 * Put a workout's exercises in a new order — the editor's drag. `orderedIds`
 * is every live item of the workout, first to last; positions are rewritten
 * 1..n in one transaction, so a drag that crosses several rows lands whole.
 * An id not in the list keeps its row but goes to the end.
 */
export async function reorderItems(userId: string, templateId: string, orderedIds: string[]): Promise<void> {
  const db = getDb(userId)

  await db.transaction('rw', [db.templateItems, db.outbox, db.meta], async () => {
    const live = await templateItems(userId, templateId)
    const rest = live.filter((item) => !orderedIds.includes(item.id)).map((item) => item.id)
    const order = [...orderedIds.filter((id) => live.some((item) => item.id === id)), ...rest]

    for (const [index, id] of order.entries()) {
      const item = live.find((row) => row.id === id)
      if (item && item.position !== index + 1) {
        await writeRow(userId, 'templateItems', { id, position: index + 1 })
      }
    }
  })
}
