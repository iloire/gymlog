'use client'

import { useEffect } from 'react'

/**
 * Keeps the screen on for the length of a workout. Without it the phone locks
 * during a 90-second rest and you unlock it before every set.
 *
 * The lock is dropped by the browser whenever the page is hidden, so it is
 * re-acquired on `visibilitychange`.
 */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    async function acquire() {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null
        if (cancelled) {
          await lock?.release()
          lock = null
        }
      } catch {
        // Unsupported, or denied because the page is not visible. Not fatal.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}
