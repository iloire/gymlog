'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useLocale } from '@/components/locale-provider'
import { addMonths, monthGrid } from '@/lib/calendar'
import { formatDay, formatMonth } from '@/lib/format'
import { weekdayInitials } from '@/lib/week'

/**
 * A month of training at a glance. A trained day is filled like a done set
 * square; a day off is just its number, never marked as missed. The rule down
 * the left of a row lights when that week had a workout — the streak counts
 * weeks, so that is the thing to keep lit.
 */
export function TrainingCalendar({
  trained,
  today,
  selected,
  onSelect,
}: {
  trained: Set<string>
  today: string
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const t = useTranslations('history.calendar')
  const locale = useLocale()
  const thisMonth = today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const firstMonth = [...trained].sort()[0]?.slice(0, 7) ?? thisMonth
  const daysThisMonth = [...trained].filter((date) => date.startsWith(month)).length

  return (
    <section aria-label={t('label')}>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1">
          <span className="figure text-xl">{formatMonth(month, locale)}</span>
          <span className="ml-2 text-sm text-ink-dim">{t('days', { count: daysThisMonth })}</span>
        </h2>
        <MonthButton label={t('previous')} disabled={month <= firstMonth} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft className="size-5" />
        </MonthButton>
        <MonthButton label={t('next')} disabled={month >= thisMonth} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="size-5" />
        </MonthButton>
      </div>

      <div className="mt-3 flex gap-2" aria-hidden="true">
        <span className="w-1 shrink-0" />
        <span className="grid flex-1 grid-cols-7 gap-1.5 text-center text-xs text-ink-dim">
          {weekdayInitials(locale).map((day, index) => (
            <span key={index}>{day}</span>
          ))}
        </span>
      </div>

      <ol className="mt-1.5 space-y-1.5">
        {monthGrid(month).map((week) => {
          const active = week.some((date) => date !== null && trained.has(date))
          // A week not yet begun has nothing to count, so it gets no rule at all.
          const started = week.some((date) => date !== null && date <= today)
          return (
            <li key={week.find(Boolean)} className="flex gap-2">
              <span className={`w-1 shrink-0 rounded-full ${active ? 'bg-plate-blue-lift' : started ? 'bg-line' : ''}`} />
              <span className="grid flex-1 grid-cols-7 gap-1.5">
                {week.map((date, index) =>
                  date === null ? (
                    <span key={index} />
                  ) : (
                    <Day
                      key={date}
                      date={date}
                      trained={trained.has(date)}
                      isToday={date === today}
                      future={date > today}
                      selected={date === selected}
                      onSelect={() => onSelect(date === selected ? null : date)}
                    />
                  ),
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Day({
  date,
  trained,
  isToday,
  future,
  selected,
  onSelect,
}: {
  date: string
  trained: boolean
  isToday: boolean
  future: boolean
  selected: boolean
  onSelect: () => void
}) {
  const t = useTranslations('history.calendar')
  const locale = useLocale()
  const number = Number(date.slice(8))
  const shape = 'figure flex aspect-square items-center justify-center rounded-sm text-sm'
  const todayRing = isToday ? 'ring-2 ring-ink ring-inset' : ''

  if (!trained) {
    return (
      <span className={`${shape} ${todayRing} ${future ? 'text-ink-dim/40' : 'text-ink-dim'}`}>
        <span className="sr-only">{formatDay(date, locale)}</span>
        <span aria-hidden="true">{number}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={t('trained', { date: formatDay(date, locale) })}
      className={`${shape} bg-plate-blue text-white outline-none transition-colors hover:bg-plate-blue-lift focus-visible:ring-2 focus-visible:ring-plate-blue-lift focus-visible:ring-offset-2 focus-visible:ring-offset-ground ${
        selected ? 'ring-2 ring-offset-2 ring-plate-blue-lift ring-offset-ground' : todayRing
      }`}
    >
      {number}
    </button>
  )
}

function MonthButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-md border border-line text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}
