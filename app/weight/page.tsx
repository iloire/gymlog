'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { SignOutButton } from '@/components/sign-out-button'
import { WeightChart } from '@/components/weight-chart'
import { deleteRow } from '@/lib/db/write'
import { publicEnv } from '@/lib/env.public'
import { bodyWeightSeries, today } from '@/lib/queries'
import { recordBodyWeight } from '@/lib/sessions'
import { bodyWeightId } from '@/lib/id'

export default function WeightPage() {
  const userId = useUserId()
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today())

  const series = useLiveQuery(
    async () => (userId ? bodyWeightSeries(userId) : []),
    [userId],
    [],
  )

  const latest = series.at(-1)
  const first = series[0]
  const change = latest && first ? latest.rolling - first.rolling : 0

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    const weight = Number(value.replace(',', '.'))
    if (!Number.isFinite(weight) || weight <= 0) return
    await recordBodyWeight(userId, weight, date)
    setValue('')
  }

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Weight</h1>

        {latest ? (
          <p className="mt-2 text-sm text-ink-dim">
            {latest.rolling.toFixed(1)} kg on a 7-day average
            {series.length > 6 && change !== 0 && (
              <> — {change > 0 ? 'up' : 'down'} {Math.abs(change).toFixed(1)} kg since you started</>
            )}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-dim">
            Weigh yourself at the same time of day. One reading means nothing; the trend is the
            thing.
          </p>
        )}

        {series.length > 1 && <WeightChart series={series} />}

        <form onSubmit={submit} className="mt-8 border-t border-line pt-5">
          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-ink-dim">Weight (kg)</span>
              <input
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={latest ? latest.weightKg.toFixed(1) : '75'}
                className="figure h-14 w-full rounded-md border border-line bg-surface px-3 text-2xl outline-none focus-visible:border-plate-blue-lift"
              />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-ink-dim">Date</span>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(event) => setDate(event.target.value)}
                className="h-14 w-full rounded-md border border-line bg-surface px-3 outline-none focus-visible:border-plate-blue-lift"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={value.trim() === ''}
            className="mt-3 h-14 w-full rounded-md bg-plate-blue text-base font-semibold text-white disabled:opacity-40"
          >
            Save weight
          </button>
        </form>

        {series.length > 0 && (
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {[...series].reverse().slice(0, 30).map((entry) => (
              <li key={entry.measuredOn} className="flex items-center justify-between py-3">
                <span className="text-sm text-ink-dim">{entry.measuredOn}</span>
                <span className="flex items-center gap-4">
                  <span className="figure text-lg">{entry.weightKg.toFixed(1)}</span>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.measuredOn}`}
                    onClick={() =>
                      userId &&
                      void deleteRow(userId, 'bodyWeights', bodyWeightId(userId, entry.measuredOn))
                    }
                    className="p-1 text-ink-dim"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-10 border-t border-line pt-5">
          <SignOutButton />
          {publicEnv.commitSha && (
            <p className="mt-4 text-center text-[11px] text-ink-dim">{publicEnv.commitSha}</p>
          )}
        </footer>
      </main>
      <Nav />
    </>
  )
}
