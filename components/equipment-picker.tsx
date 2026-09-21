'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useSyncExternalStore } from 'react'
import { useLocale } from '@/components/locale-provider'
import { localize } from '@/lib/i18n'

import {
  EQUIPMENT,
  parseEquipment,
  presetFor,
  readEquipmentRaw,
  saveEquipment,
  subscribeEquipment,
} from '@/lib/equipment'

/** Your equipment on this device; null until you have chosen. */
export function useEquipment(): string[] | null {
  // The stored value is a string so the snapshot is stable between reads; the
  // server snapshot is null, so nothing is assumed before hydration.
  const raw = useSyncExternalStore(subscribeEquipment, readEquipmentRaw, () => null)
  return useMemo(() => parseEquipment(raw), [raw])
}

const chip = (active: boolean) =>
  `rounded-full px-3.5 py-2 text-sm ${active ? 'bg-ink text-ground' : 'border border-line text-ink-dim'}`

export function EquipmentPicker() {
  const t = useTranslations('exercises.equipmentPicker')
  const items = useEquipment()
  const locale = useLocale()
  const selected = new Set(items ?? [])
  const preset = items ? presetFor(items) : undefined

  function toggle(id: string) {
    saveEquipment(
      EQUIPMENT.items
        .map((item) => item.id)
        .filter((item) => (item === id ? !selected.has(item) : selected.has(item))),
    )
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink-dim">{t('startFrom')}</p>
      <div className="grid grid-cols-2 gap-2">
        {EQUIPMENT.presets.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={preset?.id === option.id}
            onClick={() => saveEquipment(option.items)}
            className={`h-14 rounded-md border px-3 text-sm ${
              preset?.id === option.id
                ? 'border-plate-blue-lift bg-surface text-ink'
                : 'border-line bg-surface text-ink-dim'
            }`}
          >
            {localize(option.name, locale)}
          </button>
        ))}
      </div>

      <p className="mt-5 mb-2 text-sm text-ink-dim">{t('whatYouHave')}</p>
      <div className="flex flex-wrap gap-2">
        {EQUIPMENT.items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected.has(item.id)}
            onClick={() => toggle(item.id)}
            className={chip(selected.has(item.id))}
          >
            {localize(item.name, locale)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-dim">{t('note')}</p>
    </div>
  )
}
