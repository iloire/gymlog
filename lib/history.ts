'use client'

import { getDb, type LocalSetLog, type LocalWorkoutTemplate } from '@/lib/db/dexie'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { dateToEpoch, today } from '@/lib/queries'
import { summariseSession, type HistoryEntry } from '@/lib/session-summary'

const alive = <T extends { deletedAt: number | null }>(row: T) => row.deletedAt === null

/**
 * Every session you actually trained, newest first. A session opened and
 * abandoned without logging a set is not history.
 */
export async function sessionHistory(userId: string): Promise<HistoryEntry[]> {
  const db = getDb(userId)
  const sessions = (await db.sessions.toArray()).filter(alive)
  const logs = await db.setLogs.toArray()

  const bySession = new Map<string, LocalSetLog[]>()
  for (const log of logs) {
    const list = bySession.get(log.sessionId)
    if (list) list.push(log)
    else bySession.set(log.sessionId, [log])
  }

  return sessions
    .map((session) => summariseSession(session, bySession.get(session.id) ?? []))
    .filter((entry) => entry.setsDone > 0)
    .sort(
      (a, b) =>
        b.session.scheduledFor.localeCompare(a.session.scheduledFor) ||
        (b.session.startedAt ?? 0) - (a.session.startedAt ?? 0),
    )
}

/** The sessions trained on one calendar date, from `sessionHistory` and in its order. */
export function trainedOn(history: HistoryEntry[], date: string): HistoryEntry[] {
  return history.filter((entry) => entry.session.scheduledFor === date)
}

/**
 * Nothing built and nothing logged: the account has not been set up yet, which
 * is not the same as a day with nothing scheduled. An archived workout still
 * counts as having been here.
 */
export function isNewAccount(templates: LocalWorkoutTemplate[], history: HistoryEntry[]): boolean {
  return history.length === 0 && !templates.some(alive)
}

export type Rotation = { template: LocalWorkoutTemplate; lastDone: string | null }

/**
 * Your current workouts, the one you have gone longest without first — never
 * done before ever done, then oldest date. In a programme of several workouts
 * the top of this list is the one that is due.
 *
 * Takes history newest-first, as `sessionHistory` returns it.
 */
export function rotation(templates: LocalWorkoutTemplate[], history: HistoryEntry[]): Rotation[] {
  return templates
    .filter((template) => alive(template) && template.archivedAt === null)
    .map((template) => ({
      template,
      lastDone:
        history.find((entry) => entry.session.templateId === template.id)?.session.scheduledFor ??
        null,
    }))
    .sort((a, b) => {
      if (a.lastDone === b.lastDone) return a.template.name.localeCompare(b.template.name)
      if (a.lastDone === null) return -1
      if (b.lastDone === null) return 1
      return a.lastDone.localeCompare(b.lastDone)
    })
}

/** Whole calendar days from one 'YYYY-MM-DD' to another; rounds away a DST hour. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToEpoch(to) - dateToEpoch(from)) / 86_400_000)
}

/** 'today', 'yesterday', '4 days ago' for a calendar date. */
export function daysAgo(date: string, now = today(), locale: Locale = DEFAULT_LOCALE): string {
  const days = daysBetween(date, now)
  const words = AGO[locale]
  if (days <= 0) return words.today
  if (days === 1) return words.yesterday
  return words.days(days)
}

const AGO: Record<Locale, { today: string; yesterday: string; days: (n: number) => string }> = {
  en: { today: 'today', yesterday: 'yesterday', days: (n) => `${n} days ago` },
  es: { today: 'hoy', yesterday: 'ayer', days: (n) => `hace ${n} días` },
}
