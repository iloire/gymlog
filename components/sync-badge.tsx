'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { useSync } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'

const DAY_MS = 24 * 60 * 60 * 1000

function ago(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/**
 * The "ready for the gym" check: is everything I have logged actually on the
 * server, and how stale is my copy of the plan?
 */
export function SyncBadge() {
  const { userId, status, lastSyncAt, syncNow } = useSync()

  // The clock is read inside the query rather than during render — render has
  // to stay pure, and this recomputes whenever the outbox or last sync changes.
  const state = useLiveQuery(
    async () => ({
      pending: userId ? await getDb(userId).outbox.count() : 0,
      stale: !lastSyncAt || Date.now() - lastSyncAt > DAY_MS,
      label: lastSyncAt ? ago(lastSyncAt) : null,
    }),
    [userId, lastSyncAt],
  )

  if (!userId || !state) return null

  const { pending, stale, label } = state

  if (pending === 0 && !stale && status !== 'offline') {
    return <p className="text-xs text-ink-dim">Synced {label}</p>
  }

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
      className="flex w-full items-center justify-between gap-3 border-l-2 border-plate-yellow bg-surface px-4 py-3 text-left text-sm"
    >
      <span>{message}</span>
      <span className="shrink-0 text-ink-dim">
        {status === 'syncing' ? 'Syncing…' : 'Sync now'}
      </span>
    </button>
  )
}
