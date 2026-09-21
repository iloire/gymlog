/**
 * Every message, per language, one JSON file per screen (`messages/<locale>/<screen>.json`)
 * so that translating a screen touches its own two files and nothing another
 * agent is editing. English is the source of truth; a key Spanish lacks reads
 * in English rather than throwing, and `tests/i18n.test.ts` is what keeps that
 * gap from lasting.
 */
import type { Locale } from '@/lib/i18n'

import enCommon from './en/common.json'
import enProfile from './en/profile.json'
import esCommon from './es/common.json'
import esProfile from './es/profile.json'

export const en = {
  common: enCommon,
  profile: enProfile,
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

const es = fallback(en, { common: esCommon, profile: esProfile })

export const MESSAGES: Record<Locale, Messages> = { en, es }
