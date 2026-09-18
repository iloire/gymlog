'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { useUserId } from '@/components/session-boot'
import { clearRest, currentRest, extendRest, EXTEND_SEC } from '@/lib/rest'

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

/**
 * Counts down from a stored timestamp rather than ticking a counter, so neither
 * backgrounding the phone nor leaving the session screen stops or drifts the
 * clock. The rest itself lives in lib/rest.ts; this only draws it, wherever it
 * is mounted, with +30 s and Skip on the bar where the thumb already is. `link`
 * is for every screen but the session: the label takes you back to the workout.
 */
export function RestTimer({ link = false }: { link?: boolean }) {
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

  if (!rest || remaining === 0 || !userId) return null

  const minutes = Math.floor(remaining / 60)
  const seconds = `${remaining % 60}`.padStart(2, '0')
  const progress = Math.min(1, remaining / rest.totalSec)

  const label = link ? (
    <>
      Back to workout <ChevronRight size={16} aria-hidden />
    </>
  ) : (
    'Rest'
  )
  const labelClass = 'flex min-h-14 items-center gap-1 pl-5 text-sm text-ink-dim'

  return (
    <div className="border-t border-line bg-surface">
      <div
        className="h-1 bg-plate-yellow transition-[width] duration-200 ease-linear"
        style={{ width: `${progress * 100}%` }}
        role="progressbar"
        aria-label="Rest remaining"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={rest.totalSec}
      />
      <div className="mx-auto flex max-w-lg items-stretch justify-between">
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
            +{EXTEND_SEC} s
          </button>
          <button
            type="button"
            onClick={() => void clearRest(userId)}
            className="px-3 text-sm text-ink-dim"
          >
            Skip
          </button>
          <span className="figure flex items-center pr-5 pl-1 text-2xl text-plate-yellow">
            {minutes}:{seconds}
          </span>
        </div>
      </div>
    </div>
  )
}
