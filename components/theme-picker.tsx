'use client'

import { Moon, Sun, SunMoon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import {
  readStyle,
  readTheme,
  setStyle,
  setTheme,
  subscribeTheme,
  type Style,
  type Theme,
} from '@/lib/theme'

// The ids; each one's name and description are in messages/<locale>/profile.json.
const modes: { value: Theme; icon: typeof Sun }[] = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'system', icon: SunMoon },
]

const styles: Style[] = ['plate', 'whiteboard', 'iron', 'studio']

const option =
  'cursor-pointer rounded-md border border-line bg-surface text-sm text-ink-dim has-checked:border-plate-blue-lift has-checked:text-ink has-focus-visible:ring-2 has-focus-visible:ring-ring'

export function ThemePicker() {
  const t = useTranslations('profile.appearance')
  // The stored choice exists only in the browser; the server snapshot is null,
  // so nothing is marked selected until hydration rather than the wrong option.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null)
  const style = useSyncExternalStore(subscribeTheme, readStyle, () => null)

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm text-ink-dim">{t('style')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {styles.map((value) => (
            <label key={value} className={`${option} flex flex-col overflow-hidden`}>
              <input
                type="radio"
                name="style"
                value={value}
                checked={style === value}
                onChange={() => setStyle(value)}
                className="sr-only"
              />
              <StylePreview style={value} />
              <span className="px-3 pt-2 font-semibold text-ink">{t(`styles.${value}.label`)}</span>
              <span className="px-3 pb-2.5 text-xs">{t(`styles.${value}.description`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-ink-dim">{t('theme')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {modes.map(({ value, icon: Icon }) => (
            <label key={value} className={`${option} flex h-16 flex-col items-center justify-center gap-1`}>
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => setTheme(value)}
                className="sr-only"
              />
              <Icon size={20} aria-hidden />
              {t(`modes.${value}`)}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-dim">{t('deviceOnly')}</p>
      </fieldset>
    </div>
  )
}

/**
 * A set as the session screen shows it, drawn in the style itself: the
 * `data-style` attribute scopes that style's tokens to this box, in whichever
 * mode is current.
 */
function StylePreview({ style }: { style: Style }) {
  return (
    <span data-style={style} aria-hidden className="block bg-ground px-3 pt-3 pb-2.5 font-sans text-ink">
      <span className="figure block text-3xl leading-none">
        100<span className="ml-1 text-sm text-ink-dim">kg</span>
      </span>
      <span className="mt-2.5 flex items-center gap-1">
        <span className="size-3.5 rounded-sm bg-plate-blue" />
        <span className="size-3.5 rounded-sm bg-plate-blue" />
        <span className="size-3.5 rounded-sm border-2 border-plate-red" />
        <span className="size-3.5 rounded-sm border border-line" />
      </span>
      <span className="mt-2.5 block h-1 w-2/3 bg-plate-yellow" />
    </span>
  )
}
