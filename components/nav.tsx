'use client'

import { Dumbbell, History, Library, ListChecks, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { OpenWorkoutBar } from '@/components/open-workout-bar'
import { RestBar, useRest } from '@/components/rest-timer'

const items = [
  { href: '/', label: 'Today', icon: Dumbbell },
  { href: '/workouts', label: 'Plan', icon: ListChecks },
  { href: '/history', label: 'History', icon: History },
  { href: '/exercises', label: 'Exercises', icon: Library },
  { href: '/profile', label: 'Profile', icon: UserRound },
]

// Pages with no tab of their own, reached from the tab named here. Workouts,
// the week and the premade programmes are one tab; components/plan-tabs.tsx
// switches between them.
const parents: Record<string, string> = {
  '/weight': '/profile',
  '/program': '/workouts',
  '/programmes': '/workouts',
}

export function Nav({ children }: { children?: React.ReactNode }) {
  const path = usePathname()
  const pathname = parents[path] ?? path
  const rest = useRest()
  const resting = rest.rest !== null && rest.remaining > 0

  return (
    // A rest started on the session screen keeps counting above the tabs, so
    // checking an exercise or the week mid-rest does not lose the clock; with
    // no rest running, the workout under way keeps its own way back here.
    // `children` is a screen's own bar for the same spot, such as an undo toast.
    <div className="sticky bottom-0 z-10">
      {children}
      {resting ? <RestBar {...rest} link /> : path !== '/' && <OpenWorkoutBar />}
      <nav className="border-t border-line bg-ground/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-lg">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-xs ${
                    active ? 'text-ink' : 'text-ink-dim'
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  {label}
                  <span
                    className={`h-0.5 w-6 rounded-full ${active ? 'bg-plate-blue-lift' : 'bg-transparent'}`}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
