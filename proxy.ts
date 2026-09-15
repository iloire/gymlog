import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth.config'

// `middleware.ts` was renamed to `proxy.ts` in Next 16.
// Only the edge-safe config is used here — no db, no bcrypt.
const { auth } = NextAuth(authConfig)

const publicPaths = ['/login', '/signup']

export default auth((req) => {
  const { pathname } = req.nextUrl

  // API routes authenticate themselves and answer 401 — redirecting a fetch to
  // an HTML login page would just give the client unparseable JSON.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  if (!req.auth) {
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
})

export const config = {
  // Everything except Next internals, the auth endpoints, and static assets.
  // Exercise photos live under /exercise-media/ (not /exercises/, which is a route).
  matcher: [
    '/((?!api/auth|_next/static|_next/image|exercise-media/|icons/|manifest.json|sw.js|favicon.ico).*)',
  ],
}
