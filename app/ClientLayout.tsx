/* 
  Client layout global untuk kebutuhan PWA Mans Cell.
  Fungsi file ini:
  1. Register service worker
  2. Menampilkan tombol Install di semua halaman termasuk login
  3. Menangani install untuk Chrome/Android/Desktop Chromium
  4. Menampilkan panduan Add to Home Screen untuk iPhone Safari
  5. Menampilkan info jika browser belum siap install
*/

"use client"

import { useEffect, useMemo, useState } from "react"

declare global {
  interface Window {
    deferredPrompt?: any
  }

  interface Navigator {
    standalone?: boolean
  }
}

type ClientLayoutProps = {
  children: React.ReactNode
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [readyToInstall, setReadyToInstall] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [showUnavailableInfo, setShowUnavailableInfo] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  const isIos = useMemo(() => {
    if (typeof window === "undefined") return false
    const ua = window.navigator.userAgent.toLowerCase()
    return /iphone|ipad|ipod/.test(ua)
  }, [])

  const isSafari = useMemo(() => {
    if (typeof window === "undefined") return false
    const ua = window.navigator.userAgent.toLowerCase()
    const safari = ua.includes("safari")
    const notChrome = !ua.includes("crios") && !ua.includes("chrome")
    const notFirefox = !ua.includes("fxios")
    const notEdge = !ua.includes("edgios")
    return safari && notChrome && notFirefox && notEdge
  }, [])

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true

    setIsStandalone(standalone)
  }, [])

  useEffect(() => {
  if (!("serviceWorker" in navigator)) return

  const registerSW = async () => {
    try {
      await navigator.serviceWorker.register("/sw.js")
      console.log("Service Worker registered")
    } catch (error) {
      console.error("Service Worker registration failed:", error)
    }
  }

  registerSW()
}, [])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      window.deferredPrompt = e
      setReadyToInstall(true)
    }

    window.addEventListener("beforeinstallprompt", handler as EventListener)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler as EventListener)
    }
  }, [])

  const closeIosGuide = () => {
    setShowIosGuide(false)
  }

  const closeUnavailableInfo = () => {
    setShowUnavailableInfo(false)
  }

  const handleInstallClick = async () => {
    if (isStandalone) return

    if (isIos && isSafari) {
      setShowUnavailableInfo(false)
      setShowIosGuide(true)
      return
    }

    const promptEvent = window.deferredPrompt

    if (promptEvent) {
      setShowUnavailableInfo(false)
      promptEvent.prompt()

      const choiceResult = await promptEvent.userChoice
      console.log("Install choice:", choiceResult?.outcome)

      window.deferredPrompt = null
      setReadyToInstall(false)
      return
    }

    setShowIosGuide(false)
    setShowUnavailableInfo(true)
  }

  return (
    <>
      {children}

      {!isStandalone && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="fixed bottom-4 right-4 z-[9999] rounded-full bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-teal-700"
        >
          Install Mans Cell
        </button>
      )}

      {showIosGuide && !isStandalone && (
        <div className="fixed inset-x-4 bottom-20 z-[9999] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-slate-900">
                Install Mans Cell di iPhone
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Buka menu <strong>Share</strong> di Safari, lalu pilih{" "}
                <strong>Add to Home Screen</strong> agar aplikasi bisa dibuka
                seperti aplikasi biasa.
              </p>
            </div>

            <button
              type="button"
              onClick={closeIosGuide}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
              aria-label="Tutup panduan install iPhone"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {showUnavailableInfo && !isStandalone && (
        <div className="fixed inset-x-4 bottom-20 z-[9999] rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-amber-900">
                Install belum tersedia
              </h2>
              <p className="text-sm leading-6 text-amber-800">
                Browser belum memberikan izin install sekarang. Pastikan aplikasi
                dibuka memakai <strong>HTTPS</strong>, service worker aktif,
                manifest valid, dan untuk iPhone gunakan <strong>Safari</strong>{" "}
                lalu pilih <strong>Add to Home Screen</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={closeUnavailableInfo}
              className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
              aria-label="Tutup info install"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  )
}