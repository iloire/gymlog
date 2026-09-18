'use client'

import type { LocalExercise } from '@/lib/db/dexie'

/**
 * The exercise library ships two photos per movement — the start and the end
 * position. Cross-fading between them reads as the movement being performed,
 * which is all a GIF would have bought us, without the licensing question.
 *
 * Under `prefers-reduced-motion` the fade stops and you get the start position
 * as a still, which is still a useful picture.
 *
 * `animate="md"` is for a list row: the start frame as a still on a phone,
 * where a column of fading thumbnails would pull the eye from the names, and
 * the cross-fade from the medium breakpoint, where the row has the width for
 * the movement to be read without a tap. `className` sets the size and aspect.
 */
export function ExerciseFrames({
  exercise,
  className = '',
  animate = true,
}: {
  exercise: Pick<LocalExercise, 'name' | 'images'>
  className?: string
  animate?: boolean | 'md'
}) {
  const [start, end] = exercise.images ?? []

  if (!start) {
    return <div className={`rounded-sm bg-surface ${className}`} aria-hidden />
  }

  return (
    <div className={`relative overflow-hidden rounded-sm bg-surface ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local static files, already sized */}
      <img
        src={`/${start}`}
        alt={exercise.name}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-[50%_35%]"
      />
      {end && animate && (
        // eslint-disable-next-line @next/next/no-img-element -- as above
        <img
          src={`/${end}`}
          alt=""
          aria-hidden
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover object-[50%_35%] motion-safe:animate-[exercise-fade_1.6s_ease-in-out_infinite] ${
            animate === 'md' ? 'hidden md:block' : ''
          }`}
        />
      )}
    </div>
  )
}
