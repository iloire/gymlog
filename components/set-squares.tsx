'use client'

import type { LocalSetLog } from '@/lib/db/dexie'
import { formatSet } from '@/lib/format'
import { heavierThanLastTime } from '@/lib/records'
import { canSelectSet } from '@/lib/sessions'

/**
 * A row of squares: filled means done, outlined means still to do. You read
 * how far through the exercise you are without parsing any text — the same
 * glance that tells you how many plates are still on the floor.
 *
 * Tapping a square selects that set, so a mistyped set can be fixed after
 * you have moved on to the next one. Sets further ahead than the next one to
 * do cannot be tapped: they are logged in order.
 *
 * A set logged heavier than the best set last time keeps a red edge for the
 * rest of the workout. The line under the steppers only says so until you log;
 * the square is what still says it four exercises later.
 */
export function SetSquares({
  logs,
  activeId,
  previousTopKg = null,
  onSelect,
}: {
  logs: LocalSetLog[]
  activeId?: string
  /** The heaviest weight from last time, or null with nothing to beat. */
  previousTopKg?: number | null
  onSelect: (id: string) => void
}) {
  if (logs.length === 0) return null

  return (
    <ol className="mt-4 flex flex-wrap gap-2">
      {logs.map((log) => {
        const done = log.completedAt !== null
        const active = log.id === activeId
        const beat = done && heavierThanLastTime(log.weightKg, previousTopKg)

        return (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => onSelect(log.id)}
              disabled={!canSelectSet(logs, log)}
              aria-pressed={active}
              aria-label={
                done
                  ? `Set ${log.setIndex}, ${log.durationSec != null ? formatSet(log) : `${log.weightKg ?? '—'} kg × ${log.reps ?? '—'}`}${beat ? ', heavier than last time' : ''}`
                  : `Set ${log.setIndex}`
              }
              className={`flex h-12 min-w-12 flex-col items-center justify-center rounded-sm px-2 ${
                done
                  ? `bg-plate-blue text-white ${beat ? 'outline-2 -outline-offset-2 outline-plate-red' : ''} ${active ? 'ring-2 ring-ink ring-offset-2 ring-offset-ground' : ''}`
                  : active
                    ? 'border-2 border-plate-blue-lift text-ink'
                    : 'border border-line text-ink-dim disabled:opacity-50'
              }`}
            >
              {done && log.durationSec != null ? (
                <>
                  <span className="figure text-base leading-none">{Number((log.durationSec / 60).toFixed(1))}</span>
                  <span className="mt-0.5 text-[11px] leading-none opacity-80">min</span>
                </>
              ) : done ? (
                <>
                  <span className="figure text-base leading-none">{log.weightKg ?? '—'}</span>
                  <span className="mt-0.5 text-[11px] leading-none opacity-80">×{log.reps ?? '—'}</span>
                </>
              ) : (
                <span className="figure text-base leading-none">{log.setIndex}</span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
