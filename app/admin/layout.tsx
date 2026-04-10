/* 
  Layout admin dengan auth guard yang aman dari hydration mismatch.
  Revisi ini menambahkan grup baru Transaksi dan memindahkan menu terkait transaksi
  agar sidebar lebih rapi: Master Data, Transaksi, dan Absensi Karyawan.
*/

"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
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
  ArrowRightLeft,
  UserPlus,
  Wallet,
  Percent,
  ShoppingCart,
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

  const [hasHydrated, setHasHydrated] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openGroup, setOpenGroup] = useState<string[]>([])
  const [loggingOut, setLoggingOut] = useState(false)

  const [authLoading, setAuthLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  const menuGroups: MenuGroup[] = useMemo(
    () => [
      {
        label: "Master Data",
        icon: Database,
        items: [
          { href: "/admin/tambah-toko", icon: Store, label: "Tambah Toko" },
          { href: "/admin/tambah-karyawan", icon: Users, label: "Tambah Karyawan" },
          { href: "/admin/tambah-barang", icon: Package, label: "Tambah Barang" },
          { href: "/admin/tambah-barang-tetap", icon: Building2, label: "Tambah Barang Tetap" },
          { href: "/admin/transfer-barang", icon: ArrowRightLeft, label: "Transfer Barang" },
          { href: "/admin/tambah-pelanggan", icon: Users, label: "Pelanggan" },
          { href: "/admin/akun-pelanggan", icon: UserPlus, label: "Akun Pelanggan" },
          { href: "/admin/buat-akun", icon: KeyRound, label: "Akun Karyawan" },
        ],
      },
      {
        label: "Transaksi",
        icon: ShoppingCart,
        items: [
          { href: "/admin/transaksi", icon: ShoppingCart, label: "Transaksi Kasir" },
          { href: "/admin/tambah-diskon", icon: Percent, label: "Tambah Diskon" },
          { href: "/admin/tambah-metode-pembayaran", icon: Wallet, label: "Metode Pembayaran" },
        ],
      },
      {
        label: "Absensi Karyawan",
        icon: Users,
        items: [
          { href: "/admin/dashboard-absensi", icon: Home, label: "Dashboard Absensi" },
          {
            href: "/admin/laporan-absensi-karyawan",
            icon: ClipboardList,
            label: "Laporan Absensi Karyawan",
          },
          { href: "/admin/pengaturan-jam", icon: Calendar, label: "Pengaturan Jam" },
          { href: "/admin/tidak-wajib-absensi", icon: UserX, label: "Tidak Wajib Absensi" },
          {
            href: "/admin/laporan-absensi-bulanan",
            icon: ClipboardList,
            label: "Laporan Absensi Bulanan",
          },
        ],
      },
    ],
    []
  )

  const getGroupsFromPath = (currentPath: string) => {
    const nextOpenGroup: string[] = []

    if (
      currentPath.startsWith("/admin/tambah-toko") ||
      currentPath.startsWith("/admin/tambah-karyawan") ||
      currentPath.startsWith("/admin/tambah-barang") ||
      currentPath.startsWith("/admin/tambah-kategori") ||
      currentPath.startsWith("/admin/tambah-satuan") ||
      currentPath.startsWith("/admin/tambah-supplier") ||
      currentPath.startsWith("/admin/tambah-barang-tetap") ||
      currentPath.startsWith("/admin/transfer-barang") ||
      currentPath.startsWith("/admin/tambah-pelanggan") ||
      currentPath.startsWith("/admin/akun-pelanggan") ||
      currentPath.startsWith("/admin/buat-akun")
    ) {
      nextOpenGroup.push("Master Data")
    }

    if (
      currentPath.startsWith("/admin/transaksi") ||
      currentPath.startsWith("/admin/tambah-diskon") ||
      currentPath.startsWith("/admin/tambah-metode-pembayaran")
    ) {
      nextOpenGroup.push("Transaksi")
    }

    if (
      currentPath.startsWith("/admin/dashboard-absensi") ||
      currentPath.startsWith("/admin/pengaturan-jam") ||
      currentPath.startsWith("/admin/tidak-wajib-absensi") ||
      currentPath.startsWith("/admin/laporan-absensi-bulanan") ||
      currentPath.startsWith("/admin/laporan-absensi-karyawan")
    ) {
      nextOpenGroup.push("Absensi Karyawan")
    }

    return nextOpenGroup
  }

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    setSidebarOpen(false)
  }, [pathname, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return

    let isMounted = true

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!isMounted) return

      if (!user) {
        setIsAuthorized(false)
        setAuthLoading(false)
        router.replace("/login")
        return
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid))

        if (!isMounted) return

        if (!snap.exists()) {
          setIsAuthorized(false)
          setAuthLoading(false)
          router.replace("/unauthorized")
          return
        }

        const data = snap.data()
        const role: string = data?.role || ""

        if (role !== "admin") {
          setIsAuthorized(false)
          setAuthLoading(false)
          router.replace("/unauthorized")
          return
        }

        setIsAuthorized(true)
      } catch (error) {
        console.error("Gagal validasi user admin:", error)
        setIsAuthorized(false)
        router.replace("/login")
      } finally {
        if (isMounted) {
          setAuthLoading(false)
        }
      }
    })

    return () => {
      isMounted = false
      unsub()
    }
  }, [router, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return

    const groupsFromPath = getGroupsFromPath(pathname)

    setOpenGroup((prev) => {
      const merged = new Set([...prev, ...groupsFromPath])
      return Array.from(merged)
    })
  }, [pathname, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false)
      }
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [hasHydrated])

  const isActive = (href: string) => {
    if (href === "/admin/tambah-barang") {
      return (
        pathname === "/admin/tambah-barang" ||
        pathname === "/admin/tambah-kategori" ||
        pathname === "/admin/tambah-satuan" ||
        pathname === "/admin/tambah-supplier"
      )
    }

    if (href === "/admin/dashboard-absensi") {
      return pathname === "/admin/dashboard-absensi"
    }

    if (href === "/admin/transaksi") {
      return pathname === "/admin/transaksi"
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

  if (!hasHydrated) {
    return null
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
              <Cpu className="text-blue-600" size={20} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Memuat panel admin...</p>
              <p className="text-xs text-slate-500">Sedang cek autentikasi dan role user</p>
            </div>
          </div>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="relative flex min-h-screen gap-3 overflow-x-hidden bg-slate-100 p-3 sm:gap-4 sm:p-4">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-0 top-1/4 h-72 w-72 rounded-full bg-cyan-200/20 blur-[90px]" />
        <div className="absolute bottom-1/3 right-0 h-72 w-72 rounded-full bg-blue-200/20 blur-[90px]" />
        <div className="absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-indigo-200/15 blur-[80px]" />
      </div>

      <button
        type="button"
        onClick={() => setSidebarOpen((prev) => !prev)}
        className="fixed left-5 top-5 z-[70] flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg lg:hidden"
        aria-label={sidebarOpen ? "Tutup sidebar" : "Buka sidebar"}
      >
        {sidebarOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
      </button>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            type="button"
            aria-label="Tutup sidebar"
            onClick={() => setSidebarOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[40] bg-slate-900/30 backdrop-blur-[2px] lg:hidden"
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex min-w-0 flex-1 gap-3 sm:gap-4">
        <aside
          className={`
            fixed inset-y-3 left-3 z-[60] flex max-w-[calc(100vw-1.5rem)] flex-col
            rounded-3xl border border-slate-200 bg-white shadow-xl transition-all duration-300 ease-in-out
            lg:relative lg:inset-y-0 lg:left-0 lg:rounded-l-3xl lg:rounded-r-none
            ${sidebarCollapsed ? "w-20" : "w-72"}
            ${sidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)] lg:translate-x-0"}
          `}
        >
          <div className="relative flex h-20 items-center gap-3 overflow-hidden rounded-tl-3xl border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50 px-5">
            <div className="pointer-events-none absolute right-2 top-1 opacity-[0.05]">
              <Cpu size={72} strokeWidth={1} className="text-cyan-600" />
            </div>

            <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <Store className="text-blue-600" size={20} strokeWidth={2.5} />
            </div>

            {!sidebarCollapsed && (
              <div className="relative min-w-0">
                <div className="text-base font-black leading-none tracking-tight text-slate-800">
                  Mans-Cell{" "}
                  <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                    Admin
                  </span>
                </div>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Panel Management
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="absolute -right-3 top-[88px] z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:text-slate-700 lg:flex"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={13} strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={13} strokeWidth={2.5} />
            )}
          </button>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
            <Link
              href="/admin"
              className={`
                group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200
                ${
                  pathname === "/admin"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md"
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
                    type="button"
                    onClick={() =>
                      setOpenGroup((prev) =>
                        prev.includes(group.label)
                          ? prev.filter((label) => label !== group.label)
                          : [...prev, group.label]
                      )
                    }
                    className={`
                      flex w-full items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200
                      ${
                        hasActiveChild
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                      }
                    `}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`
                          flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200
                          ${
                            hasActiveChild
                              ? "bg-gradient-to-br from-blue-400 to-cyan-500 text-white shadow-sm"
                              : "bg-slate-100"
                          }
                        `}
                      >
                        <GroupIcon size={15} strokeWidth={2.5} />
                      </div>

                      {!sidebarCollapsed && (
                        <span className="truncate text-sm font-bold">{group.label}</span>
                      )}
                    </div>

                    {!sidebarCollapsed && (
                      <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.18 }}
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
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden pl-3"
                      >
                        <div className="space-y-0.5 border-l-2 border-slate-100 py-1 pl-2">
                          {group.items.map((item, idx) => {
                            const ItemIcon = item.icon
                            const active = isActive(item.href)

                            return (
                              <motion.div
                                key={item.href}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.03, duration: 0.15 }}
                              >
                                <Link
                                  href={item.href}
                                  className={`
                                    group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200
                                    ${
                                      active
                                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-sm"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                                    }
                                  `}
                                >
                                  <ItemIcon
                                    size={14}
                                    strokeWidth={active ? 2.5 : 2}
                                    className="flex-shrink-0"
                                  />
                                  <span className={active ? "truncate font-bold" : "truncate font-semibold"}>
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

          <div className="rounded-bl-3xl border-t border-slate-200 bg-slate-50/50 p-3">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-all duration-200 hover:border-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LogOut size={15} strokeWidth={2.5} />
              {!sidebarCollapsed && (
                <span className="text-sm font-bold">
                  {loggingOut ? "Logging out..." : "Logout"}
                </span>
              )}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl lg:rounded-l-none lg:rounded-r-3xl lg:border-l-0">
          <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50 px-6 lg:px-8">
            <div className="w-10 lg:hidden" />

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm sm:flex">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                  <User size={14} strokeWidth={2.5} />
                </div>
                <span className="text-sm font-bold">Admin</span>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-slate-50/30 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}