// app/karyawan/layout.tsx
"use client"

/*
  Layout karyawan Mans-Cell.
  Revisi:
  - tampilan sidebar desktop/mobile diseragamkan dengan layout admin Mans-Cell
  - tema biru konsisten: from-sky-500 via-sky-600 to-blue-500
  - header mobile putih, tidak memakai background biru
  - konten mobile diberi margin kiri-kanan dan jarak dari header
  - auth gate memakai cache localStorage agar refresh tidak memuat role terus
  - logo brand sidebar/header mengambil dari public/logo-icon.png dengan tag img agar stabil di mobile
  - fallback auth/hydration dibuat putih penuh agar tidak muncul blank hitam
  - menu SOP ditambahkan dan mengarah ke /karyawan/aturan
*/

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import {
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BookOpenText,
  Cpu,
  User,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Home,
  ShoppingCart,
  Store,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth"

type UserRole = "owner" | "admin" | "karyawan" | "pelanggan"

type MansCellSession = {
  uid: string
  role?: UserRole
  roles?: UserRole[]
  userName?: string
  redirectTo?: string
  checkedAt?: number
}

const SESSION_KEY = "mans_cell_session"
const VALID_KARYAWAN_PANEL_ROLES: UserRole[] = ["admin", "karyawan"]

function normalizeRoles(raw: any): UserRole[] {
  const values = [
    ...(Array.isArray(raw?.roles) ? raw.roles : []),
    ...(Array.isArray(raw?.role)
      ? raw.role
      : typeof raw?.role === "string"
        ? [raw.role]
        : []),
  ]

  return Array.from(
    new Set(
      values
        .map((role: any) => String(role || "").trim().toLowerCase())
        .filter((role: string): role is UserRole =>
          ["owner", "admin", "karyawan", "pelanggan"].includes(role),
        ),
    ),
  )
}

function canAccessKaryawanPanel(roles: string[]) {
  return roles.includes("admin") || roles.includes("karyawan")
}

function readLocalSession(): {
  uid: string
  roles: UserRole[]
  userName: string
} | null {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as MansCellSession
    const roles = normalizeRoles(parsed)

    if (!parsed?.uid) return null
    if (!canAccessKaryawanPanel(roles)) return null

    return {
      uid: parsed.uid,
      roles,
      userName: String(parsed?.userName || "Karyawan"),
    }
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function saveLocalSession(uid: string, roles: UserRole[], userName: string) {
  if (typeof window === "undefined") return
  if (!uid || !canAccessKaryawanPanel(roles)) return

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      uid,
      role: roles.includes("admin") ? "admin" : "karyawan",
      roles,
      userName: userName || "Karyawan",
      redirectTo: "/karyawan",
      checkedAt: Date.now(),
    }),
  )
}

function clearLocalSession() {
  if (typeof window === "undefined") return
  localStorage.removeItem(SESSION_KEY)
}

export default function KaryawanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const wrapperRefDesktop = useRef<HTMLDivElement>(null)
  const wrapperRefMobile = useRef<HTMLDivElement>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [userName, setUserName] = useState("Karyawan")
  const [userRoles, setUserRoles] = useState<UserRole[]>([])

  const [openUser, setOpenUser] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [oldPassword, setOldPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  const canAccessAdminArea = useMemo(() => {
    return userRoles.includes("admin") || userRoles.includes("karyawan")
  }, [userRoles])

  const adminAccessLabel = useMemo(() => {
    return userRoles.includes("admin") ? "Akses Admin" : "Panel Transaksi"
  }, [userRoles])

  const adminAccessTarget = useMemo(() => {
    return userRoles.includes("admin") ? "/admin" : "/admin/transaksi"
  }, [userRoles])

  const canSwitchToAdmin = useMemo(() => {
    return userRoles.includes("admin")
  }, [userRoles])

  const handleGoToAdminAccount = () => {
    setSidebarOpen(false)
    setOpenUser(false)
    router.push("/admin")
  }

  const handleMobileNavigate = (href: string) => {
    setSidebarOpen(false)
    setTimeout(() => {
      router.push(href)
    }, 150)
  }

  useEffect(() => {
    const cached = readLocalSession()

    if (cached) {
      setUserName(cached.userName || "Karyawan")
      setUserRoles(cached.roles)
      setCheckingAuth(false)
    }

    setHasHydrated(true)
  }, [])

  useEffect(() => {
    if (!hasHydrated) return

    let isMounted = true

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return

      if (!user) {
        clearLocalSession()
        setUserName("Karyawan")
        setUserRoles([])
        setCheckingAuth(false)
        router.replace("/login")
        return
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid))

        if (!isMounted) return

        if (!snap.exists()) {
          clearLocalSession()
          setUserName("Karyawan")
          setUserRoles([])
          setCheckingAuth(false)
          router.replace("/unauthorized")
          return
        }

        const raw = snap.data()
        const normalizedRoles = normalizeRoles(raw)
        const nextUserName =
          String(raw?.nama || raw?.name || raw?.displayName || "Karyawan").trim() ||
          "Karyawan"

        if (!canAccessKaryawanPanel(normalizedRoles)) {
          clearLocalSession()
          setUserName("Karyawan")
          setUserRoles([])
          setCheckingAuth(false)
          router.replace("/unauthorized")
          return
        }

        saveLocalSession(user.uid, normalizedRoles, nextUserName)
        setUserName(nextUserName)
        setUserRoles(normalizedRoles)
        setCheckingAuth(false)
      } catch (error) {
        console.error("Gagal validasi user karyawan:", error)
        clearLocalSession()
        setUserName("Karyawan")
        setUserRoles([])
        setCheckingAuth(false)
        router.replace("/unauthorized")
      }
    })

    return () => {
      isMounted = false
      unsub()
    }
  }, [router, hasHydrated])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const inDesktop = wrapperRefDesktop.current?.contains(target)
      const inMobile = wrapperRefMobile.current?.contains(target)

      if (!inDesktop && !inMobile) {
        setOpenUser(false)
      }
    }

    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!sidebarOpen) return

    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = oldOverflow
    }
  }, [sidebarOpen])

  const handleLogout = async () => {
    if (loggingOut) return

    try {
      setLoggingOut(true)
      await auth.signOut()
      localStorage.removeItem("isLoggedIn")
      clearLocalSession()
      router.replace("/login")
    } catch (err) {
      console.error("Logout gagal", err)
    } finally {
      setLoggingOut(false)
    }
  }

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      alert("Semua field wajib diisi")
      return
    }

    if (newPassword !== confirmPassword) {
      alert("Konfirmasi password tidak sama")
      return
    }

    if (newPassword.length < 6) {
      alert("Password minimal 6 karakter")
      return
    }

    const user = auth.currentUser
    if (!user || !user.email) return

    try {
      setLoading(true)

      const credential = EmailAuthProvider.credential(user.email, oldPassword)

      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)

      alert("Password berhasil diperbarui")
      setShowModal(false)
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        alert("Password lama tidak benar")
      } else if (err.code === "auth/weak-password") {
        alert("Password baru minimal 6 karakter")
      } else if (err.code === "auth/requires-recent-login") {
        alert("Sesi login sudah kedaluwarsa, silakan logout dan login ulang")
      } else {
        alert("Gagal mengganti password")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoToAdminArea = () => {
    router.push(adminAccessTarget)
    setOpenUser(false)
  }

  if (!hasHydrated) {
    return <div className="min-h-screen bg-white" />
  }

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6" style={{ backgroundColor: "#ffffff" }}>
        <div className="w-full max-w-sm rounded-[2rem] border border-slate-100 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-100/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50">
              <Cpu className="text-sky-600" size={20} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                Memuat panel...
              </p>
              <p className="text-xs text-slate-500">
                Sedang cek autentikasi dan role user
              </p>
            </div>
          </div>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-50">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
          </div>
        </div>
      </div>
    )
  }

  const UserDropdown = ({ mobile = false }: { mobile?: boolean }) => (
    <AnimatePresence>
      {openUser && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className={`absolute right-0 top-14 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-100 ${
            mobile ? "z-[46]" : "z-20"
          }`}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-black text-slate-800">
              {userName || "Karyawan"}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600/70">
              Akun Karyawan
            </p>
          </div>

          {canAccessAdminArea && (
            <button
              onClick={handleGoToAdminArea}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 shadow-sm shadow-sky-500/15">
                {userRoles.includes("admin") ? (
                  <ShieldCheck size={16} className="text-white" strokeWidth={2.5} />
                ) : (
                  <ShoppingCart size={16} className="text-white" strokeWidth={2.5} />
                )}
              </div>
              {adminAccessLabel}
            </button>
          )}

          <button
            onClick={() => {
              setShowModal(true)
              setOpenUser(false)
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 shadow-sm shadow-sky-500/15">
              <KeyRound size={16} className="text-white" strokeWidth={2.5} />
            </div>
            Ganti Password
          </button>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 shadow-sm">
              <LogOut size={16} className="text-red-600" strokeWidth={2.5} />
            </div>
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )

  const DesktopNav = () => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
      <Link
        href="/karyawan"
        className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
          pathname === "/karyawan"
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
            pathname === "/karyawan"
              ? "bg-white/20"
              : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
          }`}
        >
          <Home size={15} strokeWidth={2.5} />
        </div>
        {!sidebarCollapsed && <span className="text-sm font-black">Beranda</span>}
      </Link>

      <Link
        href="/admin/transaksi"
        className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 transition-colors duration-200 group-hover:bg-sky-100">
          <ShoppingCart size={15} strokeWidth={2.5} />
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-black">Panel Transaksi</span>
        )}
      </Link>

      <Link
        href="/karyawan/jadwal-kehadiran"
        className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
          isActive("/karyawan/jadwal-kehadiran")
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
            isActive("/karyawan/jadwal-kehadiran")
              ? "bg-white/20"
              : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
          }`}
        >
          <Calendar size={15} strokeWidth={2.5} />
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-black">Jadwal Kehadiran</span>
        )}
      </Link>

      <Link
        href="/karyawan/aturan"
        className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
          isActive("/karyawan/aturan")
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${
            isActive("/karyawan/aturan")
              ? "bg-white/20"
              : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
          }`}
        >
          <BookOpenText size={15} strokeWidth={2.5} />
        </div>
        {!sidebarCollapsed && <span className="text-sm font-black">Standar Operasional Prosedur</span>}
      </Link>

      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 transition-colors duration-200 group-hover:bg-sky-100">
          <KeyRound size={15} strokeWidth={2.5} />
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-black">Ganti Password</span>
        )}
      </button>
    </nav>
  )

  const MobileNav = () => (
    <nav className="space-y-1">
      <button
        type="button"
        onClick={() => handleMobileNavigate("/karyawan")}
        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
          pathname === "/karyawan"
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
            pathname === "/karyawan"
              ? "bg-white/20"
              : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
          }`}
        >
          <Home size={15} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black">Beranda</span>
      </button>

      <button
        type="button"
        onClick={() => handleMobileNavigate("/admin/transaksi")}
        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 group-hover:bg-sky-100">
          <ShoppingCart size={15} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black">Panel Transaksi</span>
      </button>

      <button
        type="button"
        onClick={() => handleMobileNavigate("/karyawan/jadwal-kehadiran")}
        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
          isActive("/karyawan/jadwal-kehadiran")
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
            isActive("/karyawan/jadwal-kehadiran")
              ? "bg-white/20"
              : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
          }`}
        >
          <Calendar size={15} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black">Jadwal Kehadiran</span>
      </button>

      <button
        type="button"
        onClick={() => handleMobileNavigate("/karyawan/aturan")}
        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 ${
          isActive("/karyawan/aturan")
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
            isActive("/karyawan/aturan")
              ? "bg-white/20"
              : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"
          }`}
        >
          <BookOpenText size={15} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black">SOP</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setSidebarOpen(false)
          setShowModal(true)
        }}
        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800"
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 group-hover:bg-sky-100">
          <KeyRound size={15} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-black">Ganti Password</span>
      </button>
    </nav>
  )

  return (
    <>
      <div className="relative min-h-screen bg-white" style={{ backgroundColor: "#ffffff" }}>
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/70 blur-[110px]" />
          <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-slate-100/70 blur-[120px]" />
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-50/80 blur-[110px]" />
        </div>

        <div className="relative z-10 hidden min-h-screen gap-4 p-4 lg:flex">
          <aside
            className={`
              relative flex flex-col
              ${sidebarCollapsed ? "w-20" : "w-72"}
              rounded-[2rem] border border-white/80 bg-white
              shadow-[0_22px_70px_rgba(15,23,42,0.08)]
              ring-1 ring-slate-100/80
              transition-[width] duration-300 ease-in-out
            `}
          >
            <div className="relative flex h-20 items-center gap-3 overflow-hidden rounded-tl-[2rem] border-b border-sky-200/80 bg-white px-5">
              <div className="pointer-events-none absolute right-0 top-0 opacity-[0.06]">
                <Cpu size={80} strokeWidth={1} className="text-sky-700" />
              </div>

              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sky-100 bg-white p-1.5 shadow-lg shadow-sky-500/10">
                <img
                  src="/logo-icon.png"
                  alt="Logo Mans Cell"
                  className="block h-full w-full object-contain"
                  loading="eager"
                  decoding="sync"
                />
              </div>

              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-base font-black leading-none tracking-tight text-slate-800">
                    Mans-Cell{" "}
                    <span className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 bg-clip-text text-transparent">
                      Karyawan
                    </span>
                  </div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-sky-600/70">
                    Panel Karyawan
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="absolute -right-3 top-[88px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sky-100 bg-white text-sky-700 shadow-md shadow-sky-500/10 transition-colors hover:text-sky-800"
              aria-label={sidebarCollapsed ? "Perbesar sidebar" : "Kecilkan sidebar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight size={13} strokeWidth={2.5} />
              ) : (
                <ChevronLeft size={13} strokeWidth={2.5} />
              )}
            </button>

            <DesktopNav />

            <div className="space-y-2 rounded-bl-[2rem] border-t border-sky-100/70 bg-gradient-to-r from-sky-50/80 via-white to-cyan-50/50 p-3">
              {canSwitchToAdmin && (
                <button
                  type="button"
                  onClick={handleGoToAdminAccount}
                  className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-white shadow-sm shadow-sky-500/15 transition-colors duration-200 hover:from-sky-600 hover:via-sky-700 hover:to-blue-600"
                  title="Ganti ke akun admin"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 text-white transition-colors duration-200 group-hover:bg-white/25">
                    <ShieldCheck size={15} strokeWidth={2.5} />
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-sm font-black">
                        Akun Admin
                      </span>
                      <ChevronRight size={15} strokeWidth={2.7} className="shrink-0 text-white/85" />
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-colors duration-200 hover:border-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <LogOut size={15} strokeWidth={2.5} />
                {!sidebarCollapsed && (loggingOut ? "Logging out..." : "Logout")}
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-none ring-1 ring-slate-100/80">
            <header className="flex h-20 flex-shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 lg:px-8">
              <div />

              <div className="relative flex items-center gap-3" ref={wrapperRefDesktop}>
                <button
                  type="button"
                  onClick={() => setOpenUser((v) => !v)}
                  className="hidden items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:flex"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 text-white">
                    <User size={14} strokeWidth={2.5} />
                  </div>
                  <span className="max-w-[180px] truncate text-sm font-bold">
                    {userName || "Karyawan"}
                  </span>
                </button>

                <UserDropdown />
              </div>
            </header>

            <main className="flex-1 overflow-auto bg-white p-4 sm:p-6 lg:p-8">
              {children}
            </main>
          </div>
        </div>

        <div className="relative z-10 flex min-h-screen flex-col lg:hidden">
          <header className="fixed left-0 right-0 top-0 z-[45] bg-white px-4 pb-4 pt-3 shadow-sm shadow-slate-900/5">
            <div className="relative z-10 flex items-center justify-between gap-3 rounded-[1.6rem] border border-slate-100 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100/80">
              <button
                type="button"
                onClick={() => router.push("/karyawan")}
                className="flex min-w-0 items-center gap-3"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sky-100 bg-white p-1.5 shadow-sm">
                  <img
                    src="/logo-icon.png"
                    alt="Logo Mans Cell"
                    className="block h-full w-full object-contain"
                    loading="eager"
                    decoding="sync"
                  />
                </span>

                <span className="min-w-0 text-left">
                  <span className="block truncate text-base font-black leading-tight tracking-tight text-slate-800">
                    Mans-Cell{" "}
                    <span className="bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 bg-clip-text text-transparent">
                      Karyawan
                    </span>
                  </span>
                  <span className="block truncate text-[9px] font-bold uppercase tracking-[0.2em] text-sky-600/70">
                    Panel Karyawan
                  </span>
                </span>
              </button>

              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="relative" ref={wrapperRefMobile}>
                  <button
                    type="button"
                    onClick={() => setOpenUser((v) => !v)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    aria-label="Menu user"
                  >
                    <User size={17} strokeWidth={2.3} />
                  </button>

                  <UserDropdown mobile />
                </div>

                <button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Buka menu"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </header>

          <div
            className={`fixed inset-0 z-[54] bg-black/20 transition-opacity duration-200 ${
              sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setSidebarOpen(false)}
          />

          <aside
            className={`fixed bottom-0 right-0 top-0 z-[55] flex w-[86%] max-w-[390px] transform-gpu flex-col overflow-hidden rounded-l-[34px] bg-white shadow-xl shadow-sky-900/10 ring-1 ring-sky-100/80 transition-transform duration-300 ease-out ${
              sidebarOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-6 pb-[76px] pt-7 text-white">
              <div className="pointer-events-none absolute -right-12 top-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute bottom-10 left-8 h-32 w-32 rounded-full bg-cyan-300/15 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-[74px] left-1/2 h-[142px] w-[138%] -translate-x-1/2 rounded-[100%] bg-white shadow-[0_-10px_20px_rgba(14,165,233,0.08)]" />
              <div className="pointer-events-none absolute -bottom-[52px] left-1/2 h-[112px] w-[130%] -translate-x-1/2 rounded-[100%] border-t border-sky-200/50 bg-white/10" />
              <div className="pointer-events-none absolute -bottom-[36px] left-1/2 h-[78px] w-[118%] -translate-x-1/2 rounded-[100%] border-t border-sky-300/30 bg-sky-200/10" />

              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-300/30 bg-white p-1.5 shadow-md shadow-blue-950/10">
                      <img
                        src="/logo-icon.png"
                        alt="Logo Mans Cell"
                        className="block h-full w-full object-contain"
                        loading="eager"
                        decoding="sync"
                      />
                    </span>

                    <div className="min-w-0">
                      <p className="text-lg font-extrabold leading-tight">
                        Mans-Cell{" "}
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs shadow-sm ring-1 ring-white/10">
                          Karyawan
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-50/80">
                        Panel Karyawan
                      </p>
                    </div>
                  </div>

                  <p className="line-clamp-2 text-sm leading-6 text-sky-50">
                    Kelola jadwal kehadiran dan akses transaksi karyawan.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 shadow-sm ring-1 ring-white/10 transition-colors hover:bg-white/20"
                  aria-label="Tutup menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-between overflow-hidden px-4 pb-5 pt-1">
              <div className="min-h-0 overflow-y-auto pr-1">
                <div className="mb-3 rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-800 shadow-sm">
                      <User size={21} strokeWidth={2.5} />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">
                        {userName || "Karyawan"}
                      </p>
                      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-sky-600/70">
                        Akun Mans-Cell
                      </p>
                    </div>
                  </div>
                </div>

                <MobileNav />
              </div>

              <div className="mt-4 space-y-2">
                {canSwitchToAdmin && (
                  <button
                    type="button"
                    onClick={handleGoToAdminAccount}
                    className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-white shadow-sm shadow-sky-500/15 transition-colors duration-200 hover:from-sky-600 hover:via-sky-700 hover:to-blue-600"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 text-white transition-colors duration-200 group-hover:bg-white/25">
                      <ShieldCheck size={15} strokeWidth={2.5} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-black">
                      Akun Admin
                    </span>
                    <ChevronRight size={15} strokeWidth={2.7} className="shrink-0 text-white/85" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50/60 px-5 py-4 text-left text-slate-800 shadow-md shadow-sky-500/10 transition-colors duration-150 hover:from-red-50 hover:to-rose-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-red-500 shadow-sm ring-1 ring-sky-100">
                      <LogOut size={19} strokeWidth={2.5} />
                    </div>

                    <div>
                      <p className="text-sm font-black leading-tight">
                        {loggingOut ? "Logging out..." : "Logout"}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-600/70">
                        Keluar dari akun
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </aside>

          <main className="min-h-[calc(100vh-4rem)] bg-white px-3 pb-4 pt-[108px] sm:px-4">
            <div className="mx-auto w-full max-w-[720px]">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 shadow-lg shadow-sky-500/20">
                  <KeyRound size={24} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-800">
                    Ganti Password
                  </h2>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sky-600/70">
                    Perbarui kredensial akun
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { label: "Password Lama", value: oldPassword, setter: setOldPassword },
                  { label: "Password Baru", value: newPassword, setter: setNewPassword },
                  { label: "Konfirmasi Password", value: confirmPassword, setter: setConfirmPassword },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {label}
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 pr-12 font-semibold text-slate-800 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-50"
                      >
                        {showPass ? (
                          <EyeOff size={18} strokeWidth={2} />
                        ) : (
                          <Eye size={18} strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Batal
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  disabled={loading}
                  onClick={handleChangePassword}
                  className="flex-1 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Menyimpan..." : "Simpan"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}