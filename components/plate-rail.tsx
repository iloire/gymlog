'use client'

import { useState } from 'react'

import { BARS, loadBar, readBar, saveBar, type Bar, type Plate } from '@/lib/plates'

/**
 * Each plate in the colour it is on a competition bar — which is already the
 * app's palette, so 25, 20 and 15 are the plate tokens. 10 is green and 5 is
 * white by the same code; the change plates are drawn small and dim.
 */
const PLATE_STYLE: Record<Plate, { className: string; color?: string }> = {
  25: { className: 'h-9 w-3', color: 'var(--plate-red)' },
  20: { className: 'h-9 w-3', color: 'var(--plate-blue)' },
  15: { className: 'h-8 w-2.5', color: 'var(--plate-yellow)' },
  10: { className: 'h-7 w-2.5', color: '#1f8a4c' },
  5: { className: 'h-6 w-2', color: 'var(--ink)' },
  2.5: { className: 'h-5 w-1.5 bg-ink-dim' },
  1.25: { className: 'h-4 w-1 bg-ink-dim' },
}

/**
 * The plates to load per side for the weight in the stepper, drawn as plates
 * on the bar. The question at the rack is never "77.5 kg", it is "what goes
 * on". Tapping the bar's weight switches between the 20 and 15 kg bar.
 */
export function PlateRail({ weightKg }: { weightKg: number | null }) {
  const [bar, setBar] = useState<Bar>(readBar)

  function toggleBar() {
    const next = BARS[(BARS.indexOf(bar) + 1) % BARS.length] ?? 20
    saveBar(next)
    setBar(next)
  }

  if (weightKg === null || weightKg <= 0) return null

  const loading = loadBar(weightKg, bar)
  const label = loading.perSide.map((plate) => `${plate}`).join(' + ')

  return (
    <div className="flex items-center gap-3 px-1 text-xs text-ink-dim" aria-label="Plates per side">
      <button
        type="button"
        onClick={toggleBar}
        aria-label={`${bar} kg bar, tap to change`}
        className="figure shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[11px]"
      >
        {bar} bar
      </button>

      {weightKg < bar ? (
        <span>Under the bar</span>
      ) : loading.perSide.length === 0 ? (
        <span>Empty bar</span>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex items-end gap-0.5" aria-hidden>
            {loading.perSide.map((plate, index) => {
              const style = PLATE_STYLE[plate]
              return (
                <span
                  key={index}
                  className={`shrink-0 rounded-[2px] ${style.className}`}
                  style={style.color ? { backgroundColor: style.color } : undefined}
                />
              )
            })}
          </span>
          <span className="figure truncate text-ink">{label}</span>
          <span className="shrink-0">a side</span>
        </span>
      )}

      {!loading.exact && weightKg >= bar && (
        <span className="ml-auto shrink-0">makes {loading.totalKg} kg</span>
      )}
    </div>
  )
}
