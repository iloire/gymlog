import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { LOCALE_COOKIE, parseLocale } from '@/lib/i18n'
import { MESSAGES } from '@/messages'

/**
 * What the server renders in: the device's cookie, set by `proxy.ts` on a
 * first visit and rewritten by the Language page and by sync. Read here for
 * `<html lang>`, the metadata and the two server-rendered desk pages; the
 * client tree gets the same locale through `LocaleProvider`.
 */
export default getRequestConfig(async () => {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value)
  return { locale, messages: MESSAGES[locale] }
})
