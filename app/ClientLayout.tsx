/* 
  Client layout global untuk kebutuhan PWA Mans Cell.
  Fungsi file ini:
  1. Register service worker
  2. Menampilkan banner Install di header atas semua halaman termasuk login
  3. Menangani install untuk Chrome/Android/Desktop Chromium
  4. Menampilkan panduan Add to Home Screen untuk iPhone Safari
  5. Menyembunyikan tombol install jika aplikasi sudah terpasang
  6. Banner install dibuat seperti alarm/notifikasi profesional; mode sembunyi hanya icon di kiri atas
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, Download, Share2, X } from "lucide-react"

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
const INSTALL_BANNER_HIDDEN_KEY = "mans_cell_install_banner_hidden"

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [showUnavailableInfo, setShowUnavailableInfo] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [installBannerHidden, setInstallBannerHidden] = useState(false)

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
    const bannerHidden = localStorage.getItem(INSTALL_BANNER_HIDDEN_KEY) === "1"

    setInstallBannerHidden(bannerHidden)

    if (standalone) {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
      localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
      setShowInstallButton(false)
      setInstallBannerHidden(false)
      return
    }

   if (!installHidden && isIos && isSafari) {
  setShowInstallButton(true)
}
  }, [])

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    const setupSW = async () => {
      try {
        if (process.env.NODE_ENV !== "production") {
          const registrations = await navigator.serviceWorker.getRegistrations()

          await Promise.all(
            registrations.map((registration) => registration.unregister()),
          )

          if ("caches" in window) {
            const cacheNames = await caches.keys()
            await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
          }

          console.log("Service Worker dan cache PWA dibersihkan di mode development")
          return
        }

        await navigator.serviceWorker.register("/sw.js")
        console.log("Service Worker registered")
      } catch (error) {
        console.error("Service Worker setup failed:", error)
      }
    }

    setupSW()
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      window.deferredPrompt = e
      setShowInstallButton(true)
    }

    const handleAppInstalled = () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
      localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
      window.deferredPrompt = null
      setIsStandalone(true)
      setShowInstallButton(false)
      setInstallBannerHidden(false)
      setShowIosGuide(false)
      setShowUnavailableInfo(false)
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener,
    )
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener,
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

  const hideInstallBanner = () => {
    localStorage.setItem(INSTALL_BANNER_HIDDEN_KEY, "1")
    setInstallBannerHidden(true)
    setShowIosGuide(false)
    setShowUnavailableInfo(false)
  }

  const showInstallBannerAgain = () => {
    localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
    setInstallBannerHidden(false)
  }

  const handleInstallClick = async () => {
    if (isStandalone) {
      setShowInstallButton(false)
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
      localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
      return
    }

    if (isIos && isSafari) {
      setShowUnavailableInfo(false)
      setShowIosGuide(true)
      setInstallBannerHidden(false)
      localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
      return
    }

    const promptEvent = window.deferredPrompt

    if (promptEvent) {
      setShowUnavailableInfo(false)

      promptEvent.prompt()
      const choiceResult = await promptEvent.userChoice

      if (choiceResult?.outcome === "accepted") {
        localStorage.setItem(INSTALL_DISMISSED_KEY, "1")
        localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
        setShowInstallButton(false)
        setInstallBannerHidden(false)
      }

      window.deferredPrompt = null
      return
    }

    setShowIosGuide(false)
    setShowUnavailableInfo(true)
    setInstallBannerHidden(false)
    localStorage.removeItem(INSTALL_BANNER_HIDDEN_KEY)
  }

  if (!isMounted) {
    return <>{children}</>
  }

  return (
    <>
      {children}

      {showInstallButton && !isStandalone && !installBannerHidden && (
        <div className="fixed inset-x-0 top-0 z-[9999] px-3 pt-3 sm:px-4">
          <div className="mx-auto max-w-[760px] overflow-hidden rounded-[1.45rem] border border-sky-100 bg-white/96 shadow-[0_18px_55px_rgba(14,165,233,0.18)] ring-1 ring-sky-100/80 backdrop-blur-md lg:max-w-[920px]">
            <div className="relative overflow-hidden bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-white sm:px-5">
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/16 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 left-10 h-28 w-28 rounded-full bg-cyan-200/16 blur-2xl" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/18 text-white shadow-sm ring-1 ring-white/20">
                    <Bell size={20} strokeWidth={2.7} />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-black leading-tight sm:text-base">
                      Install Mans Cell
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/86 sm:text-sm">
                      Pasang aplikasi di HP agar akses kasir, stok, laporan, dan absensi lebih cepat tanpa membuka browser manual.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={hideInstallBanner}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-white transition-colors hover:bg-white/20"
                  aria-label="Sembunyikan banner install"
                  title="Sembunyikan"
                >
                  <X size={16} strokeWidth={2.7} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-[11px] font-bold leading-relaxed text-slate-500 sm:text-xs">
                Setelah terpasang, Mans Cell akan tampil seperti aplikasi biasa di layar utama.
              </p>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={hideInstallBanner}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-sky-100 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700 transition-colors hover:bg-sky-100"
                >
                  Sembunyikan
                </button>

                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/20 transition-all hover:from-sky-600 hover:via-sky-700 hover:to-blue-600"
                >
                  <Download size={14} strokeWidth={2.8} />
                  Install
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInstallButton && !isStandalone && installBannerHidden && (
        <button
          type="button"
          onClick={showInstallBannerAgain}
          className="fixed left-3 top-3 z-[9999] inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-200/80 bg-white/95 text-sky-700 shadow-[0_12px_34px_rgba(14,165,233,0.14)] ring-1 ring-sky-100/80 backdrop-blur-md transition-all hover:bg-sky-50 hover:text-sky-800 sm:left-4 sm:top-4"
          aria-label="Munculkan banner install"
          title="Munculkan install"
        >
          <Bell size={16} strokeWidth={2.7} />
        </button>
      )}

      {showIosGuide && !isStandalone && (
        <div className="fixed inset-x-3 top-[8.25rem] z-[9999] sm:top-[9rem]">
          <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.14)] ring-1 ring-sky-100/80">
            <div className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/20">
                    <Share2 size={19} strokeWidth={2.6} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-sm font-black leading-tight">
                      Install Mans Cell
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-50/80">
                      Panduan iPhone Safari
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeIosGuide}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-white transition-colors hover:bg-white/20"
                  aria-label="Tutup panduan install iPhone"
                >
                  <X size={16} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            <div className="px-4 py-4">
              <p className="text-sm font-semibold leading-6 text-slate-600">
                Buka menu <strong>Share</strong> di Safari, lalu pilih{" "}
                <strong>Add to Home Screen</strong> agar Mans Cell bisa dibuka
                seperti aplikasi biasa.
              </p>
            </div>
          </div>
        </div>
      )}

      {showUnavailableInfo && !isStandalone && (
        <div className="fixed inset-x-3 top-[8.25rem] z-[9999] sm:top-[9rem]">
          <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.14)] ring-1 ring-sky-100/80">
            <div className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/20">
                    <Download size={19} strokeWidth={2.6} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-sm font-black leading-tight">
                      Install belum tersedia
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-50/80">
                      Cek PWA & browser
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeUnavailableInfo}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-white transition-colors hover:bg-white/20"
                  aria-label="Tutup info install"
                >
                  <X size={16} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            <div className="px-4 py-4">
              <p className="text-sm font-semibold leading-6 text-slate-600">
                Browser belum memberikan izin install sekarang. Pastikan aplikasi
                dibuka memakai <strong>HTTPS</strong>, service worker aktif,
                manifest valid, dan untuk iPhone gunakan <strong>Safari</strong>{" "}
                lalu pilih <strong>Add to Home Screen</strong>.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
