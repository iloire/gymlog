/**
 * The language the app reads in: English or Spanish.
 *
 * An account setting like the unit (`users.locale`), so the choice goes up
 * with the next sync and the other phone follows. Each device also keeps it in
 * a cookie, which is how the server knows it before Dexie is open: the shell
 * it renders, `<html lang>` and the sign-in page are already in the right
 * language, and nothing flashes English on the way in. Never in the URL — the
 * service worker, the deep links and the redirects assume one path per screen.
 *
 * Pure, so the negotiation and the parsing are unit tests.
 */

export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Each language named in itself, so you can find your way back from the other one. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' }

/** The BCP 47 tag `Intl` formats with: `77,5 kg` and `15 sept 2026` in Spanish. */
export const INTL_TAG: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' }

/** Set by the proxy on a first visit and rewritten by whoever changes the language. */
export const LOCALE_COOKIE = 'gymlog_locale'

/** A year: long enough that a phone never forgets, short enough that a cookie is not forever. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseLocale(value: unknown): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE
}

/**
 * The language to start a visitor in, from the browser's `Accept-Language`:
 * the first entry whose language we have, by its stated preference. `es-MX`
 * is Spanish; anything we do not have is English.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const ranked = acceptLanguage
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...params] = entry.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { language: tag.trim().toLowerCase().split('-')[0] ?? '', weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  const hit = ranked.find((entry) => LOCALES.includes(entry.language as Locale))
  return hit ? (hit.language as Locale) : DEFAULT_LOCALE
}

/** The `Set-Cookie` attributes every writer uses, so the proxy and the browser agree on one cookie. */
export const LOCALE_COOKIE_ATTRIBUTES = { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax' } as const

/** Write the cookie from the browser; a no-op where `document` does not exist. */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`
}
