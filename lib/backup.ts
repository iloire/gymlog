'use client'

import { z } from 'zod'

import { getDb, type GymlogDexie } from '@/lib/db/dexie'
import { bodyWeightId, exerciseNoteId, importedId } from '@/lib/id'
import { today } from '@/lib/queries'
import { mutationFor, now } from '@/lib/sync/client'
import { SYNC_TABLES, type SyncRow, type SyncTable } from '@/lib/sync/types'

/**
 * Take your log out of the app, and put it back.
 *
 * Both directions run against Dexie only — an export is what is on the device,
 * and an import is an ordinary batch of local writes that reaches the server
 * through the outbox like any other. Nothing here talks to `/api/sync`.
 *
 * The file is JSON: a backup, and something an LLM can read.
 */

export const BACKUP_FORMAT = 'gymlog-backup'
export const BACKUP_VERSION = 1

// ------------------------------------------------------------------ parsing

/**
 * A file is untrusted input, so every row is parsed field by field. Unknown
 * keys are dropped rather than passed through: the server inserts what it is
 * sent, and one stray column makes the row an `invalid` rejection that the
 * user never sees. `userId` and `rev` are dropped for the same reason — the
 * account is decided here, and the revision by the server.
 */
const id = z.string().min(1)
const text = z.string().nullable().default(null)
const num = z.number().nullable().default(null)
const strings = z.array(z.string()).nullable().default(null)

const base = {
  id,
  createdAt: z.number().optional(),
  deletedAt: z.number().nullable().default(null),
}

const rowSchemas = {
  exercises: z.object({
    ...base,
    name: z.string(),
    slug: z.string(),
    category: text,
    level: text,
    force: text,
    mechanic: text,
    equipment: text,
    primaryMuscles: strings,
    secondaryMuscles: strings,
    instructions: strings,
    images: strings,
  }),
  exerciseNotes: z.object({ ...base, exerciseId: id, notes: text, favoritedAt: num }),
  workoutTemplates: z.object({ ...base, name: z.string(), notes: text, archivedAt: num }),
  templateItems: z.object({
    ...base,
    templateId: id,
    exerciseId: id,
    position: z.number(),
    sets: z.number(),
    targetReps: z.number(),
    targetRepsMax: num,
    targetWeightKg: num,
    targetDurationSec: num,
    restSec: z.number(),
    notes: text,
  }),
  programs: z.object({
    ...base,
    name: z.string(),
    stage: text,
    startedOn: z.string(),
    endedOn: text,
    notes: text,
  }),
  programDays: z.object({ ...base, programId: id, dayOfWeek: z.number(), templateId: id }),
  sessions: z.object({
    ...base,
    programId: text,
    templateId: text,
    templateName: z.string(),
    scheduledFor: z.string(),
    startedAt: num,
    completedAt: num,
    notes: text,
  }),
  setLogs: z.object({
    ...base,
    sessionId: id,
    exerciseId: id,
    exerciseName: z.string(),
    position: z.number(),
    setIndex: z.number(),
    targetReps: num,
    targetRepsMax: num,
    targetWeightKg: num,
    targetDurationSec: num,
    restSec: num,
    weightKg: num,
    reps: num,
    durationSec: num,
    effort: z.enum(['easy', 'hard', 'failed']).nullable().default(null),
    isWarmup: z.boolean().default(false),
    completedAt: num,
    performedAt: z.number(),
    notes: text,
  }),
  bodyWeights: z.object({ ...base, measuredOn: z.string(), weightKg: z.number(), notes: text }),
} satisfies Record<SyncTable, z.ZodType>

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.number(),
  /** Which account the file came from — the one thing that decides id handling. */
  userId: id,
  tables: z.object({
    exercises: z.array(rowSchemas.exercises).default([]),
    exerciseNotes: z.array(rowSchemas.exerciseNotes).default([]),
    workoutTemplates: z.array(rowSchemas.workoutTemplates).default([]),
    templateItems: z.array(rowSchemas.templateItems).default([]),
    programs: z.array(rowSchemas.programs).default([]),
    programDays: z.array(rowSchemas.programDays).default([]),
    sessions: z.array(rowSchemas.sessions).default([]),
    setLogs: z.array(rowSchemas.setLogs).default([]),
    bodyWeights: z.array(rowSchemas.bodyWeights).default([]),
  }),
})

export type Backup = z.infer<typeof backupSchema>
type Row = { id: string } & Record<string, unknown>

/** How many rows a file holds, per table — shown before anything is written. */
export type BackupCounts = Record<SyncTable, number>

export function countRows(backup: Backup): BackupCounts {
  return Object.fromEntries(
    SYNC_TABLES.map((table) => [table, backup.tables[table].length]),
  ) as BackupCounts
}

/** Why a file could not be read; the page has the words for each, in either language. */
export type ReadError = 'notJson' | 'notBackup' | 'newer' | 'damaged'

export type ReadResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: ReadError; /** Where a damaged file first went wrong, e.g. `tables.setLogs.3.reps: Expected number`. */ detail?: string }

/** Parse a file the user picked. Never throws — the result says what was wrong. */
export function readBackup(contents: string): ReadResult {
  let data: unknown
  try {
    data = JSON.parse(contents)
  } catch {
    return { ok: false, error: 'notJson' }
  }

  if ((data as { format?: unknown })?.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'notBackup' }
  }
  if (Number((data as { version?: unknown }).version) > BACKUP_VERSION) {
    return { ok: false, error: 'newer' }
  }

  const parsed = backupSchema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: 'damaged',
      ...(issue ? { detail: `${issue.path.join('.')}: ${issue.message}` } : {}),
    }
  }

  return { ok: true, backup: parsed.data }
}

// ------------------------------------------------------------------- export

/**
 * Everything this account owns, as it stands on the device.
 *
 * The global exercise library is left out — every account already has it, it is
 * read-only, and writing those rows back would be rejected as `forbidden`. Your
 * own exercises are the same table with a `userId`, and they are included.
 * Deleted rows are left out too: a backup is the data you have, and a tombstone
 * can only take something away from the account it is imported into.
 */
export async function exportBackup(userId: string): Promise<Backup> {
  const db = getDb(userId)
  const tables = {} as Backup['tables']

  for (const table of SYNC_TABLES) {
    const rows = (await db.table(table).toArray()) as SyncRow[]
    tables[table] = rows
      .filter((row) => row.deletedAt == null && row.userId != null)
      .map(strip) as never
  }

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), userId, tables }
}

function strip(row: SyncRow): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row }
  delete copy.userId
  delete copy.rev
  return copy
}

/** `gymlog-2026-09-18.json` — the local date, like every other date in the app. */
export function backupFilename(exportedAt = Date.now()): string {
  return `gymlog-${today(new Date(exportedAt))}.json`
}

// ------------------------------------------------------------------- import

export type ImportSummary = {
  /** Rows written, per table. */
  written: BackupCounts
  total: number
  /**
   * True when the file came from this account: ids are kept, so every row lands
   * back on itself and importing twice changes nothing the second time.
   */
  restore: boolean
  /** Exercises that were already here under the same slug, so they were left alone. */
  merged: number
  /** Rows dropped because something they reference is in neither the file nor this account. */
  skipped: number
}

/**
 * Write a backup into this account.
 *
 * **A backup of this account keeps its ids.** Every row lands back on itself,
 * so a restore is exact and running it twice is a no-op.
 *
 * **A backup from another account cannot.** Those ids already belong to someone
 * else on the server, which would reject every row as `forbidden` — the rows
 * would sit on the device and never sync. So each one is given a new id derived
 * from (this user, its old id), and every reference between them is remapped to
 * match. That is deterministic, so importing the same file twice updates the
 * same rows rather than making a second copy of the log. Two exceptions, both
 * forced by a unique index the server would refuse: a weigh-in takes the id of
 * (this user, its date) and an exercise note the id of (this user, exercise),
 * so they collide with what is already here on purpose and correct it.
 *
 * An imported exercise whose slug is already here — a library squat, or one you
 * made — is not written at all: references point at the exercise you have.
 */
export async function importBackup(userId: string, backup: Backup): Promise<ImportSummary> {
  const db = getDb(userId)
  const restore = backup.userId === userId

  const ids = new Map<string, string>()
  const merged = new Set<string>()
  if (!restore) await remap(db, userId, backup, ids, merged)

  const mapped = (value: string) => ids.get(value) ?? value

  // Which ids a reference may point at: everything already on the device, plus
  // the rows accepted from the file as we go. SYNC_TABLES is in dependency
  // order, so a parent is always decided before its children.
  const available = new Map<SyncTable, Set<string>>()
  for (const table of SYNC_TABLES) {
    available.set(table, new Set((await db.table(table).toCollection().primaryKeys()) as string[]))
  }

  const writes = new Map<SyncTable, Row[]>()
  const written = Object.fromEntries(SYNC_TABLES.map((table) => [table, 0])) as BackupCounts
  let skipped = 0

  for (const table of SYNC_TABLES) {
    const rows: Row[] = []

    for (const source of backup.tables[table] as Row[]) {
      if (table === 'exercises' && merged.has(source.id)) continue

      const row = { ...source, id: mapped(source.id) }
      if (!relink(table, row, mapped, available)) {
        skipped += 1
        continue
      }

      rows.push(row)
      available.get(table)?.add(row.id)
    }

    // A weigh-in and an exercise note are keyed on their natural key, so the
    // same file read twice cannot produce two rows for one day or one exercise.
    if (rows.length) writes.set(table, dedupe(rows))
    written[table] = writes.get(table)?.length ?? 0
  }

  await commit(db, userId, writes)

  return {
    written,
    total: Object.values(written).reduce((sum, count) => sum + count, 0),
    restore,
    merged: merged.size,
    skipped,
  }
}

/** New ids for a file from another account, before anything is written. */
async function remap(
  db: GymlogDexie,
  userId: string,
  backup: Backup,
  ids: Map<string, string>,
  merged: Set<string>,
): Promise<void> {
  const bySlug = new Map(
    (await db.exercises.toArray())
      .filter((exercise) => exercise.deletedAt === null)
      .map((exercise) => [exercise.slug, exercise.id]),
  )

  for (const exercise of backup.tables.exercises) {
    const here = bySlug.get(exercise.slug)
    if (here) {
      ids.set(exercise.id, here)
      merged.add(exercise.id)
    } else {
      ids.set(exercise.id, importedId(userId, exercise.id))
    }
  }

  for (const table of SYNC_TABLES) {
    if (table === 'exercises') continue
    for (const row of backup.tables[table] as Row[]) {
      ids.set(row.id, importedId(userId, row.id))
    }
  }

  // Both have a unique index on (user, natural key) that an arbitrary id would
  // walk straight into; these ids are what this account would have minted.
  for (const note of backup.tables.exerciseNotes) {
    ids.set(note.id, exerciseNoteId(userId, ids.get(note.exerciseId) ?? note.exerciseId))
  }
  for (const weight of backup.tables.bodyWeights) {
    ids.set(weight.id, bodyWeightId(userId, weight.measuredOn))
  }
}

/**
 * Point a row's references at the rows they mean, and say whether it can be
 * written at all. A child whose parent is in neither the file nor this account
 * would be an `invalid` rejection at the server — a row on the device that
 * never syncs — so it is dropped here instead. A session's programme and
 * workout are optional, so a missing one is cleared rather than losing the
 * workout you did.
 *
 * An exercise is never a reason to drop a row. The shared library is not on a
 * device until the first sync has finished, so restoring a backup onto a phone
 * you have just signed in to would otherwise throw away every set you have
 * ever done: the rows exist on the server, which is what the foreign key is
 * checked against.
 */
function relink(
  table: SyncTable,
  row: Row,
  mapped: (value: string) => string,
  available: Map<SyncTable, Set<string>>,
): boolean {
  const rewrite = (field: string): string => {
    const value = mapped(row[field] as string)
    row[field] = value
    return value
  }

  const link = (field: string, parent: SyncTable): boolean =>
    available.get(parent)?.has(rewrite(field)) ?? false

  const optional = (field: string, parent: SyncTable): void => {
    if (row[field] == null) return
    if (!link(field, parent)) row[field] = null
  }

  switch (table) {
    case 'exerciseNotes':
      rewrite('exerciseId')
      return true
    case 'templateItems':
      rewrite('exerciseId')
      return link('templateId', 'workoutTemplates')
    case 'programDays':
      return link('programId', 'programs') && link('templateId', 'workoutTemplates')
    case 'sessions':
      optional('programId', 'programs')
      optional('templateId', 'workoutTemplates')
      return true
    case 'setLogs':
      rewrite('exerciseId')
      return link('sessionId', 'sessions')
    default:
      return true
  }
}

/** Last row wins, so a file holding two versions of a row writes one. */
function dedupe(rows: Row[]): Row[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()]
}

/**
 * One transaction for the whole import: the rows and their outbox entries go in
 * together or not at all, the same rule `lib/db/write.ts` keeps for a single
 * write. Every row is stamped `updatedAt = now` so it wins last-write-wins on
 * the server — an import is a deliberate act, and the file is what you want.
 */
async function commit(
  db: GymlogDexie,
  userId: string,
  writes: Map<SyncTable, Row[]>,
): Promise<void> {
  if (!writes.size) return
  const timestamp = await now(db)

  await db.transaction('rw', db.tables, async () => {
    for (const [table, rows] of writes) {
      const existing = (await db.table(table).bulkGet(rows.map((row) => row.id))) as (
        | SyncRow
        | undefined
      )[]

      const saved = rows.map((row, index) => ({
        ...existing[index],
        ...row,
        userId,
        createdAt: existing[index]?.createdAt ?? row.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: (row.deletedAt as number | null) ?? null,
      })) as SyncRow[]

      await db.table(table).bulkPut(saved)
      await db.outbox.bulkPut(saved.map((row) => mutationFor(table, row)))
    }
  })
}
