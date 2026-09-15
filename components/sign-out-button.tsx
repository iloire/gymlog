'use client'

import { signOut } from 'next-auth/react'

import { useUserId } from '@/components/session-boot'
import { destroyDb } from '@/lib/db/dexie'

/**
 * Signing out has to wipe the local database as well as the cookie — this app
 * keeps a full copy of your training log on the device, and a shared phone
 * must not hand it to the next person who signs in.
 */
export function SignOutButton() {
  const userId = useUserId()

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          localStorage.removeItem('gymlog:userId')
        } catch {
          // Nothing to clear.
        }
        if (userId) await destroyDb(userId)
        await signOut({ callbackUrl: '/login' })
      }}
      className="h-12 w-full rounded-md border border-line text-sm text-ink-dim"
    >
      Sign out
    </button>
  )
}
