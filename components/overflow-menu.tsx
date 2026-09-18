'use client'

import { EllipsisVertical } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

export type OverflowItem = { label: string; onSelect: () => void }

/**
 * A ⋮ button holding the actions you rarely want, so they take no room on the
 * screen and cannot be hit by mistake on one used one-handed between sets.
 * Escape, a tap outside and choosing an item all close it.
 */
export function OverflowMenu({ label, items }: { label: string; items: OverflowItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((was) => !was)}
        className="-mr-3 flex h-11 w-11 items-center justify-center text-ink-dim"
      >
        <EllipsisVertical size={20} aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute top-full right-0 z-10 mt-1 min-w-44 rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="block h-12 w-full px-4 text-left text-sm whitespace-nowrap hover:bg-surface-high"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
