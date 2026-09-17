'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'

import { useIsAdmin } from '@/components/admin/use-is-admin'
import { EquipmentPicker } from '@/components/equipment-picker'
import { Nav } from '@/components/nav'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemePicker } from '@/components/theme-picker'
import { publicEnv } from '@/lib/env.public'

export default function ProfilePage() {
  // The session comes from the auth endpoint, so with no signal there is no
  // name or email to show — the rest of the page works regardless.
  const { data: session } = useSession()
  const user = session?.user
  const isAdmin = useIsAdmin()

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-6">
        <h1 className="figure text-4xl">Profile</h1>

        {user && (
          <section className="mt-6 border-y border-line py-4">
            {user.name && <p className="text-lg font-semibold">{user.name}</p>}
            {user.email && <p className="text-sm text-ink-dim">{user.email}</p>}
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-1 text-xl font-semibold">Bodyweight</h2>
          <p className="mb-4 text-sm text-ink-dim">
            Your weigh-ins and the 7-day trend. Today&apos;s weight is asked for on Today.
          </p>
          <Link
            href="/weight"
            className="flex h-12 w-full items-center justify-center rounded-md border border-line text-sm"
          >
            Weight log
          </Link>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold">Appearance</h2>
          <ThemePicker />
        </section>

        <section className="mt-8">
          <h2 className="mb-1 text-xl font-semibold">Equipment</h2>
          <p className="mb-4 text-sm text-ink-dim">
            What your gym has, so premade programmes swap in exercises you can do.
          </p>
          <EquipmentPicker />
        </section>

        <section className="mt-8">
          <h2 className="mb-1 text-xl font-semibold">API access</h2>
          <p className="mb-4 text-sm text-ink-dim">
            Tokens that let ChatGPT, Claude or another tool read your log or edit your workouts.
          </p>
          {/* A plain <a>: the token page is server-rendered and online-only, so
              visiting Profile must not prefetch it. */}
          <a
            href="/profile/api"
            className="flex h-12 w-full items-center justify-center rounded-md border border-line text-sm"
          >
            Manage API tokens
          </a>
        </section>

        <footer className="mt-10 border-t border-line pt-5">
          {/* A plain <a>, not <Link>, so the page never prefetches the
              server-rendered admin panel. */}
          {isAdmin && (
            <a
              href="/admin"
              className="mb-3 flex h-12 w-full items-center justify-center rounded-md border border-line text-sm text-ink-dim"
            >
              Admin
            </a>
          )}
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
