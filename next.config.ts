import type { NextConfig } from 'next'

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

export default nextConfig
