/**
 * Theme is a per-device choice, not an account setting: the same person wants
 * dark on the phone in a gym at night and light on a laptop by a window. So it
 * lives in localStorage, never syncs, and survives signing out — it says nothing
 * about whose log is on the device.
 *
 * Two independent choices make a theme:
 * - the mode — dark, light, or follow the system;
 * - the style — the palette, typefaces and corners (app/globals.css), each of
 *   which has a dark and a light version.
 *
 * `themeScript` is the only code that applies a theme. It runs inline in <head>
 * before first paint, so a light-theme user never sees a dark flash, and it
 * stays installed to follow the OS setting and changes made from any tab.
 * The profile page only stores the choice and announces it.
 */

export const THEMES = ['dark', 'light', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const STYLES = ['plate', 'iron', 'studio', 'lane', 'court', 'signal'] as const
export type Style = (typeof STYLES)[number]

export const DEFAULT_THEME: Theme = 'dark'
export const DEFAULT_STYLE: Style = 'plate'

const THEME_KEY = 'gymlog:theme'
const STYLE_KEY = 'gymlog:style'
const CHANGE_EVENT = 'gymlog:theme'

/** Browser chrome colour for each style and resolved mode — its `--ground` token. */
export const THEME_COLORS = {
  plate: { dark: '#12171c', light: '#eef1f4' },
  iron: { dark: '#1a1917', light: '#e2e0db' },
  studio: { dark: '#191a2b', light: '#f1f0f7' },
  lane: { dark: '#0c1b22', light: '#e8f1f3' },
  court: { dark: '#1a1510', light: '#f0e5d0' },
  signal: { dark: '#000000', light: '#ffffff' },
} as const satisfies Record<Style, Record<'dark' | 'light', string>>

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME
}

export function parseStyle(value: unknown): Style {
  return STYLES.includes(value as Style) ? (value as Style) : DEFAULT_STYLE
}

function read<T>(key: string, parse: (value: unknown) => T, fallback: T): T {
  try {
    return parse(localStorage.getItem(key))
  } catch {
    return fallback
  }
}

function store(key: string, value: string, detail: { theme?: Theme; style?: Style }): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the choice still applies until the page is reloaded.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }))
}

export const readTheme = (): Theme => read(THEME_KEY, parseTheme, DEFAULT_THEME)
export const readStyle = (): Style => read(STYLE_KEY, parseStyle, DEFAULT_STYLE)

export const setTheme = (theme: Theme): void => store(THEME_KEY, theme, { theme })
export const setStyle = (style: Style): void => store(STYLE_KEY, style, { style })

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
  var styles = ${JSON.stringify(STYLES)}
  var colors = ${JSON.stringify(THEME_COLORS)}
  var light = window.matchMedia('(prefers-color-scheme: light)')
  // Choices announced in this tab, so they hold even when storage is blocked.
  var chosen = {}

  function pick(value, key, list, fallback) {
    if (list.indexOf(value) !== -1) return value
    try { value = localStorage.getItem(key) } catch (e) { value = null }
    return list.indexOf(value) === -1 ? fallback : value
  }

  function apply() {
    var theme = pick(chosen.theme, ${JSON.stringify(THEME_KEY)}, themes, ${JSON.stringify(DEFAULT_THEME)})
    var style = pick(chosen.style, ${JSON.stringify(STYLE_KEY)}, styles, ${JSON.stringify(DEFAULT_STYLE)})
    var resolved = theme === 'system' ? (light.matches ? 'light' : 'dark') : theme

    var root = document.documentElement
    root.classList.toggle('light', resolved === 'light')
    root.setAttribute('data-style', style)
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', colors[style][resolved])
  }

  apply()
  // The theme-color meta may be emitted after this script; catch it once parsed.
  document.addEventListener('DOMContentLoaded', apply)
  light.addEventListener('change', apply)
  window.addEventListener('storage', function () { chosen = {}; apply() })
  window.addEventListener(${JSON.stringify(CHANGE_EVENT)}, function (event) {
    var detail = event.detail || {}
    if (detail.theme) chosen.theme = detail.theme
    if (detail.style) chosen.style = detail.style
    apply()
  })
})()`
