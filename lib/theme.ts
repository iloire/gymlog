/**
 * Theme is a per-device choice, not an account setting: the same person wants
 * dark on the phone in a gym at night and light on a laptop by a window. So it
 * lives in localStorage, never syncs, and survives signing out — it says nothing
 * about whose log is on the device.
 *
 * `themeScript` is the only code that applies a theme. It runs inline in <head>
 * before first paint, so a light-theme user never sees a dark flash, and it
 * stays installed to follow the OS setting and changes made from any tab.
 * The profile page only stores the choice and announces it.
 */

export const THEMES = ['dark', 'light', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'dark'

const STORAGE_KEY = 'gymlog:theme'
const CHANGE_EVENT = 'gymlog:theme'

/** Browser chrome colour for each resolved theme — the `--ground` token. */
export const THEME_COLORS = { dark: '#12171c', light: '#eef1f4' } as const

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME
}

export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Blocked storage: the choice still applies until the page is reloaded.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: theme }))
}

/** For useSyncExternalStore: re-read whenever the theme is changed, here or in another tab. */
export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export const themeScript = `(function () {
  var themes = ${JSON.stringify(THEMES)}
  var colors = ${JSON.stringify(THEME_COLORS)}
  var light = window.matchMedia('(prefers-color-scheme: light)')

  function apply(choice) {
    var theme = choice
    if (themes.indexOf(theme) === -1) {
      try { theme = localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) } catch (e) { theme = null }
    }
    if (themes.indexOf(theme) === -1) theme = ${JSON.stringify(DEFAULT_THEME)}
    var resolved = theme === 'system' ? (light.matches ? 'light' : 'dark') : theme

    document.documentElement.classList.toggle('light', resolved === 'light')
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', colors[resolved])
  }

  apply()
  // The theme-color meta may be emitted after this script; catch it once parsed.
  document.addEventListener('DOMContentLoaded', function () { apply() })
  light.addEventListener('change', function () { apply() })
  window.addEventListener('storage', function () { apply() })
  window.addEventListener(${JSON.stringify(CHANGE_EVENT)}, function (event) { apply(event.detail) })
})()`
