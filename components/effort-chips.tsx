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
 * reps logged on the set are never touched. They are drawn as full outlined
 * buttons in a row of three, not pills, so they read as something to tap.
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
    <div className={className}>
      <p className="text-sm text-ink-dim">{t('felt', { n: log.setIndex })}</p>
      <ul className="mt-2 grid grid-cols-3 gap-2" aria-label={t('how', { n: log.setIndex })}>
        {EFFORTS.map((value) => {
          const active = current === value
          return (
            <li key={value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => void writeRow(userId, 'setLogs', { id: log.id, effort: active ? null : value })}
                className={`flex h-11 w-full touch-manipulation items-center justify-center rounded-md border text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plate-blue-lift ${
                  active
                    ? 'border-ink bg-ink text-ground'
                    : 'border-line bg-surface text-ink hover:bg-surface-high active:bg-surface-high'
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
