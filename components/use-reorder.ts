'use client'

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

type Drag = { from: number; to: number; dy: number; height: number }

/**
 * Drag rows of a list into a new order with a handle, on touch and mouse
 * alike. HTML drag-and-drop does not work on a phone, so this is pointer
 * events: the handle captures the pointer, the dragged row follows the
 * finger, the rows it passes slide out of its way, and on release the new
 * order is handed back. Nothing is written until then.
 */
export function useReorder(count: number, onReorder: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  // The drag as the handlers see it: state is for drawing, and an event
  // handler must not read what the last render happened to hold.
  const latest = useRef<Drag | null>(null)
  const rows = useRef<(HTMLElement | null)[]>([])
  const rects = useRef<DOMRect[]>([])
  const start = useRef(0)

  function rowRef(index: number) {
    return (node: HTMLElement | null) => {
      rows.current[index] = node
    }
  }

  function handleProps(index: number) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        rects.current = rows.current.slice(0, count).map((row) => row?.getBoundingClientRect() ?? new DOMRect())
        start.current = event.clientY
        latest.current = { from: index, to: index, dy: 0, height: rects.current[index]?.height ?? 0 }
        setDrag(latest.current)
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const current = latest.current
        if (!current) return
        const dy = event.clientY - start.current
        const y = (rects.current[current.from]?.top ?? 0) + current.height / 2 + dy
        // The row whose middle the dragged row's middle has crossed.
        let to = current.from
        rects.current.forEach((rect, i) => {
          const mid = rect.top + rect.height / 2
          if (i < current.from && y < mid) to = Math.min(to, i)
          if (i > current.from && y > mid) to = Math.max(to, i)
        })
        latest.current = { ...current, dy, to }
        setDrag(latest.current)
      },
      onPointerUp() {
        const current = latest.current
        latest.current = null
        setDrag(null)
        if (current && current.to !== current.from) onReorder(current.from, current.to)
      },
      onPointerCancel() {
        latest.current = null
        setDrag(null)
      },
      style: { touchAction: 'none' } as CSSProperties,
    }
  }

  /** Where a row sits while a drag is under way. */
  function rowStyle(index: number): CSSProperties {
    if (!drag) return {}
    if (index === drag.from) {
      return { transform: `translateY(${drag.dy}px)`, zIndex: 1, position: 'relative', transition: 'none' }
    }
    const shift =
      drag.to < drag.from && index >= drag.to && index < drag.from
        ? drag.height
        : drag.to > drag.from && index <= drag.to && index > drag.from
          ? -drag.height
          : 0
    return { transform: shift ? `translateY(${shift}px)` : undefined, transition: 'transform 150ms ease-out' }
  }

  return { rowRef, handleProps, rowStyle, dragging: drag?.from ?? null }
}
