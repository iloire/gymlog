'use client'

import { CalendarDays, Dumbbell, Library, ListChecks, Scale } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/', label: 'Today', icon: Dumbbell },
  { href: '/workouts', label: 'Workouts', icon: ListChecks },
  { href: '/program', label: 'Week', icon: CalendarDays },
  { href: '/exercises', label: 'Exercises', icon: Library },
  { href: '/weight', label: 'Weight', icon: Scale },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="sticky bottom-0 z-10 border-t border-line bg-ground/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${
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
  )
}
