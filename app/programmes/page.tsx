'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'

import { EquipmentPicker, useEquipment } from '@/components/equipment-picker'
import { ExerciseDialog } from '@/components/exercise-dialog'
import { ExerciseFrames } from '@/components/exercise-frames'
import { Loading, Placeholder } from '@/components/loading'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb, type LocalExercise } from '@/lib/db/dexie'
import { equipmentName, presetFor } from '@/lib/equipment'
import {
  adoptProgramme,
  fitProgramme,
  programmeById,
  PROGRAMMES,
  shiftWeek,
  trainingDays,
  type Fit,
  type Programme,
} from '@/lib/programmes'
import { activeProgram } from '@/lib/queries'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Library = ReadonlyMap<string, LocalExercise>

/**
 * The premade programme catalogue and one programme's preview, as
 * `/programmes?id=…` rather than a path segment so the one cached document
 * serves every programme offline (see docs/architecture.md, "Working offline").
 */
export default function ProgrammesPage() {
  return (
    <Suspense fallback={<ProgrammesLoading />}>
      <Programmes />
    </Suspense>
  )
}

function Programmes() {
  const userId = useUserId()
  const id = useSearchParams().get('id')
  const have = useEquipment()

  const exercises = useLiveQuery(
    async () => (userId ? getDb(userId).exercises.toArray() : undefined),
    [userId],
  )
  const library = useMemo(
    () => new Map((exercises ?? []).filter((e) => e.deletedAt === null).map((e) => [e.id, e])),
    [exercises],
  )

  if (!userId || !exercises) {
    return <ProgrammesLoading detail={id !== null} />
  }

  const programme = id ? programmeById(id) : undefined

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-5 pb-6">
        {programme ? (
          <ProgrammeDetail userId={userId} programme={programme} have={have} library={library} />
        ) : (
          <Catalogue have={have} library={library} />
        )}
      </main>
      <Nav />
    </>
  )
}

/**
 * The catalogue's frame, or a programme's: the way back and the heading are
 * known before the library is, so they are drawn where they will stay.
 */
function ProgrammesLoading({ detail = false }: { detail?: boolean }) {
  return (
    <Loading className="pt-5">
      {detail ? (
        <>
          <Link href="/programmes" className="flex items-center gap-1 text-sm text-ink-dim">
            <ChevronLeft size={18} aria-hidden />
            Programmes
          </Link>
          <Placeholder className="mt-4 h-10 w-56" />
        </>
      ) : (
        <>
          <Link href="/workouts" className="flex items-center gap-1 text-sm text-ink-dim">
            <ChevronLeft size={18} aria-hidden />
            Plan
          </Link>
          <h1 className="figure mt-4 text-4xl">Programmes</h1>
          <Placeholder className="mt-2 h-5 w-64" />
        </>
      )}
    </Loading>
  )
}

function Catalogue({ have, library }: { have: string[] | null; library: Library }) {
  const [editing, setEditing] = useState(false)

  const entries = useMemo(() => {
    const owned = new Set(have ?? [])
    return PROGRAMMES.map((programme) => ({ programme, fit: fitProgramme(programme, owned, library) }))
      // Best match first: doable, then fewest swaps. Stable, so ties keep catalogue order.
      .sort((a, b) => Number(b.fit.doable) - Number(a.fit.doable) || a.fit.swaps - b.fit.swaps)
  }, [have, library])

  const summary = have
    ? (presetFor(have)?.name ?? (have.map(equipmentName).join(', ') || 'No equipment'))
    : null

  return (
    <>
      <Link href="/workouts" className="flex items-center gap-1 text-sm text-ink-dim">
        <ChevronLeft size={18} aria-hidden />
        Plan
      </Link>
      <h1 className="figure mt-4 text-4xl">Programmes</h1>
      <p className="mt-2 text-sm text-ink-dim">
        Ready-made weeks of training. Picking one copies it into your workouts, where you can change
        anything.
      </p>

      {have === null || editing ? (
        <section className="mt-7">
          <h2 className="mb-4 text-xl font-semibold">What can you train with?</h2>
          <EquipmentPicker />
          {have !== null && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="mt-5 h-12 w-full rounded-md border border-line text-sm"
            >
              Done
            </button>
          )}
        </section>
      ) : (
        <div className="mt-6 flex items-baseline justify-between gap-3">
          <p className="text-sm">
            <span className="text-ink-dim">Your equipment: </span>
            {summary}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-sm underline underline-offset-4"
          >
            Change
          </button>
        </div>
      )}

      {have !== null && !editing && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {entries.map(({ programme, fit }) => (
            <li key={programme.id}>
              <Link href={`/programmes?id=${programme.id}`} className="block py-4">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[17px] font-semibold">{programme.name}</span>
                  <span className="shrink-0 text-sm text-ink-dim capitalize">{programme.level}</span>
                </span>
                <span className="mt-1 block text-sm text-ink-dim">{programme.summary}</span>
                <FitLine fit={fit} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function FitLine({ fit }: { fit: Fit }) {
  if (!fit.doable) {
    return (
      <span className="mt-2 block text-sm text-ink-dim">
        Needs {fit.missing.map(equipmentName).join(', ')}
      </span>
    )
  }
  return (
    <span className="mt-2 flex items-center gap-1.5 text-sm">
      <Check size={16} aria-hidden className="text-plate-blue-lift" />
      {fit.swaps === 0
        ? 'Fits your equipment'
        : `Fits your equipment, with ${fit.swaps} ${fit.swaps === 1 ? 'swap' : 'swaps'}`}
    </span>
  )
}

function ProgrammeDetail({
  userId,
  programme,
  have,
  library,
}: {
  userId: string
  programme: Programme
  have: string[] | null
  library: Library
}) {
  const router = useRouter()
  const [shift, setShift] = useState(0)
  const [viewingExerciseId, setViewingExerciseId] = useState<string | null>(null)
  const [adopting, setAdopting] = useState(false)

  const current = useLiveQuery(() => activeProgram(userId), [userId])
  const fit = useMemo(() => fitProgramme(programme, new Set(have ?? []), library), [programme, have, library])

  const names = Object.fromEntries(fit.workouts.map((workout) => [workout.key, workout.name]))
  const week = shiftWeek(programme.week, shift)

  // Every distinct set of training days the week can be moved to.
  const dayOptions = [...new Map(
    WEEKDAYS.map((_, by) => {
      const label = shiftWeek(programme.week, by)
        .flatMap((key, day) => (key === null ? [] : [WEEKDAYS[day]!.slice(0, 3)]))
        .join(' · ')
      return [label, by] as const
    }),
  )]

  async function adopt(schedule: boolean) {
    if (adopting) return
    setAdopting(true)
    await adoptProgramme(userId, programme, fit, { schedule, shift })
    router.push('/workouts')
  }

  return (
    <>
      {viewingExerciseId && (
        <ExerciseDialog
          userId={userId}
          exerciseId={viewingExerciseId}
          onClose={() => setViewingExerciseId(null)}
        />
      )}

      <Link href="/programmes" className="flex items-center gap-1 text-sm text-ink-dim">
        <ChevronLeft size={18} aria-hidden />
        Programmes
      </Link>

      <h1 className="figure mt-4 text-4xl leading-[1.05]">{programme.name}</h1>
      <p className="mt-2 text-sm text-ink-dim">
        <span className="capitalize">{programme.level}</span> · {trainingDays(programme.week)} days a
        week
      </p>
      <p className="mt-3 text-[15px]">{programme.summary}</p>

      {have === null && (
        <section className="mt-7 border-y border-line py-5">
          <h2 className="mb-4 text-xl font-semibold">What can you train with?</h2>
          <EquipmentPicker />
        </section>
      )}

      <section className="mt-8">
        <label className="block">
          <span className="mb-2 block text-sm text-ink-dim">Train on</span>
          <select
            value={shift}
            onChange={(event) => setShift(Number(event.target.value))}
            className="h-12 w-full rounded-md border border-line bg-surface px-3 text-[15px] outline-none focus-visible:border-plate-blue-lift"
          >
            {dayOptions.map(([label, by]) => (
              <option key={by} value={by}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <ul className="mt-3 divide-y divide-line border-y border-line">
          {week.flatMap((key, day) =>
            key === null
              ? []
              : [
                  <li key={day} className="flex items-baseline gap-3 py-2.5 text-[15px]">
                    <span className="w-28 shrink-0 text-ink-dim">{WEEKDAYS[day]}</span>
                    {names[key]}
                  </li>,
                ],
          )}
        </ul>
      </section>

      {fit.workouts.map((workout) => (
        <section key={workout.key} className="mt-8">
          <h2 className="text-xl font-semibold">{workout.name}</h2>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {workout.choices.map((choice, index) => {
              const exercise = library.get(choice.exerciseId)
              const name = exercise?.name ?? choice.exerciseId

              return (
                <li key={`${choice.exerciseId}-${index}`}>
                  <button
                    type="button"
                    disabled={!exercise}
                    onClick={() => setViewingExerciseId(choice.exerciseId)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <ExerciseFrames
                      exercise={{ name, images: exercise?.images ?? null }}
                      className="aspect-[3/2] w-16 shrink-0"
                      animate={false}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">{name}</span>
                      {!choice.doable ? (
                        <span className="block text-xs text-ink-dim">
                          Needs {choice.missing.map(equipmentName).join(', ')}
                        </span>
                      ) : (
                        choice.swapped && (
                          <span className="block text-xs text-ink-dim">
                            Instead of {library.get(choice.slot.exercise)?.name ?? choice.slot.exercise}
                          </span>
                        )
                      )}
                    </span>
                    <span className="figure shrink-0 text-base">
                      {choice.slot.sets} × {choice.slot.reps}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      <section className="mt-8">
        {!fit.doable && (
          <p className="mb-4 text-sm text-ink-dim">
            Some exercises need equipment you have not ticked. They are copied as written, so you can
            swap them in the workout editor.
          </p>
        )}
        <button
          type="button"
          onClick={() => void adopt(true)}
          disabled={adopting}
          className="h-14 w-full rounded-md bg-plate-blue text-base font-semibold text-white transition-colors hover:bg-plate-blue-lift disabled:opacity-60"
        >
          Start this programme
        </button>
        {current && (
          <p className="mt-2 text-center text-xs text-ink-dim">
            Ends “{current.name}”. Everything you have logged stays as it is.
          </p>
        )}
        <button
          type="button"
          onClick={() => void adopt(false)}
          disabled={adopting}
          className="mt-3 h-12 w-full rounded-md border border-line text-sm disabled:opacity-60"
        >
          Just add the workouts
        </button>
      </section>
    </>
  )
}
