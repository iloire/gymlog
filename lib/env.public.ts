import { z } from 'zod'

/**
 * The `NEXT_PUBLIC_*` surface — safe to import from client components.
 *
 * Each variable MUST be written as a literal member access
 * (`process.env.NEXT_PUBLIC_X`); Next only inlines literals, so
 * `process.env[name]` would be `undefined` in the browser bundle.
 */
/** Feature flags arrive as strings; turn them into booleans once, here. */
const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default('gymlog'),
  /**
   * The service worker is a production feature; in dev its navigation caching
   * fights hot reload. Turn it on deliberately to test the offline behaviour.
   */
  NEXT_PUBLIC_SW_IN_DEV: flag,
  /** Mapped from VERCEL_GIT_COMMIT_SHA in next.config.ts; empty off Vercel. */
  NEXT_PUBLIC_COMMIT_SHA: z.string().default(''),
})

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_SW_IN_DEV: process.env.NEXT_PUBLIC_SW_IN_DEV,
  NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA,
})

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid public environment variables:\n${issues}`)
}

export const publicEnv = {
  appName: parsed.data.NEXT_PUBLIC_APP_NAME,
  serviceWorkerInDev: parsed.data.NEXT_PUBLIC_SW_IN_DEV,
  /** Short 7-char SHA, or null when the build was not made on Vercel. */
  commitSha: parsed.data.NEXT_PUBLIC_COMMIT_SHA ? parsed.data.NEXT_PUBLIC_COMMIT_SHA.slice(0, 7) : null,
} as const
