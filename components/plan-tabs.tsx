'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/workouts', label: 'Workouts' },
  { href: '/program', label: 'Week' },
  { href: '/programmes', label: 'Programmes' },
]

/**
 * The three screens behind the Plan tab: what you train, which days you train
 * it, and the premade weeks you can copy both from. Sits above the heading on
 * each of them; the editor and a programme's preview have a back link instead.
 */
export function PlanTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Plan" className="mb-6 flex rounded-md border border-line p-1">
      {tabs.map(({ href, label }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex h-10 flex-1 items-center justify-center rounded-sm text-sm ${
              active ? 'bg-surface font-semibold text-ink' : 'text-ink-dim'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
