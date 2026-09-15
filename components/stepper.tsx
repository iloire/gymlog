'use client'

import { Minus, Plus } from 'lucide-react'

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

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-sm text-ink-dim">{label}</span>
        {unit && <span className="text-xs text-ink-dim">{unit}</span>}
      </div>

      <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-surface">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, current - step))}
          className="flex w-16 shrink-0 items-center justify-center text-ink-dim active:bg-surface-high"
        >
          <Minus size={20} aria-hidden />
        </button>

        <input
          aria-label={label}
          inputMode="decimal"
          value={value ?? ''}
          placeholder="—"
          onChange={(event) => {
            const next = Number(event.target.value.replace(',', '.'))
            if (Number.isFinite(next)) onChange(next)
          }}
          className="figure h-16 w-full min-w-0 bg-transparent text-center text-4xl outline-none"
        />

        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(current + step)}
          className="flex w-16 shrink-0 items-center justify-center text-ink-dim active:bg-surface-high"
        >
          <Plus size={20} aria-hidden />
        </button>
      </div>
    </div>
  )
}
