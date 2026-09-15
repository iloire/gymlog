import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe half of the auth config: no database, no bcrypt, no Node APIs —
 * this is what `proxy.ts` runs on every request. The Credentials provider and
 * everything it drags in lives in `lib/auth.ts`.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
      }
      return token
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
