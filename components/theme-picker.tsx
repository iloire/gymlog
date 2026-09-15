'use client'

import { Moon, Sun, SunMoon } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { readTheme, setTheme, subscribeTheme, type Theme } from '@/lib/theme'

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: SunMoon },
]

export function ThemePicker() {
  // The stored choice exists only in the browser; the server snapshot is null,
  // so nothing is marked selected until hydration rather than the wrong option.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null)

  return (
    <fieldset>
      <legend className="mb-2 text-sm text-ink-dim">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface text-sm text-ink-dim has-checked:border-plate-blue-lift has-checked:text-ink has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
              className="sr-only"
            />
            <Icon size={20} aria-hidden />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        Saved on this device only. System follows your phone&apos;s setting.
      </p>
    </fieldset>
  )
}
