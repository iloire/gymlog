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
 * beside the clock where the thumb already is. The screen's only clock, so it
 * is the one that names what the rest is for: `after` is the exercise just
 * finished, when the screen has already moved on to the next one. `link` is
 * for every screen but the session: the label takes you back to the workout.
 *
 * `children` go under the clock, inside the bar: what is left to say about the
 * exercise the rest follows — how its last set felt, a note on it — so it sits
 * with that exercise's rest, not among the steppers of the one now on screen.
 */
export function RestBar({
  rest,
  remaining,
  link = false,
  after,
  children,
}: RestState & { link?: boolean; after?: string; children?: React.ReactNode }) {
  const userId = useUserId()
  const t = useTranslations('session.restTimer')
  if (!rest || remaining === 0 || !userId) return null

  const progress = Math.min(1, remaining / rest.totalSec)

  const label = link ? (
    <>
      {t('backToWorkout')} <ChevronRight size={16} aria-hidden />
    </>
  ) : after ? (
    <span className="truncate">{t('restAfter', { name: after })}</span>
  ) : (
    t('rest')
  )
  const labelClass = 'flex min-h-14 min-w-0 items-center gap-1 pl-5 text-sm text-ink-dim'

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
        <div className="flex shrink-0 items-stretch">
          <button
            type="button"
            onClick={() => void extendRest(userId)}
            className="figure px-3 text-sm whitespace-nowrap text-ink-dim"
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
      {/* The chips sit on the bar's own surface, so theirs is lifted a step. */}
      {children && (
        <div className="mx-auto max-w-page px-5 pb-4 [&_button[aria-pressed=false]]:bg-surface-high">{children}</div>
      )}
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
 * where the steppers were becomes the clock, set huge and draining, with Skip
 * where Log set was.
 *
 * Everything about the rest and the set it follows — the clock, how that set
 * felt, the rest length, +30 s and Skip — sits in one amber-edged panel, and
 * the next set comes after it, outside: what is over and what is coming read
 * as two things, not one list. At zero the panel goes and the steppers return.
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
  /** About the set just done — how it felt — inside the panel, under the clock. */
  children?: React.ReactNode
}) {
  const userId = useUserId()
  const t = useTranslations('session.restTimer')
  if (!rest || remaining === 0 || !userId) return null

  const progress = Math.min(1, remaining / rest.totalSec)

  return (
    <div className="mt-4">
      <section
        className="rounded-sm border border-plate-yellow/40 bg-plate-yellow/[0.06] p-4"
        aria-label={t('rest')}
      >
        <p className="text-sm text-ink-dim">{t('rest')}</p>
        <p
          className="figure mt-1 text-[4.5rem] leading-none text-plate-yellow"
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

        {restSec != null && onRestSec && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-ink-dim">
              {t('betweenSets')}
              <span className="block text-xs">{t('keptForThis')}</span>
            </span>
            <div className="hold-pair h-11">
              <button
                type="button"
                aria-label={t('less')}
                disabled={restSec < REST_STEP_SEC}
                onClick={() => onRestSec(restSec - REST_STEP_SEC)}
                className="hold-button w-11"
              >
                <Minus size={18} aria-hidden />
              </button>
              <span className="figure flex min-w-16 items-center justify-center text-base" aria-live="polite">
                {t('seconds', { seconds: restSec })}
              </span>
              <button
                type="button"
                aria-label={t('more')}
                onClick={() => onRestSec(restSec + REST_STEP_SEC)}
                className="hold-button w-11"
              >
                <Plus size={18} aria-hidden />
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => void extendRest(userId)} className="btn-quiet figure h-14 text-lg">
            {t('extend', { seconds: EXTEND_SEC })}
          </button>
          <button type="button" onClick={() => void clearRest(userId)} className="btn-primary">
            {t('skipRest')}
          </button>
        </div>
      </section>

      {/* What comes after the rest, outside its panel: the set the squares above already point at. */}
      <p className="mt-5 text-sm text-ink-dim">{t('next')}</p>
      <p className="mt-0.5 text-lg">{next}</p>
    </div>
  )
}
