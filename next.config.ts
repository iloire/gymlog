import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  env: {
    // Vercel injects VERCEL_GIT_COMMIT_SHA at build time. Screens are client
    // components (they read IndexedDB), so it is re-exposed under a public name
    // to be rendered there. Absent outside Vercel, and then nothing renders.
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
  // The week used to be its own screen; it is the top of the Plan tab now.
  redirects: async () => [{ source: '/program', destination: '/workouts', permanent: true }],
}

// Points next-intl at i18n/request.ts, which reads the language cookie for the server tree.
export default createNextIntlPlugin('./i18n/request.ts')(nextConfig)
