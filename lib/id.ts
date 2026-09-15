import { v5 as uuidv5 } from 'uuid'
import { uuidv7 } from 'uuidv7'

/**
 * IDs are minted on the client, never by the server: a set logged in a gym
 * basement needs its *final* primary key immediately, so no id-remapping pass
 * ever has to run at sync time.
 *
 * - `newId()` — UUIDv7 for rows with no natural key. The leading timestamp
 *   makes ids k-sortable, so SQLite appends to the right edge of the b-tree
 *   instead of splitting pages at random, and `ORDER BY id` is free FIFO order
 *   for the outbox.
 * - The `*Id()` helpers — deterministic UUIDv5 over a natural key, so two
 *   devices offline at the same time compute the *same* id and sync merges the
 *   rows instead of duplicating them.
 */

/** Fixed namespace for this app's deterministic ids. Never change it. */
const NAMESPACE = '0f6d6f2c-5e7a-4a1e-9f3f-2a3b4c5d6e7f'

export function newId(): string {
  return uuidv7()
}

/** One session per (user, calendar date, template). */
export function sessionId(userId: string, scheduledFor: string, templateId: string): string {
  return uuidv5(`session|${userId}|${scheduledFor}|${templateId}`, NAMESPACE)
}

/** One row per set within a session — matches UNIQUE(sessionId, exerciseId, setIndex). */
export function setLogId(sessionId: string, exerciseId: string, setIndex: number): string {
  return uuidv5(`set|${sessionId}|${exerciseId}|${setIndex}`, NAMESPACE)
}

/** One bodyweight row per (user, day), so a re-entry corrects instead of duplicating. */
export function bodyWeightId(userId: string, measuredOn: string): string {
  return uuidv5(`bw|${userId}|${measuredOn}`, NAMESPACE)
}

/** One notes row per (user, exercise). */
export function exerciseNoteId(userId: string, exerciseId: string): string {
  return uuidv5(`exn|${userId}|${exerciseId}`, NAMESPACE)
}
