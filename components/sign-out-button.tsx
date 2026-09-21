'use client'

import { signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useSync } from '@/components/session-boot'
import { destroyDb, getDb } from '@/lib/db/dexie'

/**
 * Signing out has to wipe the local database as well as the cookie — this app
 * keeps a full copy of your training log on the device, and a shared phone
 * must not hand it to the next person who signs in.
 *
 * Which is why it first makes sure the log is on the server. Signing out in a
 * basement after a workout used to destroy every set that had not synced: now
 * it syncs first when it can, and with changes still waiting it stops and says
 * how many, so losing them is a choice and never an accident.
 */
export function SignOutButton() {
  const t = useTranslations('common.signOut')
  const { userId, syncNow } = useSync()
  const [pending, setPending] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function wipeAndSignOut() {
    try {
      localStorage.removeItem('gymlog:userId')
    } catch {
      // Nothing to clear.
    }
    if (userId) await destroyDb(userId)
    await signOut({ callbackUrl: '/login' })
  }

  async function attempt() {
    if (!userId || busy) return
    setBusy(true)
    try {
      const outbox = getDb(userId).outbox
      let left = await outbox.count()
      if (left > 0 && navigator.onLine) {
        await syncNow()
        left = await outbox.count()
      }
      if (left > 0) {
        setPending(left)
        return
      }
      await wipeAndSignOut()
    } finally {
      setBusy(false)
    }
  }

  if (pending !== null) {
    return (
      <div role="alertdialog" aria-labelledby="sign-out-pending" className="w-full rounded-md border border-line p-4">
        <p id="sign-out-pending" className="text-[15px]">
          {t('pending', { count: pending })}
        </p>
        <p className="mt-1 text-sm text-ink-dim">{t('pendingHint')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setPending(null)}
            className="h-12 rounded-md border border-line text-sm"
          >
            {t('wait')}
          </button>
          <button
            type="button"
            onClick={() => void wipeAndSignOut()}
            className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
          >
            {t('anyway')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void attempt()}
      disabled={busy}
      className="h-12 w-full rounded-md border border-line text-sm text-ink-dim disabled:opacity-60"
    >
      {busy ? t('syncing') : t('signOut')}
    </button>
  )
}
