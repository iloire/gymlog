'use client'

import { useLocale } from '@/components/locale-provider'
import type { LocalExercise } from '@/lib/db/dexie'
import { exerciseName } from '@/lib/exercise-i18n'

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
  exercise: Pick<LocalExercise, 'id' | 'name' | 'images'>
  className?: string
  animate?: boolean | 'md'
}) {
  const locale = useLocale()
  const [start, end] = exercise.images ?? []

  // An exercise of your own has no photos. Its box holds the initial of its
  // name, so it is still a picture to recognise it by in a list.
  if (!start) {
    return (
      <div className={`figure flex items-center justify-center rounded-sm bg-surface text-2xl text-ink-dim ${className}`} aria-hidden>
        {exerciseName(exercise, locale).trim().charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-sm bg-surface ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local static files, already sized */}
      <img
        src={`/${start}`}
        alt={exerciseName(exercise, locale)}
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

/**
 * The thumbnail a list row starts with. Every list of exercises in the app —
 * the picker, the workout editor, a programme's rows, the sets logged on Today
 * and in History, the summary's records — puts it first, at this one size, so
 * an exercise is recognised by its picture in the same place on every screen
 * before its name is read. 3:2 is the library photos' own shape. A sheet passes
 * `animate={false}` and keeps the still.
 */
export function ExerciseThumb({
  exercise,
  animate = 'md',
}: {
  exercise: Pick<LocalExercise, 'id' | 'name' | 'images'>
  animate?: boolean | 'md'
}) {
  return <ExerciseFrames exercise={exercise} className="aspect-[3/2] w-16 shrink-0 md:w-32" animate={animate} />
}
