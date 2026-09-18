'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useState } from 'react'

import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { parseNumber } from '@/lib/format'
import { bodyWeightSeries, today } from '@/lib/queries'
import { recordBodyWeight } from '@/lib/sessions'

/**
 * Today's weigh-in, on Today. The weight log sits two taps deep under
 * Profile, and a daily habit does not survive that: this is one field and
 * one button, shown until today's reading is in, then gone. The field opens
 * on the last reading, so the usual case is a nudge of a digit and Save.
 */
export function WeighIn() {
  const userId = useUserId()
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
    await recordBodyWeight(userId, weight)
    setValue('')
  }

  return (
    <form onSubmit={save} className="mt-6 flex items-center gap-2" aria-label="Weigh-in">
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-line bg-surface pl-4">
        <span className="shrink-0 text-sm text-ink-dim">
          <Link href="/weight" className="underline-offset-4 hover:underline">
            Weight
          </Link>{' '}
          today?
        </span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={state.latest ? state.latest.weightKg.toFixed(1) : '75'}
          aria-label="Bodyweight in kg"
          className="figure h-12 w-full min-w-0 bg-transparent text-right text-xl outline-none"
        />
        <span className="pr-3 text-sm text-ink-dim">kg</span>
      </label>
      <button
        type="submit"
        disabled={parseNumber(value) === null}
        className="h-12 shrink-0 rounded-md border border-line px-4 text-sm disabled:opacity-40"
      >
        Save
      </button>
    </form>
  )
}
