'use client'

import { useState } from 'react'

import { useUserId } from '@/components/session-boot'
import type { LocalSession } from '@/lib/db/dexie'
import { finishSession } from '@/lib/sessions'

/**
 * End a workout from its card on Today, sets left or not — the rack never came
 * free, or you ran out of time. The session screen only offers Finish once
 * every set is logged, so without this a workout cut short stayed open for
 * good. With sets still to do it asks first; Reopen undoes it either way.
 */
export function FinishSession({ session, setsLeft }: { session: LocalSession; setsLeft: number }) {
  const userId = useUserId()
  const [confirming, setConfirming] = useState(false)

  if (!userId) return null

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => (setsLeft > 0 ? setConfirming(true) : void finishSession(userId, session))}
        className="h-12 w-full rounded-md border border-line text-sm"
      >
        Finish workout
      </button>
    )
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={`finish-session-${session.id}`}
      className="w-full rounded-md border border-line p-4"
    >
      <p id={`finish-session-${session.id}`} className="text-[15px]">
        Finish with {setsLeft} {setsLeft === 1 ? 'set' : 'sets'} not done?
      </p>
      <p className="mt-1 text-sm text-ink-dim">
        What you logged is kept. You can reopen the workout if there is more in you.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          autoFocus
          onClick={() => setConfirming(false)}
          className="h-12 rounded-md border border-line text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void finishSession(userId, session)}
          className="h-12 rounded-md bg-plate-blue text-sm font-semibold text-white"
        >
          Finish
        </button>
      </div>
    </div>
  )
}
