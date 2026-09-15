import { z } from 'zod'

/**
 * Server-side environment. Never import this from a client component —
 * use `lib/env.public.ts` for anything the browser needs.
 *
 * Validation is lazy (behind a Proxy) so that importing a module which merely
 * *references* `env` does not blow up at build time, only when a value is read.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Turso / libSQL. A local file DB (`file:./local.db`) needs no auth token.
  TURSO_DATABASE_URL: z.string().min(1, 'TURSO_DATABASE_URL is required'),
  TURSO_AUTH_TOKEN: z.string().optional(),

  // NextAuth v5
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),

  // Injected by Vercel at build time; absent everywhere else.
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${issues}`)
  }

  return parsed.data
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    cached ??= validateEnv()
    return cached[prop as keyof Env]
  },
})
