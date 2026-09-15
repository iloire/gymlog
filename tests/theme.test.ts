import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME, parseTheme, THEME_COLORS, themeScript } from '@/lib/theme'

/**
 * Runs the real inline <head> script against just enough of a browser to see
 * what it does to <html>. A mistake here is silent until someone picks Light
 * and gets a dark screen, or a flash on every load.
 */
function boot({ stored = null as string | null, osLight = false, storageBlocked = false } = {}) {
  const classes = new Set<string>()
  const listeners = new Map<string, ((event?: unknown) => void)[]>()
  const on = (type: string, fn: (event?: unknown) => void) =>
    listeners.set(type, [...(listeners.get(type) ?? []), fn])
  const fire = (type: string, event?: unknown) => listeners.get(type)?.forEach((fn) => fn(event))

  let meta: { content: string; setAttribute: (name: string, value: string) => void } | null = null
  const store = new Map<string, string>(stored === null ? [] : [['gymlog:theme', stored]])
  const media = { matches: osLight, addEventListener: (_: string, fn: () => void) => on('media', fn) }

  const window = {
    matchMedia: () => media,
    addEventListener: on,
  }
  const context = {
    window,
    localStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error('blocked')
        return store.get(key) ?? null
      },
    },
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, force: boolean) => (force ? classes.add(name) : classes.delete(name)),
        },
      },
      querySelector: () => meta,
      addEventListener: on,
    },
  }

  runInNewContext(themeScript, context)

  return {
    isLight: () => classes.has('light'),
    themeColor: () => meta?.content,
    parseMeta() {
      meta = { content: THEME_COLORS.dark, setAttribute: (_, value) => (meta!.content = value) }
      fire('DOMContentLoaded')
    },
    store: (value: string) => {
      store.set('gymlog:theme', value)
      fire('storage')
    },
    announce: (value: string) => fire('gymlog:theme', { detail: value }),
    setOsLight: (value: boolean) => {
      media.matches = value
      fire('media')
    },
  }
}

describe('theme script', () => {
  it('stays dark when nothing has been chosen', () => {
    expect(boot().isLight()).toBe(false)
    expect(boot({ osLight: true }).isLight()).toBe(false)
  })

  it('applies a stored light theme before first paint', () => {
    expect(boot({ stored: 'light' }).isLight()).toBe(true)
  })

  it('falls back to the default on a garbage or unreadable value', () => {
    expect(boot({ stored: 'purple' }).isLight()).toBe(false)
    expect(boot({ stored: 'light', storageBlocked: true }).isLight()).toBe(false)
  })

  it('follows the OS under System, including when it changes', () => {
    const page = boot({ stored: 'system', osLight: true })
    expect(page.isLight()).toBe(true)
    page.setOsLight(false)
    expect(page.isLight()).toBe(false)
  })

  it('ignores the OS once a fixed theme is chosen', () => {
    const page = boot({ stored: 'dark' })
    page.setOsLight(true)
    expect(page.isLight()).toBe(false)
  })

  it('re-applies when the choice changes in this tab or another', () => {
    const page = boot()
    page.announce('light')
    expect(page.isLight()).toBe(true)
    page.store('dark')
    expect(page.isLight()).toBe(false)
  })

  it('applies an announced choice even when storage is blocked', () => {
    const page = boot({ storageBlocked: true })
    page.announce('light')
    expect(page.isLight()).toBe(true)
  })

  it('sets the browser chrome colour once the meta tag exists', () => {
    const page = boot({ stored: 'light' })
    page.parseMeta()
    expect(page.themeColor()).toBe(THEME_COLORS.light)
  })
})

describe('parseTheme', () => {
  it('accepts only known themes', () => {
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme('Light')).toBe(DEFAULT_THEME)
    expect(parseTheme(null)).toBe(DEFAULT_THEME)
  })
})
