import type { Locale } from '@/lib/i18n'

import type { Messages } from './index'

/** A wrong `t('…')` key is a compile error, and `useLocale()` is a `Locale`, not a string. */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
