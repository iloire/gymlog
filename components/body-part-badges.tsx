'use client'

import { useTranslations } from 'next-intl'

import { useLibraryLabel } from '@/components/exercise-filters'

/** Small pills naming the body parts a workout covers — Legs, Chest, Back… `parts` are ids, named here. */
export function BodyPartBadges({ parts, className = '' }: { parts: string[]; className?: string }) {
  const t = useTranslations('exercises.badges')
  const label = useLibraryLabel()
  if (parts.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label={t('label')}>
      {parts.map((part) => (
        <li key={part} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-dim">
          {label('bodyPart', part)}
        </li>
      ))}
    </ul>
  )
}
