/* 
  Client layout global untuk kebutuhan PWA Mans Cell.
  Fungsi file ini:
  1. Register service worker
  2. Menampilkan tombol Install di semua halaman termasuk login
  3. Menangani install untuk Chrome/Android/Desktop Chromium
  4. Menampilkan panduan Add to Home Screen untuk iPhone Safari
  5. Menyembunyikan tombol install jika aplikasi sudah terpasang
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

const INSTALL_DISMISSED_KEY = "mans_cell_install_hidden"

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [showUnavailableInfo, setShowUnavailableInfo] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

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
    setIsMounted(true)

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true

    setIsStandalone(standalone)

    const installHidden = localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"

    if (standalone) {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
      setShowInstallButton(false)
      return
    }

    if (!installHidden) {
      setShowInstallButton(true)
    }
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
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      window.deferredPrompt = e
      setShowInstallButton(true)
    }

    const handleAppInstalled = () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
      window.deferredPrompt = null
      setIsStandalone(true)
      setShowInstallButton(false)
      setShowIosGuide(false)
      setShowUnavailableInfo(false)
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener
    )
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener
      )
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const closeIosGuide = () => {
    setShowIosGuide(false)
  }

  const closeUnavailableInfo = () => {
    setShowUnavailableInfo(false)
  }

  const handleInstallClick = async () => {
    if (isStandalone) {
      setShowInstallButton(false)
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
      return
    }

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

      if (choiceResult?.outcome === "accepted") {
        localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
        setShowInstallButton(false)
      }

      window.deferredPrompt = null
      return
    }

    setShowIosGuide(false)
    setShowUnavailableInfo(true)
  }

  if (!isMounted) {
    return <>{children}</>
  }

  return (
    <>
      {children}

      {showInstallButton && !isStandalone && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="fixed bottom-4 right-4 z-[9999] rounded-full bg-[#3d78eb] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#2f68d9]"
        >
          Install Mans Cell
        </button>
      )}

      {showIosGuide && !isStandalone && (
        <div className="fixed inset-x-4 bottom-20 z-[9999] rounded-2xl border border-blue-100 bg-white p-4 shadow-2xl">
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
        <div className="fixed inset-x-4 bottom-20 z-[9999] rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-blue-900">
                Install belum tersedia
              </h2>
              <p className="text-sm leading-6 text-blue-800">
                Browser belum memberikan izin install sekarang. Pastikan aplikasi
                dibuka memakai <strong>HTTPS</strong>, service worker aktif,
                manifest valid, dan untuk iPhone gunakan <strong>Safari</strong>{" "}
                lalu pilih <strong>Add to Home Screen</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={closeUnavailableInfo}
              className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
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