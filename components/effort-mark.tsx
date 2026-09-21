'use client'

import { useTranslations } from 'next-intl'

import type { LocalSetLog } from '@/lib/db/dexie'

/**
 * How a logged set felt, read back after the fact: a small word after the
 * figure. Easy is dim ink, hard is the word in plate yellow, and a failed set
 * turns the figure yellow too (`effortTone`), so a weight that was too much is
 * found by colour before the numbers are read. Red stays for records.
 */
export function EffortMark({ effort }: { effort: LocalSetLog['effort'] }) {
  const t = useTranslations('session.effort')
  if (!effort) return null
  return <span className={`ml-1 text-xs font-normal lowercase ${effort === 'easy' ? 'text-ink-dim' : 'text-plate-yellow'}`}>{t(effort)}</span>
}

/** The class for a set's figure: yellow when the set failed, unchanged otherwise. */
export function effortTone(effort: LocalSetLog['effort']): string {
  return effort === 'failed' ? 'text-plate-yellow' : ''
}
