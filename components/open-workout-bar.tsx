'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { today } from '@/lib/queries'
import { nextSet } from '@/lib/sessions'

/**
 * The workout under way, on every tab: "Full Body A · Squat, set 2 of 3" and
 * the way back into it, like a player's now-playing bar. The rest bar already
 * offers the way back while a rest runs, so this one steps aside for it, and
 * Today shows the workout whole with its own Continue.
 */
export function OpenWorkoutBar() {
  const userId = useUserId()

  const open = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const session = (await db.sessions.where('scheduledFor').equals(today()).toArray())
      .filter((row) => row.deletedAt === null && row.completedAt === null && row.startedAt !== null)
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]
    if (!session) return null

    const logs = (await db.setLogs.where('sessionId').equals(session.id).toArray())
      .filter((log) => log.deletedAt === null)
      .sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)
    if (logs.length === 0) return null

    const next = nextSet(logs)
    const ofExercise = next ? logs.filter((log) => log.exerciseId === next.exerciseId).length : 0
    return {
      sessionId: session.id,
      name: session.templateName,
      next: next ? { exerciseName: next.exerciseName, setIndex: next.setIndex, sets: ofExercise } : null,
    }
  }, [userId])

  if (!open) return null

  return (
    <Link
      href={`/session?id=${open.sessionId}`}
      className="flex min-h-14 items-center gap-3 border-t border-line bg-surface pr-4 pl-5"
    >
      <span className="size-2 shrink-0 rounded-full bg-plate-blue-lift motion-safe:animate-pulse" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="text-ink-dim">{open.name} · </span>
        {open.next ? (
          <>
            {open.next.exerciseName}, set <span className="figure">{open.next.setIndex}</span> of{' '}
            <span className="figure">{open.next.sets}</span>
          </>
        ) : (
          'every set logged'
        )}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-sm text-ink-dim">
        {open.next ? 'Continue' : 'Finish'}
        <ChevronRight size={16} aria-hidden />
      </span>
    </Link>
  )
}
