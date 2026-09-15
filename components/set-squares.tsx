'use client'

import type { LocalSetLog } from '@/lib/db/dexie'

/**
 * A row of squares: filled means done, outlined means still to do. You read
 * how far through the exercise you are without parsing any text — the same
 * glance that tells you how many plates are still on the floor.
 *
 * Tapping a square selects that set, so a mistyped set can be fixed after
 * you have moved on to the next one.
 */
export function SetSquares({
  logs,
  activeId,
  onSelect,
}: {
  logs: LocalSetLog[]
  activeId?: string
  onSelect: (id: string) => void
}) {
  if (logs.length === 0) return null

  return (
    <ol className="mt-6 flex flex-wrap gap-2">
      {logs.map((log) => {
        const done = log.completedAt !== null
        const active = log.id === activeId

        return (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => onSelect(log.id)}
              aria-pressed={active}
              aria-label={
                done
                  ? `Set ${log.setIndex}, ${log.weightKg ?? '—'} kg × ${log.reps ?? '—'}`
                  : `Set ${log.setIndex}`
              }
              className={`flex h-14 min-w-14 flex-col items-center justify-center rounded-sm px-2 ${
                done
                  ? `bg-plate-blue text-white ${active ? 'ring-2 ring-ink ring-offset-2 ring-offset-ground' : ''}`
                  : active
                    ? 'border-2 border-plate-blue-lift text-ink'
                    : 'border border-line text-ink-dim'
              }`}
            >
              {done ? (
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
