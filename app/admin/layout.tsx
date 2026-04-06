"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import {
  Home,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Cpu,
  Database,
  Store,
  User,
  Users,
  Package,
  Building2,
  KeyRound,
  LogOut,
  Calendar,
  ClipboardList,
  UserX,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type MenuItem = {
  href: string
  label: string
  icon: any
}

type MenuGroup = {
  label: string
  icon: any
  items: MenuItem[]
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openGroup, setOpenGroup] = useState<string[]>([])
  const [loggingOut, setLoggingOut] = useState(false)

  // Tutup sidebar otomatis saat navigasi berhasil
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.replace("/login")
        return
      }

      const snap = await getDoc(doc(db, "users", user.uid))

      if (!snap.exists()) {
        router.replace("/unauthorized")
        return
      }

      const data = snap.data()
      const role: string = data?.role || ""

      if (role !== "admin") {
        router.replace("/unauthorized")
      }
    })

    return () => unsub()
  }, [router])

  useEffect(() => {
    const nextOpenGroup: string[] = []

    if (
      pathname.startsWith("/admin/tambah-toko") ||
      pathname.startsWith("/admin/tambah-karyawan") ||
      pathname.startsWith("/admin/tambah-barang") ||
      pathname.startsWith("/admin/tambah-kategori") ||
      pathname.startsWith("/admin/tambah-barang-tetap") ||
      pathname.startsWith("/admin/buat-akun")
    ) {
      nextOpenGroup.push("Master Data")
    }

    if (
      pathname.startsWith("/admin/dashboard-absensi") ||
      pathname.startsWith("/admin/pengaturan-jam") ||
      pathname.startsWith("/admin/tidak-wajib-absensi") ||
      pathname.startsWith("/admin/laporan-absensi-bulanan") ||
      pathname.startsWith("/admin/laporan-absensi-karyawan")
    ) {
      nextOpenGroup.push("Absensi Karyawan")
    }

    setOpenGroup(nextOpenGroup)
  }, [pathname])

  const isActive = (href: string) => {
    if (href === "/admin/tambah-barang") {
      return pathname === "/admin/tambah-barang" || pathname === "/admin/tambah-kategori"
    }
    if (href === "/admin/dashboard-absensi") {
      return pathname === "/admin/dashboard-absensi"
    }
    return pathname === href
  }

  const handleLogout = async () => {
    if (loggingOut) return
    try {
      setLoggingOut(true)
      await signOut(auth)
      localStorage.removeItem("mans_cell_session")
      router.replace("/login")
    } catch (error) {
      console.error("Logout gagal:", error)
    } finally {
      setLoggingOut(false)
    }
  }

  const menuGroups: MenuGroup[] = [
    {
      label: "Master Data",
      icon: Database,
      items: [
        { href: "/admin/tambah-toko", icon: Store, label: "Tambah Toko" },
        { href: "/admin/tambah-karyawan", icon: Users, label: "Tambah Karyawan" },
        { href: "/admin/tambah-barang", icon: Package, label: "Tambah Barang" },
        { href: "/admin/tambah-barang-tetap", icon: Building2, label: "Tambah Barang Tetap" },
        { href: "/admin/buat-akun", icon: KeyRound, label: "Buat Akun" },
      ],
    },
    {
      label: "Absensi Karyawan",
      icon: Users,
      items: [
        { href: "/admin/dashboard-absensi", icon: Home, label: "Dashboard Absensi" },
        { href: "/admin/laporan-absensi-karyawan", icon: ClipboardList, label: "Laporan Absensi Karyawan" },
        { href: "/admin/pengaturan-jam", icon: Calendar, label: "Pengaturan Jam" },
        { href: "/admin/tidak-wajib-absensi", icon: UserX, label: "Tidak Wajib Absensi" },
        { href: "/admin/laporan-absensi-bulanan", icon: ClipboardList, label: "Laporan Absensi Bulanan" },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100 flex relative p-4 gap-4">

      {/* ── Background Orbs ── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute left-0 top-1/4 h-96 w-96 rounded-full bg-cyan-200/30 blur-[120px]" />
        <div className="absolute right-0 bottom-1/3 h-96 w-96 rounded-full bg-blue-200/30 blur-[120px]" />
        <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-200/20 blur-[100px]" />
      </div>

      {/* ── Mobile Hamburger ── z-[60] lebih tinggi dari segalanya ── */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-8 left-8 z-[60] flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 text-slate-700"
      >
        <AnimatePresence mode="wait" initial={false}>
          {sidebarOpen ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X size={18} strokeWidth={2} />
            </motion.span>
          ) : (
            <motion.span
              key="menu"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Menu size={18} strokeWidth={2} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/*
        ── Mobile Backdrop ──
        KUNCI FIX: backdrop dimulai dari setelah sidebar selesai (left: 19rem)
        sehingga TIDAK overlap dengan sidebar sama sekali.
        Sidebar z-[50], backdrop z-[40] — sidebar selalu di atas backdrop.
        Klik di area backdrop → tutup sidebar. Klik di sidebar → navigasi normal.
      */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed top-0 bottom-0 right-0 z-[40] bg-black/20"
            style={{ left: "19rem" }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-1 gap-4">

        {/* ── SIDEBAR ── z-[50] lebih tinggi dari backdrop z-[40] ── */}
        <aside
          className={`
            fixed lg:relative
            inset-y-4 left-4 lg:inset-y-0 lg:left-0
            z-[50] flex flex-col
            ${sidebarCollapsed ? "w-20" : "w-72"}
            bg-white backdrop-blur-xl
            border border-slate-200
            shadow-2xl shadow-slate-300/40
            rounded-3xl lg:rounded-r-none lg:rounded-l-3xl
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)] lg:translate-x-0"}
          `}
        >
          {/* ── Logo / Brand ── */}
          <div className="relative h-20 flex items-center gap-3 px-5 border-b border-slate-200 overflow-hidden rounded-tl-3xl bg-gradient-to-r from-slate-50 to-blue-50/50">
            <div className="absolute right-0 top-0 opacity-[0.06] pointer-events-none">
              <Cpu size={80} strokeWidth={1} className="text-cyan-600" />
            </div>

            <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <Store className="text-blue-600" size={20} strokeWidth={2.5} />
            </div>

            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <div className="text-base font-black text-slate-800 tracking-tight leading-none">
                  Mans-Cell{" "}
                  <span className="text-transparent bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text">
                    Admin
                  </span>
                </div>
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                  Panel Management
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Collapse Toggle ── */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex absolute -right-3 top-[88px] h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md text-slate-500 hover:text-slate-700 transition-colors z-10"
          >
            {sidebarCollapsed ? (
              <ChevronRight size={13} strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={13} strokeWidth={2.5} />
            )}
          </motion.button>

          {/* ── Navigation ── */}
          <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">

            <Link
              href="/admin"
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                ${
                  pathname === "/admin"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-200/50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }
              `}
            >
              <div
                className={`
                  flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200
                  ${
                    pathname === "/admin"
                      ? "bg-white/20"
                      : "bg-slate-100 group-hover:bg-slate-200"
                  }
                `}
              >
                <Home size={15} strokeWidth={2.5} />
              </div>
              {!sidebarCollapsed && <span className="text-sm font-bold">Dashboard</span>}
            </Link>

            {menuGroups.map((group) => {
              const GroupIcon = group.icon
              const isOpen = openGroup.includes(group.label)
              const hasActiveChild = group.items.some((item) => isActive(item.href))

              return (
                <div key={group.label} className="space-y-0.5">
                  <button
                    onClick={() =>
                      setOpenGroup((prev) =>
                        prev.includes(group.label)
                          ? prev.filter((l) => l !== group.label)
                          : [...prev, group.label]
                      )
                    }
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200
                      ${
                        hasActiveChild
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`
                          flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200
                          ${
                            hasActiveChild
                              ? "bg-gradient-to-br from-blue-400 to-cyan-500 text-white shadow-sm shadow-blue-200/50"
                              : "bg-slate-100"
                          }
                        `}
                      >
                        <GroupIcon size={15} strokeWidth={2.5} />
                      </div>
                      {!sidebarCollapsed && (
                        <span className="text-sm font-bold">{group.label}</span>
                      )}
                    </div>

                    {!sidebarCollapsed && (
                      <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={14} strokeWidth={2.5} className="text-slate-400" />
                      </motion.div>
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && !sidebarCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden pl-3"
                      >
                        <div className="border-l-2 border-slate-100 pl-2 space-y-0.5 py-1">
                          {group.items.map((item, idx) => {
                            const ItemIcon = item.icon
                            const active = isActive(item.href)

                            return (
                              <motion.div
                                key={item.href}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.04 }}
                              >
                                <Link
                                  href={item.href}
                                  className={`
                                    group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200
                                    ${
                                      active
                                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-sm shadow-blue-200/50"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                                    }
                                  `}
                                >
                                  <ItemIcon
                                    size={14}
                                    strokeWidth={active ? 2.5 : 2}
                                    className="flex-shrink-0"
                                  />
                                  <span className={active ? "font-bold truncate" : "font-semibold truncate"}>
                                    {item.label}
                                  </span>
                                </Link>
                              </motion.div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </nav>

          {/* ── Sidebar Footer ── */}
          <div className="p-3 border-t border-slate-200 rounded-bl-3xl bg-slate-50/50">
            <motion.button
              whileHover={{ scale: loggingOut ? 1 : 1.02 }}
              whileTap={{ scale: loggingOut ? 1 : 0.97 }}
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 hover:border-red-200 transition-all duration-200 font-bold text-sm"
            >
              <LogOut size={15} strokeWidth={2.5} />
              {!sidebarCollapsed && (
                <span className="text-sm font-bold">
                  {loggingOut ? "Logging out..." : "Logout"}
                </span>
              )}
            </motion.button>
          </div>
        </aside>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-3xl lg:rounded-l-none lg:rounded-r-3xl border border-slate-200 lg:border-l-0 shadow-2xl shadow-slate-300/40 overflow-hidden">

          {/* ── HEADER ── */}
          <header className="h-20 flex items-center justify-between px-6 lg:px-8 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50">
            <div className="lg:hidden" />

            <div className="flex items-center gap-3 ml-auto">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="hidden sm:flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all duration-200"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                  <User size={14} strokeWidth={2.5} />
                </div>
                <span className="text-sm font-bold">Admin</span>
              </motion.div>
            </div>
          </header>

          {/* ── MAIN CONTENT ── */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto bg-slate-50/30">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}