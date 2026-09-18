'use client'

import { Nav } from '@/components/nav'

/**
 * A screen while IndexedDB answers. `useLiveQuery` yields nothing for a frame
 * or two on a cold start, and every screen used to fill that gap differently:
 * Today drew its header with a pulsing bar where the workout's name would go,
 * the rest printed "Loading…" in the corner and then jumped to the real page.
 *
 * Now each screen renders its frame — the parts it knows with no data: the
 * tabs, the back link, a heading that never changes — and a `Placeholder` the
 * size of what it is waiting for, so the page keeps its shape and nothing
 * moves when the data lands. `aria-busy` tells assistive tech the same thing.
 */
export function Loading({
  children,
  nav = true,
  className = 'pt-8',
}: {
  children: React.ReactNode
  /** The tab bar, on every screen that has one. */
  nav?: boolean
  /** The real screen's top padding, so the frame sits where the page will. */
  className?: string
}) {
  return (
    <>
      <main className={`mx-auto w-full max-w-lg flex-1 px-5 ${className}`} aria-busy="true">
        {children}
      </main>
      {nav && <Nav />}
    </>
  )
}

/** A pulsing block the size of the text or picture it stands in for. */
export function Placeholder({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-surface ${className}`} aria-hidden />
}
