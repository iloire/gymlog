import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth.config'
import { LOCALE_COOKIE, LOCALE_COOKIE_ATTRIBUTES, negotiateLocale } from '@/lib/i18n'

// `middleware.ts` was renamed to `proxy.ts` in Next 16.
// Only the edge-safe config is used here — no db, no bcrypt.
const { auth } = NextAuth(authConfig)

const publicPaths = ['/login', '/signup']

/**
 * A first visit has no language cookie yet; the browser's Accept-Language
 * picks one, and from then on the cookie is the device's word (rewritten by
 * the Language page and by sync, never here). Set on the redirect too, so the
 * sign-in page a visitor lands on is already in their language.
 */
function withLocale(req: Parameters<Parameters<typeof auth>[0]>[0], response: NextResponse): NextResponse {
  if (!req.cookies.has(LOCALE_COOKIE)) {
    response.cookies.set(LOCALE_COOKIE, negotiateLocale(req.headers.get('accept-language')), LOCALE_COOKIE_ATTRIBUTES)
  }
  return response
}

export default auth((req) => {
  const { pathname } = req.nextUrl

  // API routes authenticate themselves and answer 401 — redirecting a fetch to
  // an HTML login page would just give the client unparseable JSON.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withLocale(req, NextResponse.next())
  }

  if (!req.auth) {
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`)
    return withLocale(req, NextResponse.redirect(url))
  }

  return withLocale(req, NextResponse.next())
})

export const config = {
  // Everything except Next internals, the auth endpoints, and static assets.
  // Exercise photos live under /exercise-media/ (not /exercises/, which is a route).
  // /auth-media/ is the sign in picture, requested before anyone is signed in.
  matcher: [
    '/((?!api/auth|_next/static|_next/image|exercise-media/|auth-media/|icons/|manifest.json|sw.js|favicon.ico).*)',
  ],
}
