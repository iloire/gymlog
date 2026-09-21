'use client'

import { Dumbbell, Library, ListChecks, TrendingUp, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { OpenWorkoutBar } from '@/components/open-workout-bar'
import { RestBar, useRest } from '@/components/rest-timer'

const items = [
  { href: '/', label: 'today', icon: Dumbbell },
  { href: '/workouts', label: 'plan', icon: ListChecks },
  { href: '/history', label: 'progress', icon: TrendingUp },
  { href: '/exercises', label: 'exercises', icon: Library },
  { href: '/profile', label: 'profile', icon: UserRound },
] as const

// Pages with no tab of their own, reached from the tab named here. The
// premade programmes are browsed from the Plan tab.
const parents: Record<string, string> = {
  '/weight': '/profile',
  '/programmes': '/workouts',
}

// `tab` names the tab to light when a screen is reached from more than one,
// such as an exercise opened from Progress.
export function Nav({ children, tab }: { children?: React.ReactNode; tab?: string }) {
  const t = useTranslations('common.nav')
  const path = usePathname()
  const pathname = tab ?? parents[path] ?? path
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
        <ul className="mx-auto flex max-w-page">
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
                  {t(label)}
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
