/**
 * The week behind and ahead of today: which days you trained, which are still
 * to come, and which went by with a workout on them that never happened.
 *
 * Pure and free of Dexie — the strip under Today's header and the tests read
 * the same function. Weeks run Monday-first, like the rest of the app.
 */
import { addDays, weekStart } from '@/lib/calendar'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

/**
 * `done` — a workout was logged that day. `missed` — one was planned and the
 * day is over. `planned` — today or later. `rest` — nothing on the programme.
 */
export type DayState = 'done' | 'missed' | 'planned' | 'rest'

export type WeekDay = {
  date: string
  /** 0 = Monday. */
  weekday: number
  state: DayState
  /** What was trained, or what was planned — null on a rest day. */
  templateId: string | null
  name: string | null
  isToday: boolean
}

/** A workout on the programme for one weekday. */
export type ScheduledDay = { templateId: string; name: string }

/** A session with sets logged, from `sessionHistory`. */
export type TrainedDay = { date: string; templateId: string | null; name: string }

export type Week = {
  days: WeekDay[]
  /**
   * The workout worth offering to catch up on today: the most recent day this
   * week that was planned, went by untrained, and whose workout has not been
   * done on some other day of the week instead.
   */
  missed: WeekDay | null
}

const WEEKDAY_NAMES: Record<Locale, string[]> = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
}

/**
 * The strip's initials, Monday-first. A table, not the names' first letters:
 * Spanish writes Wednesday as X so it does not read as a second Tuesday.
 */
const WEEKDAY_INITIALS: Record<Locale, string[]> = {
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
}

/** A, B, C… — the letter a workout wears on the week and beside its name. */
export function workoutLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

/**
 * Every workout's letter by id, in the order Plan lists them — so a square on
 * Today's strip and the cell on Plan say the same letter for the same workout,
 * and the letter is the one thing you have to learn once. Archived and deleted
 * workouts are left out, as they are on Plan, rather than shifting the letters
 * of the ones still in use.
 */
export function workoutLetters(
  templates: { id: string; deletedAt: number | null; archivedAt: number | null }[],
): Map<string, string> {
  return new Map(
    templates
      .filter((template) => template.deletedAt === null && template.archivedAt === null)
      .map((template, index) => [template.id, workoutLetter(index)]),
  )
}

export function weekdayInitials(locale: Locale = DEFAULT_LOCALE): string[] {
  return WEEKDAY_INITIALS[locale]
}

/** The full name of a weekday index, 0 = Monday. */
export function weekdayName(weekday: number, locale: Locale = DEFAULT_LOCALE): string {
  return WEEKDAY_NAMES[locale][weekday] ?? ''
}

export function planWeek({
  today,
  schedule,
  trained,
}: {
  today: string
  /** Weekday index (0 = Monday) to the workout on the programme that day. */
  schedule: Map<number, ScheduledDay>
  /** Every session trained this week. Days outside the week are ignored. */
  trained: TrainedDay[]
}): Week {
  const monday = weekStart(today)

  const days: WeekDay[] = Array.from({ length: 7 }, (_, weekday) => {
    const date = addDays(monday, weekday)
    // What you actually did wins over what was on the programme: on a day you
    // trained something else, the strip should name the workout you did.
    const done = trained.find((session) => session.date === date) ?? null
    const planned = schedule.get(weekday) ?? null
    const state: DayState = done ? 'done' : planned ? (date < today ? 'missed' : 'planned') : 'rest'

    return {
      date,
      weekday,
      state,
      templateId: done?.templateId ?? planned?.templateId ?? null,
      name: done?.name ?? planned?.name ?? null,
      isToday: date === today,
    }
  })

  // A workout done on the wrong day is still done. Wednesday's Full body B
  // trained on Thursday leaves Wednesday empty, but nothing to catch up on.
  const trainedTemplates = new Set(trained.map((session) => session.templateId))
  // Neither is one the programme already has you doing today: the session is
  // the same session, so offering it twice is one button too many.
  const todayWeekday = days.findIndex((day) => day.isToday)
  const dueToday = schedule.get(todayWeekday)?.templateId ?? null

  const missed =
    [...days]
      .reverse()
      .find(
        (day) =>
          day.state === 'missed' &&
          day.templateId !== null &&
          day.templateId !== dueToday &&
          !trainedTemplates.has(day.templateId),
      ) ?? null

  return { days, missed }
}

const DAY_WORDS: Record<Locale, { today: string; restDay: string } & Record<Exclude<DayState, 'rest'>, string>> = {
  en: { today: 'today', restDay: 'rest day', done: 'done', missed: 'missed', planned: 'planned' },
  es: { today: 'hoy', restDay: 'descanso', done: 'hecho', missed: 'pendiente', planned: 'previsto' },
}

/** What a strip square says to a screen reader: 'Wednesday, Full body B, missed'. */
export function describeDay(day: WeekDay, locale: Locale = DEFAULT_LOCALE): string {
  const words = DAY_WORDS[locale]
  const name = weekdayName(day.weekday, locale)
  const when = day.isToday ? `${name}, ${words.today}` : name
  if (day.state === 'rest') return `${when}, ${words.restDay}`
  return `${when}, ${day.name}, ${words[day.state]}`
}
