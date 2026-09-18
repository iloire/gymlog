/** Wire types shared by the client sync engine and `/api/sync`. */

import type { Unit } from '@/lib/units'

export const SYNC_TABLES = [
  'exercises',
  'exerciseNotes',
  'workoutTemplates',
  'templateItems',
  'programs',
  'programDays',
  'sessions',
  'setLogs',
  'bodyWeights',
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/**
 * How many queued rows one push may carry. The server refuses a larger request
 * outright, so the client has to stop at the same number: an import can put
 * thousands of rows in the outbox at once, and without this the whole batch is
 * sent, rejected as a bad request, and sync never recovers. A full batch just
 * means the next sync carries the rest.
 */
export const MAX_PUSH = 2000

/** A row as it travels over the wire — camelCase, JSON-safe. */
export type SyncRow = Record<string, unknown> & {
  id: string
  updatedAt: number
  deletedAt?: number | null
  rev?: number
}

/**
 * One queued local write. Full-row upserts only — no field-level diffs, no
 * operational transforms. A delete is an upsert with `deletedAt` set.
 */
export type Mutation = {
  /**
   * `${table}:${rowId}`, so re-editing a row REPLACES its queued mutation
   * instead of stacking another one behind it. Without this the outbox grows
   * with superseded copies that are re-sent and rejected as stale forever, and
   * the "changes waiting to sync" count lies.
   */
  id: string
  table: SyncTable
  rowId: string
  row: SyncRow
  /** FIFO ordering, and the guard against dropping an edit made mid-sync. */
  queuedAt: number
}

export function mutationKey(table: SyncTable, rowId: string): string {
  return `${table}:${rowId}`
}

/**
 * A row created on a device that did not know the row already existed: its
 * first write, so created and updated at the same instant. Opening a workout
 * pre-creates every set with a deterministic id, and a second device doing the
 * same offline mints the very same rows. Such a row must never replace what is
 * stored — with last-write-wins alone, opening today's workout on the laptop
 * after logging it on the phone would blank every set.
 */
export function isFreshRow(row: SyncRow): boolean {
  return Number(row.createdAt) === Number(row.updatedAt)
}

/**
 * A row with nothing in it worth keeping: a pre-created set nobody did, or a
 * session with nothing logged and no note. Losing one is not losing anything,
 * so neither the badge nor the server's conflict log counts it.
 */
export function isBlankRow(table: SyncTable, row: SyncRow): boolean {
  if (table === 'setLogs') {
    return row.completedAt == null && row.weightKg == null && row.reps == null && row.durationSec == null
  }
  if (table === 'sessions') return row.completedAt == null && row.notes == null
  return false
}

export type SyncRequest = {
  /** `users.syncRev` as of the last successful pull. 0 bootstraps a full snapshot. */
  cursor: number
  /** Newest `updatedAt` of the global exercise library already held. 0 = none. */
  globalCursor: number
  /** Stable per-device id, so a push can be traced to the phone or laptop that sent it. */
  clientId: string
  mutations: Mutation[]
  /**
   * A unit chosen on this device since its last push. The one account setting
   * a phone can change: it is not a row, so it rides beside the mutations and
   * the server takes it as given — the last device to choose wins.
   */
  unit?: Unit
}

export type RejectedMutation = {
  mutationId: string
  table: SyncTable
  rowId: string
  /**
   * `stale` — the stored row stands: it is newer (last-write-wins), or the
   *   sent row was a fresh copy from a device that did not know it existed
   *   (see `isFreshRow`). The client takes `winner` so the devices agree.
   * `forbidden` — the row belongs to another user or to the global library.
   * `invalid` — the database refused it (e.g. it references a row that does
   *   not exist). Rejected rather than retried, so one bad row cannot wedge
   *   every other change behind it in the outbox forever.
   * Whatever the reason, the server keeps the losing row in `sync_conflicts`
   * unless it was blank, so a lost change can always be recovered.
   */
  reason: 'stale' | 'forbidden' | 'invalid'
  winner: SyncRow
}

export type SyncResponse = {
  cursor: number
  /** Server clock, so the client can correct a skewed device clock. */
  serverTime: number
  /** `users.unit` after this push, so every device shows weights the same way. */
  unit: Unit
  changes: Partial<Record<SyncTable, SyncRow[]>>
  applied: string[]
  rejected: RejectedMutation[]
}
