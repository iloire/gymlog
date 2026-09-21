'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { useUserId } from '@/components/session-boot'
import { useLocale } from '@/components/locale-provider'
import { getDb } from '@/lib/db/dexie'
import { libraryName } from '@/lib/exercise-i18n'
import { today } from '@/lib/queries'
import { openWorkout } from '@/lib/sessions'

/**
 * The workout under way, on every tab: "Full Body A · Squat, set 2 of 3" and
 * the way back into it, like a player's now-playing bar. The rest bar already
 * offers the way back while a rest runs, so this one steps aside for it, and
 * Today shows the workout whole with its own Continue.
 */
export function OpenWorkoutBar() {
  const t = useTranslations('today.openBar')
  const userId = useUserId()

  const locale = useLocale()
  const open = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    // Newest first; a workout opened and left with nothing logged does not hide
    // one started earlier that has.
    const sessions = (await db.sessions.where('scheduledFor').equals(today()).toArray())
      .filter((row) => row.deletedAt === null && row.completedAt === null && row.startedAt !== null)
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    for (const session of sessions) {
      const logs = (await db.setLogs.where('sessionId').equals(session.id).toArray())
        .filter((log) => log.deletedAt === null)
        .sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)
      const open = openWorkout(logs)
      if (open) return { sessionId: session.id, name: session.templateName, next: open.next }
    }
    return null
  }, [userId])

  if (!open) return null

  return (
    <Link
      href={`/session?id=${open.sessionId}`}
      className="block border-t border-line bg-surface"
    >
      <span className="mx-auto flex min-h-14 w-full max-w-page items-center gap-3 pr-4 pl-5">
      <span className="size-2 shrink-0 rounded-full bg-plate-blue-lift motion-safe:animate-pulse" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="text-ink-dim">{open.name} · </span>
        {open.next
          ? t.rich('next', {
              exercise: libraryName(open.next.exerciseId, open.next.exerciseName, locale),
              setIndex: open.next.setIndex,
              sets: open.next.sets,
              n: (chunks) => <span className="figure">{chunks}</span>,
            })
          : t('allLogged')}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-sm text-ink-dim">
        {open.next ? t('continue') : t('finish')}
        <ChevronRight size={16} aria-hidden />
      </span>
      </span>
    </Link>
  )
}
