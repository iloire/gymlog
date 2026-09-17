import { beforeEach, describe, expect, it } from 'vitest'

import {
  BACKUP_FORMAT,
  backupFilename,
  exportBackup,
  importBackup,
  readBackup,
  type Backup,
} from '@/lib/backup'
import { destroyDb, getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { bodyWeightId } from '@/lib/id'

const MINE = 'user-1'
const THEIRS = 'user-2'

/** A library exercise: `userId` null, shared by every account, read-only. */
async function globalExercise(user: string) {
  await getDb(user).exercises.put({
    id: 'Barbell_Squat',
    userId: null,
    name: 'Barbell Squat',
    slug: 'barbell-squat',
    category: null,
    level: null,
    force: null,
    mechanic: null,
    equipment: null,
    primaryMuscles: null,
    secondaryMuscles: null,
    instructions: null,
    images: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  })
}

/** A programme, a workout, a day, a logged session with one set, and a weigh-in. */
async function seed(user: string) {
  await globalExercise(user)
  await writeRow(user, 'exercises', { id: 'ex-own', name: 'Zercher Squat', slug: 'zercher-squat' })
  await writeRow(user, 'workoutTemplates', { id: 'tpl-1', name: 'Legs', archivedAt: null })
  await writeRow(user, 'templateItems', {
    id: 'item-1',
    templateId: 'tpl-1',
    exerciseId: 'Barbell_Squat',
    position: 1,
    sets: 3,
    targetReps: 5,
    restSec: 180,
  })
  await writeRow(user, 'programs', { id: 'prog-1', name: 'Winter', startedOn: '2026-09-01' })
  await writeRow(user, 'programDays', {
    id: 'day-1',
    programId: 'prog-1',
    dayOfWeek: 0,
    templateId: 'tpl-1',
  })
  await writeRow(user, 'sessions', {
    id: 'sess-1',
    programId: 'prog-1',
    templateId: 'tpl-1',
    templateName: 'Legs',
    scheduledFor: '2026-09-14',
  })
  await writeRow(user, 'setLogs', {
    id: 'set-1',
    sessionId: 'sess-1',
    exerciseId: 'Barbell_Squat',
    exerciseName: 'Barbell Squat',
    position: 1,
    setIndex: 1,
    weightKg: 100,
    reps: 5,
    isWarmup: false,
    performedAt: 1_757_808_000_000,
  })
  await writeRow(user, 'bodyWeights', {
    id: bodyWeightId(user, '2026-09-14'),
    measuredOn: '2026-09-14',
    weightKg: 80,
  })
}

beforeEach(async () => {
  await destroyDb(MINE)
  await destroyDb(THEIRS)
})

describe('export', () => {
  it('takes your own rows and leaves the shared library behind', async () => {
    await seed(MINE)

    const backup = await exportBackup(MINE)

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.userId).toBe(MINE)
    expect(backup.tables.exercises.map((row) => row.id)).toEqual(['ex-own'])
    expect(backup.tables.setLogs).toHaveLength(1)
    expect(backup.tables.bodyWeights).toHaveLength(1)
  })

  it('leaves out what you deleted — a tombstone can only take data away', async () => {
    await seed(MINE)
    await writeRow(MINE, 'workoutTemplates', { id: 'tpl-1', name: 'Legs', deletedAt: Date.now() })

    const backup = await exportBackup(MINE)

    expect(backup.tables.workoutTemplates).toHaveLength(0)
  })

  it('carries no userId or rev: the account is decided when it is read back', async () => {
    await seed(MINE)

    const backup = await exportBackup(MINE)

    for (const row of backup.tables.setLogs) {
      expect(row).not.toHaveProperty('userId')
      expect(row).not.toHaveProperty('rev')
    }
  })

  it('names the file after the local day it was made', () => {
    expect(backupFilename(new Date(2026, 8, 18, 23, 30).getTime())).toBe('gymlog-2026-09-18.json')
  })
})

describe('restoring your own backup', () => {
  it('puts every row back under its own id', async () => {
    await seed(MINE)
    const backup = await exportBackup(MINE)
    await destroyDb(MINE)

    const summary = await importBackup(MINE, backup)
    expect(summary.restore).toBe(true)
    expect(summary.skipped).toBe(0)

    const db = getDb(MINE)
    expect(await db.sessions.get('sess-1')).toMatchObject({ userId: MINE, templateName: 'Legs' })
    expect(await db.setLogs.get('set-1')).toMatchObject({ sessionId: 'sess-1', weightKg: 100 })
    expect(await db.templateItems.get('item-1')).toMatchObject({ templateId: 'tpl-1' })
  })

  it('keeps your sets on a phone whose exercise library has not synced yet', async () => {
    await seed(MINE)
    const backup = await exportBackup(MINE)
    // A fresh device: signed in, database empty, the shared library not pulled
    // yet. The squat those sets refer to exists on the server all the same.
    await destroyDb(MINE)

    await importBackup(MINE, backup)

    const db = getDb(MINE)
    expect(await db.setLogs.count()).toBe(1)
    expect(await db.templateItems.count()).toBe(1)
    expect((await db.setLogs.toArray())[0]?.exerciseId).toBe('Barbell_Squat')
  })

  it('brings back a row you deleted since, rather than leaving it hidden', async () => {
    await seed(MINE)
    const backup = await exportBackup(MINE)
    await writeRow(MINE, 'workoutTemplates', { id: 'tpl-1', name: 'Legs', deletedAt: Date.now() })

    await importBackup(MINE, backup)

    expect(await getDb(MINE).workoutTemplates.get('tpl-1')).toMatchObject({ deletedAt: null })
  })

  it('imports the same file twice without making a second copy', async () => {
    await seed(MINE)
    const backup = await exportBackup(MINE)

    await importBackup(MINE, backup)
    await importBackup(MINE, backup)

    const db = getDb(MINE)
    expect(await db.setLogs.count()).toBe(1)
    expect(await db.sessions.count()).toBe(1)
    expect(await db.workoutTemplates.count()).toBe(1)
  })
})

describe('importing someone else’s backup', () => {
  it('gives every row a new id and keeps the links between them', async () => {
    await seed(THEIRS)
    const backup = await exportBackup(THEIRS)
    await globalExercise(MINE)

    const summary = await importBackup(MINE, backup)
    expect(summary.restore).toBe(false)
    expect(summary.skipped).toBe(0)

    const db = getDb(MINE)
    const session = (await db.sessions.toArray())[0]
    const log = (await db.setLogs.toArray())[0]
    const template = (await db.workoutTemplates.toArray())[0]

    // The ids belong to this account now — the originals are user-2's rows on
    // the server, and reusing them would be rejected as forbidden.
    expect(session?.id).not.toBe('sess-1')
    expect(log?.id).not.toBe('set-1')
    expect(log?.sessionId).toBe(session?.id)
    expect(session?.templateId).toBe(template?.id)
    expect(log?.userId).toBe(MINE)
  })

  it('reads the same file twice onto the same rows', async () => {
    await seed(THEIRS)
    const backup = await exportBackup(THEIRS)
    await globalExercise(MINE)

    await importBackup(MINE, backup)
    const first = (await getDb(MINE).setLogs.toArray()).map((row) => row.id)
    await importBackup(MINE, backup)
    const second = (await getDb(MINE).setLogs.toArray()).map((row) => row.id)

    expect(second).toEqual(first)
  })

  it('points at an exercise you already have instead of adding a second one', async () => {
    await seed(THEIRS)
    const backup = await exportBackup(THEIRS)
    await globalExercise(MINE)
    await writeRow(MINE, 'exercises', { id: 'mine-zercher', name: 'Zercher', slug: 'zercher-squat' })

    const summary = await importBackup(MINE, backup)

    const db = getDb(MINE)
    expect(summary.merged).toBe(1)
    expect(await db.exercises.count()).toBe(2)
    // Untouched: the import must not rewrite an exercise that was already here.
    expect(await db.exercises.get('mine-zercher')).toMatchObject({ name: 'Zercher' })
    // And the library squat its sets refer to is still the library row.
    expect((await db.setLogs.toArray())[0]?.exerciseId).toBe('Barbell_Squat')
  })

  it('corrects the weigh-in for a day already recorded instead of adding another', async () => {
    await seed(THEIRS)
    const backup = await exportBackup(THEIRS)
    await globalExercise(MINE)
    await writeRow(MINE, 'bodyWeights', {
      id: bodyWeightId(MINE, '2026-09-14'),
      measuredOn: '2026-09-14',
      weightKg: 91,
    })

    await importBackup(MINE, backup)

    // One row per day, as the server's unique index demands.
    const weights = await getDb(MINE).bodyWeights.toArray()
    expect(weights).toHaveLength(1)
    expect(weights[0]).toMatchObject({ id: bodyWeightId(MINE, '2026-09-14'), weightKg: 80 })
  })

  it('drops a set whose session is missing rather than writing one that can never sync', async () => {
    await seed(THEIRS)
    const backup = await exportBackup(THEIRS)
    backup.tables.sessions = []
    await globalExercise(MINE)

    const summary = await importBackup(MINE, backup)

    expect(summary.skipped).toBe(1)
    expect(summary.written.setLogs).toBe(0)
    expect(await getDb(MINE).setLogs.count()).toBe(0)
  })

  it('keeps a session whose programme is missing, clearing the reference', async () => {
    await seed(THEIRS)
    const backup = await exportBackup(THEIRS)
    backup.tables.programs = []
    backup.tables.programDays = []
    await globalExercise(MINE)

    await importBackup(MINE, backup)

    const session = (await getDb(MINE).sessions.toArray())[0]
    expect(session?.programId).toBeNull()
    expect(session?.templateId).not.toBeNull()
  })
})

describe('what an import queues', () => {
  it('writes an outbox entry for every row, or the import never leaves the device', async () => {
    await seed(MINE)
    const backup = await exportBackup(MINE)
    await destroyDb(MINE)

    const summary = await importBackup(MINE, backup)

    const db = getDb(MINE)
    expect(await db.outbox.count()).toBe(summary.total)
    const queued = await db.outbox.get('setLogs:set-1')
    expect(queued?.row).toMatchObject({ id: 'set-1', userId: MINE, weightKg: 100 })
  })

  it('stamps every row as written now, so the server takes it as the winner', async () => {
    await seed(MINE)
    const backup = await exportBackup(MINE)
    const before = Date.now()

    await importBackup(MINE, backup)

    const log = await getDb(MINE).setLogs.get('set-1')
    expect(log?.updatedAt).toBeGreaterThanOrEqual(before)
    // …while when it was first created is preserved.
    expect(log?.createdAt).toBeLessThanOrEqual(before)
  })
})

describe('reading a file', () => {
  it('refuses what is not JSON, not a backup, or newer than this app', () => {
    expect(readBackup('not json at all')).toMatchObject({ ok: false })
    expect(readBackup('{"format":"something-else"}')).toMatchObject({ ok: false })
    expect(
      readBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, exportedAt: 1, userId: 'u', tables: {} })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('newer version') })
  })

  it('refuses a backup whose rows are damaged rather than importing half of it', () => {
    const broken = {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: 1,
      userId: 'u',
      tables: { bodyWeights: [{ id: 'bw-1', measuredOn: '2026-09-14', weightKg: 'heavy' }] },
    }

    expect(readBackup(JSON.stringify(broken))).toMatchObject({ ok: false })
  })

  it('drops columns it does not know, which the server would refuse', async () => {
    await seed(MINE)
    const exported = await exportBackup(MINE)
    const tampered = JSON.parse(JSON.stringify(exported)) as Backup
    ;(tampered.tables.bodyWeights[0] as Record<string, unknown>).dropTable = 'oops'

    const result = readBackup(JSON.stringify(tampered))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.tables.bodyWeights[0]).not.toHaveProperty('dropTable')
  })
})
