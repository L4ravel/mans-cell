/*
  Service Worker PWA Mans Cell.
  Revisi:
  - Tidak menyimpan cache sama sekali.
  - Service Worker hanya dipakai agar PWA valid dan bisa diinstall.
  - Semua request langsung ke network/browser normal.
  - Cache lama mans-cell-* tetap dibersihkan saat activate.
*/

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()

      await Promise.all(
        keys
          .filter((key) => key.startsWith("mans-cell-"))
          .map((key) => caches.delete(key)),
      )

      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", () => {
  return
})