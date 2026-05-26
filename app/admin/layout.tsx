/* 
  Layout Admin Mans-Cell.
  Revisi:
  - loading "Memuat panel..." hanya muncul saat belum ada session lokal
  - refresh langsung tampil dari localStorage lalu validasi auth berjalan diam-diam
  - fetch badge restock dan approval tidak menahan tampilan panel
  - grup Transaksi Admin berada di atas Transaksi Kasir
  - sidebar mengikuti layout referensi dengan warna biru: from-sky-500 via-sky-600 to-blue-500
  - header mobile putih, tanpa background biru
  - konten mobile diberi jarak lebih tinggi dari header
  - role karyawan murni hanya melihat dan mengakses grup Transaksi Kasir
  - role admin/owner atau admin+karyawan mendapat akses penuh
  - label panel mengikuti role utama: Owner, Admin, atau Karyawan
  - kartu akun menampilkan nama user, bukan role
  - akses halaman di luar hak role diarahkan ke halaman not-found tanpa menampilkan dashboard terlebih dahulu
  - tombol Akun Karyawan tidak tampil jika akun memiliki role owner
  - logo brand sidebar/header mengambil dari public/logo-icon.png dengan tag img agar stabil di mobile
  - fallback auth/route checking dibuat putih penuh agar tidak muncul blank hitam
*/

"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore"
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
  Tag,
  Ruler,
  Truck,
  Wifi,
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
  Receipt,
  Boxes,
  BarChart3,
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  BriefcaseBusiness,
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

type UserRole = "owner" | "admin" | "karyawan"

type MansCellSession = {
  uid: string
  roles: UserRole[]
  userName?: string
  checkedAt: number
}

const VALID_ROLES: UserRole[] = ["owner", "admin", "karyawan"]

const normalizeRoles = (raw: any): UserRole[] => {
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
          VALID_ROLES.includes(role as UserRole),
        ),
    ),
  )
}

const hasAnyRole = (roles: UserRole[]) => roles.length > 0
const hasFullAccess = (roles: UserRole[]) => roles.includes("owner") || roles.includes("admin")
const isCashierOnly = (roles: UserRole[]) => roles.includes("karyawan") && !hasFullAccess(roles)
const getRoleLabel = (roles: UserRole[]) => {
  if (roles.includes("owner")) return "Owner"
  if (roles.includes("admin")) return "Admin"
  if (roles.includes("karyawan")) return "Karyawan"
  return "User"
}

const SESSION_KEY = "mans_cell_session"

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
  const [restockCount, setRestockCount] = useState(0)
  const [approvalCount, setApprovalCount] = useState(0)
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [userName, setUserName] = useState("User")
  const [routeChecking, setRouteChecking] = useState(true)

  const saveLocalSession = (uid: string, roles: UserRole[], nextUserName?: string) => {
    if (typeof window === "undefined") return
    if (!uid || !hasAnyRole(roles)) return

    const payload: MansCellSession = {
      uid,
      roles,
      userName: nextUserName || "User",
      checkedAt: Date.now(),
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  }

  const clearLocalSession = () => {
    if (typeof window === "undefined") return
    localStorage.removeItem(SESSION_KEY)
  }

  const readLocalSession = (): MansCellSession | null => {
    if (typeof window === "undefined") return null

    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null

      const parsed = JSON.parse(raw) as MansCellSession & { role?: UserRole }
      const roles = normalizeRoles({ roles: parsed?.roles, role: parsed?.role })

      if (!parsed?.uid) return null
      if (!hasAnyRole(roles)) return null

      return {
        uid: parsed.uid,
        roles,
        userName: String(parsed?.userName || "User"),
        checkedAt: Number(parsed?.checkedAt || Date.now()),
      }
    } catch {
      clearLocalSession()
      return null
    }
  }

  const allMenuGroups: MenuGroup[] = useMemo(
    () => [
      {
        label: "Data Master",
        icon: Database,
        items: [
          { href: "/admin/tambah-toko", icon: Store, label: "Data Toko" },
          { href: "/admin/tambah-karyawan", icon: Users, label: "Data Karyawan" },
          { href: "/admin/tambah-pelanggan", icon: Users, label: "Data Pelanggan" },
          { href: "/admin/akun-pelanggan", icon: UserPlus, label: "Akun Pelanggan" },
          { href: "/admin/buat-akun", icon: KeyRound, label: "Akun Karyawan" },
          { href: "/admin/tambah-kategori", icon: Tag, label: "Kategori Barang" },
          { href: "/admin/tambah-satuan", icon: Ruler, label: "Satuan Barang" },
          { href: "/admin/tambah-supplier", icon: Truck, label: "Supplier" },
          { href: "/admin/tambah-saldo", icon: Wallet, label: "Saldo Digital" },
          { href: "/admin/tambah-provider", icon: Wifi, label: "Provider Digital" },
          { href: "/admin/tambah-barang", icon: Package, label: "Data Barang" },
          { href: "/admin/tambah-barang-tetap", icon: Building2, label: "Aset Tetap" },
        ],
      },
      {
        label: "Transaksi Admin",
        icon: Boxes,
        items: [
          { href: "/admin/restock-barang", icon: AlertTriangle, label: "Pembelian Barang" },
          { href: "/admin/transfer-barang", icon: ArrowRightLeft, label: "Transfer Barang" },
          { href: "/admin/terima-barang", icon: ArrowDownToLine, label: "Terima Barang" },
          { href: "/admin/mutasi-stok", icon: Boxes, label: "Mutasi Stok" },
          { href: "/admin/pengeluaran", icon: Wallet, label: "Pengeluaran" },
        ],
      },
      {
        label: "Transaksi Kasir",
        icon: ShoppingCart,
        items: [
          { href: "/admin/transaksi", icon: ShoppingCart, label: "Transaksi Kasir" },
          { href: "/admin/tambah-diskon", icon: Percent, label: "Tambah Diskon" },
          { href: "/admin/tambah-metode-pembayaran", icon: Wallet, label: "Metode Pembayaran" },
          { href: "/admin/riwayat-transaksi", icon: Receipt, label: "Riwayat Transaksi" },
          { href: "/admin/laporan-harian", icon: BarChart3, label: "Laporan Harian Kasir" },
          { href: "/admin/laporan-bulanan", icon: BarChart3, label: "Laporan Bulanan Kasir" },
        ],
      },
      {
        label: "Laporan",
        icon: BarChart3,
        items: [
          { href: "/admin/laporan-pengeluaran", icon: BarChart3, label: "Laporan Pengeluaran" },
          { href: "/admin/laporan-pembelian-barang", icon: BarChart3, label: "Laporan Pembelian Barang" },
          { href: "/admin/laporan-keuntungan-bulanan", icon: BarChart3, label: "Laporan Keuntungan Bulanan" },
          { href: "/admin/laporan-keuntungan-harian", icon: BarChart3, label: "Laporan Keuntungan Harian" },
          { href: "/admin/laporan-setelah-modal-tetap", icon: BarChart3, label: "Laporan Setelah Modal Tetap" },
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
            href: "/admin/persetujuan-absensi-karyawan",
            icon: ClipboardList,
            label: "Persetujuan Absensi",
          },
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

  const transaksiKasirGroup = useMemo(
    () =>
      allMenuGroups.find((group) => group.label === "Transaksi Kasir") || {
        label: "Transaksi Kasir",
        icon: ShoppingCart,
        items: [],
      },
    [allMenuGroups],
  )

  const fullAccess = useMemo(() => hasFullAccess(userRoles), [userRoles])
  const cashierOnly = useMemo(() => isCashierOnly(userRoles), [userRoles])
  const canBackToKaryawan = useMemo(
    () =>
      !userRoles.includes("owner") &&
      (userRoles.includes("admin") || userRoles.includes("karyawan")),
    [userRoles],
  )

  const menuGroups: MenuGroup[] = useMemo(() => {
    if (fullAccess) return allMenuGroups
    if (cashierOnly) return [transaksiKasirGroup]
    return []
  }, [allMenuGroups, cashierOnly, fullAccess, transaksiKasirGroup])

  const allowedPaths = useMemo(() => {
    const transaksiKasirPaths = transaksiKasirGroup.items.map((item) => item.href)

    if (fullAccess) {
      return [
        "/admin",
        ...allMenuGroups.flatMap((group) => group.items.map((item) => item.href)),
      ]
    }

    if (cashierOnly) {
      return transaksiKasirPaths
    }

    return []
  }, [allMenuGroups, cashierOnly, fullAccess, transaksiKasirGroup])

  const fetchRestockCount = async () => {
    try {
      const [barangSnap, saldoSnap] = await Promise.all([
        getDocs(query(collection(db, "barang"))),
        getDocs(query(collection(db, "master_saldo_digital"))),
      ])

      const totalBarangRestock = barangSnap.docs.reduce((sum, d) => {
        const x = d.data() as any
        const jenisBarang = (x?.jenisBarang || "fisik") as "fisik" | "digital"
        const stok = Number(x?.stok || 0)
        const stokMinimum = Number(x?.stokMinimum || 0)

        if (jenisBarang === "fisik" && stok <= stokMinimum) return sum + 1
        return sum
      }, 0)

      const totalSaldoRestock = saldoSnap.docs.reduce((sum, d) => {
        const x = d.data() as any
        const aktif = x?.aktif !== false
        const jumlahSaldo = Number(x?.jumlahSaldo || 0)
        const jumlahMinimum = Number(x?.jumlahMinimum || 0)

        if (aktif && jumlahSaldo <= jumlahMinimum) return sum + 1
        return sum
      }, 0)

      setRestockCount(totalBarangRestock + totalSaldoRestock)
    } catch (error) {
      console.error("Gagal memuat notifikasi restock:", error)
      setRestockCount(0)
    }
  }

  const fetchApprovalCount = async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, "absensi_karyawan"),
          where("approvalStatus", "==", "pending"),
          where("status", "in", ["izin", "sakit"])
        )
      )

      setApprovalCount(snap.size)
    } catch (error) {
      console.error("Gagal memuat notifikasi persetujuan absensi:", error)
      setApprovalCount(0)
    }
  }

  const refreshBadges = (roles: UserRole[]) => {
    if (hasFullAccess(roles)) {
      void Promise.all([fetchRestockCount(), fetchApprovalCount()])
      return
    }

    setRestockCount(0)
    setApprovalCount(0)
  }

  const getGroupsFromPath = (currentPath: string) => {
    const nextOpenGroup: string[] = []

    if (
      currentPath.startsWith("/admin/tambah-toko") ||
      currentPath.startsWith("/admin/tambah-karyawan") ||
      currentPath.startsWith("/admin/tambah-pelanggan") ||
      currentPath.startsWith("/admin/akun-pelanggan") ||
      currentPath.startsWith("/admin/buat-akun") ||
      currentPath.startsWith("/admin/tambah-saldo") ||
      currentPath.startsWith("/admin/tambah-provider") ||
      currentPath.startsWith("/admin/tambah-barang") ||
      currentPath.startsWith("/admin/tambah-kategori") ||
      currentPath.startsWith("/admin/tambah-satuan") ||
      currentPath.startsWith("/admin/tambah-supplier") ||
      currentPath.startsWith("/admin/tambah-barang-tetap")
    ) {
      nextOpenGroup.push("Data Master")
    }

    if (
      currentPath.startsWith("/admin/restock-barang") ||
      currentPath.startsWith("/admin/transfer-barang") ||
      currentPath.startsWith("/admin/terima-barang") ||
      currentPath.startsWith("/admin/mutasi-stok") ||
      currentPath.startsWith("/admin/pengeluaran")
    ) {
      nextOpenGroup.push("Transaksi Admin")
    }

    if (
      currentPath.startsWith("/admin/transaksi") ||
      currentPath.startsWith("/admin/tambah-diskon") ||
      currentPath.startsWith("/admin/tambah-metode-pembayaran") ||
      currentPath.startsWith("/admin/riwayat-transaksi") ||
      currentPath.startsWith("/admin/laporan-harian") ||
      currentPath.startsWith("/admin/laporan-bulanan")
    ) {
      nextOpenGroup.push("Transaksi Kasir")
    }

    if (
      currentPath.startsWith("/admin/laporan-pengeluaran") ||
      currentPath.startsWith("/admin/laporan-pembelian-barang") ||
      currentPath.startsWith("/admin/laporan-keuntungan-bulanan") ||
      currentPath.startsWith("/admin/laporan-keuntungan-harian") ||
      currentPath.startsWith("/admin/laporan-setelah-modal-tetap")
    ) {
      nextOpenGroup.push("Laporan")
    }

    if (
      currentPath.startsWith("/admin/dashboard-absensi") ||
      currentPath.startsWith("/admin/pengaturan-jam") ||
      currentPath.startsWith("/admin/tidak-wajib-absensi") ||
      currentPath.startsWith("/admin/persetujuan-absensi-karyawan") ||
      currentPath.startsWith("/admin/laporan-absensi-bulanan") ||
      currentPath.startsWith("/admin/laporan-absensi-karyawan")
    ) {
      nextOpenGroup.push("Absensi Karyawan")
    }

    return nextOpenGroup
  }

  useEffect(() => {
    const cached = readLocalSession()

    if (cached) {
      setUserRoles(cached.roles)
      setUserName(cached.userName || "User")
      setIsAuthorized(true)
      setAuthLoading(false)
    }

    setHasHydrated(true)
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    setSidebarOpen(false)
  }, [pathname, hasHydrated])

  useEffect(() => {
    if (!sidebarOpen) return

    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = oldOverflow
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!hasHydrated) return
    let isMounted = true

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!isMounted) return

      if (!user) {
        clearLocalSession()
        setUserRoles([])
        setUserName("User")
        setIsAuthorized(false)
        setAuthLoading(false)
        router.replace("/login")
        return
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid))

        if (!isMounted) return

        if (!snap.exists()) {
          clearLocalSession()
          setUserRoles([])
          setUserName("User")
          setIsAuthorized(false)
          setAuthLoading(false)
          router.replace("/not-found")
          return
        }

        const data = snap.data()
        const roles = normalizeRoles(data)
        const nextUserName = String(data?.nama || data?.name || data?.displayName || "User").trim() || "User"

        if (!hasAnyRole(roles)) {
          clearLocalSession()
          setUserRoles([])
          setUserName("User")
          setIsAuthorized(false)
          setAuthLoading(false)
          router.replace("/not-found")
          return
        }

        saveLocalSession(user.uid, roles, nextUserName)
        setUserRoles(roles)
        setUserName(nextUserName)
        setIsAuthorized(true)
        setAuthLoading(false)

        refreshBadges(roles)
      } catch (error) {
        console.error("Gagal validasi user admin/karyawan:", error)
        clearLocalSession()
        setUserRoles([])
        setUserName("User")
        setIsAuthorized(false)
        setAuthLoading(false)
        router.replace("/login")
      }
    })

    return () => {
      isMounted = false
      unsub()
    }
  }, [router, hasHydrated])

  useEffect(() => {
    if (!hasHydrated || !isAuthorized || !hasAnyRole(userRoles)) return
    refreshBadges(userRoles)
  }, [pathname, hasHydrated, isAuthorized, userRoles])

  useEffect(() => {
    if (!hasHydrated) return

    const groupsFromPath = getGroupsFromPath(pathname)
    setOpenGroup((prev) => {
      const merged = new Set([...prev, ...groupsFromPath])
      return Array.from(merged)
    })
  }, [pathname, hasHydrated])

  useEffect(() => {
    if (!hasHydrated || !isAuthorized || !hasAnyRole(userRoles)) return

    const isAllowed = allowedPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )

    if (cashierOnly && pathname === "/admin") {
      setRouteChecking(true)
      router.replace("/admin/transaksi")
      return
    }

    if (!isAllowed) {
      setRouteChecking(true)
      router.replace("/not-found")
      return
    }

    setRouteChecking(false)
  }, [
    pathname,
    hasHydrated,
    isAuthorized,
    userRoles,
    allowedPaths,
    router,
    cashierOnly,
  ])

  const isActive = (href: string) => {
    if (href === "/admin/tambah-barang") return pathname === "/admin/tambah-barang"
    if (href === "/admin/tambah-saldo") return pathname === "/admin/tambah-saldo"
    if (href === "/admin/tambah-provider") return pathname === "/admin/tambah-provider"
    if (href === "/admin/tambah-kategori") return pathname === "/admin/tambah-kategori"
    if (href === "/admin/tambah-satuan") return pathname === "/admin/tambah-satuan"
    if (href === "/admin/tambah-supplier") return pathname === "/admin/tambah-supplier"

    if (href === "/admin/dashboard-absensi") return pathname === "/admin/dashboard-absensi"
    if (href === "/admin/transaksi") return pathname === "/admin/transaksi"

    return pathname === href
  }

  const handleLogout = async () => {
    if (loggingOut) return

    try {
      setLoggingOut(true)
      await signOut(auth)
      clearLocalSession()
      router.replace("/login")
    } catch (error) {
      console.error("Logout gagal:", error)
    } finally {
      setLoggingOut(false)
    }
  }

  if (!hasHydrated) {
    return <div className="min-h-screen bg-white" />
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6" style={{ backgroundColor: "#ffffff" }}>
        <div className="w-full max-w-sm rounded-[2rem] border border-slate-100 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-100/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50">
              <Cpu className="text-sky-600" size={20} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Memuat panel...</p>
              <p className="text-xs text-slate-500">Sedang cek autentikasi dan role user</p>
            </div>
          </div>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-50">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return <div className="min-h-screen bg-white" />
  }

  if (routeChecking) {
    return <div className="min-h-screen bg-white" />
  }

  const roleLabel = getRoleLabel(userRoles)
  const homeHref = cashierOnly ? "/admin/transaksi" : "/admin"
  const homeLabel = cashierOnly ? "Transaksi Kasir" : "Dashboard"
  const mobileDescription = cashierOnly
    ? "Akses transaksi kasir, diskon, metode pembayaran, dan riwayat penjualan."
    : roleLabel === "Owner"
      ? "Kelola transaksi, stok barang, laporan, dan absensi karyawan sebagai owner."
      : "Kelola transaksi, stok barang, laporan, dan absensi karyawan sebagai admin."

  const NavMenu = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={`${mobile ? "space-y-1" : "flex-1 space-y-1 overflow-y-auto px-3 py-5"}`}>
      {fullAccess && (
      <Link
                href={homeHref}
                onClick={() => setSidebarOpen(false)}
                className={`
                  group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200
                  ${
                    pathname === homeHref
                      ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                      : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
                  }
                `}
              >
                <div
                  className={`
                    flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-200
                    ${pathname === homeHref ? "bg-white/20" : "bg-sky-50 text-sky-700 group-hover:bg-sky-100"}
                  `}
                >
                  <Home size={15} strokeWidth={2.5} />
                </div>
                {(mobile || !sidebarCollapsed) && <span className="text-sm font-black">{homeLabel}</span>}
              </Link>
      )}

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
                    ? prev.filter((l) => l !== group.label)
                    : [...prev, group.label]
                )
              }
              className={`
                flex w-full items-center justify-between rounded-2xl px-3 py-2.5 transition-colors duration-200
                ${
                  hasActiveChild
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
                }
              `}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`
                    flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-200
                    ${
                      hasActiveChild
                        ? "bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/10"
                        : "bg-slate-50 text-slate-500"
                    }
                  `}
                >
                  <GroupIcon size={15} strokeWidth={2.5} />
                </div>

                {(mobile || !sidebarCollapsed) && (
                  <span className="truncate text-sm font-black">{group.label}</span>
                )}
              </div>

              {(mobile || !sidebarCollapsed) && (
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <ChevronDown size={14} strokeWidth={2.5} className="text-slate-400" />
                </motion.div>
              )}
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (mobile || !sidebarCollapsed) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden pl-3"
                >
                  <div className="space-y-0.5 border-l-2 border-sky-100/80 py-1 pl-2">
                    {group.items.map((item, idx) => {
                      const ItemIcon = item.icon
                      const active = isActive(item.href)
                      const isRestockMenu = item.href === "/admin/restock-barang"
                      const isApprovalMenu = item.href === "/admin/persetujuan-absensi-karyawan"

                      return (
                        <motion.div
                          key={item.href}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.02, duration: 0.15 }}
                        >
                          <Link
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`
                              group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors duration-200
                              ${
                                active
                                  ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/10"
                                  : "text-slate-600 hover:bg-sky-50 hover:text-sky-800"
                              }
                            `}
                          >
                            <ItemIcon
                              size={14}
                              strokeWidth={active ? 2.5 : 2}
                              className="flex-shrink-0"
                            />

                            <span className={`truncate ${active ? "font-black" : "font-semibold"}`}>
                              {item.label}
                            </span>

                            {isRestockMenu && restockCount > 0 && (
                              <span
                                className={`ml-auto inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                                  active ? "bg-white text-sky-600" : "bg-orange-500 text-white"
                                }`}
                              >
                                {restockCount}
                              </span>
                            )}

                            {isApprovalMenu && approvalCount > 0 && (
                              <span
                                className={`ml-auto inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                                  active ? "bg-white text-orange-600" : "bg-orange-500 text-white"
                                }`}
                              >
                                {approvalCount}
                              </span>
                            )}
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
  )

  return (
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
                    {roleLabel}
                  </span>
                </div>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-sky-600/70">
                  Panel Management
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

          <NavMenu />

          <div className="space-y-2 rounded-bl-[2rem] border-t border-sky-100/70 bg-gradient-to-r from-sky-50/80 via-white to-cyan-50/50 p-3">
            {canBackToKaryawan && (
              <button
                type="button"
                onClick={() => router.push("/karyawan")}
                className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-white shadow-sm shadow-sky-500/15 transition-colors duration-200 hover:from-sky-600 hover:via-sky-700 hover:to-blue-600"
                title="Kembali ke akun karyawan"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 text-white transition-colors duration-200 group-hover:bg-white/25">
                  <BriefcaseBusiness size={15} strokeWidth={2.5} />
                </div>
                {!sidebarCollapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-black">
                      Akun Karyawan
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

            <div className="flex items-center gap-3">
              {fullAccess && (
                <button
                  type="button"
                  onClick={() => router.push("/admin/restock-barang")}
                  className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  aria-label="Notifikasi restock"
                >
                  <Bell size={18} strokeWidth={2} />

                  {restockCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white shadow-sm">
                      {restockCount}
                    </span>
                  )}
                </button>
              )}

              {fullAccess && (
                <button
                  type="button"
                  onClick={() => router.push("/admin/persetujuan-absensi-karyawan")}
                  className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  aria-label="Persetujuan absensi"
                >
                  <ClipboardList size={18} strokeWidth={2} />

                  {approvalCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-sm">
                      {approvalCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                className="hidden items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:flex"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 text-white">
                  <User size={14} strokeWidth={2.5} />
                </div>
                <span className="max-w-[180px] truncate text-sm font-bold">{userName}</span>
              </button>
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
              onClick={() => router.push(homeHref)}
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
                    {roleLabel}
                  </span>
                </span>
                <span className="block truncate text-[9px] font-bold uppercase tracking-[0.2em] text-sky-600/70">
                  Panel Management
                </span>
              </span>
            </button>

            <div className="flex flex-shrink-0 items-center gap-2">
              {fullAccess && (
                <button
                  type="button"
                  onClick={() => router.push("/admin/restock-barang")}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  aria-label="Notifikasi restock"
                >
                  <Bell size={17} strokeWidth={2.3} />
                  {restockCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white shadow-sm">
                      {restockCount}
                    </span>
                  )}
                </button>
              )}

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
                        {roleLabel}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-50/80">
                      Panel Management
                    </p>
                  </div>
                </div>

                <p className="line-clamp-2 text-sm leading-6 text-sky-50">
                  {mobileDescription}
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
                      {userName}
                    </p>
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-sky-600/70">
                      {roleLabel}
                    </p>
                  </div>
                </div>
              </div>

              <NavMenu mobile />
            </div>

            <div className="mt-4 space-y-2">
              {canBackToKaryawan && (
                <button
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push("/karyawan")
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-white shadow-sm shadow-sky-500/15 transition-colors duration-200 hover:from-sky-600 hover:via-sky-700 hover:to-blue-600"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 text-white transition-colors duration-200 group-hover:bg-white/25">
                    <BriefcaseBusiness size={15} strokeWidth={2.5} />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-black">
                    Akun Karyawan
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

        <main className="min-h-[calc(100vh-4rem)] bg-white px-3 pt-[108px] pb-4 sm:px-4">
  <div className="mx-auto w-full max-w-[720px]">
    {children}
  </div>
</main>
      </div>
    </div>
  )
}