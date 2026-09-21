'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Copy, GripVertical, Plus } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'

import { ExerciseDialog } from '@/components/exercise-dialog'
import { ExerciseFrames } from '@/components/exercise-frames'
import { ExercisePicker } from '@/components/exercise-picker'
import { ItemSheet, type EditableItem } from '@/components/item-sheet'
import { Loading, Placeholder } from '@/components/loading'
import { useLocale } from '@/components/locale-provider'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { exerciseName } from '@/lib/exercise-i18n'
import { UndoToast } from '@/components/undo-toast'
import { useReorder } from '@/components/use-reorder'
import { CARDIO_ITEM, isCardio } from '@/lib/cardio'
import { getDb, type LocalTemplateItem } from '@/lib/db/dexie'
import { deleteRow, writeRow } from '@/lib/db/write'
import { newId } from '@/lib/id'
import { estimateWorkoutMs, formatTarget, planSummary } from '@/lib/plan'
import { activeProgram, templateItems } from '@/lib/queries'
import { weekdayName } from '@/lib/week'
import { duplicateWorkout, reorderItems, restoreTemplateItem } from '@/lib/workouts'

/** How far a row is swiped left before it is removed. */
const SWIPE_REMOVE_PX = 88

export default function WorkoutEditorPage() {
  const userId = useUserId()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const t = useTranslations('plan')
  const locale = useLocale()
  const fallbackName = t('defaults.exercise')
  const [picking, setPicking] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingExerciseId, setViewingExerciseId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // The exercise last removed, while its Undo is still on offer.
  const [removed, setRemoved] = useState<{ id: string; name: string } | null>(null)
  const dismissRemoved = useCallback(() => setRemoved(null), [])

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const template = await db.workoutTemplates.get(id)
    if (!template || template.deletedAt !== null) return null

    const items = await templateItems(userId, id)
    const named: EditableItem[] = await Promise.all(
      items.map(async (item) => {
        const exercise = await db.exercises.get(item.exerciseId)
        return {
          ...item,
          exerciseName: exercise ? exerciseName(exercise, locale) : fallbackName,
          exerciseImages: exercise?.images ?? null,
          cardio: isCardio(exercise) || item.targetDurationSec != null,
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
  }, [userId, id, fallbackName])

  const items = data?.items ?? []

  const reorder = useReorder(items.length, (from, to) => {
    if (!userId) return
    const order = items.map((item) => item.id)
    const [moved] = order.splice(from, 1)
    if (moved) order.splice(to, 0, moved)
    void reorderItems(userId, id, order)
  })

  if (!userId || !data) {
    return (
      <Loading className="pt-5">
        <Link href="/workouts" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>
        <Placeholder className="mt-4 h-9 w-56" />
      </Loading>
    )
  }

  const { template, scheduledOn } = data
  const editing = items.find((item) => item.id === editingId) ?? null

  async function update(item: LocalTemplateItem, changes: Partial<LocalTemplateItem>) {
    await writeRow(userId!, 'templateItems', { ...item, ...changes })
  }

  async function remove(item: EditableItem) {
    await deleteRow(userId!, 'templateItems', item.id)
    setRemoved({ id: item.id, name: item.exerciseName })
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
              targetRepsMax: null,
              targetWeightKg: null,
              notes: null,
              ...(isCardio(exercise)
                ? CARDIO_ITEM
                : { sets: 3, targetReps: 10, targetDurationSec: null, restSec: 90 }),
            })
            setPicking(false)
          }}
        />
      )}

      {editing && !viewingExerciseId && (
        <ItemSheet
          item={editing}
          onChange={(changes) => void update(editing, changes)}
          onView={() => setViewingExerciseId(editing.exerciseId)}
          onRemove={() => {
            setEditingId(null)
            void remove(editing)
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {viewingExerciseId && (
        <ExerciseDialog
          userId={userId}
          exerciseId={viewingExerciseId}
          onClose={() => setViewingExerciseId(null)}
        />
      )}

      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-5 pb-6">
        <Link href="/workouts" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          {t('back')}
        </Link>

        <input
          value={template.name}
          onChange={(event) =>
            void writeRow(userId, 'workoutTemplates', { ...template, name: event.target.value })
          }
          aria-label={t('editor.nameLabel')}
          className="figure mt-4 w-full bg-transparent text-3xl outline-none focus-visible:text-plate-blue-lift"
        />
        <p className="mt-1 text-sm text-ink-dim">{planSummary(items.length, estimateWorkoutMs(items), locale)}</p>

        {/* One line per exercise, so a whole workout fits on a screen: the
            handle drags it into place, a swipe left takes it out, and a tap
            opens the sheet with its sets, reps and rest. */}
        <ol className="mt-6 divide-y divide-line border-y border-line">
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={reorder.rowRef(index)}
              style={reorder.rowStyle(index)}
              className={`flex items-stretch bg-ground ${reorder.dragging === index ? 'shadow-lg' : ''}`}
            >
              <button
                type="button"
                aria-label={t('editor.move', { name: item.exerciseName })}
                {...reorder.handleProps(index)}
                className="flex w-10 shrink-0 cursor-grab items-center justify-center text-ink-dim active:cursor-grabbing"
              >
                <GripVertical size={18} aria-hidden />
              </button>
              <SwipeRow
                onOpen={() => setEditingId(item.id)}
                onRemove={() => void remove(item)}
                label={t('editor.edit', { name: item.exerciseName })}
              >
                <ExerciseFrames
                  exercise={{ id: item.exerciseId, name: item.exerciseName, images: item.exerciseImages }}
                  className="aspect-[3/2] w-14 shrink-0 md:w-32"
                  animate="md"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{item.exerciseName}</span>
                  <span className="block text-sm text-ink-dim">
                    <span className="figure">{formatTarget(item)}</span>
                    {' · '}
                    {t.rich('editor.rest', { seconds: item.restSec, figure: (chunks) => <span className="figure">{chunks}</span> })}
                  </span>
                </span>
              </SwipeRow>
            </li>
          ))}
        </ol>

        {items.length === 0 && (
          <p className="mt-6 border-y border-line py-6 text-[15px] text-ink-dim">
            {t('editor.empty')}
          </p>
        )}

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-md bg-plate-blue text-base font-semibold text-white"
        >
          <Plus size={18} aria-hidden />
          {t('editor.addExercise')}
        </button>

        <button
          type="button"
          onClick={async () => router.push(`/workouts/${await duplicateWorkout(userId, id)}`)}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-sm"
        >
          <Copy size={16} aria-hidden />
          {t('editor.duplicate')}
        </button>

        {confirmingDelete ? (
          <div
            role="alertdialog"
            aria-labelledby="delete-workout-title"
            className="mt-3 rounded-md border border-plate-red p-4"
          >
            <p id="delete-workout-title" className="text-[15px]">
              {t('editor.deleteTitle', { name: template.name })}
            </p>
            {scheduledOn.length > 0 && (
              <p className="mt-1 text-sm text-ink-dim">
                {t('editor.deleteScheduled', {
                  days: scheduledOn.map((day) => weekdayName(day, locale).slice(0, 3)).join(', '),
                })}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingDelete(false)}
                className="h-12 rounded-md border border-line text-sm"
              >
                {t('editor.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteRow(userId, 'workoutTemplates', id)
                  router.push('/workouts')
                }}
                className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
              >
                {t('editor.delete')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mt-3 h-12 w-full rounded-md border border-line text-sm text-ink-dim"
          >
            {t('editor.deleteWorkout')}
          </button>
        )}
      </main>
      <Nav>
        {removed && (
          <UndoToast
            key={removed.id}
            message={t('editor.removed', { name: removed.name })}
            onUndo={() => {
              void restoreTemplateItem(userId, removed.id)
              setRemoved(null)
            }}
            onDismiss={dismissRemoved}
          />
        )}
      </Nav>
    </>
  )
}

/**
 * A row that opens on a tap and goes on a swipe to the left. It follows the
 * finger so the swipe is visible, snaps back short of the threshold, and a
 * swipe never counts as the tap that follows it.
 */
function SwipeRow({
  label,
  onOpen,
  onRemove,
  children,
}: {
  label: string
  onOpen: () => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false
          return
        }
        onOpen()
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null
        swiped.current = false
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0]
        if (!start.current || !touch) return
        const moveX = touch.clientX - start.current.x
        const moveY = touch.clientY - start.current.y
        // Sideways and leftward only; anything else is a scroll.
        if (moveX < 0 && Math.abs(moveX) > Math.abs(moveY)) {
          setDx(Math.max(moveX, -SWIPE_REMOVE_PX * 1.5))
          swiped.current = true
        }
      }}
      onTouchEnd={() => {
        const gone = dx <= -SWIPE_REMOVE_PX
        setDx(0)
        start.current = null
        if (gone) onRemove()
      }}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform 150ms ease-out' }}
      className={`flex min-w-0 flex-1 items-center gap-3 py-3 pr-1 text-left ${
        dx <= -SWIPE_REMOVE_PX ? 'text-ink-dim' : ''
      }`}
    >
      {children}
    </button>
  )
}
