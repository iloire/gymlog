'use client'

import { Star } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { setFavorite } from '@/lib/favorites'

export function FavoriteButton({
  userId,
  exerciseId,
  exerciseName,
  favorite,
  className = '',
}: {
  userId: string
  exerciseId: string
  exerciseName: string
  favorite: boolean
  className?: string
}) {
  const t = useTranslations('exercises.favorite')
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={t(favorite ? 'remove' : 'add', { name: exerciseName })}
      onClick={() => void setFavorite(userId, exerciseId, !favorite)}
      className={className}
    >
      <Star
        size={20}
        aria-hidden
        className={favorite ? 'fill-plate-yellow text-plate-yellow' : 'text-current'}
      />
    </button>
  )
}
