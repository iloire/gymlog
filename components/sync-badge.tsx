'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { useSync } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { clearRejections, rejections } from '@/lib/sync/client'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The "ready for the gym" check: is everything I have logged actually on the
 * server, and how stale is my copy of the plan? Shows nothing when all is
 * well — a "Synced just now" line on every load is a row of reassurance
 * nobody reads — and a yellow bar only when something needs doing. Under it,
 * what the server refused since you last looked: a set another phone
 * overwrote, or a row it could not store, which the outbox has already let
 * go of and would otherwise never mention.
 */
export function SyncBadge() {
  const { userId, status, lastSyncAt, syncNow } = useSync()

  // The clock is read inside the query rather than during render — render has
  // to stay pure, and this recomputes whenever the outbox or last sync changes.
  const state = useLiveQuery(
    async () => ({
      pending: userId ? await getDb(userId).outbox.count() : 0,
      stale: !lastSyncAt || Date.now() - lastSyncAt > DAY_MS,
      refused: userId ? await rejections(userId) : [],
    }),
    [userId, lastSyncAt],
  )

  if (!userId || !state) return null

  const { pending, stale, refused } = state
  const overwritten = refused.filter((r) => r.reason === 'stale').length
  const unsaved = refused.length - overwritten

  // A push the server could not take is not "waiting": tapping Sync now again
  // changes nothing, and the badge has to say so or it reads as a flaky link.
  const waiting = `${pending} ${pending === 1 ? 'change' : 'changes'} waiting to sync`
  const message =
    pending > 0
      ? status === 'error'
        ? `${waiting} · the server could not take them`
        : waiting
      : status === 'offline'
        ? 'Offline — your log is saved on this phone'
        : stale
          ? 'Your copy of the plan is over a day old'
          : null

  if (!message && refused.length === 0) return null

  return (
    <div className="mt-6">
      {message && (
        <button
          type="button"
          onClick={() => void syncNow()}
          className="flex w-full items-center justify-between gap-3 border-l-2 border-plate-yellow bg-surface px-4 py-3 text-left text-sm"
        >
          <span>{message}</span>
          <span className="shrink-0 text-ink-dim">
            {status === 'syncing' ? 'Syncing…' : status === 'error' ? 'Try again' : 'Sync now'}
          </span>
        </button>
      )}
      {refused.length > 0 && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 border-l-2 border-line bg-surface px-4 py-3 text-sm ${message ? 'mt-px' : ''}`}
        >
          <span>
            {overwritten > 0 && `${overwritten} ${overwritten === 1 ? 'change was' : 'changes were'} overwritten by another device`}
            {overwritten > 0 && unsaved > 0 && ' · '}
            {unsaved > 0 && `${unsaved} ${unsaved === 1 ? 'change' : 'changes'} could not be saved`}
          </span>
          <button type="button" onClick={() => void clearRejections(userId)} className="shrink-0 text-ink-dim">
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
