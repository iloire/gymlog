'use client'

import { getDb } from '@/lib/db/dexie'
import { mutationFor, now } from '@/lib/sync/client'
import type { SyncRow, SyncTable } from '@/lib/sync/types'

/**
 * The only sanctioned way to change local data.
 *
 * A row and its outbox entry are written in ONE Dexie transaction — never one
 * without the other, or a set logged in a basement can be saved locally and
 * never sync, or sync and vanish locally.
 */
export type RowInput = { id: string } & Record<string, unknown>

export async function writeRow(
  userId: string,
  table: SyncTable,
  row: RowInput,
): Promise<SyncRow> {
  const db = getDb(userId)
  const timestamp = await now(db)

  let saved!: SyncRow
  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    const existing = (await db.table(table).get(row.id)) as SyncRow | undefined

    saved = {
      ...existing,
      ...row,
      userId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      // Only an explicit `deletedAt` changes it, and `null` restores a deleted row.
      deletedAt: 'deletedAt' in row ? ((row.deletedAt as number | null) ?? null) : (existing?.deletedAt ?? null),
    }

    await db.table(table).put(saved)
    await db.outbox.put(mutationFor(table, saved))
  })

  return saved
}

/** Soft delete — an offline device has to learn about deletions. */
export async function deleteRow(userId: string, table: SyncTable, id: string): Promise<void> {
  const db = getDb(userId)
  const timestamp = await now(db)

  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    const existing = (await db.table(table).get(id)) as SyncRow | undefined
    if (!existing) return

    const saved = { ...existing, updatedAt: timestamp, deletedAt: timestamp }
    await db.table(table).put(saved)
    await db.outbox.put(mutationFor(table, saved))
  })
}
