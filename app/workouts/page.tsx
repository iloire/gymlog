'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DayPicker } from '@/components/day-picker'
import { useLocale } from '@/components/locale-provider'
import { Loading, Placeholder } from '@/components/loading'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { formatDay } from '@/lib/format'
import { assignDay, startNewStage } from '@/lib/program'
import { activeProgram, dayOfWeek } from '@/lib/queries'
import { startSession } from '@/lib/sessions'
import { weekdayInitials, weekdayName, workoutLetter } from '@/lib/week'

/**
 * The Plan tab, whole: the week along the top, a cell per day wearing the
 * letter of its workout, and the workouts under it wearing the same letters.
 * A tap on a day picks its workout from a sheet. What you train and when
 * used to be two screens behind a segmented control; they are one idea.
 */
export default function WorkoutsPage() {
  const userId = useUserId()
  const router = useRouter()
  const t = useTranslations('plan')
  const locale = useLocale()
  const [starting, setStarting] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)

  const data = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const templates = (await db.workoutTemplates.toArray()).filter(
      (t) => t.deletedAt === null && t.archivedAt === null,
    )

    const program = (await activeProgram(userId)) ?? null
    const days = program
      ? (await db.programDays.where('programId').equals(program.id).toArray()).filter(
          (day) => day.deletedAt === null,
        )
      : []
    const workouts = await Promise.all(
      templates.map(async (template) => {
        const items = (await db.templateItems.where('templateId').equals(template.id).toArray())
          .filter((item) => item.deletedAt === null)
          .sort((a, b) => a.position - b.position)
        const scheduledOn = days
          .filter((day) => day.templateId === template.id)
          .map((day) => day.dayOfWeek)
          .sort((a, b) => a - b)
        return {
          ...template,
          exerciseCount: items.length,
          scheduledOn,
          // Started on its own day it is the programme's session, as it is from Today.
          programId: scheduledOn.includes(dayOfWeek()) ? (program?.id ?? null) : null,
        }
      }),
    )

    // A programme day pointing at a deleted workout is a rest day.
    const week = weekdayInitials(locale).map((_, weekday) => {
      const templateId = days.find((day) => day.dayOfWeek === weekday)?.templateId ?? null
      const index = workouts.findIndex((workout) => workout.id === templateId)
      return { weekday, templateId: index === -1 ? null : templateId, index }
    })

    return { program, workouts, week, trainingDays: week.filter((day) => day.templateId !== null).length }
  }, [userId, locale])

  async function start(templateId: string, programId: string | null) {
    if (!userId || starting) return
    setStarting(true)
    const id = await startSession(userId, templateId, programId)
    router.push(`/session?id=${id}`)
  }

  if (!userId || !data) {
    return (
      <Loading>
        <h1 className="figure text-4xl">{t('title')}</h1>
        <Placeholder className="mt-2 h-5 w-64" />
        <Placeholder className="mt-7 h-16 w-full" />
      </Loading>
    )
  }

  const { program, workouts, week, trainingDays } = data
  const current = dayOfWeek()

  return (
    <>
      {picking !== null && (
        <DayPicker
          weekday={picking}
          templates={workouts}
          current={week[picking]?.templateId ?? null}
          onPick={(templateId) => {
            void assignDay(userId, picking, templateId, locale)
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        {/* The programme is the headline and the tab's name the line above it:
            the tab bar already says Plan, and what you are on is the news. */}
        {program ? (
          <header>
            <p className="text-sm text-ink-dim">{t('title')}</p>
            <h1 className="figure mt-1 text-4xl leading-[1.05]">{program.name}</h1>
            <p className="mt-1.5 text-sm text-ink-dim">
              {t('intro.programmeDetail', { days: trainingDays, since: formatDay(program.startedOn, locale) })}
            </p>
          </header>
        ) : (
          <header>
            <h1 className="figure text-4xl">{t('title')}</h1>
            <p className="mt-2 text-sm text-ink-dim">{t('intro.empty')}</p>
          </header>
        )}

        {/* The week: a cell per day wearing its workout's letter. */}
        <section className="mt-7" aria-label={t('week.label')}>
          <ol className="grid grid-cols-7 gap-1.5">
            {week.map((day) => {
              const isToday = day.weekday === current
              const name = day.index === -1 ? null : (workouts[day.index]?.name ?? null)
              return (
                <li key={day.weekday} className="flex flex-col items-center gap-1.5">
                  <span aria-hidden className={`text-xs ${isToday ? 'text-ink' : 'text-ink-dim'}`}>
                    {weekdayInitials(locale)[day.weekday]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPicking(day.weekday)}
                    disabled={workouts.length === 0}
                    aria-label={t(isToday ? 'week.dayLabelToday' : 'week.dayLabel', {
                      day: weekdayName(day.weekday, locale),
                      workout: name ?? t('week.rest'),
                    })}
                    className={`figure flex aspect-square w-full items-center justify-center rounded-sm text-lg transition-opacity active:opacity-70 ${
                      name
                        ? 'bg-plate-blue text-white'
                        : 'border border-dashed border-line text-ink-dim'
                    } ${isToday ? 'ring-2 ring-ink ring-inset' : ''} disabled:opacity-50`}
                  >
                    {/* A day off is an empty slot with a +, not a dot: the same
                        square on Today only reports the week, and nothing but
                        the plus says this one can be filled in. */}
                    {name ? workoutLetter(day.index) : <Plus size={16} aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ol>
          {/* Said once, quietly, under the week: the squares are buttons here and
              read-only on Today, and nothing about a filled square shows which. */}
          {workouts.length > 0 && <p className="mt-2 text-xs text-ink-dim">{t('week.hint')}</p>}
        </section>

        {workouts.length ? (
          <ul className="mt-7 divide-y divide-line border-y border-line">
            {workouts.map((workout, index) => (
              <li key={workout.id} className="flex items-center gap-3">
                <Link href={`/workouts/${workout.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-4">
                  <span
                    className={`figure flex size-9 shrink-0 items-center justify-center rounded-sm text-base ${
                      workout.scheduledOn.length > 0 ? 'bg-plate-blue text-white' : 'border border-line text-ink-dim'
                    }`}
                    aria-hidden
                  >
                    {workoutLetter(index)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{workout.name}</span>
                    {/* One quiet line under the name. Plan is where you see
                        the shape of the week, and the rows had grown to four
                        lines each: when a workout was last done is Progress's
                        question, and a rail of body-part pills said in colour
                        what Upper A and Lower B already say in words. What is
                        left is the days it is on and how long it is. */}
                    <span className="block text-sm text-ink-dim">
                      {workout.scheduledOn.length > 0
                        ? workout.scheduledOn.map((day) => weekdayName(day, locale).slice(0, 3)).join(' · ')
                        : t('workout.noSetDay')}
                      {' · '}
                      {t('workout.exercises', { count: workout.exerciseCount })}
                    </span>
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-dim" />
                </Link>
                <button
                  type="button"
                  onClick={() => void start(workout.id, workout.programId)}
                  disabled={starting}
                  aria-label={t('workout.startLabel', { name: workout.name })}
                  className="btn-quiet w-auto shrink-0"
                >
                  {t('workout.start')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-7 border-y border-line py-6 text-[15px] text-ink-dim">
            {t('empty')}
          </p>
        )}

        <Link
          href="/workouts/new"
          className="btn-primary mt-6 text-base"
        >
          <Plus size={18} aria-hidden />
          {t('newWorkout')}
        </Link>
        <Link
          href="/programmes"
          className="btn-quiet mt-3"
        >
          {t('browse')}
        </Link>

        {program && <NewStage onStart={(name) => startNewStage(userId, name)} />}
      </main>
      <Nav />
    </>
  )
}

/**
 * Moving up a stage ends the current programme and starts a new, empty one.
 * Old sessions keep pointing at the old programme, so the history stays intact.
 */
function NewStage({ onStart }: { onStart: (name: string) => Promise<unknown> }) {
  const t = useTranslations('plan.newStage')
  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-ink-dim">{t('intro')}</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const name = String(new FormData(form).get('name') ?? '').trim()
          if (!name) return
          await onStart(name)
          form.reset()
        }}
      >
        <input
          name="name"
          placeholder={t('placeholder')}
          aria-label={t('nameLabel')}
          className="h-12 min-w-0 flex-1 rounded-md bg-surface px-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-plate-blue-lift"
        />
        <button type="submit" className="btn-quiet w-auto shrink-0">
          {t('submit')}
        </button>
      </form>
    </section>
  )
}
