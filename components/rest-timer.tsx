'use client'

import { useEffect, useRef, useState } from 'react'

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
 * Counts down from a timestamp rather than ticking a counter, so backgrounding
 * the phone between sets does not stop or drift the clock.
 */
export function RestTimer({ endsAt, onDone }: { endsAt: number | null; onDone: () => void }) {
  const [state, setState] = useState<{ remaining: number; total: number }>({
    remaining: 0,
    total: 0,
  })
  const fired = useRef(false)

  useEffect(() => {
    if (!endsAt) return

    fired.current = false
    const total = Math.max(1, Math.round((endsAt - Date.now()) / 1000))

    const tick = () => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      setState({ remaining, total })

      if (remaining === 0 && !fired.current) {
        fired.current = true
        beep()
        navigator.vibrate?.([120, 60, 120])
        onDone()
      }
    }

    const timer = window.setInterval(tick, 250)
    tick()
    return () => window.clearInterval(timer)
  }, [endsAt, onDone])

  if (!endsAt || state.remaining === 0) return null

  const minutes = Math.floor(state.remaining / 60)
  const seconds = `${state.remaining % 60}`.padStart(2, '0')
  const progress = state.remaining / state.total

  return (
    <div className="border-t border-line bg-surface">
      <div
        className="h-1 bg-plate-yellow transition-[width] duration-200 ease-linear"
        style={{ width: `${progress * 100}%` }}
        role="progressbar"
        aria-label="Rest remaining"
        aria-valuenow={state.remaining}
        aria-valuemin={0}
        aria-valuemax={state.total}
      />
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-sm text-ink-dim">Rest</span>
        <span className="figure text-2xl text-plate-yellow">
          {minutes}:{seconds}
        </span>
      </div>
    </div>
  )
}
