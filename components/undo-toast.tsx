'use client'

import { useEffect } from 'react'

const VISIBLE_MS = 6000

/**
 * "Removed · Undo" — a bar above the tabs, like the rest timer, for a removal
 * that happens on one tap. It goes on its own after a few seconds; by then the
 * removal stands. Give it a `key` per removal so a second one restarts the clock.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string
  onUndo: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <div role="status" className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-page items-center justify-between gap-3 py-1 pr-2 pl-5">
        <span className="min-w-0 truncate text-sm text-ink-dim">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="h-11 shrink-0 px-3 text-sm font-semibold text-plate-blue-lift"
        >
          Undo
        </button>
      </div>
    </div>
  )
}
