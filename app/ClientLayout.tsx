/* 
  Client layout untuk kebutuhan PWA di sisi browser.
  Tugas file ini:
  1. Register service worker
  2. Menangkap event install PWA di browser Chromium
  3. Menampilkan tombol install untuk Android/Desktop Chromium
  4. Menampilkan panduan Add to Home Screen untuk iPhone Safari
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
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", async () => {
        try {
          await navigator.serviceWorker.register("/sw.js")
          console.log("Service Worker registered")
        } catch (error) {
          console.error("Service Worker registration failed:", error)
        }
      })
    }
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

  useEffect(() => {
    if (!isStandalone && isIos && isSafari) {
      const dismissed = window.sessionStorage.getItem("ios-install-guide-dismissed")
      if (!dismissed) {
        setShowIosGuide(true)
      }
    }
  }, [isStandalone, isIos, isSafari])

  const closeIosGuide = () => {
    setShowIosGuide(false)
    window.sessionStorage.setItem("ios-install-guide-dismissed", "1")
  }

  const handleInstallClick = async () => {
    const promptEvent = window.deferredPrompt
    if (!promptEvent) return

    promptEvent.prompt()
    const choiceResult = await promptEvent.userChoice

    if (choiceResult?.outcome) {
      console.log("Install choice:", choiceResult.outcome)
    }

    window.deferredPrompt = null
    setReadyToInstall(false)
  }

  return (
    <>
      {children}

      {readyToInstall && !isStandalone && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-teal-700"
        >
          Install Mans Cell
        </button>
      )}

      {showIosGuide && !isStandalone && (
        <div className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-slate-900">
                Install Mans Cell di iPhone
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Buka menu <strong>Share</strong> di Safari, lalu pilih{" "}
                <strong>Add to Home Screen</strong> agar aplikasi bisa dibuka
                seperti app biasa.
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
    </>
  )
}