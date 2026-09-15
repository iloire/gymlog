'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ExerciseFrames } from '@/components/exercise-frames'
import { FavoriteButton } from '@/components/favorite-button'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { writeRow } from '@/lib/db/write'
import { exerciseNoteId } from '@/lib/id'

export default function ExerciseDetailPage() {
  const userId = useUserId()
  const { id } = useParams<{ id: string }>()

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const exercise = await db.exercises.get(id)
    if (!exercise) return null

    const note = await db.exerciseNotes.get(exerciseNoteId(userId, id))

    // Every set of this movement, newest session first.
    const logs = (await db.setLogs.where('[exerciseId+performedAt]')
      .between([id, -Infinity], [id, Infinity])
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
  }, [userId, id])

  if (!userId || !data) {
    return <main className="p-6 text-ink-dim">Loading…</main>
  }

  const { exercise, note, history } = data

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-5 pb-6">
        <Link href="/exercises" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Exercises
        </Link>

        <ExerciseFrames exercise={exercise} className="mt-4 aspect-[4/3] w-full" />

        <div className="mt-5 flex items-start justify-between gap-3">
          <h1 className="figure text-3xl leading-tight">{exercise.name}</h1>
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
                id: exerciseNoteId(userId, id),
                exerciseId: id,
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
                    {sets.map((set) => `${set.weightKg ?? '—'}×${set.reps ?? '—'}`).join('  ')}
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
      </main>
      <Nav />
    </>
  )
}
