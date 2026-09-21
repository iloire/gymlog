/**
 * Every message, per language, one JSON file per screen (`messages/<locale>/<screen>.json`)
 * so that translating a screen touches its own two files and nothing another
 * agent is editing. English is the source of truth; a key Spanish lacks reads
 * in English rather than throwing, and `tests/i18n.test.ts` is what keeps that
 * gap from lasting. Every screen's file is registered here up front, so
 * adding strings to one never edits this file.
 */
import type { Locale } from '@/lib/i18n'

import enAdmin from './en/admin.json'
import enAuth from './en/auth.json'
import enCommon from './en/common.json'
import enData from './en/data.json'
import enExercises from './en/exercises.json'
import enHistory from './en/history.json'
import enPlan from './en/plan.json'
import enProfile from './en/profile.json'
import enSession from './en/session.json'
import enToday from './en/today.json'
import enWeight from './en/weight.json'
import esAdmin from './es/admin.json'
import esAuth from './es/auth.json'
import esCommon from './es/common.json'
import esData from './es/data.json'
import esExercises from './es/exercises.json'
import esHistory from './es/history.json'
import esPlan from './es/plan.json'
import esProfile from './es/profile.json'
import esSession from './es/session.json'
import esToday from './es/today.json'
import esWeight from './es/weight.json'

export const en = {
  admin: enAdmin,
  auth: enAuth,
  common: enCommon,
  data: enData,
  exercises: enExercises,
  history: enHistory,
  plan: enPlan,
  profile: enProfile,
  session: enSession,
  today: enToday,
  weight: enWeight,
}

export type Messages = typeof en

type Tree = { [key: string]: string | Tree }

/** `base` with every leaf `over` has; a subtree `over` lacks is kept whole. */
export function fallback<T extends Tree>(base: T, over: Tree): T {
  const out: Tree = { ...base }
  for (const [key, value] of Object.entries(over)) {
    const under = base[key]
    out[key] = typeof value === 'object' && typeof under === 'object' ? fallback(under, value) : value
  }
  return out as T
}

const es = fallback(en, {
  admin: esAdmin,
  auth: esAuth,
  common: esCommon,
  data: esData,
  exercises: esExercises,
  history: esHistory,
  plan: esPlan,
  profile: esProfile,
  session: esSession,
  today: esToday,
  weight: esWeight,
})

export const MESSAGES: Record<Locale, Messages> = { en, es }
