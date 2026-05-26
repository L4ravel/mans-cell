/*
  Service Worker PWA Mans Cell.
  Revisi:
  - Cache dinaikkan ke v5 agar cache lama v4 ikut dibersihkan.
  - Manifest dan icon PWA dibuat network-first supaya update icon lebih cepat terbaca.
  - Icon disamakan dengan manifest: icon-192-v2.png dan icon-512-v2.png.
  - Fallback tetap ke /login jika offline.
*/

const CACHE_NAME = "mans-cell-v5"

const APP_SHELL = [
  "/login",
  "/manifest.json",
]

const OPTIONAL_ASSETS = [
  "/icons/icon-192-v2.png",
  "/icons/icon-512-v2.png",
  "/icons/apple-touch-icon.png",
]

const FRESH_ASSETS = [
  "/manifest.json",
  "/icons/icon-192-v2.png",
  "/icons/icon-512-v2.png",
  "/icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)

      await cache.addAll(APP_SHELL)

      for (const asset of OPTIONAL_ASSETS) {
        try {
          await cache.add(asset)
        } catch (error) {
          console.warn("Gagal cache asset optional:", asset, error)
        }
      }

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()

      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )

      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") return

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin
  const isFreshAsset = isSameOrigin && FRESH_ASSETS.includes(url.pathname)

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)

      if (isFreshAsset) {
        try {
          const networkResponse = await fetch(request, { cache: "no-store" })

          if (networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone())
          }

          return networkResponse
        } catch (error) {
          const cachedResponse = await caches.match(request)
          if (cachedResponse) return cachedResponse

          const fallback = await caches.match("/login")
          return fallback || Response.error()
        }
      }

      const cachedResponse = await caches.match(request)
      if (cachedResponse) return cachedResponse

      try {
        const networkResponse = await fetch(request)

        if (isSameOrigin && networkResponse.status === 200) {
          await cache.put(request, networkResponse.clone())
        }

        return networkResponse
      } catch (error) {
        const fallback = await caches.match("/login")
        return fallback || Response.error()
      }
    })(),
  )
})