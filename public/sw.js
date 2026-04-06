/*
  Service Worker PWA Mans Cell.
  File ini menangani cache asset dasar dengan cara yang lebih aman.
  Jika ada file optional yang gagal di-cache, service worker tidak langsung gagal total.
*/

const CACHE_NAME = "mans-cell-v2"
const APP_SHELL = [
  "/",
  "/manifest.json"
]

const OPTIONAL_ASSETS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
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
    })()
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()

      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )

      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") return

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request)
      if (cachedResponse) return cachedResponse

      try {
        const networkResponse = await fetch(request)

        if (
          request.url.startsWith(self.location.origin) &&
          networkResponse.status === 200
        ) {
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, networkResponse.clone())
        }

        return networkResponse
      } catch (error) {
        const fallback = await caches.match("/")
        return fallback || Response.error()
      }
    })()
  )
})