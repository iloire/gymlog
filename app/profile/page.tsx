'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSyncExternalStore, type ReactNode } from 'react'

import { useIsAdmin } from '@/components/admin/use-is-admin'
import { useEquipment } from '@/components/equipment-picker'
import { Nav } from '@/components/nav'
import { useUserId } from '@/components/session-boot'
import { SignOutButton } from '@/components/sign-out-button'
import { useUnit } from '@/components/use-unit'
import { publicEnv } from '@/lib/env.public'
import { presetFor } from '@/lib/equipment'
import { daysAgo } from '@/lib/history'
import { bodyWeightSeries } from '@/lib/queries'
import { readStyle, readTheme, subscribeTheme } from '@/lib/theme'
import { formatWeight, UNIT_NAMES } from '@/lib/units'

const THEME_LABEL = { dark: 'dark', light: 'light', system: 'follows the phone' } as const

/**
 * One row per setting, the current value as its second line: what is set is
 * read in a glance, and the page to change it is one tap. The value comes from
 * wherever the setting lives — the device for appearance and equipment, the
 * account for the unit, the log for bodyweight.
 */
export default function ProfilePage() {
  // The session comes from the auth endpoint, so with no signal there is no
  // name or email to show — the rest of the page works regardless.
  const { data: session } = useSession()
  const user = session?.user
  const userId = useUserId()
  const isAdmin = useIsAdmin()

  // Device choices exist only in the browser; the server snapshot is null so
  // the row's value line is empty, never wrong, until hydration.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null)
  const style = useSyncExternalStore(subscribeTheme, readStyle, () => null)
  const equipment = useEquipment()
  const unit = useUnit()
  const latestWeight = useLiveQuery(
    async () => (userId ? ((await bodyWeightSeries(userId)).at(-1) ?? null) : null),
    [userId],
    null,
  )

  const appearance = style && theme ? `${capitalise(style)}, ${THEME_LABEL[theme]}` : ''
  const gym =
    equipment === null
      ? 'Not set yet'
      : (presetFor(equipment)?.name ?? `${equipment.length} ${equipment.length === 1 ? 'item' : 'items'}`)
  const bodyweight = latestWeight
    ? `${formatWeight(latestWeight.weightKg, unit)} · ${daysAgo(latestWeight.measuredOn)}`
    : 'No readings yet'

  return (
    <>
      <main className="mx-auto w-full max-w-page flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Profile</h1>

        {user && (
          <section className="mt-6 border-y border-line py-4">
            {user.name && <p className="text-lg font-semibold">{user.name}</p>}
            {user.email && <p className="text-sm text-ink-dim">{user.email}</p>}
          </section>
        )}

        <ul className={`divide-y divide-line border-b border-line ${user ? '' : 'mt-6 border-t'}`}>
          <Row href="/profile/appearance" title="Appearance" value={appearance} />
          <Row href="/profile/equipment" title="Equipment" value={gym} />
          <Row href="/profile/units" title="Units" value={`${UNIT_NAMES[unit]} (${unit})`} />
          <Row href="/weight" title="Bodyweight" value={bodyweight} />
          <Row href="/profile/data" title="Your data" value="Export and import, one file" />
          {/* A plain <a>: the token page is server-rendered and online-only, so
              visiting Profile must not prefetch it. */}
          <Row href="/profile/api" title="API access" value="Tokens for ChatGPT, Claude or a script" plain />
          {/* Likewise the server-rendered admin panel. */}
          {isAdmin && <Row href="/admin" title="Admin" value="Every account" plain />}
        </ul>

        <footer className="mt-8">
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

/** A setting: its name, what it is set to, and the chevron that says it opens. */
function Row({ href, title, value, plain = false }: { href: string; title: string; value: ReactNode; plain?: boolean }) {
  const className = 'flex items-center gap-3 py-3.5 -mx-2 px-2 rounded-sm active:bg-surface-high'
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{title}</span>
        <span className="block min-h-5 truncate text-sm text-ink-dim">{value}</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-dim" />
    </>
  )
  return (
    <li>
      {plain ? (
        <a href={href} className={className}>
          {inner}
        </a>
      ) : (
        <Link href={href} className={className}>
          {inner}
        </Link>
      )}
    </li>
  )
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
