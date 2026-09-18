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
 * `pair` is the still version for a list row: the start frame on a phone, and
 * from the medium breakpoint both frames side by side, where the row has the
 * width for the movement to be read without a tap. `className` then sets the
 * pair's width, not its aspect.
 */
export function ExerciseFrames({
  exercise,
  className = '',
  animate = true,
  pair = false,
}: {
  exercise: Pick<LocalExercise, 'name' | 'images'>
  className?: string
  animate?: boolean
  pair?: boolean
}) {
  const [start, end] = exercise.images ?? []

  if (pair) {
    return (
      <span className={`flex gap-1 ${className}`}>
        <Frame src={start} alt={exercise.name} className="min-w-0 flex-1" />
        <Frame src={start && end} alt="" className="hidden min-w-0 flex-1 md:block" />
      </span>
    )
  }

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
          className="absolute inset-0 h-full w-full object-cover object-[50%_35%] motion-safe:animate-[exercise-fade_1.6s_ease-in-out_infinite]"
        />
      )}
    </div>
  )
}

/** One still frame at the library's 3:2, or a blank of the same shape. */
function Frame({
  src,
  alt,
  className,
}: {
  src: string | undefined
  alt: string
  className: string
}) {
  if (!src) {
    return <span className={`aspect-[3/2] rounded-sm bg-surface ${className}`} aria-hidden />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local static files, already sized
    <img
      src={`/${src}`}
      alt={alt}
      aria-hidden={alt === '' || undefined}
      loading="lazy"
      className={`aspect-[3/2] rounded-sm bg-surface object-cover object-[50%_35%] ${className}`}
    />
  )
}
