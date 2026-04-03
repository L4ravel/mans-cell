// app/karyawan/layout.tsx
"use client"

/*
  Layout ini menjadi gate auth dan shell dashboard untuk halaman karyawan.
  Sidebar, dropdown user, logout, dan ganti password sudah disiapkan dengan tema yang konsisten.
*/

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
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
  Cpu,
  User,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Home,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth"

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
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [, setUserName] = useState("Karyawan")
  const [userRoles, setUserRoles] = useState<string[]>([])

  const [openUser, setOpenUser] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [oldPassword, setOldPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  const handleMobileNavigate = (href: string) => {
    setSidebarOpen(false)
    setTimeout(() => {
      router.push(href)
    }, 150)
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login")
        return
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (!snap.exists()) {
          router.replace("/unauthorized")
          return
        }

        const raw = snap.data()
        setUserName(raw?.nama || "Karyawan")

        const roles: string[] = Array.isArray(raw?.roles)
          ? raw.roles
          : Array.isArray(raw?.role)
          ? raw.role
          : typeof raw?.role === "string"
          ? [raw.role]
          : []

        setUserRoles(roles)

        if (!roles.includes("karyawan")) {
          router.replace("/unauthorized")
          return
        }

        setCheckingAuth(false)
      } catch (error) {
        console.error("Gagal validasi user karyawan:", error)
        router.replace("/unauthorized")
      }
    })

    return () => unsub()
  }, [router])

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

  const handleLogout = async () => {
    try {
      await auth.signOut()
      localStorage.removeItem("isLoggedIn")
      router.replace("/login")
    } catch (err) {
      console.error("Logout gagal", err)
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

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-xl">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-6 w-6 rounded-full border-2 border-cyan-400 border-t-transparent"
            />
            <p className="text-sm font-bold text-slate-600">Memuat halaman karyawan...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-slate-100 relative">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute left-0 top-1/4 h-96 w-96 rounded-full bg-cyan-200/30 blur-[120px]" />
          <div className="absolute right-0 bottom-1/3 h-96 w-96 rounded-full bg-emerald-200/30 blur-[120px]" />
          <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-200/20 blur-[100px]" />
        </div>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-50 pointer-events-none"
            >
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="fixed z-[60] flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors pointer-events-auto"
                style={{ top: "14px", left: "calc(17rem + 34px)" }}
              >
                <X size={16} strokeWidth={2} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="hidden lg:flex min-h-screen p-4 gap-4 relative z-10">
          <aside
            className={`
              relative flex flex-col
              ${sidebarCollapsed ? "w-20" : "w-72"}
              bg-white border border-slate-200
              shadow-2xl shadow-slate-300/40
              rounded-3xl
              transition-all duration-300 ease-in-out
            `}
          >
            <div className="relative h-20 flex items-center gap-3 px-5 border-b border-slate-200 overflow-hidden rounded-tl-3xl bg-gradient-to-r from-slate-50 to-blue-50/50">
              <div className="absolute right-0 top-0 opacity-[0.06] pointer-events-none">
                <Cpu size={80} strokeWidth={1} className="text-cyan-600" />
              </div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <Image src="/logo.png" alt="Logo" width={32} height={32} className="object-contain" priority />
              </motion.div>
              {!sidebarCollapsed && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                  <div className="text-base font-black text-slate-800 tracking-tight leading-none">
                    SIDIP{" "}
                    <span className="text-transparent bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text">v.Beta</span>
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                    Panel Karyawan
                  </div>
                </motion.div>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="absolute -right-3 top-[88px] h-6 w-6 flex items-center justify-center rounded-full border border-slate-200 bg-white shadow-md text-slate-500 hover:text-slate-700 transition-colors z-10"
            >
              {sidebarCollapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
            </motion.button>

            <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
              <Link
                href="/karyawan"
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  pathname === "/karyawan"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-200/50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                  pathname === "/karyawan" ? "bg-white/20" : "bg-slate-100 group-hover:bg-slate-200"
                }`}>
                  <Home size={15} strokeWidth={2.5} />
                </div>
                {!sidebarCollapsed && <span className="text-sm font-bold">Beranda</span>}
              </Link>

              <Link
                href="/karyawan/jadwal-kehadiran"
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive("/karyawan/jadwal-kehadiran")
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-200/50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                  isActive("/karyawan/jadwal-kehadiran") ? "bg-white/20" : "bg-slate-100 group-hover:bg-slate-200"
                }`}>
                  <Calendar size={15} strokeWidth={2.5} />
                </div>
                {!sidebarCollapsed && <span className="text-sm font-bold">Jadwal Kehadiran</span>}
              </Link>
            </nav>

            <div className="p-3 border-t border-slate-200 rounded-bl-3xl bg-slate-50/50">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 hover:border-red-200 transition-all duration-200 font-bold text-sm"
              >
                <LogOut size={15} strokeWidth={2.5} />
                {!sidebarCollapsed && "Logout"}
              </motion.button>
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0 bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-300/40 overflow-hidden">
            <header className="h-20 flex items-center justify-between px-6 lg:px-8 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50 flex-shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400"></p>
                <h1 className="text-lg font-black text-slate-800 tracking-tight"></h1>
              </div>
              <div className="flex items-center gap-2 relative" ref={wrapperRefDesktop}>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setOpenUser((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <User size={18} className="text-slate-700" strokeWidth={2} />
                </motion.button>
                <AnimatePresence>
                  {openUser && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-14 w-48 rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden z-20"
                    >
                      {userRoles.includes("admin") && (
                        <button
                          onClick={() => { router.push("/admin"); setOpenUser(false) }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-sm">
                            <ShieldCheck size={16} className="text-white" strokeWidth={2.5} />
                          </div>
                          Akses Admin
                        </button>
                      )}
                      <button
                        onClick={() => { setShowModal(true); setOpenUser(false) }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-cyan-400 shadow-sm">
                          <KeyRound size={16} className="text-white" strokeWidth={2.5} />
                        </div>
                        Ganti Password
                      </button>
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50/80 transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-red-100 shadow-sm">
                          <LogOut size={16} className="text-red-600" strokeWidth={2.5} />
                        </div>
                        Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto bg-slate-50/30">
              {children}
            </main>
          </div>
        </div>

        <div className="lg:hidden flex flex-col min-h-screen relative z-10">
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-[54]"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          <aside
            className={`
              fixed inset-y-0 left-0 z-[55] flex flex-col w-[17rem]
              bg-white rounded-r-3xl
              border border-slate-200 shadow-2xl shadow-slate-400/20
              transition-transform duration-300 ease-in-out
              ${sidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+2rem)]"}
            `}
          >
            <div className="relative h-20 flex items-center gap-3 px-5 border-b border-slate-200 overflow-hidden bg-gradient-to-r from-slate-50 to-blue-50/50">
              <div className="absolute right-0 top-0 opacity-[0.06] pointer-events-none">
                <Cpu size={80} strokeWidth={1} className="text-cyan-600" />
              </div>
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <Image src="/logo.png" alt="Logo" width={32} height={32} className="object-contain" priority />
              </div>
              <div>
                <div className="text-base font-black text-slate-800 tracking-tight leading-none">
                  SIDIP{" "}
                  <span className="text-transparent bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text">v.Beta</span>
                </div>
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                  Panel Karyawan
                </div>
              </div>
            </div>

            <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => handleMobileNavigate("/karyawan")}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  pathname === "/karyawan"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-200/50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                  pathname === "/karyawan" ? "bg-white/20" : "bg-slate-100 group-hover:bg-slate-200"
                }`}>
                  <Home size={15} strokeWidth={2.5} />
                </div>
                <span className="text-sm font-bold">Beranda</span>
              </button>

              <button
                type="button"
                onClick={() => handleMobileNavigate("/karyawan/jadwal-kehadiran")}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive("/karyawan/jadwal-kehadiran")
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-200/50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                  isActive("/karyawan/jadwal-kehadiran") ? "bg-white/20" : "bg-slate-100 group-hover:bg-slate-200"
                }`}>
                  <Calendar size={15} strokeWidth={2.5} />
                </div>
                <span className="text-sm font-bold">Jadwal Kehadiran</span>
              </button>
            </nav>

            <div className="p-3 border-t border-slate-200 bg-slate-50/50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 transition-all duration-200 font-bold text-sm"
              >
                <LogOut size={15} strokeWidth={2.5} />
                Logout
              </button>
            </div>
          </aside>

          <header className="fixed top-0 left-0 right-0 z-[45] h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white/90 backdrop-blur-md shadow-sm">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Menu size={18} strokeWidth={2} />
            </button>

            <div className="relative" ref={wrapperRefMobile}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setOpenUser((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-colors"
              >
                <User size={18} className="text-slate-700" strokeWidth={2} />
              </motion.button>
              <AnimatePresence>
                {openUser && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-14 w-52 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-[46]"
                  >
                    {userRoles.includes("admin") && (
                      <button
                        onClick={() => { router.push("/admin"); setOpenUser(false) }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-sm">
                          <ShieldCheck size={16} className="text-white" strokeWidth={2.5} />
                        </div>
                        Akses Admin
                      </button>
                    )}
                    <button
                      onClick={() => { setShowModal(true); setOpenUser(false) }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-cyan-400 shadow-sm">
                        <KeyRound size={16} className="text-white" strokeWidth={2.5} />
                      </div>
                      Ganti Password
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50/80 transition-colors border-t border-slate-100"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-red-100 shadow-sm">
                        <LogOut size={16} className="text-red-600" strokeWidth={2.5} />
                      </div>
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          <main className="pt-16 min-h-[calc(100vh-4rem)] bg-slate-50/30">
            {children}
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
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 shadow-lg shadow-blue-200/50">
                  <KeyRound size={24} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Ganti Password</h2>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Perbarui Kredensial Anda
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
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                      {label}
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 text-slate-800 font-semibold placeholder:text-slate-300 pr-12"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl hover:bg-white/50 text-slate-400 transition-colors"
                      >
                        {showPass ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-5 py-3 rounded-full border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Batal
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={loading}
                  onClick={handleChangePassword}
                  className="flex-1 px-5 py-3 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 font-black uppercase tracking-[0.1em] text-white hover:shadow-lg hover:shadow-emerald-200/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200/30 text-[11px]"
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