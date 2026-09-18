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
 * Above it, when there is a last time, a dimmed row of the sets you did then,
 * aligned by set number: "set 3 was 8 reps last time" is read down a column,
 * not out of a sentence. The red edge on a square below then explains
 * itself — it beat the square above.
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
  previous = null,
  previousLabel = 'Last time',
  justLoggedId = null,
  onSelect,
}: {
  logs: LocalSetLog[]
  activeId?: string
  /** The heaviest weight from last time, or null with nothing to beat. */
  previousTopKg?: number | null
  /** Last time's sets in set order, for the ghost row; null or empty for none. */
  previous?: LocalSetLog[] | null
  /** What to call the ghost row — 'Last time', 'Last time · 3 days ago'. */
  previousLabel?: string
  /** The set just logged: its square plays the fill animation once. */
  justLoggedId?: string | null
  onSelect: (id: string) => void
}) {
  if (logs.length === 0) return null

  const ghosts = previous ?? []
  const columns = Math.max(logs.length, ghosts.length)
  // One grid for both rows, so set 3 sits under set 3 whatever each row holds.
  const grid = { gridTemplateColumns: `repeat(${columns}, minmax(3rem, max-content))` }

  // Six sets of "77.5" outgrow a 320px phone: the rows scroll together rather than wrap apart.
  return (
    <div className="-mx-5 mt-4 overflow-x-auto px-5 [scrollbar-width:none]">
      {ghosts.length > 0 && (
        <>
          <p className="mb-1.5 text-xs text-ink-dim">{previousLabel}</p>
          <ol className="grid gap-2" style={grid} aria-label={previousLabel}>
            {ghosts.map((set) => (
              <li
                key={set.id}
                className="flex h-11 min-w-12 flex-col items-center justify-center rounded-sm border border-dashed border-line px-2 text-ink-dim"
                aria-label={`Set ${set.setIndex}, ${formatSet(set)}`}
              >
                <Figure set={set} />
              </li>
            ))}
          </ol>
        </>
      )}

      <ol className={`grid gap-2 ${ghosts.length > 0 ? 'mt-2' : ''}`} style={grid}>
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
                className={`flex h-12 w-full min-w-12 flex-col items-center justify-center rounded-sm px-2 ${
                  done
                    ? `bg-plate-blue text-white ${beat ? 'outline-2 -outline-offset-2 outline-plate-red' : ''} ${active ? 'ring-2 ring-ink ring-offset-2 ring-offset-ground' : ''} ${log.id === justLoggedId ? 'motion-safe:animate-[set-logged_400ms_ease-out]' : ''}`
                    : active
                      ? 'border-2 border-plate-blue-lift text-ink'
                      : 'border border-line text-ink-dim disabled:opacity-50'
                }`}
              >
                {done ? <Figure set={log} /> : <span className="figure text-base leading-none">{log.setIndex}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The two-line figure inside a square: the weight over ×reps, or minutes for a timed set. */
function Figure({ set }: { set: LocalSetLog }) {
  if (set.durationSec != null) {
    return (
      <>
        <span className="figure text-base leading-none">{Number((set.durationSec / 60).toFixed(1))}</span>
        <span className="mt-0.5 text-[11px] leading-none opacity-80">min</span>
      </>
    )
  }
  return (
    <>
      <span className="figure text-base leading-none">{set.weightKg ?? '—'}</span>
      <span className="mt-0.5 text-[11px] leading-none opacity-80">×{set.reps ?? '—'}</span>
    </>
  )
}
