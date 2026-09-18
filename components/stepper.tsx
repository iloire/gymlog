'use client'

import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { parseNumber } from '@/lib/format'

/** Hold a button this long before it starts repeating, then repeat this often. */
const HOLD_DELAY_MS = 400
const HOLD_REPEAT_MS = 110

/**
 * Numbers go in with the thumb, not the keyboard — chalky hands and a phone
 * keypad do not mix. The field still accepts typing for the odd 42.5. Holding
 * − or + repeats it: an empty bar to 60 kg was twenty-four taps.
 */
export function Stepper({
  label,
  value,
  step,
  min = 0,
  unit,
  onChange,
}: {
  label: string
  value: number | null
  step: number
  min?: number
  unit?: string
  onChange: (next: number) => void
}) {
  const current = value ?? 0
  // What is in the field while it has focus. Showing the parsed number instead
  // turned '42.' straight back into '42', so 42.5 could only ever be typed as 425.
  const [typing, setTyping] = useState<string | null>(null)

  // The value the repeat reads, so a held button keeps counting from where
  // the last tick left it rather than from the render it started on.
  const latest = useRef(current)
  useEffect(() => {
    latest.current = current
  }, [current])
  const hold = useRef<{ delay: number; repeat: number } | null>(null)

  function stepBy(delta: number) {
    const next = Number((latest.current + delta).toFixed(2))
    if (next < min) return
    latest.current = next
    onChange(next)
  }

  function release() {
    if (!hold.current) return
    window.clearTimeout(hold.current.delay)
    window.clearInterval(hold.current.repeat)
    hold.current = null
  }

  function press(delta: number) {
    release()
    stepBy(delta)
    const delay = window.setTimeout(() => {
      const repeat = window.setInterval(() => stepBy(delta), HOLD_REPEAT_MS)
      if (hold.current) hold.current.repeat = repeat
    }, HOLD_DELAY_MS)
    hold.current = { delay, repeat: 0 }
  }

  useEffect(() => release, [])

  const buttonClass =
    'flex w-16 shrink-0 touch-manipulation select-none items-center justify-center text-ink-dim active:bg-surface-high'

  return (
    // The label rides inside the field, above the number: a row of its own per
    // stepper was enough to push the Log button below the fold.
    <div className="flex w-full items-stretch overflow-hidden rounded-md border border-line bg-surface">
      <HoldButton label={`Decrease ${label}`} onPress={() => press(-step)} onRelease={release} className={buttonClass}>
        <Minus size={20} aria-hidden />
      </HoldButton>

      <label className="flex min-w-0 flex-1 flex-col items-center pt-2">
        <span className="text-xs leading-none text-ink-dim">
          {label}
          {unit && ` ${unit}`}
        </span>
        <input
          aria-label={label}
          inputMode="decimal"
          value={typing ?? value ?? ''}
          placeholder="—"
          onFocus={(event) => {
            setTyping(`${value ?? ''}`)
            // Typing replaces the number rather than adding digits to it.
            event.target.select()
          }}
          onChange={(event) => {
            setTyping(event.target.value)
            const next = parseNumber(event.target.value)
            if (next !== null && next >= min) onChange(next)
          }}
          onBlur={() => setTyping(null)}
          className="figure h-11 w-full min-w-0 bg-transparent text-center text-4xl outline-none"
        />
      </label>

      <HoldButton label={`Increase ${label}`} onPress={() => press(step)} onRelease={release} className={buttonClass}>
        <Plus size={20} aria-hidden />
      </HoldButton>
    </div>
  )
}

/**
 * A button that fires on pointer down and repeats while held. A keyboard
 * activation arrives as a click with no pointer, so it still steps once.
 */
function HoldButton({
  label,
  onPress,
  onRelease,
  className,
  children,
}: {
  label: string
  onPress: () => void
  onRelease: () => void
  className: string
  children: React.ReactNode
}) {
  const pointer = useRef(false)

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        // Only the primary button or a touch; a right-click must not count.
        if (event.button !== 0) return
        pointer.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        onPress()
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      onClick={() => {
        // The click that follows a pointer press has already been counted.
        if (pointer.current) {
          pointer.current = false
          return
        }
        onPress()
        onRelease()
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={className}
    >
      {children}
    </button>
  )
}
