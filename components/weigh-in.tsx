'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useLocale } from '@/components/locale-provider'
import { useUserId } from '@/components/session-boot'
import { useUnit } from '@/components/use-unit'
import { getDb } from '@/lib/db/dexie'
import { parseNumber } from '@/lib/format'
import { bodyWeightSeries, today } from '@/lib/queries'
import { recordBodyWeight } from '@/lib/sessions'
import { fromUnit } from '@/lib/units'
import { displayOneDecimal } from '@/lib/weights'

/**
 * Today's weigh-in, on Today. The weight log sits two taps deep under
 * Profile, and a daily habit does not survive that: this is one field and
 * one button, shown until today's reading is in, then gone. The field opens
 * on the last reading, so the usual case is a nudge of a digit and Save.
 */
export function WeighIn() {
  const userId = useUserId()
  const unit = useUnit()
  const locale = useLocale()
  const t = useTranslations('weight.weighIn')
  const [value, setValue] = useState('')

  const state = useLiveQuery(async () => {
    if (!userId) return null
    const date = today()
    const done = await getDb(userId).bodyWeights.where('measuredOn').equals(date).first()
    if (done && done.deletedAt === null) return { done: true as const }
    const latest = (await bodyWeightSeries(userId)).at(-1) ?? null
    return { done: false as const, latest }
  }, [userId])

  if (!userId || !state || state.done) return null

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const weight = parseNumber(value)
    if (!userId || weight === null || weight <= 0) return
    await recordBodyWeight(userId, fromUnit(weight, unit))
    setValue('')
  }

  return (
    <form onSubmit={save} className="mt-6 flex items-center gap-2" aria-label={t('label')}>
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-line bg-surface pl-4">
        <span className="shrink-0 text-sm text-ink-dim">
          {t.rich('prompt', {
            link: (chunks) => (
              <Link href="/weight" className="underline-offset-4 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={state.latest ? displayOneDecimal(state.latest.weightKg, unit, locale) : unit === 'lb' ? '165' : '75'}
          aria-label={t('input', { unit })}
          className="figure h-12 w-full min-w-0 bg-transparent text-right text-xl outline-none"
        />
        <span className="pr-3 text-sm text-ink-dim">{unit}</span>
      </label>
      <button
        type="submit"
        disabled={parseNumber(value) === null}
        className="h-12 shrink-0 rounded-md border border-line px-4 text-sm disabled:opacity-40"
      >
        {t('save')}
      </button>
    </form>
  )
}
