import { describe, expect, it } from 'vitest'

import { bodyWeightId, exerciseNoteId, newId, sessionId, setLogId } from '@/lib/id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const version = (id: string) => UUID.exec(id)?.[1]

describe('newId', () => {
  it('is a UUIDv7', () => {
    expect(version(newId())).toBe('7')
  })

  it('is unique', () => {
    const ids = new Set(Array.from({ length: 2000 }, newId))
    expect(ids.size).toBe(2000)
  })

  it('sorts in creation order, so the outbox and b-tree stay append-only', async () => {
    const earlier = newId()
    await new Promise((resolve) => setTimeout(resolve, 2))
    const later = newId()
    expect([later, earlier].sort()).toEqual([earlier, later])
  })
})

describe('deterministic ids', () => {
  it('are UUIDv5', () => {
    expect(version(sessionId('u', '2026-09-15', 't'))).toBe('5')
    expect(version(setLogId('s', 'e', 1))).toBe('5')
    expect(version(bodyWeightId('u', '2026-09-15'))).toBe('5')
    expect(version(exerciseNoteId('u', 'e'))).toBe('5')
  })

  it('give two offline devices the same session id for the same workout', () => {
    // The property the whole merge-don't-duplicate design depends on.
    expect(sessionId('user', '2026-09-15', 'tpl')).toBe(sessionId('user', '2026-09-15', 'tpl'))
  })

  it('separate different users, dates and templates', () => {
    const base = sessionId('user', '2026-09-15', 'tpl')
    expect(sessionId('other', '2026-09-15', 'tpl')).not.toBe(base)
    expect(sessionId('user', '2026-09-16', 'tpl')).not.toBe(base)
    expect(sessionId('user', '2026-09-15', 'tpl-b')).not.toBe(base)
  })

  it('give every set in a session its own id', () => {
    const ids = [1, 2, 3].map((n) => setLogId('session', 'Squat', n))
    expect(new Set(ids).size).toBe(3)
    expect(setLogId('session', 'Bench', 1)).not.toBe(ids[0])
  })

  it('never collide across kinds of row fed the same strings', () => {
    const ids = [
      sessionId('a', 'b', 'c'),
      setLogId('a', 'b', 1),
      bodyWeightId('a', 'b'),
      exerciseNoteId('a', 'b'),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cannot be confused by delimiters inside values', () => {
    // "a|b" + "c" must not equal "a" + "b|c".
    expect(exerciseNoteId('a|b', 'c')).not.toBe(exerciseNoteId('a', 'b|c'))
  })
})
