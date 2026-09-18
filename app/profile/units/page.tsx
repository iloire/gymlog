'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { Nav } from '@/components/nav'
import { useSync, useUserId } from '@/components/session-boot'
import { useUnit } from '@/components/use-unit'
import { setUnit } from '@/lib/sync/client'
import { UNIT_NAMES, UNITS, type Unit } from '@/lib/units'

const EXAMPLE: Record<Unit, string> = { kg: '60 · 77.5 · 100', lb: '135 · 185 · 225' }

/**
 * Kilograms or pounds. An account setting, not a device one: you think in one
 * unit wherever you are, so it goes up with the next sync and the other phone
 * follows. Weights stay kilograms underneath; only what you see and type
 * changes.
 */
export default function UnitsPage() {
  const userId = useUserId()
  const unit = useUnit()
  const { syncNow } = useSync()

  async function choose(next: Unit) {
    if (!userId || next === unit) return
    await setUnit(userId, next)
    void syncNow()
  }

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <Link href="/profile" className="flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={18} aria-hidden />
          Profile
        </Link>
        <h1 className="figure mt-2 text-4xl">Units</h1>
        <p className="mt-2 text-sm text-ink-dim">
          How every weight is shown and typed: the steppers, the plates, the charts, your bodyweight.
        </p>

        <fieldset className="mt-8">
          <legend className="sr-only">Unit</legend>
          <div className="grid grid-cols-2 gap-2">
            {UNITS.map((value) => (
              <label
                key={value}
                className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface text-sm text-ink-dim has-checked:border-plate-blue-lift has-checked:text-ink has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="unit"
                  value={value}
                  checked={unit === value}
                  onChange={() => void choose(value)}
                  className="sr-only"
                />
                <span className="figure text-3xl leading-none text-ink">{value}</span>
                <span>{UNIT_NAMES[value]}</span>
                <span className="figure text-xs">{EXAMPLE[value]}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-dim">
            Saved to your account, so every device signed in as you shows the same. What you have
            already logged is kept as it was and shown in the unit you pick.
          </p>
        </fieldset>
      </main>
      <Nav />
    </>
  )
}
