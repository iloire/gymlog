'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { BodyPartBadges } from '@/components/body-part-badges'
import { DeleteSession } from '@/components/delete-session'
import { ExercisePicker } from '@/components/exercise-picker'
import { FinishSession } from '@/components/finish-session'
import { useLocale } from '@/components/locale-provider'
import { Nav } from '@/components/nav'
import { PlanList } from '@/components/plan-list'
import { Loading, Placeholder } from '@/components/loading'
import { SessionSets } from '@/components/session-sets'
import { useSync, useUserId } from '@/components/session-boot'
import { SyncBadge } from '@/components/sync-badge'
import { useUnit } from '@/components/use-unit'
import { WeekStrip } from '@/components/week-strip'
import { WeighIn } from '@/components/weigh-in'
import { bodyParts } from '@/lib/body-parts'
import { addDays, weekStart } from '@/lib/calendar'
import { getDb, type LocalExercise } from '@/lib/db/dexie'
import { formatDuration, formatMinutes } from '@/lib/format'
import { daysAgo, isNewAccount, rotation, sessionHistory, trainedOn, type Rotation } from '@/lib/history'
import { planSummary } from '@/lib/plan'
import type { HistoryEntry } from '@/lib/session-summary'
import { dayOfWeek, planPreview, today, weekSchedule, type PlanPreview } from '@/lib/queries'
import { addToSession, startSession } from '@/lib/sessions'
import { lastSyncAt } from '@/lib/sync/client'
import { formatWeight } from '@/lib/units'
import { planWeek, weekdayName, type WeekDay } from '@/lib/week'

/** A workout planned for a day that went by without it. */
type Missed = { day: WeekDay; templateId: string; programId: string; preview: PlanPreview }

/**
 * A workout offered from the list, with why it is there when the programme has
 * a say: the one planned for today, or the one missed earlier in the week.
 * `rank` orders those two ahead of the rotation.
 */
type Offer = Rotation & { programId: string | null; hint: string | null; rank: number }

export default function TodayPage() {
  const t = useTranslations('today')
  const locale = useLocale()
  const userId = useUserId()
  const { status } = useSync()
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const workoutFallback = t('workoutFallback')

  const plan = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const date = today()

    const history = await sessionHistory(userId)
    // Off-schedule, the workout you have gone longest without comes first.
    const allTemplates = await db.workoutTemplates.toArray()
    const templates = rotation(allTemplates, history)
    // An empty phone is only a new account once a sync has said so: signing in
    // on a second device starts just as empty, until the first pull lands.
    const fresh = isNewAccount(allTemplates, history)
    const synced = (await lastSyncAt(userId)) !== null

    const schedule = await weekSchedule(userId)
    const scheduledTemplateId = schedule?.days.get(dayOfWeek()) ?? null
    const scheduled =
      schedule && scheduledTemplateId
        ? { templateId: scheduledTemplateId, programId: schedule.programId }
        : null

    // The week strip, and with it the workout that went by untrained. A
    // programme day pointing at a deleted workout is not a plan for that day.
    const live = new Map(
      allTemplates.filter((template) => template.deletedAt === null).map((template) => [template.id, template]),
    )
    const monday = weekStart(date)
    const sunday = addDays(monday, 6)
    const week = planWeek({
      today: date,
      schedule: new Map(
        [...(schedule?.days ?? [])]
          .filter(([, templateId]) => live.has(templateId))
          .map(([weekday, templateId]) => [weekday, { templateId, name: live.get(templateId)?.name ?? workoutFallback }]),
      ),
      trained: history
        .filter((entry) => entry.session.scheduledFor >= monday && entry.session.scheduledFor <= sunday)
        .map((entry) => ({
          date: entry.session.scheduledFor,
          templateId: entry.session.templateId,
          name: entry.session.templateName,
        })),
    })

    const missedId = week.missed?.templateId
    const missed: Missed | null =
      week.missed && missedId && schedule
        ? {
            day: week.missed,
            templateId: missedId,
            programId: schedule.programId,
            preview: await planPreview(userId, missedId, locale),
          }
        : null

    // Once a set is logged today, the screen is today's log rather than a choice of workout.
    const trained = await Promise.all(
      trainedOn(history, date).map(async (entry) => {
        const exercises = await db.exercises.bulkGet(entry.exercises.map((exercise) => exercise.exerciseId))
        const parts = bodyParts(
          entry.exercises.map((exercise, index) => ({ exercise: exercises[index], sets: exercise.sets.length })),
        )
        return { entry, parts }
      }),
    )

    if (!scheduled) {
      return { scheduled: null, preview: null, week: week.days, missed, templates, trained, session: null, fresh, synced }
    }

    const template = await db.workoutTemplates.get(scheduled.templateId)
    const session = await db.sessions
      .where('scheduledFor')
      .equals(date)
      .filter((s) => s.templateId === scheduled.templateId && s.deletedAt === null)
      .first()

    return {
      scheduled: { ...scheduled, name: template?.name ?? workoutFallback },
      preview: await planPreview(userId, scheduled.templateId, locale),
      week: week.days,
      missed,
      templates,
      trained,
      session: session ?? null,
      fresh,
      synced,
    }
  }, [userId, workoutFallback])

  async function start(templateId: string, programId: string | null) {
    if (!userId || starting) return
    setStarting(true)
    const id = await startSession(userId, templateId, programId)
    router.push(`/session?id=${id}`)
  }

  const weekday = weekdayName(dayOfWeek(), locale)

  // useLiveQuery yields undefined until IndexedDB answers. Rendering the empty
  // state during that gap tells you it is a rest day when it isn't — on a cold
  // start in the gym that is the difference between training and going home.
  // The same goes for an empty phone whose first sync is still on its way: it
  // may be a new account, or yours on a new device. With no signal there is
  // nothing to wait for.
  const awaitingFirstSync = plan?.fresh && !plan.synced && status !== 'offline' && status !== 'error'

  if (plan === undefined || awaitingFirstSync) {
    return (
      <Loading>
        <p className="text-sm text-ink-dim">{weekday}</p>
        <Placeholder className="mt-2 h-10 w-48" />
      </Loading>
    )
  }

  if (plan?.fresh) return <Welcome />

  if (plan?.trained.length) {
    const { scheduled, missed } = plan
    // Today's training is above, done or under way. The workout the programme
    // had planned for today and the one missed earlier in the week are still a
    // tap away, but folded in with the rest and only marked as such: a second
    // workout pushed at someone who has just finished one is noise. A workout
    // already trained today is not offered — starting it would only re-open it.
    const trainedIds = new Set(plan.trained.map(({ entry }) => entry.session.templateId))
    const others: Offer[] = plan.templates
      .filter(({ template }) => !trainedIds.has(template.id))
      .map((row) => {
        const id = row.template.id
        if (scheduled && id === scheduled.templateId)
          return { ...row, programId: scheduled.programId, hint: t('plannedFor', { weekday }), rank: 0 }
        if (missed && id === missed.templateId)
          return { ...row, programId: missed.programId, hint: t('missedOn', { weekday: weekdayName(missed.day.weekday, locale) }), rank: 1 }
        return { ...row, programId: null, hint: null, rank: 2 }
      })
      .sort((a, b) => a.rank - b.rank)

    return (
      <>
        <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
          <header className="mb-6">
            <p className="text-sm text-ink-dim">{weekday}</p>
            <h1 className="figure mt-1 text-4xl leading-[1.05]">{t('title')}</h1>
          </header>

          <WeekStrip days={plan.week} />

          <SyncBadge />
          <WeighIn />

          <section className="mt-6 divide-y divide-line border-y border-line">
            {plan.trained.map(({ entry, parts }) => (
              <TodaySession key={entry.session.id} entry={entry} parts={parts} />
            ))}
          </section>

          {others.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-ink-dim">{t('startAnother')}</summary>
              <WorkoutList templates={others} onStart={(id, programId) => void start(id, programId)} />
            </details>
          )}
        </main>
        <Nav />
      </>
    )
  }

  // Nothing scheduled and nothing trained, but a workout went by untrained
  // earlier this week: that one takes the screen, in full, ready to start.
  const catchUp = plan && !plan.scheduled ? plan.missed : null

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <header className="mb-6">
          <p className="text-sm text-ink-dim">{weekday}</p>
          <h1 className="figure mt-1 text-4xl leading-[1.05]">
            {plan?.scheduled?.name ?? catchUp?.day.name ?? t('restDay')}
          </h1>
          {plan?.scheduled && plan.preview ? (
            <p className="mt-1.5 text-sm text-ink-dim">{planSummary(plan.preview.lines.length, plan.preview.estimateMs, locale)}</p>
          ) : catchUp ? (
            <p className="mt-1.5 text-[15px] text-ink-dim">
              {t('missedQuestion', { weekday: weekdayName(catchUp.day.weekday, locale) })}
            </p>
          ) : null}
        </header>

        {plan && <WeekStrip days={plan.week} />}

        <SyncBadge />
        <WeighIn />

        {plan?.scheduled && plan.preview ? (
          <section className="mt-6">
            <PlanList lines={plan.preview.lines} />

            <button
              type="button"
              onClick={() => void start(plan.scheduled!.templateId, plan.scheduled!.programId)}
              disabled={starting}
              className="btn-primary mt-6 h-16"
            >
              {plan.session?.startedAt ? t('continueWorkout') : t('startWorkout')}
            </button>

            {plan.missed && (
              <MissedNote
                missed={plan.missed}
                disabled={starting}
                onStart={() => void start(plan.missed!.templateId, plan.missed!.programId)}
              />
            )}
          </section>
        ) : catchUp ? (
          <section className="mt-6">
            <p className="mb-3 text-sm text-ink-dim">{planSummary(catchUp.preview.lines.length, catchUp.preview.estimateMs, locale)}</p>
            <PlanList lines={catchUp.preview.lines} />

            <button
              type="button"
              onClick={() => void start(catchUp.templateId, catchUp.programId)}
              disabled={starting}
              className="btn-primary mt-6 h-16"
            >
              {t('startWorkout')}
            </button>

            <p className="mt-6 text-sm text-ink-dim">
              {t.rich('nothingWasScheduled', {
                weekday,
                link: (chunks) => (
                  <Link href="/workouts" className="text-ink underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            </p>

            {plan?.templates.length ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-ink-dim">{t('startAnother')}</summary>
                <WorkoutList templates={plan.templates} onStart={(id) => void start(id, null)} />
              </details>
            ) : null}
          </section>
        ) : (
          <section className="mt-6">
            <p className="text-[15px] text-ink-dim">
              {t.rich('nothingScheduled', {
                weekday,
                link: (chunks) => (
                  <Link href="/workouts" className="text-ink underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            </p>

            {plan?.templates.length ? (
              <WorkoutList templates={plan.templates} onStart={(id) => void start(id, null)} />
            ) : (
              // Every workout archived or deleted, with a log behind you.
              <SetupChoices />
            )}
          </section>
        )}
      </main>
      <Nav />
    </>
  )
}

/**
 * A workout earlier in the week that never happened, offered beside whatever
 * today already holds. It only appears while that workout has not been trained
 * on some other day of the week — see `planWeek`.
 */
function MissedNote({ missed, disabled, onStart }: { missed: Missed; disabled: boolean; onStart: () => void }) {
  const t = useTranslations('today.missedNote')
  const locale = useLocale()
  return (
    <section className="mt-6 rounded-md bg-surface p-4">
      <p className="text-[15px]">
        {t.rich('text', {
          weekday: weekdayName(missed.day.weekday, locale),
          name: missed.day.name ?? '',
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </p>
      <p className="mt-0.5 text-sm text-ink-dim">{planSummary(missed.preview.lines.length, missed.preview.estimateMs, locale)}</p>
      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="btn-quiet mt-3"
      >
        {t('doToday')}
      </button>
    </section>
  )
}
/**
 * A new account's first screen. Nothing is scheduled because nothing exists
 * yet, so it says what the app is for and offers the two ways to get a plan.
 */
function Welcome() {
  const t = useTranslations('today.welcome')
  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <header>
          <p className="text-sm text-ink-dim">{t('eyebrow')}</p>
          <h1 className="figure mt-1 text-4xl leading-[1.05]">{t('title')}</h1>
          <p className="mt-3 text-[15px] text-ink-dim">{t('intro')}</p>
        </header>

        <SetupChoices />
      </main>
      <Nav />
    </>
  )
}

/** The two ways to get workouts: copy a premade programme, or write your own. */
function SetupChoices() {
  const t = useTranslations('today.setup')
  return (
    <div className="mt-6 flex flex-col gap-3">
      <Link
        href="/programmes"
        className="flex items-center gap-3 rounded-md bg-plate-blue px-4 py-4 text-white transition-colors hover:bg-plate-blue-lift"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{t('premadeTitle')}</span>
          <span className="mt-0.5 block text-sm opacity-85">{t('premadeText')}</span>
        </span>
        <ChevronRight size={20} aria-hidden className="shrink-0" />
      </Link>
      <Link href="/workouts/new" className="flex items-center gap-3 rounded-md bg-surface px-4 py-4 transition-colors hover:bg-surface-high">
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{t('ownTitle')}</span>
          <span className="mt-0.5 block text-sm text-ink-dim">{t('ownText')}</span>
        </span>
        <ChevronRight size={20} aria-hidden className="shrink-0 text-ink-dim" />
      </Link>
    </div>
  )
}

function WorkoutList({
  templates,
  onStart,
}: {
  templates: (Rotation & Partial<Pick<Offer, 'programId' | 'hint'>>)[]
  onStart: (templateId: string, programId: string | null) => void
}) {
  const t = useTranslations('today.list')
  const locale = useLocale()
  return (
    <ul className="mt-5 divide-y divide-line border-y border-line">
      {templates.map(({ template, lastDone, programId, hint }) => (
        <li key={template.id}>
          <button
            type="button"
            onClick={() => onStart(template.id, programId ?? null)}
            className="flex w-full items-center justify-between gap-3 py-4 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[15px]">{template.name}</span>
              <span className="block text-sm text-ink-dim">
                {[hint, lastDone ? t('lastDone', { when: daysAgo(lastDone, undefined, locale) }) : t('notDone')].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="shrink-0 text-sm text-ink-dim">{t('start')}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** One session trained today: what is logged so far, and the way back into it. */
function TodaySession({ entry, parts }: { entry: HistoryEntry; parts: string[] }) {
  const t = useTranslations('today.session')
  const locale = useLocale()
  const userId = useUserId()
  const unit = useUnit()
  const router = useRouter()
  const [picking, setPicking] = useState(false)
  const { session, setsDone, setsPlanned, volumeKg, cardioSec, durationMs, exercises } = entry
  const totals = [
    t('sets', { done: setsDone, planned: setsPlanned }),
    volumeKg > 0 ? formatWeight(volumeKg, unit, locale) : null,
    cardioSec > 0 ? t('cardio', { minutes: formatMinutes(cardioSec) }) : null,
    // How long it took, as Progress prints it — but only once the workout is
    // over: while it is under way the number is the time since the first set,
    // which grows through every rest and says nothing about the training.
    session.completedAt !== null && durationMs !== null && durationMs >= 60_000
      ? formatDuration(durationMs)
      : null,
  ].filter(Boolean)

  async function addExercise(picked: LocalExercise) {
    if (!userId) return
    await addToSession(userId, session, picked)
    setPicking(false)
    // Straight to the exercise you just picked, ready to log its first set.
    router.push(`/session?id=${session.id}&exercise=${encodeURIComponent(picked.id)}`)
  }

  return (
    <article className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg">{session.templateName}</h2>
        <span className="shrink-0 text-sm text-ink-dim">{totals.join(' · ')}</span>
      </div>
      <BodyPartBadges parts={parts} className="mt-2" />
      {session.completedAt === null ? (
        <>
          <div className="mt-3">
            <SessionSets exercises={exercises} />
          </div>
          <Link href={`/session?id=${session.id}`} className="btn-primary mt-4">
            {t('continue', { name: session.templateName })}
          </Link>
          {/* Adding an exercise is a change to the whole workout, so it lives here
              beside the workout's own sets rather than on the one-exercise gym
              screen. Ending it is about the whole workout too, and the gym screen
              only offers Finish once every set is logged — this is the way out of
              one cut short. Both are quiet, side by side: Continue is the tap. */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setPicking(true)} className="btn-quiet">
              <Plus size={16} aria-hidden />
              {t('addExercise')}
            </button>
            <FinishSession session={session} setsLeft={setsPlanned - setsDone} />
          </div>
          {picking && (
            <ExercisePicker
              onClose={() => setPicking(false)}
              onPick={(picked) => void addExercise(picked)}
            />
          )}
        </>
      ) : (
        <>
          {/* Done is done, and the sets stay in view: the glance back at what was
              lifted, and the one set that needs fixing, cost no tap. */}
          <div className="mt-3">
            <SessionSets exercises={exercises} />
          </div>
          <Link
            href={`/session?id=${session.id}`}
            className="mt-3 inline-block text-sm text-ink-dim underline underline-offset-4"
          >
            {t('finished')}
          </Link>
        </>
      )}
      {/* The wrong workout started, or one logged twice: deleting it is about the
          whole workout, so it sits with the workout and not on the gym screen. */}
      <div className="mt-4 flex justify-end">
        <DeleteSession session={session} />
      </div>
    </article>
  )
}
