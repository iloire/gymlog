'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

import { ExerciseFrames } from '@/components/exercise-frames'
import { ExercisePicker } from '@/components/exercise-picker'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb, type LocalTemplateItem } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { newId } from '@/lib/id'
import { activeProgram, templateItems } from '@/lib/queries'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WorkoutEditorPage() {
  const userId = useUserId()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [picking, setPicking] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const template = await db.workoutTemplates.get(id)
    if (!template || template.deletedAt !== null) return null

    const items = await templateItems(userId, id)
    const named = await Promise.all(
      items.map(async (item) => {
        const exercise = await db.exercises.get(item.exerciseId)
        return {
          ...item,
          exerciseName: exercise?.name ?? 'Exercise',
          exerciseImages: exercise?.images ?? null,
        }
      }),
    )
    // Weekdays in the active programme that run this workout, so deleting it
    // says what else goes with it.
    const program = await activeProgram(userId)
    const scheduledOn = program
      ? (await db.programDays.where('programId').equals(program.id).toArray())
          .filter((day) => day.deletedAt === null && day.templateId === id)
          .map((day) => day.dayOfWeek)
          .sort()
      : []

    return { template, items: named, scheduledOn }
  }, [userId, id])

  if (!userId || !data) {
    return <main className="p-6 text-ink-dim">Loading…</main>
  }

  const { template, items, scheduledOn } = data

  async function update(item: LocalTemplateItem, changes: Partial<LocalTemplateItem>) {
    await writeRow(userId!, 'templateItems', { ...item, ...changes })
  }

  async function move(index: number, delta: number) {
    const a = items[index]
    const b = items[index + delta]
    if (!a || !b) return
    await update(a, { position: b.position })
    await update(b, { position: a.position })
  }

  return (
    <>
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={async (exercise) => {
            await writeRow(userId, 'templateItems', {
              id: newId(),
              templateId: id,
              exerciseId: exercise.id,
              position: (items.at(-1)?.position ?? 0) + 1,
              sets: 3,
              targetReps: 10,
              targetRepsMax: null,
              targetWeightKg: null,
              restSec: 90,
              notes: null,
            })
            setPicking(false)
          }}
        />
      )}

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-5 pb-6">
        <Link href="/workouts" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Workouts
        </Link>

        <input
          value={template.name}
          onChange={(event) =>
            void writeRow(userId, 'workoutTemplates', { ...template, name: event.target.value })
          }
          aria-label="Workout name"
          className="figure mt-4 w-full bg-transparent text-3xl outline-none focus-visible:text-plate-blue-lift"
        />

        <ul className="mt-6 space-y-3">
          {items.map((item, index) => (
            <li key={item.id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/exercises/${item.exerciseId}`} className="flex min-w-0 items-center gap-3">
                  <ExerciseFrames
                    exercise={{ name: item.exerciseName, images: item.exerciseImages }}
                    className="aspect-[3/2] w-20 shrink-0"
                    animate={false}
                  />
                  <span className="text-[15px]">{item.exerciseName}</span>
                </Link>
                <div className="flex shrink-0 gap-1 text-ink-dim">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                    className="p-1.5 disabled:opacity-25"
                  >
                    <ChevronUp size={18} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === items.length - 1}
                    onClick={() => void move(index, 1)}
                    className="p-1.5 disabled:opacity-25"
                  >
                    <ChevronDown size={18} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.exerciseName}`}
                    onClick={() => void deleteRow(userId, 'templateItems', item.id)}
                    className="p-1.5"
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <NumberField
                  label="Sets"
                  value={item.sets}
                  min={1}
                  onChange={(sets) => void update(item, { sets })}
                />
                <NumberField
                  label="Reps"
                  value={item.targetReps}
                  min={1}
                  onChange={(targetReps) => void update(item, { targetReps })}
                />
                <NumberField
                  label="Rest"
                  unit="s"
                  value={item.restSec}
                  min={0}
                  step={15}
                  onChange={(restSec) => void update(item, { restSec })}
                />
              </div>
            </li>
          ))}
        </ul>

        {items.length === 0 && (
          <p className="mt-6 border-y border-line py-6 text-[15px] text-ink-dim">
            Add the exercises you want to do, in the order you want to do them.
          </p>
        )}

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-md bg-plate-blue text-base font-semibold text-white"
        >
          <Plus size={18} aria-hidden />
          Add exercise
        </button>

        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-labelledby="delete-workout-title"
            className="mt-3 rounded-md border border-plate-red p-4"
          >
            <p id="delete-workout-title" className="text-[15px]">
              Delete “{template.name}”?
            </p>
            {scheduledOn.length > 0 && (
              <p className="mt-1 text-sm text-ink-dim">
                It is on your programme for {scheduledOn.map((day) => WEEKDAYS[day]).join(', ')}.
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingDelete(false)}
                className="h-12 rounded-md border border-line text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteRow(userId, 'workoutTemplates', id)
                  router.push('/workouts')
                }}
                className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mt-3 h-12 w-full rounded-md border border-line text-sm text-ink-dim"
          >
            Delete workout
          </button>
        )}
      </main>
      <Nav />
    </>
  )
}

function NumberField({
  label,
  value,
  unit,
  min = 0,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  unit?: string
  min?: number
  step?: number
  onChange: (next: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-dim">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next >= min) onChange(next)
        }}
        className="figure h-12 w-full rounded-md border border-line bg-ground px-2 text-center text-xl outline-none focus-visible:border-plate-blue-lift"
      />
    </label>
  )
}
