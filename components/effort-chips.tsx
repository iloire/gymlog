'use client'

import { useTranslations } from 'next-intl'

import type { LocalSetLog } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'

export const EFFORTS = ['easy', 'hard', 'failed'] as const

export type Effort = (typeof EFFORTS)[number]

/**
 * How a set felt, one tap: easy, hard or failed. That is all the progression
 * needs — a failed set is a miss even when the reps were there — and it is far
 * likelier to get entered between sets than a number from one to ten. Tapping
 * the chosen chip again clears it. Only `effort` is written, so the weight and
 * reps logged on the set are never touched.
 */
export function EffortChips({
  userId,
  log,
  className = '',
}: {
  userId: string
  log: LocalSetLog
  className?: string
}) {
  const t = useTranslations('session.effort')
  const current = log.effort ?? null

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm text-ink-dim">
        {t('felt', { n: log.setIndex })}
      </span>
      <ul className="flex gap-2" aria-label={t('how', { n: log.setIndex })}>
        {EFFORTS.map((value) => {
          const active = current === value
          return (
            <li key={value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => void writeRow(userId, 'setLogs', { id: log.id, effort: active ? null : value })}
                className={`h-9 rounded-full px-3.5 text-sm transition-colors ${
                  active ? 'bg-ink text-ground' : 'bg-surface text-ink-dim hover:text-ink'
                }`}
              >
                {t(value)}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
