/** Wire types shared by the client sync engine and `/api/sync`. */

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

export type SyncRequest = {
  /** `users.syncRev` as of the last successful pull. 0 bootstraps a full snapshot. */
  cursor: number
  /** Stable per-device id; breaks `updatedAt` ties deterministically. */
  clientId: string
  mutations: Mutation[]
}

export type RejectedMutation = {
  mutationId: string
  table: SyncTable
  rowId: string
  /**
   * `stale` — a newer version is already stored (last-write-wins).
   * `forbidden` — the row belongs to another user or to the global library.
   */
  reason: 'stale' | 'forbidden'
  winner: SyncRow
}

export type SyncResponse = {
  cursor: number
  /** Server clock, so the client can correct a skewed device clock. */
  serverTime: number
  changes: Partial<Record<SyncTable, SyncRow[]>>
  applied: string[]
  rejected: RejectedMutation[]
}
