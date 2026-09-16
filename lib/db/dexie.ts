'use client'

import Dexie, { type EntityTable } from 'dexie'

import type { Mutation } from '@/lib/sync/types'

/**
 * The client's copy of the data. Every screen reads from here — nothing in the
 * UI fetches. See CLAUDE.md: this is the constraint the whole app is built on.
 *
 * The database name is namespaced by user id so a shared phone never leaks one
 * account's log into another's, and logout can delete the whole database.
 */

export type LocalExercise = {
  id: string
  userId: string | null
  name: string
  slug: string
  category: string | null
  level: string | null
  force: string | null
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[] | null
  secondaryMuscles: string[] | null
  instructions: string[] | null
  images: string[] | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalExerciseNote = {
  id: string
  userId: string
  exerciseId: string
  notes: string | null
  /** Absent on rows written before favourites existed. */
  favoritedAt?: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalWorkoutTemplate = {
  id: string
  userId: string
  name: string
  notes: string | null
  archivedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalTemplateItem = {
  id: string
  userId: string
  templateId: string
  exerciseId: string
  position: number
  sets: number
  targetReps: number
  targetRepsMax: number | null
  targetWeightKg: number | null
  /** Absent on rows written before cardio existed. */
  targetDurationSec?: number | null
  restSec: number
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalProgram = {
  id: string
  userId: string
  name: string
  stage: string | null
  startedOn: string
  endedOn: string | null
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalProgramDay = {
  id: string
  userId: string
  programId: string
  dayOfWeek: number
  templateId: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalSession = {
  id: string
  userId: string
  programId: string | null
  templateId: string | null
  templateName: string
  scheduledFor: string
  startedAt: number | null
  completedAt: number | null
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalSetLog = {
  id: string
  userId: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  position: number
  setIndex: number
  targetReps: number | null
  targetRepsMax: number | null
  targetWeightKg: number | null
  /** Absent on rows written before cardio existed, like `durationSec`. */
  targetDurationSec?: number | null
  restSec: number | null
  weightKg: number | null
  reps: number | null
  durationSec?: number | null
  isWarmup: boolean
  completedAt: number | null
  performedAt: number
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type LocalBodyWeight = {
  id: string
  userId: string
  measuredOn: string
  weightKg: number
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** Local-only: sync cursor, device id, server clock offset. */
export type MetaRow = { key: string; value: unknown }

/**
 * The Dexie 4 shape: an intersection type over one `SCHEMA` object, rather than
 * a subclass whose typed fields can drift out of step with the stores actually
 * declared. Every key here must appear in SCHEMA below, or the table is
 * `undefined` at runtime while still typechecking.
 */
export type GymlogDexie = Dexie & {
  exercises: EntityTable<LocalExercise, 'id'>
  exerciseNotes: EntityTable<LocalExerciseNote, 'id'>
  workoutTemplates: EntityTable<LocalWorkoutTemplate, 'id'>
  templateItems: EntityTable<LocalTemplateItem, 'id'>
  programs: EntityTable<LocalProgram, 'id'>
  programDays: EntityTable<LocalProgramDay, 'id'>
  sessions: EntityTable<LocalSession, 'id'>
  setLogs: EntityTable<LocalSetLog, 'id'>
  bodyWeights: EntityTable<LocalBodyWeight, 'id'>
  outbox: EntityTable<Mutation, 'id'>
  meta: EntityTable<MetaRow, 'key'>
}

/** Every table in `GymlogDexie`, so the schema below cannot miss one. */
type TableName = Exclude<keyof GymlogDexie, keyof Dexie>

// Typed as an exhaustive record: forget a table here and the build fails,
// rather than the table silently being `undefined` at runtime.
const SCHEMA: Record<TableName, string> = {
  exercises: 'id, slug, name, equipment, level, category',
  exerciseNotes: 'id, exerciseId',
  workoutTemplates: 'id, archivedAt',
  templateItems: 'id, templateId, [templateId+position]',
  programs: 'id, endedOn',
  programDays: 'id, programId, [programId+dayOfWeek]',
  sessions: 'id, scheduledFor, completedAt, templateId',
  // [exerciseId+performedAt] powers "what did I lift last time?" — the one
  // query that must be instant with no signal.
  setLogs: 'id, sessionId, [sessionId+position+setIndex], [exerciseId+performedAt]',
  bodyWeights: 'id, measuredOn',
  outbox: 'id, queuedAt, table',
  meta: 'key',
}

function createDb(name: string): GymlogDexie {
  const db = new Dexie(name) as GymlogDexie
  db.version(1).stores(SCHEMA)
  return db
}

let instance: GymlogDexie | null = null
let instanceUserId: string | null = null

function databaseName(userId: string): string {
  return `gymlog:${userId}`
}

/** The Dexie instance for a user, created on first use. */
export function getDb(userId: string): GymlogDexie {
  if (instance && instanceUserId !== userId) {
    instance.close()
    instance = null
  }
  if (!instance) {
    instance = createDb(databaseName(userId))
    instanceUserId = userId
  }
  return instance
}

/** Wipe local data on logout, so a shared device leaks nothing. */
export async function destroyDb(userId: string): Promise<void> {
  if (instance && instanceUserId === userId) {
    instance.close()
    instance = null
    instanceUserId = null
  }
  await Dexie.delete(databaseName(userId))
}
