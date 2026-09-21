'use client'

import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import { useLocale } from '@/components/locale-provider'
import type { LocalWorkoutTemplate } from '@/lib/db/dexie'
import { weekdayName } from '@/lib/week'

/**
 * Which workout goes on a day: a sheet at the bottom edge listing every
 * workout and Rest, one tap to choose. Replaces a native select per weekday,
 * which on a phone is a wheel of names with no room for anything else.
 */
export function DayPicker({
  weekday,
  templates,
  current,
  onPick,
  onClose,
}: {
  weekday: number
  templates: LocalWorkoutTemplate[]
  /** The workout on the day now, or null for a rest day. */
  current: string | null
  onPick: (templateId: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = useTranslations('plan.dayPicker')
  const locale = useLocale()

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const options: { id: string | null; name: string }[] = [
    ...templates.map((template) => ({ id: template.id, name: template.name })),
    { id: null, name: t('rest') },
  ]

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
      className="mx-auto mt-auto mb-0 max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-md border border-line bg-ground p-0 text-ink backdrop:bg-black/70"
    >
      <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="figure text-xl">
            {weekdayName(weekday, locale)}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="-mr-2 p-2 text-ink-dim">
            <X size={22} aria-hidden />
          </button>
        </div>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {options.map((option) => {
            const chosen = option.id === current
            return (
              <li key={option.id ?? 'rest'}>
                <button
                  type="button"
                  onClick={() => onPick(option.id)}
                  aria-pressed={chosen}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-[15px] ${
                    option.id === null ? 'text-ink-dim' : ''
                  }`}
                >
                  <span className="min-w-0 truncate">{option.name}</span>
                  {chosen && <Check size={18} aria-hidden className="shrink-0 text-plate-blue-lift" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </dialog>
  )
}
