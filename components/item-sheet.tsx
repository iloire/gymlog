'use client'

import { Info, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import { ExerciseFrames } from '@/components/exercise-frames'
import { CARDIO_ITEM } from '@/lib/cardio'
import type { LocalTemplateItem } from '@/lib/db/dexie'

export type EditableItem = LocalTemplateItem & {
  exerciseName: string
  exerciseImages: string[] | null
  cardio: boolean
}

/**
 * One exercise's prescription — sets, reps or minutes, rest, and the top of a
 * rep range — in a sheet at the bottom edge, opened from its row. The rows
 * themselves show one line, so a whole workout fits on a screen; the fields
 * are here when one line needs changing. Every change writes straight
 * through, as the inline fields did.
 */
export function ItemSheet({
  item,
  onChange,
  onView,
  onRemove,
  onClose,
}: {
  item: EditableItem
  onChange: (changes: Partial<LocalTemplateItem>) => void
  /** Open the exercise's photos and instructions. */
  onView: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = useTranslations('plan.itemSheet')

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-md border border-line bg-ground p-0 text-ink backdrop:bg-black/70"
    >
      <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onView} aria-label={t('about', { name: item.exerciseName })} className="relative shrink-0">
            <ExerciseFrames
              exercise={{ id: item.exerciseId, name: item.exerciseName, images: item.exerciseImages }}
              className="aspect-[3/2] w-20"
              animate={false}
            />
            <span className="absolute right-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-ground/70 text-ink">
              <Info size={12} aria-hidden />
            </span>
          </button>
          <h2 id={titleId} className="figure min-w-0 flex-1 text-xl leading-tight">
            {item.exerciseName}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="-mr-2 shrink-0 p-2 text-ink-dim">
            <X size={22} aria-hidden />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <NumberField label={t('sets')} value={item.sets} min={1} onChange={(sets) => onChange({ sets })} />
          {item.cardio ? (
            <NumberField
              label={t('time')}
              unit="min"
              value={Math.round((item.targetDurationSec ?? CARDIO_ITEM.targetDurationSec) / 60)}
              min={1}
              onChange={(minutes) => onChange({ targetDurationSec: minutes * 60 })}
            />
          ) : (
            <NumberField label={t('reps')} value={item.targetReps} min={1} onChange={(targetReps) => onChange({ targetReps })} />
          )}
          <NumberField
            label={t('rest')}
            unit="s"
            value={item.restSec}
            min={0}
            step={15}
            onChange={(restSec) => onChange({ restSec })}
          />
        </div>

        {!item.cardio && (
          <label className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm">
              {t('repRange')}
              <span className="block text-xs text-ink-dim">{t('repRangeHint')}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm text-ink-dim">
              {item.targetReps}–
              <input
                type="number"
                inputMode="numeric"
                min={item.targetReps + 1}
                value={item.targetRepsMax ?? ''}
                placeholder="—"
                aria-label={t('topOfRange')}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  onChange({ targetRepsMax: event.target.value === '' || next <= item.targetReps ? null : next })
                }}
                className="figure h-12 w-16 rounded-md border border-line bg-surface px-2 text-center text-xl outline-none focus-visible:border-plate-blue-lift"
              />
            </span>
          </label>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-sm text-ink-dim"
        >
          <Trash2 size={16} aria-hidden />
          {t('remove')}
        </button>
      </div>
    </dialog>
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
        className="figure h-12 w-full rounded-md border border-line bg-surface px-2 text-center text-xl outline-none focus-visible:border-plate-blue-lift"
      />
    </label>
  )
}
