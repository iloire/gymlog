import { z } from 'zod'

/**
 * The `NEXT_PUBLIC_*` surface — safe to import from client components.
 *
 * Each variable MUST be written as a literal member access
 * (`process.env.NEXT_PUBLIC_X`); Next only inlines literals, so
 * `process.env[name]` would be `undefined` in the browser bundle.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default('gymlog'),
})

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
})

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid public environment variables:\n${issues}`)
}

export const publicEnv = {
  appName: parsed.data.NEXT_PUBLIC_APP_NAME,
} as const
