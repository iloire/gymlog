/**
 * What a planned workout says about itself before you start it: the sets and
 * reps of each line, what you lifted last time, and how long the whole thing
 * will take. Pure and free of Dexie, so it can be read straight off a template
 * item on any screen.
 */
import { formatDuration, formatMinutes, kg } from '@/lib/format'

/** The template fields a planned line is built from. */
export type PlanTarget = {
  sets: number
  targetReps: number
  targetRepsMax: number | null
  targetDurationSec?: number | null
  restSec: number
}

/** One line of a planned workout, as Today lists it. */
export type PlanLine = {
  exerciseId: string
  name: string
  /** '3×5', '3×8–12', '10 min'. */
  target: string
  /** The headline number from last time — '60 kg', '12 reps', '8 min'; null the first time. */
  last: string | null
}

/**
 * A working set bar to bar: the reps themselves plus loading the bar and
 * getting set. Rest is prescribed and rarely kept to; this part is guesswork,
 * so the estimate is rounded hard before it is shown.
 */
const SET_SEC = 45

/** '3×5', '3×8–12' for a rep range, '10 min' or '3×10 min' for a timed set. */
export function formatTarget(item: PlanTarget): string {
  if (item.targetDurationSec != null) {
    const time = formatMinutes(item.targetDurationSec)
    return item.sets > 1 ? `${item.sets}×${time}` : time
  }
  const reps =
    item.targetRepsMax !== null && item.targetRepsMax > item.targetReps
      ? `${item.targetReps}–${item.targetRepsMax}`
      : `${item.targetReps}`
  return `${item.sets}×${reps}`
}

/**
 * Roughly how long a workout runs, in ms: every set takes its work plus its
 * prescribed rest. The very last rest is dropped — there is nothing to rest
 * for once the workout is over.
 */
export function estimateWorkoutMs(items: PlanTarget[]): number {
  const seconds = items.reduce(
    (total, item) => total + item.sets * ((item.targetDurationSec ?? SET_SEC) + item.restSec),
    0,
  )
  const trailingRest = items.at(-1)?.restSec ?? 0
  return Math.max(0, seconds - trailingRest) * 1000
}

/** 'about 45 min' — rounded to five minutes, because it is a guess and reads like one. */
export function formatEstimate(ms: number): string {
  const step = 5 * 60_000
  return `about ${formatDuration(Math.max(step, Math.round(ms / step) * step))}`
}

/** '5 exercises · about 45 min' — the line under a planned workout's name. */
export function planSummary(exercises: number, estimateMs: number): string {
  if (exercises === 0) return 'No exercises yet'
  return `${exercises} ${exercises === 1 ? 'exercise' : 'exercises'} · ${formatEstimate(estimateMs)}`
}

/** The one number worth carrying forward from last time: '60 kg', '12 reps', '8 min'. */
export function formatLast(set: { weightKg: number | null; reps: number | null; durationSec?: number | null }): string {
  if (set.durationSec != null) return formatMinutes(set.durationSec)
  return set.weightKg ? kg(set.weightKg) : `${set.reps ?? 0} reps`
}
