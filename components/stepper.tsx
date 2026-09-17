'use client'

import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'

import { parseNumber } from '@/lib/format'

/**
 * Numbers go in with the thumb, not the keyboard — chalky hands and a phone
 * keypad do not mix. The field still accepts typing for the odd 42.5.
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

  return (
    // The label rides inside the field, above the number: a row of its own per
    // stepper was enough to push the Log button below the fold.
    <div className="flex w-full items-stretch overflow-hidden rounded-md border border-line bg-surface">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(Math.max(min, current - step))}
        className="flex w-16 shrink-0 items-center justify-center text-ink-dim active:bg-surface-high"
      >
        <Minus size={20} aria-hidden />
      </button>

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

      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(current + step)}
        className="flex w-16 shrink-0 items-center justify-center text-ink-dim active:bg-surface-high"
      >
        <Plus size={20} aria-hidden />
      </button>
    </div>
  )
}
