'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Minus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { useUserId } from '@/components/session-boot'
import { clearRest, currentRest, extendRest, EXTEND_SEC, REST_STEP_SEC, type Rest } from '@/lib/rest'

/** A short two-tone beep. No audio file to load, and it works offline. */
function beep() {
  try {
    const context = new AudioContext()
    const gain = context.createGain()
    gain.gain.value = 0.0001
    gain.connect(context.destination)

    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.setValueAtTime(1320, context.currentTime + 0.12)
    oscillator.connect(gain)

    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45)

    oscillator.start()
    oscillator.stop(context.currentTime + 0.5)
    oscillator.onended = () => void context.close()
  } catch {
    // Audio is a courtesy; the bar doesn't care.
  }
}

export type RestState = { rest: Rest | null; remaining: number }

/** '1:23' — the clock as every rest view prints it. */
export function formatRest(remaining: number): string {
  const minutes = Math.floor(remaining / 60)
  const seconds = `${remaining % 60}`.padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * The rest under way, counting down from the timestamp in IndexedDB rather
 * than ticking a counter, so neither backgrounding the phone nor leaving the
 * screen stops or drifts the clock. Beeps, vibrates and clears the rest once
 * at zero — so a screen mounts this hook once and hands the state to whichever
 * view draws it, never two hooks that would both beep.
 */
export function useRest(): RestState {
  const userId = useUserId()
  const rest = useLiveQuery(async () => (userId ? currentRest(userId) : null), [userId]) ?? null
  const endsAt = rest?.endsAt ?? null

  const [remaining, setRemaining] = useState(0)
  const fired = useRef(false)

  useEffect(() => {
    if (!endsAt || !userId) return

    fired.current = false

    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      setRemaining(left)

      if (left === 0 && !fired.current) {
        fired.current = true
        beep()
        navigator.vibrate?.([120, 60, 120])
        void clearRest(userId)
      }
    }

    const timer = window.setInterval(tick, 250)
    tick()
    return () => window.clearInterval(timer)
  }, [endsAt, userId])

  return { rest, remaining }
}

/**
 * The rest as a rule that drains across the bottom edge, with +30 s and Skip
 * beside the clock where the thumb already is. `link` is for every screen but
 * the session: the label takes you back to the workout.
 */
export function RestBar({ rest, remaining, link = false }: RestState & { link?: boolean }) {
  const userId = useUserId()
  const t = useTranslations('session.restTimer')
  if (!rest || remaining === 0 || !userId) return null

  const progress = Math.min(1, remaining / rest.totalSec)

  const label = link ? (
    <>
      {t('backToWorkout')} <ChevronRight size={16} aria-hidden />
    </>
  ) : (
    t('rest')
  )
  const labelClass = 'flex min-h-14 items-center gap-1 pl-5 text-sm text-ink-dim'

  return (
    <div className="border-t border-line bg-surface">
      <div
        className="h-1 bg-plate-yellow transition-[width] duration-200 ease-linear"
        style={{ width: `${progress * 100}%` }}
        role="progressbar"
        aria-label={t('remaining')}
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={rest.totalSec}
      />
      <div className="mx-auto flex max-w-page items-stretch justify-between">
        {link ? (
          <Link href={`/session?id=${rest.sessionId}`} className={labelClass}>
            {label}
          </Link>
        ) : (
          <span className={labelClass}>{label}</span>
        )}
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => void extendRest(userId)}
            className="figure px-3 text-sm text-ink-dim"
          >
            {t('extend', { seconds: EXTEND_SEC })}
          </button>
          <button
            type="button"
            onClick={() => void clearRest(userId)}
            className="px-3 text-sm text-ink-dim"
          >
            {t('skip')}
          </button>
          <span className="figure flex items-center pr-5 pl-1 text-2xl text-plate-yellow">
            {formatRest(remaining)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** The bar with its own hook — for the tab bar, where nothing else asks about the rest. */
export function RestTimer({ link = false }: { link?: boolean }) {
  const state = useRest()
  return <RestBar {...state} link={link} />
}

/**
 * The rest as the screen's state. Between sets you look at the phone for the
 * time, then at what the next set asks; so while the rest runs, the block
 * where the steppers were becomes the clock, set huge and draining, with the
 * next set under it and Skip where Log set was. At zero the steppers return.
 *
 * `restSec` is what the exercise rests between sets, with − and + beside it:
 * the moment you know 90 s is not enough for this lift is while you are
 * waiting through it, so the rest is changed here for good, not once with
 * +30 s. Left out for an exercise that has no rest.
 */
export function RestTakeover({
  rest,
  remaining,
  next,
  restSec,
  onRestSec,
  children,
}: RestState & {
  /** What comes after the rest — 'Set 3 · 77.5 kg × 10'. */
  next: React.ReactNode
  /** The exercise's rest between sets, and where a change goes. */
  restSec?: number | null
  onRestSec?: (restSec: number) => void
  /** About the set just done — how it felt — between the clock and what is next. */
  children?: React.ReactNode
}) {
  const userId = useUserId()
  const t = useTranslations('session.restTimer')
  if (!rest || remaining === 0 || !userId) return null

  const progress = Math.min(1, remaining / rest.totalSec)

  return (
    <section className="mt-4" aria-label={t('rest')}>
      <p className="text-sm text-ink-dim">{t('rest')}</p>
      <p
        className="figure mt-1 text-[5.5rem] leading-none text-plate-yellow"
        role="timer"
        aria-live="off"
        aria-label={t('secondsLeft', { count: remaining })}
      >
        {formatRest(remaining)}
      </p>
      <div className="mt-4 h-1 w-full rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-plate-yellow transition-[width] duration-200 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {children}

      <p className="mt-5 text-sm text-ink-dim">{t('next')}</p>
      <p className="mt-0.5 text-[17px]">{next}</p>

      {restSec != null && onRestSec && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-ink-dim">
            {t('betweenSets')}
            <span className="block text-xs">{t('keptForThis')}</span>
          </span>
          <div className="flex items-stretch overflow-hidden rounded-md border border-line">
            <button
              type="button"
              aria-label={t('less')}
              disabled={restSec < REST_STEP_SEC}
              onClick={() => onRestSec(restSec - REST_STEP_SEC)}
              className="flex w-12 touch-manipulation items-center justify-center text-ink-dim active:bg-surface-high disabled:opacity-40"
            >
              <Minus size={18} aria-hidden />
            </button>
            <span className="figure flex min-w-16 items-center justify-center text-lg" aria-live="polite">
              {t('seconds', { seconds: restSec })}
            </span>
            <button
              type="button"
              aria-label={t('more')}
              onClick={() => onRestSec(restSec + REST_STEP_SEC)}
              className="flex w-12 touch-manipulation items-center justify-center text-ink-dim active:bg-surface-high"
            >
              <Plus size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void extendRest(userId)}
          className="figure h-14 rounded-md border border-line text-lg"
        >
          {t('extend', { seconds: EXTEND_SEC })}
        </button>
        <button
          type="button"
          onClick={() => void clearRest(userId)}
          className="h-14 rounded-md bg-plate-blue text-lg font-semibold text-white transition-colors hover:bg-plate-blue-lift"
        >
          {t('skipRest')}
        </button>
      </div>
    </section>
  )
}

/**
 * The rest carried over from the exercise before. Its last set moves the
 * screen on to the next exercise while the clock runs, and what the rest is
 * for looking at is that exercise's weight and reps; so the clock sits in a
 * strip above the steppers, named after the exercise it follows, instead of
 * taking their place. +30 s and Skip stay in the bar at the bottom.
 */
export function RestCarried({
  rest,
  remaining,
  after,
  children,
}: RestState & {
  /** The exercise the rest follows — the one just finished, not the one on screen. */
  after: string
  /** About the set just done — how it felt — under the clock. */
  children?: React.ReactNode
}) {
  const t = useTranslations('session.restTimer')
  if (!rest || remaining === 0) return null

  const progress = Math.min(1, remaining / rest.totalSec)

  return (
    <section className="mb-5" aria-label={t('restAfter', { name: after })}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ink-dim">{t('restAfter', { name: after })}</p>
        <p
          className="figure shrink-0 text-4xl leading-none text-plate-yellow"
          role="timer"
          aria-live="off"
          aria-label={t('secondsLeft', { count: remaining })}
        >
          {formatRest(remaining)}
        </p>
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-plate-yellow transition-[width] duration-200 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {children}
    </section>
  )
}
