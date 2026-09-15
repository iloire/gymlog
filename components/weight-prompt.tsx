'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

import { useUserId } from '@/components/session-boot'
import { getDb } from '@/lib/db/dexie'
import { today } from '@/lib/queries'
import { recordBodyWeight } from '@/lib/sessions'

/** One tap from the home screen, and only while today's weight is missing. */
export function WeightPrompt() {
  const userId = useUserId()
  const [value, setValue] = useState('')

  const state = useLiveQuery(async () => {
    if (!userId) return null
    const db = getDb(userId)
    const all = (await db.bodyWeights.toArray())
      .filter((row) => row.deletedAt === null)
      .sort((a, b) => b.measuredOn.localeCompare(a.measuredOn))

    return { todays: all.find((row) => row.measuredOn === today()) ?? null, latest: all[0] ?? null }
  }, [userId])

  if (!userId || !state || state.todays) return null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const weight = Number(value.replace(',', '.'))
    if (!Number.isFinite(weight) || weight <= 0) return
    await recordBodyWeight(userId!, weight)
    setValue('')
  }

  return (
    <form onSubmit={submit} className="mt-10 border-t border-line pt-5">
      <label htmlFor="bodyweight" className="block text-sm text-ink-dim">
        Today&apos;s bodyweight
        {state.latest && ` — last was ${state.latest.weightKg} kg`}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="bodyweight"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={state.latest ? String(state.latest.weightKg) : '75'}
          className="figure h-14 w-32 rounded-md border border-line bg-surface px-3 text-2xl outline-none focus-visible:border-plate-blue-lift"
        />
        <button
          type="submit"
          disabled={value.trim() === ''}
          className="h-14 flex-1 rounded-md border border-line text-base font-semibold disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  )
}
