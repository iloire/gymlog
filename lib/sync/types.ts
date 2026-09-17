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

export type SyncRequest = {
  /** `users.syncRev` as of the last successful pull. 0 bootstraps a full snapshot. */
  cursor: number
  /** Newest `updatedAt` of the global exercise library already held. 0 = none. */
  globalCursor: number
  /** Stable per-device id, so a push can be traced to the phone or laptop that sent it. */
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
   * `invalid` — the database refused it (e.g. it references a row that does
   *   not exist). Rejected rather than retried, so one bad row cannot wedge
   *   every other change behind it in the outbox forever.
   */
  reason: 'stale' | 'forbidden' | 'invalid'
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
