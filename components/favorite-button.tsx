'use client'

import { Star } from 'lucide-react'

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
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? `Unfavourite ${exerciseName}` : `Favourite ${exerciseName}`}
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
