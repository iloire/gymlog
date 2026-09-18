'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { useSync } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The "ready for the gym" check: is everything I have logged actually on the
 * server, and how stale is my copy of the plan? Shows nothing when all is
 * well — a "Synced just now" line on every load is a row of reassurance
 * nobody reads — and a yellow bar only when something needs doing.
 */
export function SyncBadge() {
  const { userId, status, lastSyncAt, syncNow } = useSync()

  // The clock is read inside the query rather than during render — render has
  // to stay pure, and this recomputes whenever the outbox or last sync changes.
  const state = useLiveQuery(
    async () => ({
      pending: userId ? await getDb(userId).outbox.count() : 0,
      stale: !lastSyncAt || Date.now() - lastSyncAt > DAY_MS,
    }),
    [userId, lastSyncAt],
  )

  if (!userId || !state) return null

  const { pending, stale } = state

  if (pending === 0 && !stale && status !== 'offline') return null

  const message =
    pending > 0
      ? `${pending} ${pending === 1 ? 'change' : 'changes'} waiting to sync`
      : status === 'offline'
        ? 'Offline — your log is saved on this phone'
        : 'Your copy of the plan is over a day old'

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className="mt-6 flex w-full items-center justify-between gap-3 border-l-2 border-plate-yellow bg-surface px-4 py-3 text-left text-sm"
    >
      <span>{message}</span>
      <span className="shrink-0 text-ink-dim">
        {status === 'syncing' ? 'Syncing…' : 'Sync now'}
      </span>
    </button>
  )
}
