'use client'

import { PencilLine } from 'lucide-react'
import { useState } from 'react'

import type { LocalSetLog } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'

/**
 * A note on one exercise in one session — how it went, how close to your limit
 * the weight was. Kept out of the way: a quiet link until tapped.
 *
 * It lives in `notes` on the exercise's first set log, which every session
 * already has and syncs, so a note needs no table of its own. Only `notes` is
 * written, so it never touches the weight and reps logged on that set.
 */
export function ExerciseNote({ userId, log }: { userId: string; log: LocalSetLog }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={2}
        defaultValue={log.notes ?? ''}
        placeholder="How it went, how close to your limit…"
        aria-label="Note on this exercise"
        onBlur={async (event) => {
          const notes = event.target.value.trim() || null
          if (notes !== log.notes) await writeRow(userId, 'setLogs', { id: log.id, notes })
          setEditing(false)
        }}
        className="mt-5 w-full rounded-md border border-line bg-surface p-3 text-[15px] outline-none focus-visible:border-plate-blue-lift"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-5 flex max-w-full items-start gap-1.5 text-left text-sm text-ink-dim"
    >
      <PencilLine size={14} className="mt-0.5 shrink-0" aria-hidden />
      {log.notes ? <span className="italic">{log.notes}</span> : 'Add a note'}
    </button>
  )
}
