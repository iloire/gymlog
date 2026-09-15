import { existsSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { syncedTables } from '@/db/schema'
import seeds from '@/db/seed-exercises.json'
import { SYNC_TABLES } from '@/lib/sync/types'

async function loadPublicEnv(values: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
  return (await import('@/lib/env.public')).publicEnv
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('publicEnv', () => {
  it('defaults the app name and leaves the service worker off in dev', async () => {
    const env = await loadPublicEnv({ NEXT_PUBLIC_APP_NAME: undefined, NEXT_PUBLIC_SW_IN_DEV: undefined })
    expect(env.appName).toBe('gymlog')
    expect(env.serviceWorkerInDev).toBe(false)
  })

  it('turns the service worker flag on only for the literal "true"', async () => {
    expect((await loadPublicEnv({ NEXT_PUBLIC_SW_IN_DEV: 'true' })).serviceWorkerInDev).toBe(true)
    expect((await loadPublicEnv({ NEXT_PUBLIC_SW_IN_DEV: 'false' })).serviceWorkerInDev).toBe(false)
  })

  it('fails loudly on a malformed flag instead of guessing', async () => {
    // This is what caught a quoted value pasted into the Vercel dashboard.
    await expect(loadPublicEnv({ NEXT_PUBLIC_SW_IN_DEV: '"false"' })).rejects.toThrow(
      /NEXT_PUBLIC_SW_IN_DEV/,
    )
  })

  it('shortens the commit SHA to 7 characters', async () => {
    const env = await loadPublicEnv({ NEXT_PUBLIC_COMMIT_SHA: '963df18a1b2c3d4e5f60718293a4b5c6d7e8f901' })
    expect(env.commitSha).toBe('963df18')
  })

  it('shows no SHA when the build did not run on Vercel', async () => {
    expect((await loadPublicEnv({ NEXT_PUBLIC_COMMIT_SHA: '' })).commitSha).toBeNull()
  })
})

describe('sync table order', () => {
  it('matches the schema, which lists tables parents-first', () => {
    // The server applies pushes in SYNC_TABLES order to satisfy foreign keys.
    // If this list drifts from the schema, a child can be written before its
    // parent and every sync for that user fails.
    expect([...SYNC_TABLES]).toEqual(Object.keys(syncedTables))
  })
})

describe('offline shell', () => {
  it('ships the service worker, manifest and every icon the manifest names', async () => {
    const manifest = (await import('@/public/manifest.json')).default
    expect(existsSync('public/sw.js')).toBe(true)
    for (const icon of manifest.icons) {
      expect(existsSync(`public${icon.src}`), icon.src).toBe(true)
    }
  })

  it('has every exercise photo on disk, so the library works with no signal', () => {
    const missing = seeds.flatMap((s) => s.images).filter((image) => !existsSync(`public/${image}`))
    expect(missing).toEqual([])
  })
})
