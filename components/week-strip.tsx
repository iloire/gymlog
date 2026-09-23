'use client'

import { useTranslations } from 'next-intl'

import { useLocale } from '@/components/locale-provider'
import { describeDay, weekdayInitials, type WeekDay } from '@/lib/week'

/**
 * The week at a glance under Today's header: a square per day, Monday-first.
 *
 * Filled blue is a day you trained, an outline is one still to come, a grey
 * block is a planned day that went by empty, and a rest day is a dot. Today
 * carries the ring, the same as a day on the History calendar.
 *
 * The square wears its workout's letter — the same A, B, C the workout wears
 * on Plan — so the week says *which* workout was done and which is coming,
 * not merely that there was one. `letters` maps a workout's id to its letter;
 * a day whose workout is not in it, such as one trained off the programme,
 * keeps the bare square.
 */
export function WeekStrip({ days, letters }: { days: WeekDay[]; letters: Map<string, string> }) {
  const t = useTranslations('today.weekStrip')
  const locale = useLocale()
  return (
    <section aria-label={t('label')}>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-1.5">
            <span aria-hidden="true" className={`text-xs ${day.isToday ? 'text-ink' : 'text-ink-dim'}`}>
              {weekdayInitials(locale)[day.weekday]}
            </span>
            <span
              aria-hidden="true"
              className={`figure flex aspect-square w-full items-center justify-center rounded-sm text-lg ${
                SQUARE[day.state]
              } ${day.isToday ? 'ring-2 ring-ink ring-inset' : ''}`}
            >
              {day.state === 'rest' ? (
                <span className="size-1 rounded-full bg-line" />
              ) : (
                (day.templateId && letters.get(day.templateId)) || null
              )}
            </span>
            <span className="sr-only">{describeDay(day, locale)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

const SQUARE: Record<WeekDay['state'], string> = {
  done: 'bg-plate-blue text-white',
  missed: 'bg-line text-ink-dim',
  planned: 'border border-line text-ink-dim',
  rest: '',
}
