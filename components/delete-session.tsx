'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useLocale } from '@/components/locale-provider'
import { useUserId } from '@/components/session-boot'
import type { LocalSession } from '@/lib/db/dexie'
import { formatDay } from '@/lib/format'
import { deleteSession } from '@/lib/sessions'

/**
 * Delete a whole logged workout, with an inline confirm — shared by Today and
 * History, the two places a workout is shown whole. It stays off the session
 * screen: that one is used mid-set with one hand, and nothing there should be
 * able to throw the workout away.
 */
export function DeleteSession({ session }: { session: LocalSession }) {
  const userId = useUserId()
  const locale = useLocale()
  const t = useTranslations('history.delete')
  const [confirming, setConfirming] = useState(false)

  if (!userId) return null

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-ink-dim underline underline-offset-4"
      >
        {t('button')}
      </button>
    )
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={`delete-session-${session.id}`}
      className="w-full rounded-md border border-plate-red p-4"
    >
      <p id={`delete-session-${session.id}`} className="text-[15px]">
        {t('question', { name: session.templateName })}
      </p>
      <p className="mt-1 text-sm text-ink-dim">{t('detail', { date: formatDay(session.scheduledFor, locale) })}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          autoFocus
          onClick={() => setConfirming(false)}
          className="h-12 rounded-md border border-line text-sm"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void deleteSession(userId, session.id)}
          className="h-12 rounded-md bg-plate-red text-sm font-semibold text-white"
        >
          {t('confirm')}
        </button>
      </div>
    </div>
  )
}
