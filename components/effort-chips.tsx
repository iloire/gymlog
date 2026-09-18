'use client'

import type { LocalSetLog } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'

export const EFFORTS = [
  { value: 'easy', label: 'Easy' },
  { value: 'hard', label: 'Hard' },
  { value: 'failed', label: 'Failed' },
] as const

export type Effort = (typeof EFFORTS)[number]['value']

/**
 * How a set felt, one tap: easy, hard or failed. That is all the progression
 * needs — a failed set is a miss even when the reps were there — and it is far
 * likelier to get entered between sets than a number from one to ten. Tapping
 * the chosen chip again clears it. Only `effort` is written, so the weight and
 * reps logged on the set are never touched.
 */
export function EffortChips({ userId, log, className = '' }: { userId: string; log: LocalSetLog; className?: string }) {
  const current = log.effort ?? null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm text-ink-dim">Set {log.setIndex} felt</span>
      <ul className="flex gap-2" aria-label={`How set ${log.setIndex} felt`}>
        {EFFORTS.map(({ value, label }) => {
          const active = current === value
          return (
            <li key={value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => void writeRow(userId, 'setLogs', { id: log.id, effort: active ? null : value })}
                className={`h-9 rounded-full px-3 text-sm ${
                  active ? 'bg-ink text-ground' : 'border border-line text-ink-dim'
                }`}
              >
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
