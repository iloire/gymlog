'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { ExerciseFrames } from '@/components/exercise-frames'
import { FavoriteButton } from '@/components/favorite-button'
import { getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { formatSet } from '@/lib/format'
import { exerciseNoteId } from '@/lib/id'

/**
 * Everything about one exercise: photos, favourite star, your cues, your
 * history and how to do it. Rendered by the exercise page and, as a dialog, by
 * the workout editor — so looking up a movement never navigates you out of the
 * workout you are building.
 */
export function ExerciseDetail({
  userId,
  exerciseId,
  titleId,
}: {
  userId: string
  exerciseId: string
  titleId?: string
}) {
  const data = useLiveQuery(async () => {
    const db = getDb(userId)
    const exercise = await db.exercises.get(exerciseId)
    if (!exercise) return null

    const note = await db.exerciseNotes.get(exerciseNoteId(userId, exerciseId))

    // Every set of this movement, newest session first.
    const logs = (await db.setLogs.where('[exerciseId+performedAt]')
      .between([exerciseId, -Infinity], [exerciseId, Infinity])
      .reverse()
      .toArray())
      .filter((log) => log.deletedAt === null && log.completedAt !== null)

    const bySession = new Map<string, typeof logs>()
    for (const log of logs) {
      bySession.set(log.sessionId, [...(bySession.get(log.sessionId) ?? []), log])
    }

    const history = [...bySession.values()]
      .map((sets) => sets.sort((a, b) => a.setIndex - b.setIndex))
      .slice(0, 12)

    return { exercise, note: note ?? null, history }
  }, [userId, exerciseId])

  if (!data) {
    return <p className="py-6 text-ink-dim">Loading…</p>
  }

  const { exercise, note, history } = data

  return (
    <>
      <ExerciseFrames exercise={exercise} className="aspect-[4/3] w-full" />

      <div className="mt-5 flex items-start justify-between gap-3">
        <h1 id={titleId} className="figure text-3xl leading-tight">
          {exercise.name}
        </h1>
        <FavoriteButton
          userId={userId}
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          favorite={note?.favoritedAt != null}
          className="-mr-2 shrink-0 p-2 text-ink-dim"
        />
      </div>
      <p className="mt-1.5 text-sm capitalize text-ink-dim">
        {[exercise.equipment, exercise.level, ...(exercise.primaryMuscles ?? [])]
          .filter(Boolean)
          .join(', ')}
      </p>

      <section className="mt-7">
        <h2 className="mb-2 text-sm text-ink-dim">Your cues</h2>
        <textarea
          defaultValue={note?.notes ?? ''}
          rows={3}
          placeholder="Knees out, brace before you unrack."
          onBlur={(event) =>
            void writeRow(userId, 'exerciseNotes', {
              id: exerciseNoteId(userId, exerciseId),
              exerciseId,
              notes: event.target.value,
            })
          }
          className="w-full rounded-md border border-line bg-surface p-3 text-[15px] outline-none focus-visible:border-plate-blue-lift"
        />
      </section>

      {history.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-sm text-ink-dim">Your history</h2>
          <ul className="divide-y divide-line border-y border-line">
            {history.map((sets) => (
              <li key={sets[0]?.id} className="flex items-baseline justify-between gap-4 py-3">
                <span className="text-sm text-ink-dim">
                  {new Date(sets[0]?.performedAt ?? 0).toLocaleDateString()}
                </span>
                <span className="figure text-right text-[15px]">
                  {sets.map(formatSet).join('  ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(exercise.instructions?.length ?? 0) > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-sm text-ink-dim">How to do it</h2>
          <ol className="space-y-3">
            {exercise.instructions?.map((step, index) => (
              <li key={index} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="figure shrink-0 text-ink-dim">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
