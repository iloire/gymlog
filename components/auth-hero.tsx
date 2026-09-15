'use client'

import { useSyncExternalStore } from 'react'

import config from '@/data/login-images.json'

/**
 * The picture behind the sign in and sign up forms, one of
 * `data/login-images.json` at random.
 *
 * Picked once when the module loads, so moving between sign in and sign up
 * keeps the same picture. The server snapshot is null: a random pick during
 * server rendering would disagree with the browser's and break hydration, so
 * the server renders the bare ground and the browser fills it in.
 */
const chosen = config.images[Math.floor(Math.random() * config.images.length)] ?? null

const subscribe = () => () => {}

export function AuthHero({ className = '' }: { className?: string }) {
  const image = useSyncExternalStore(
    subscribe,
    () => chosen,
    () => null,
  )

  return (
    <div className={`overflow-hidden bg-surface ${className}`} aria-hidden>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- local static files, already sized
        <img
          src={image.src}
          alt=""
          fetchPriority="high"
          className="h-full w-full object-cover"
          style={{ objectPosition: image.position }}
        />
      )}
      {/* Fades the picture into the ground under the wordmark, and on a desk
          also into the column the form sits in. */}
      <div className="absolute inset-0 bg-linear-to-t from-ground via-ground/40 via-30% to-transparent to-70%" />
      <div className="absolute inset-0 hidden bg-linear-to-r from-transparent from-60% to-ground lg:block" />
    </div>
  )
}
