'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useUnit } from '@/components/use-unit'
import { PLATE_SETS, loadBar, readBar, saveBar } from '@/lib/plates'
import { displayWeight, type Unit } from '@/lib/units'

/**
 * Each plate in the colour it is on a competition bar — which is already the
 * app's palette, so 25, 20 and 15 are the plate tokens. 10 is green and 5 is
 * white by the same code; the change plates are drawn small and dim. Pound
 * plates follow their own calibrated colours: 45 blue, 35 yellow, 25 green.
 */
const PLATE_STYLE: Record<Unit, Record<number, { className: string; color?: string }>> = {
  kg: {
    25: { className: 'h-9 w-3', color: 'var(--plate-red)' },
    20: { className: 'h-9 w-3', color: 'var(--plate-blue)' },
    15: { className: 'h-8 w-2.5', color: 'var(--plate-yellow)' },
    10: { className: 'h-7 w-2.5', color: '#1f8a4c' },
    5: { className: 'h-6 w-2', color: 'var(--ink)' },
    2.5: { className: 'h-5 w-1.5 bg-ink-dim' },
    1.25: { className: 'h-4 w-1 bg-ink-dim' },
  },
  lb: {
    45: { className: 'h-9 w-3', color: 'var(--plate-blue)' },
    35: { className: 'h-8 w-2.5', color: 'var(--plate-yellow)' },
    25: { className: 'h-7 w-2.5', color: '#1f8a4c' },
    10: { className: 'h-6 w-2', color: 'var(--ink)' },
    5: { className: 'h-5 w-1.5 bg-ink-dim' },
    2.5: { className: 'h-4 w-1 bg-ink-dim' },
  },
}

/**
 * The plates to load per side for the weight in the stepper, drawn as plates
 * on the bar. The question at the rack is never "77.5 kg", it is "what goes
 * on". Tapping the bar's weight switches between the men's and the women's
 * bar — 20 and 15 kg, or 45 and 35 lb.
 */
export function PlateRail({ weightKg }: { weightKg: number | null }) {
  const unit = useUnit()
  const t = useTranslations('session.plates')
  const { bars } = PLATE_SETS[unit]
  const [chosen, setBar] = useState<number | null>(null)
  const bar = chosen !== null && bars.includes(chosen) ? chosen : readBar(unit)

  function toggleBar() {
    const next = bars[(bars.indexOf(bar) + 1) % bars.length] ?? bars[0]!
    saveBar(next)
    setBar(next)
  }

  if (weightKg === null || weightKg <= 0) return null

  const weight = displayWeight(weightKg, unit)
  const loading = loadBar(weight, bar, unit)
  const label = loading.perSide.map((plate) => `${plate}`).join(' + ')

  return (
    <div className="flex items-center gap-3 px-1 text-xs text-ink-dim" aria-label={t('perSide')}>
      <button
        type="button"
        onClick={toggleBar}
        aria-label={t('barLabel', { bar, unit })}
        className="figure shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[11px]"
      >
        {t('bar', { bar })}
      </button>

      {weight < bar ? (
        <span>{t('underBar')}</span>
      ) : loading.perSide.length === 0 ? (
        <span>{t('emptyBar')}</span>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex items-end gap-0.5" aria-hidden>
            {loading.perSide.map((plate, index) => {
              const style = PLATE_STYLE[unit][plate] ?? { className: 'h-4 w-1 bg-ink-dim' }
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
          <span className="shrink-0">{t('aSide')}</span>
        </span>
      )}

      {!loading.exact && weight >= bar && (
        <span className="ml-auto shrink-0">{t('makes', { total: loading.total, unit })}</span>
      )}
    </div>
  )
}
