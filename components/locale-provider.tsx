'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { NextIntlClientProvider } from 'next-intl'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { useSync, useUserId } from '@/components/session-boot'
import { type Locale, writeLocaleCookie } from '@/lib/i18n'
import { readLocale, setLocale as storeLocale } from '@/lib/sync/client'
import { MESSAGES } from '@/messages'

type LocaleState = {
  locale: Locale
  /** Read in this language from now on: at once here, on the account with the next sync. */
  chooseLocale: (locale: Locale) => Promise<void>
}

const LocaleContext = createContext<LocaleState>({ locale: 'en', chooseLocale: async () => {} })

/**
 * The language the client tree reads in. Starts from the cookie the layout
 * read, so the server's shell and the hydrated page agree; then follows the
 * account's choice in `meta` the way `useUnit` follows the unit, so a sync
 * that brings the other phone's language re-renders every screen without a
 * reload. Both message bundles are on the device, so switching never needs
 * the network: a round trip for the other language would fail in the gym.
 */
export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const userId = useUserId()
  const { syncNow } = useSync()
  // What this device was told or chose before the account had a say; the
  // account's own value, once `meta` holds one, wins.
  const [chosen, setChosen] = useState<Locale>(initial)
  const synced = useLiveQuery(() => (userId ? readLocale(userId) : null), [userId], null)
  const locale = synced ?? chosen

  // The cookie follows whatever is shown, so the next load renders in it;
  // <html lang> too, which the server set for the language at load time.
  useEffect(() => {
    writeLocaleCookie(locale)
    document.documentElement.lang = locale
  }, [locale])

  const chooseLocale = useCallback(
    async (next: Locale) => {
      setChosen(next)
      if (!userId) return
      await storeLocale(userId, next)
      void syncNow()
    },
    [userId, syncNow],
  )

  return (
    <LocaleContext.Provider value={{ locale, chooseLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale
}

export function useChooseLocale(): LocaleState['chooseLocale'] {
  return useContext(LocaleContext).chooseLocale
}
