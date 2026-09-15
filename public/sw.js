/**
 * gymlog service worker.
 *
 * Hand-written rather than generated, because the rules are few and the
 * failure mode matters: if this is wrong, the app does not open in a gym.
 *
 * - Build assets and exercise photos are immutable → cache first.
 * - Everything else same-origin → network first, falling back to the cache,
 *   so a navigation still resolves with no signal.
 * - /api/* is never cached. The sync engine already treats a failed request as
 *   "still offline", and a stale cached sync response would be a lie.
 * - /admin is never cached either: it shows other people's data.
 *
 * Note `ignoreSearch` on the navigation fallback: /session?id=… caches one
 * document that then serves every session, including ones first opened offline.
 */
const VERSION = 'v1'
const ASSETS = `gymlog-assets-${VERSION}`
const PAGES = `gymlog-pages-${VERSION}`

/**
 * Registered as /sw.js?dev=1 in development. Build asset URLs are only
 * content-hashed in a production build, so caching them first in dev serves
 * stale chunks forever and hot reload appears to do nothing.
 */
const DEV = new URL(self.location.href).searchParams.get('dev') === '1'

const IMMUTABLE = DEV ? [/^\/exercise-media\//] : [/^\/_next\/static\//, /^\/exercise-media\//, /^\/icons\//]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES).then((cache) => cache.addAll(['/', '/session', '/exercises', '/weight', '/profile', '/programmes'])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  // Other people's accounts must never land in this device's cache, and sign
  // out does not clear it. The panel is online-only anyway.
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return

  if (IMMUTABLE.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }

  event.respondWith(networkFirst(request, PAGES))
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit

  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const hit =
      (await cache.match(request)) ??
      (await cache.match(request, { ignoreSearch: true })) ??
      (request.mode === 'navigate' ? await cache.match('/') : undefined)

    if (hit) return hit
    throw new Error('offline and not cached')
  }
}

/**
 * Pull every photo for the exercises in a message into the cache, so the
 * library is browsable before you leave the house. Sent by the app.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache-media') return
  const urls = event.data.urls ?? []

  event.waitUntil(
    caches.open(ASSETS).then(async (cache) => {
      for (const url of urls) {
        if (await cache.match(url)) continue
        try {
          const response = await fetch(url)
          if (response.ok) await cache.put(url, response)
        } catch {
          // Best effort; whatever is missing is fetched on demand later.
        }
      }
    }),
  )
})
