'use client'

import { Minus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { parseNumber } from '@/lib/format'

/** Hold a button this long before it starts repeating, then repeat this often. */
const HOLD_DELAY_MS = 400
const HOLD_REPEAT_MS = 110

/**
 * Numbers go in with the thumb, not the keyboard — chalky hands and a phone
 * keypad do not mix. The field still accepts typing for the odd 42.5. Holding
 * − or + repeats it: an empty bar to 60 kg was twenty-four taps.
 *
 * The number is the content, so it gets the left of the row at the largest
 * size the controls allow, with its label small above it and the unit beside
 * it. − and + sit together on the right as one control: a thumb changes the
 * number without shifting its grip, where a − on the far left had it crossing
 * the screen for every drop.
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
  const t = useTranslations('session.stepper')
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

  return (
    <div className="flex h-[4.25rem] w-full items-stretch gap-2">
      {/* The label rides inside the field, above the number: a row of its own per
          stepper was enough to push the Log button below the fold. The input sizes
          to its digits off a hidden twin in the same grid cell. */}
      <label className="flex min-w-0 flex-1 flex-col justify-center rounded-md bg-surface px-4 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-plate-blue-lift">
        <span className="text-xs leading-none text-ink-dim">{label}</span>
        <span className="mt-1 flex min-w-0 items-baseline gap-1.5">
          <span className="grid min-w-0 shrink">
            <span aria-hidden className="figure invisible col-start-1 row-start-1 min-w-[1.5ch] text-[2.5rem] leading-none whitespace-pre">
              {typing ?? value ?? '—'}
            </span>
            <input
              aria-label={label}
              inputMode="decimal"
              size={1}
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
              className="figure col-start-1 row-start-1 w-full min-w-0 bg-transparent text-[2.5rem] leading-none outline-none placeholder:text-ink-dim"
            />
          </span>
          {unit && <span className="shrink-0 text-base text-ink-dim">{unit}</span>}
        </span>
      </label>

      <div className="hold-pair">
        <HoldButton label={t('decrease', { label })} onPress={() => press(-step)} onRelease={release} className="hold-button">
          <Minus size={22} aria-hidden />
        </HoldButton>
        <HoldButton label={t('increase', { label })} onPress={() => press(step)} onRelease={release} className="hold-button">
          <Plus size={22} aria-hidden />
        </HoldButton>
      </div>
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
  disabled,
  children,
}: {
  label: string
  onPress: () => void
  onRelease: () => void
  className: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const pointer = useRef(false)

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
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
