import { z } from 'zod'

import config from '@/data/equipment.json'
import type { LocalExercise } from '@/lib/db/dexie'
import { DEFAULT_LOCALE, type Locale, localize, localizedSchema } from '@/lib/i18n'

/**
 * What you can train with, and what an exercise needs.
 *
 * The library's own `equipment` field (barbell, dumbbell, kettlebells, cable,
 * machine, body only, …) is the base, and its values double as item ids. It cannot say that a
 * squat needs a rack or a chin-up a bar, so `data/equipment.json` adds those
 * extras for the exercises that need them. Schema: `data/README.md`.
 *
 * Your equipment is a per-device choice kept in localStorage, like the theme:
 * it describes the gym this phone goes to, and it never syncs.
 */

const Config = z.object({
  items: z.array(z.object({ id: z.string(), name: localizedSchema })).min(1),
  presets: z.array(z.object({ id: z.string(), name: localizedSchema, items: z.array(z.string()) })),
  needs: z.record(z.string(), z.array(z.string())),
})

export const EQUIPMENT = Config.parse(config)

/**
 * Library values that name no item: `body only` needs nothing, and `other` is
 * anything the library has no word for (a hyperextension bench, a sled), so
 * what it really needs goes under `needs` instead.
 */
const NO_ITEM = new Set(['body only', 'other'])

export type EquipmentExercise = Pick<LocalExercise, 'id' | 'equipment'>

export function exerciseNeeds(exercise: EquipmentExercise): string[] {
  const base = exercise.equipment && !NO_ITEM.has(exercise.equipment) ? [exercise.equipment] : []
  return [...new Set([...base, ...(EQUIPMENT.needs[exercise.id] ?? [])])]
}

/** The items an exercise needs that you do not have; empty means you can do it. */
export function missingEquipment(exercise: EquipmentExercise, have: ReadonlySet<string>): string[] {
  return exerciseNeeds(exercise).filter((item) => !have.has(item))
}

/**
 * The library's equipment, with `body only` and the empty field most stretches
 * and bodyweight moves carry read as one `bodyweight`.
 */
export function exerciseEquipment(exercise: Pick<LocalExercise, 'equipment'>): string {
  return !exercise.equipment || exercise.equipment === 'body only' ? 'bodyweight' : exercise.equipment
}

export function equipmentName(id: string, locale: Locale = DEFAULT_LOCALE): string {
  const name = EQUIPMENT.items.find((item) => item.id === id)?.name
  return name ? localize(name, locale) : id
}

/** The preset that is exactly this selection, if any. */
export function presetFor(items: readonly string[]) {
  const selected = new Set(items)
  return EQUIPMENT.presets.find(
    (preset) => preset.items.length === selected.size && preset.items.every((item) => selected.has(item)),
  )
}

// ------------------------------------------------------------- storage

const STORAGE_KEY = 'gymlog:equipment'
const CHANGE_EVENT = 'gymlog:equipment'

/**
 * The stored value as a string, for useSyncExternalStore — a parsed array would
 * be a new object on every read and re-render forever. Parse with
 * `parseEquipment`.
 */
export function readEquipmentRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Known item ids from a stored value; null when nothing valid has been chosen yet. */
export function parseEquipment(raw: string | null): string[] | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return null
    // In the config's order, so the stored order never matters.
    return EQUIPMENT.items.map((item) => item.id).filter((id) => value.includes(id))
  } catch {
    return null
  }
}

export function saveEquipment(items: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Blocked storage: there is nowhere to keep the choice, so the picker asks again.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** For useSyncExternalStore: re-read whenever the choice changes, here or in another tab. */
export function subscribeEquipment(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
