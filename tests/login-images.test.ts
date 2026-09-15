import { statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import config from '@/data/login-images.json'
import { config as proxyConfig } from '@/proxy'

// Only the proxy's matcher is under test; next-auth does not load outside Next.
vi.mock('next-auth', () => ({ default: () => ({ auth: (handler: unknown) => handler }) }))
vi.mock('next/server', () => ({ NextResponse: {} }))

// The sign in page is the first thing a new user loads, usually on mobile data.
const MAX_BYTES = 250 * 1024

describe('data/login-images.json', () => {
  it('lists at least one picture', () => {
    expect(config.images.length).toBeGreaterThan(0)
  })

  it.each(config.images)('$src exists in public/ and is small enough', ({ src }) => {
    const { size } = statSync(path.join(process.cwd(), 'public', src))
    expect(size).toBeLessThanOrEqual(MAX_BYTES)
  })

  it.each(config.images)('$src is served to signed-out visitors', ({ src }) => {
    // Anything the proxy matches redirects to /login when signed out, which
    // is exactly who sees these pictures.
    const matched = proxyConfig.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(src))
    expect(matched).toBe(false)
    expect(new RegExp(`^${proxyConfig.matcher[0]}$`).test('/login')).toBe(true)
  })
})
