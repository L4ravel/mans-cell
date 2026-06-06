/*
  app/admin/laporan-bulanan/page.tsx
  Halaman admin laporan bulanan.
  Keuntungan bersih hanya terlihat untuk role admin dan owner.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  ListFilter,
  Percent,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type BreakdownMetode = {
  nama: string
  jumlahTransaksi: number
  omzet: number
  admin: number
}

type LaporanBulanan = {
  id: string
  bulanKey: string
  tahun: number
  bulan: number
  tokoId: string
  tokoNama: string
  jumlahTransaksi: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalBiayaAdmin: number
  totalModal: number
  totalLabaKotor: number
  totalItemTerjual: number
  totalJenisBarangTerjual: number
  rataRataBelanja: number
  metodePembayaranBreakdown: BreakdownMetode[]
  updatedAtMs: number
}

type UserProfile = {
  uid: string
  nama: string
  email: string
  role: string
  roles: string[]
  tokoId: string
  tokoNama: string
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatBulanKey(value?: string) {
  if (!value) return "-"
  const [year, month] = value.split("-")
  const y = Number(year || 0)
  const m = Number(month || 0)
  if (!y || !m) return value

  const date = new Date(y, m - 1, 1)
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(date)
}

function formatDateTime(value?: number) {
  if (!value) return "-"

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function toMonthInputValue(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

function getStartOfYearMonthInput() {
  const now = new Date()
  return `${now.getFullYear()}-01`
}

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
}

function isAdminProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (role === "admin" || role === "owner" || role === "superadmin") return true
  return profile.roles.includes("admin") || profile.roles.includes("owner") || profile.roles.includes("superadmin")
}

function canViewProfitProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (role === "admin" || role === "owner") return true
  return profile.roles.includes("admin") || profile.roles.includes("owner")
}

function formatProfit(value: number, canViewProfit: boolean) {
  return canViewProfit ? formatRupiah(value) : "-"
}

export default function LaporanBulananPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanList, setLaporanList] = useState<LaporanBulanan[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isAdminUser = useMemo(() => isAdminProfile(currentUserProfile), [currentUserProfile])
  const canViewProfit = useMemo(() => canViewProfitProfile(currentUserProfile), [currentUserProfile])

  const effectiveTokoId = useMemo(
    () => (isAdminUser ? filterToko : String(currentUserProfile?.tokoId || "").trim()),
    [isAdminUser, filterToko, currentUserProfile]
  )

  const showError = (message: string) => {
    setError(message)
    setTimeout(() => setError(null), 3500)
  }

  const fetchCurrentUserProfile = async (uid: string, emailFallback?: string | null) => {
    try {
      const snap = await getDoc(doc(db, "users", uid))
      if (snap.exists()) {
        const data = snap.data() as any
        const profile: UserProfile = {
          uid,
          nama: String(data?.nama || "").trim() || "Tanpa Nama",
          email: String(data?.email || "").trim() || String(emailFallback || "").trim() || "-",
          role: String(data?.role || "").trim().toLowerCase(),
          roles: normalizeRoles(data?.roles),
          tokoId: String(data?.tokoId || "").trim(),
          tokoNama: String(data?.tokoNama || "").trim(),
        }
        setCurrentUserProfile(profile)
        return profile
      }
    } catch (err) {
      console.error("Gagal mengambil profil user:", err)
    }

    const fallback: UserProfile = {
      uid,
      nama: "Tanpa Nama",
      email: String(emailFallback || "").trim() || "-",
      role: "",
      roles: [],
      tokoId: "",
      tokoNama: "",
    }
    setCurrentUserProfile(fallback)
    return fallback
  }

  const mapLaporanDoc = (id: string, raw: any): LaporanBulanan => {
    const breakdown: BreakdownMetode[] = Array.isArray(raw?.metodePembayaranBreakdown)
      ? raw.metodePembayaranBreakdown.map((item: any) => ({
          nama: item?.nama || "Tanpa Nama",
          jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
          omzet: Number(item?.omzet || 0),
          admin: Number(item?.admin || 0),
        }))
      : []

    return {
      id,
      bulanKey: raw?.bulanKey || "",
      tahun: Number(raw?.tahun || 0),
      bulan: Number(raw?.bulan || 0),
      tokoId: raw?.tokoId || "",
      tokoNama: raw?.tokoNama || "",
      jumlahTransaksi: Number(raw?.jumlahTransaksi || 0),
      omzet: Number(raw?.omzet || 0),
      subtotal: Number(raw?.subtotal || 0),
      totalDiskon: Number(raw?.totalDiskon || 0),
      totalSetelahDiskon: Number(raw?.totalSetelahDiskon || 0),
      totalBiayaAdmin: Number(raw?.totalBiayaAdmin || 0),
      totalModal: Number(raw?.totalModal || 0),
      totalLabaKotor: Number(raw?.totalLabaKotor || 0),
      totalItemTerjual: Number(raw?.totalItemTerjual || 0),
      totalJenisBarangTerjual: Number(raw?.totalJenisBarangTerjual || 0),
      rataRataBelanja: Number(raw?.rataRataBelanja || 0),
      metodePembayaranBreakdown: breakdown,
      updatedAtMs: Number(raw?.updatedAtMs || 0),
    }
  }

  const fetchAll = async (profileOverride?: UserProfile | null) => {
    const activeProfile = profileOverride || currentUserProfile
    const admin = isAdminProfile(activeProfile)
    const tokoIdUser = String(activeProfile?.tokoId || "").trim()

    if (!admin && !tokoIdUser) {
      setTokoList([])
      setLaporanList([])
      showError("Akun ini belum terhubung ke toko")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const laporanPromise = getDocs(query(collection(db, "laporan_bulanan"), orderBy("bulanKey", "desc")))

      if (admin) {
        const [tokoSnap, laporanSnap] = await Promise.all([
          getDocs(query(collection(db, "toko"), orderBy("nama"))),
          laporanPromise,
        ])

        const tokoData: Toko[] = tokoSnap.docs
          .map((item) => {
            const x = item.data() as any
            return {
              id: item.id,
              nama: x?.nama || "",
              aktif: Boolean(x?.aktif),
            }
          })
          .filter((item) => item.nama)

        const laporanData = laporanSnap.docs
          .map((item) => mapLaporanDoc(item.id, item.data()))
          .filter((item) => item.bulanKey)

        setTokoList(tokoData)
        setLaporanList(laporanData)
      } else {
        const laporanSnap = await laporanPromise
        const laporanData = laporanSnap.docs
          .map((item) => mapLaporanDoc(item.id, item.data()))
          .filter((item) => item.bulanKey && item.tokoId === tokoIdUser)

        setTokoList([
          {
            id: tokoIdUser,
            nama: String(activeProfile?.tokoNama || "").trim() || "Toko Karyawan",
            aktif: true,
          },
        ])
        setLaporanList(laporanData)
      }
    } catch (err) {
      console.error(err)
      setTokoList([])
      setLaporanList([])
      showError("Gagal memuat laporan bulanan")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUserProfile(null)
        setTokoList([])
        setLaporanList([])
        setLoading(false)
        return
      }

      const profile = await fetchCurrentUserProfile(user.uid, user.email)
      if (!isAdminProfile(profile)) setFilterToko(String(profile.tokoId || "").trim())
      await fetchAll(profile)
    })

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredLaporan = useMemo(() => {
    const q = search.toLowerCase().trim()

    return laporanList.filter((item) => {
      const matchSearch =
        !q ||
        item.bulanKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.metodePembayaranBreakdown.some((metode) => metode.nama.toLowerCase().includes(q))

      const matchToko = !effectiveTokoId || item.tokoId === effectiveTokoId
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [laporanList, search, effectiveTokoId, bulanMulai, bulanSelesai])

  const totalOmzet = filteredLaporan.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredLaporan.reduce((acc, item) => acc + item.jumlahTransaksi, 0)
  const totalDiskon = filteredLaporan.reduce((acc, item) => acc + item.totalDiskon, 0)
  const totalAdmin = filteredLaporan.reduce((acc, item) => acc + item.totalBiayaAdmin, 0)
  const totalLabaKotor = filteredLaporan.reduce((acc, item) => acc + item.totalLabaKotor, 0)
  const totalItemTerjual = filteredLaporan.reduce((acc, item) => acc + item.totalItemTerjual, 0)
  const rataRataBelanja = totalTransaksi > 0 ? totalOmzet / totalTransaksi : 0

  const omzetBulanIni = filteredLaporan
    .filter((item) => item.bulanKey === toMonthInputValue(new Date()))
    .reduce((acc, item) => acc + item.omzet, 0)

  const metodeBreakdown = useMemo(() => {
    const map = new Map<string, { nama: string; jumlahTransaksi: number; omzet: number; admin: number }>()

    for (const laporan of filteredLaporan) {
      for (const metode of laporan.metodePembayaranBreakdown || []) {
        const key = metode.nama || "Tanpa Nama"
        const current = map.get(key) || {
          nama: key,
          jumlahTransaksi: 0,
          omzet: 0,
          admin: 0,
        }

        current.jumlahTransaksi += Number(metode.jumlahTransaksi || 0)
        current.omzet += Number(metode.omzet || 0)
        current.admin += Number(metode.admin || 0)
        map.set(key, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

  const tokoBreakdown = useMemo(() => {
    const map = new Map<string, { tokoId: string; tokoNama: string; bulanAktif: number; transaksi: number; omzet: number }>()

    for (const laporan of filteredLaporan) {
      const key = laporan.tokoId || laporan.tokoNama || laporan.id
      const current = map.get(key) || {
        tokoId: laporan.tokoId,
        tokoNama: laporan.tokoNama || "Tanpa Toko",
        bulanAktif: 0,
        transaksi: 0,
        omzet: 0,
      }

      current.bulanAktif += 1
      current.transaksi += Number(laporan.jumlahTransaksi || 0)
      current.omzet += Number(laporan.omzet || 0)
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredLaporan.length / itemsPerPage))
  const pagedLaporan = itemsPerPage === 0 ? filteredLaporan : filteredLaporan.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => {
    setPage(1)
  }, [search, filterToko, bulanMulai, bulanSelesai, itemsPerPage])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BarChart3 size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Laporan Bulanan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Rekap bulanan omzet, metode pembayaran, toko, dan keuntungan bersih.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => fetchAll()}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                title="Refresh"
              >
                <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
            >
              <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-red-700">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isAdminUser ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <div className="lg:col-span-2">
              <FieldBox label="Cari Laporan">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.5}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Bulan, toko, atau metode pembayaran..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </FieldBox>
            </div>

            <div className="hidden sm:contents">
              {isAdminUser ? (
                <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                  <option value="">Semua Toko</option>
                  {tokoList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama}
                    </option>
                  ))}
                </FilterSelect>
              ) : (
                <FieldBox label="Toko Karyawan">
                  <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                    {currentUserProfile?.tokoNama || "Toko belum terhubung"}
                  </div>
                </FieldBox>
              )}

              <FieldMonth label="Mulai" value={bulanMulai} onChange={setBulanMulai} />
              <FieldMonth label="Selesai" value={bulanSelesai} onChange={setBulanSelesai} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => fetchAll()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15 disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              Refresh
            </button>

            <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
              <ShoppingCart size={14} strokeWidth={2.5} />
              {totalTransaksi} Trx
            </div>

            <button
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </button>
          </div>

          <AnimatePresence initial={false}>
            {filterMobileOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden sm:hidden"
              >
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  {isAdminUser ? (
                    <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                      <option value="">Semua Toko</option>
                      {tokoList.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nama}
                        </option>
                      ))}
                    </FilterSelect>
                  ) : (
                    <FieldBox label="Toko Karyawan">
                      <div className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
                        {currentUserProfile?.tokoNama || "Toko belum terhubung"}
                      </div>
                    </FieldBox>
                  )}

                  <FieldMonth label="Mulai" value={bulanMulai} onChange={setBulanMulai} />
                  <FieldMonth label="Selesai" value={bulanSelesai} onChange={setBulanSelesai} />
                  <FilterSelect
                    label="Tampilkan"
                    value={String(itemsPerPage)}
                    onChange={(value) => setItemsPerPage(Number(value))}
                  >
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="space-y-2 sm:space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              label="Omzet"
              value={formatRupiah(totalOmzet)}
              subValue={`${totalTransaksi} transaksi`}
              tone="sky"
            />
            <StatCard
              icon={Receipt}
              label="Rata-rata"
              value={formatRupiah(rataRataBelanja)}
              subValue={`${totalItemTerjual} item`}
              tone="blue"
            />
            <StatCard
              icon={Percent}
              label="Diskon"
              value={formatRupiah(totalDiskon)}
              subValue={`Admin ${formatRupiah(totalAdmin)}`}
              tone="slate"
            />
            <StatCard
              icon={BadgeDollarSign}
              label="Keuntungan Bersih"
              value={formatProfit(totalLabaKotor, canViewProfit)}
              subValue={canViewProfit ? "Akumulasi" : "Disembunyikan"}
              tone="rose"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={TrendingUp} label="Bulan Ini" value={formatRupiah(omzetBulanIni)} tone="sky" />
            <StatCard icon={ShoppingCart} label="Bulan Direkap" value={String(filteredLaporan.length)} tone="blue" />
            <StatCard icon={Store} label="Toko Aktif" value={String(tokoBreakdown.length)} tone="slate" />
            <StatCard icon={Wallet} label="Metode Aktif" value={String(metodeBreakdown.length)} tone="rose" />
          </div>
        </div>

        <LaporanContent
          loading={loading}
          filteredLaporan={filteredLaporan}
          pagedLaporan={pagedLaporan}
          metodeBreakdown={metodeBreakdown}
          tokoBreakdown={tokoBreakdown}
          totalOmzet={totalOmzet}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={setItemsPerPage}
          page={page}
          totalPages={totalPages}
          goPage={goPage}
          canViewProfit={canViewProfit}
        />
      </main>
    </div>
  )
}

function HeaderTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-600">
        {title}
      </p>
      <p className="mt-1 text-sm font-black text-slate-800">{subtitle}</p>
    </div>
  )
}

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      {children}
    </div>
  )
}

function FieldMonth({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        <CalendarDays
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </FieldBox>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        {Icon && <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${Icon ? "pl-9" : "pl-3"} py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
      </div>
    </FieldBox>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone,
}: {
  icon: any
  label: string
  value: string
  subValue?: string
  tone: "slate" | "sky" | "blue" | "rose"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
          : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-800 sm:text-xl">
            {value}
          </p>
          {subValue && (
            <p className="mt-0.5 truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[9px]">
              {subValue}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LaporanContent({
  loading,
  filteredLaporan,
  pagedLaporan,
  metodeBreakdown,
  tokoBreakdown,
  totalOmzet,
  itemsPerPage,
  setItemsPerPage,
  page,
  totalPages,
  goPage,
  canViewProfit,
}: {
  loading: boolean
  filteredLaporan: LaporanBulanan[]
  pagedLaporan: LaporanBulanan[]
  metodeBreakdown: { nama: string; jumlahTransaksi: number; omzet: number; admin: number }[]
  tokoBreakdown: { tokoId: string; tokoNama: string; bulanAktif: number; transaksi: number; omzet: number }[]
  totalOmzet: number
  itemsPerPage: number
  setItemsPerPage: (value: number) => void
  page: number
  totalPages: number
  goPage: (page: number) => void
  canViewProfit: boolean
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Memuat laporan bulanan...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-7">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <HeaderTitle title="Metode Pembayaran" subtitle="Breakdown omzet berdasarkan metode bayar" />

          {metodeBreakdown.length === 0 ? (
            <EmptyBox label="Belum ada data metode" icon={Wallet} />
          ) : (
            <div className="space-y-3">
              {metodeBreakdown.map((item) => {
                const persenOmzet = totalOmzet > 0 ? (item.omzet / totalOmzet) * 100 : 0

                return (
                  <div key={item.nama} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-800">{item.nama}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {item.jumlahTransaksi} transaksi
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black text-slate-800">{formatRupiah(item.omzet)}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          Admin {formatRupiah(item.admin)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500"
                          style={{ width: `${Math.min(100, persenOmzet)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] font-bold text-slate-500">
                        {persenOmzet.toFixed(1)}% dari omzet
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <HeaderTitle title="Rekap Bulanan" subtitle="Daftar dokumen laporan_bulanan" />

            <div className="hidden w-full sm:block sm:max-w-[120px]">
              <FilterSelect
                label="Tampilkan"
                value={String(itemsPerPage)}
                onChange={(value) => setItemsPerPage(Number(value))}
              >
                {ITEMS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          {filteredLaporan.length === 0 ? (
            <EmptyBox label="Belum ada laporan bulanan" icon={BarChart3} />
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {pagedLaporan.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                        <BarChart3 size={20} strokeWidth={2.5} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">
                              {formatBulanKey(item.bulanKey)}
                            </p>
                            <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                              {item.tokoNama || "Tanpa Toko"}
                            </p>
                          </div>

                          <span className="inline-flex shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                            {item.jumlahTransaksi} Trx
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                          <MiniInfo label="Omzet" value={formatRupiah(item.omzet)} />
                          <MiniInfo label="Untung" value={formatProfit(item.totalLabaKotor, canViewProfit)} />
                          <MiniInfo label="Diskon" value={formatRupiah(item.totalDiskon)} />
                          <MiniInfo label="Item" value={String(item.totalItemTerjual)} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/70">
                      <tr>
                        {["No", "Bulan", "Toko", "Transaksi", "Omzet", "Diskon", "Admin", "Untung", "Update"].map((head) => (
                          <th
                            key={head}
                            className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                              head === "No" ? "text-center" : "text-left"
                            }`}
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLaporan.map((item, index) => (
                        <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                          <td className="px-3 py-3 text-center font-bold text-slate-400">
                            {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                            {formatBulanKey(item.bulanKey)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                            {item.tokoNama || "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                            {item.jumlahTransaksi}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">
                            {formatRupiah(item.omzet)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                            {formatRupiah(item.totalDiskon)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                            {formatRupiah(item.totalBiayaAdmin)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-black text-sky-700">
                            {formatProfit(item.totalLabaKotor, canViewProfit)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                            {formatDateTime(item.updatedAtMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {itemsPerPage !== 0 && totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} goPage={goPage} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-4 xl:col-span-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <HeaderTitle title="Toko Teratas" subtitle="Ranking toko berdasarkan omzet" />

          {tokoBreakdown.length === 0 ? (
            <EmptyBox label="Belum ada data toko" icon={Store} />
          ) : (
            <div className="space-y-3">
              {tokoBreakdown.slice(0, 8).map((item, idx) => (
                <div key={`${item.tokoId}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{item.tokoNama}</p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.bulanAktif} bulan aktif
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-slate-800">{formatRupiah(item.omzet)}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {item.transaksi} transaksi
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
      <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-800">{value}</p>
    </div>
  )
}

function EmptyBox({ label, icon: Icon }: { label: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
        <Icon size={28} strokeWidth={2} />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  )
}

function Pagination({ page, totalPages, goPage }: { page: number; totalPages: number; goPage: (page: number) => void }) {
  return (
    <div className="flex justify-center gap-1.5 pt-3">
      <button
        type="button"
        onClick={() => goPage(page - 1)}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
        .reduce<(number | "...")[]>((acc, p, idx, arr) => {
          if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("...")
          acc.push(p)
          return acc
        }, [])
        .map((p, idx) =>
          p === "..." ? (
            <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">···</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => goPage(p)}
              className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${
                page === p
                  ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          )
        )}

      <button
        type="button"
        onClick={() => goPage(page + 1)}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  )
}