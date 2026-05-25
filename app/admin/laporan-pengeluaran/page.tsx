/*
  Halaman admin laporan pengeluaran.
  Layout konsisten dengan Transfer Barang / Terima Barang / Mutasi Stok / Pengeluaran:
  header biru, card putih rounded-2xl, filter collapse mobile, pagination, dan chart ringan.
*/

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  ListFilter,
  RefreshCw,
  Search,
  Store,
  Tags,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type KategoriPengeluaran = {
  id: string
  nama: string
  aktif?: boolean
}

type Pengeluaran = {
  id: string
  tanggal: string
  tanggalKey: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  nominal: number
  catatan: string
  createdAtMs: number
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
  const [year, month] = String(value).split("-")
  const y = Number(year || 0)
  const m = Number(month || 0)
  if (!y || !m) return value

  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1))
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

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
      {children}
    </label>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
}: {
  value: string | number
  onChange: (value: string) => void
  children: ReactNode
  label: string
  icon?: any
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2.5}
          />
        ) : null}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <FieldLabel>Cari</FieldLabel>
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Kategori, toko, catatan, bulan..."
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </div>
  )
}

function MonthInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <CalendarDays
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </div>
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
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-start sm:gap-3 sm:text-left">
        <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:flex ${cls}`}>
          <Icon size={19} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="truncate text-sm font-black leading-tight text-slate-800 sm:text-lg">
            {value}
          </p>
          {subValue ? (
            <p className="mt-0.5 hidden truncate text-[11px] font-semibold text-slate-500 sm:block">
              {subValue}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {label}
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {title}
                </p>
                {subtitle ? (
                  <h2 className="truncate text-base font-black text-slate-800">{subtitle}</h2>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>
            <div className="max-h-[calc(88vh-65px)] overflow-y-auto p-4 sm:p-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default function LaporanPengeluaranPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriPengeluaran[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [selectedDetail, setSelectedDetail] = useState<Pengeluaran | null>(null)
  const [rankingModal, setRankingModal] = useState<"toko" | "kategori" | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, kategoriSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "kategori_pengeluaran"), orderBy("nama"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("createdAtMs", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: String(x?.nama || ""),
          aktif: Boolean(x?.aktif ?? true),
        }
      })

      const kategoriData: KategoriPengeluaran[] = kategoriSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: String(x?.nama || ""),
          aktif: Boolean(x?.aktif ?? true),
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          tanggal: String(x?.tanggal || ""),
          tanggalKey: String(x?.tanggalKey || ""),
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          kategoriId: String(x?.kategoriId || ""),
          kategoriNama: String(x?.kategoriNama || ""),
          nominal: Number(x?.nominal || 0),
          catatan: String(x?.catatan || ""),
          createdAtMs: Number(x?.createdAtMs || 0),
        }
      })

      setTokoList(tokoData.filter((item) => item.nama))
      setKategoriList(kategoriData.filter((item) => item.nama))
      setPengeluaranList(pengeluaranData.filter((item) => item.bulanKey))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan pengeluaran")
      setTokoList([])
      setKategoriList([])
      setPengeluaranList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchAll()
    })

    return () => unsub()
  }, [])

  const resetFilter = () => {
    setSearch("")
    setFilterToko("")
    setFilterKategori("")
    setBulanMulai(getStartOfYearMonthInput())
    setBulanSelesai(toMonthInputValue(new Date()))
    setPage(1)
  }

  const filteredPengeluaran = useMemo(() => {
    const q = search.toLowerCase().trim()

    return pengeluaranList.filter((item) => {
      const matchSearch =
        !q ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.catatan.toLowerCase().includes(q) ||
        item.tanggalKey.toLowerCase().includes(q) ||
        item.bulanKey.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchKategori = !filterKategori || item.kategoriId === filterKategori
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchKategori && matchStart && matchEnd
    })
  }, [pengeluaranList, search, filterToko, filterKategori, bulanMulai, bulanSelesai])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredPengeluaran.length / itemsPerPage))

  const pagedPengeluaran =
    itemsPerPage === 0
      ? filteredPengeluaran
      : filteredPengeluaran.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (value: number) => setPage(Math.max(1, Math.min(totalPages, value)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const totalPengeluaran = filteredPengeluaran.reduce(
    (acc, item) => acc + Number(item.nominal || 0),
    0
  )

  const pengeluaranBulanIni = filteredPengeluaran
    .filter((item) => item.bulanKey === toMonthInputValue(new Date()))
    .reduce((acc, item) => acc + Number(item.nominal || 0), 0)

  const kategoriBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { kategoriId: string; kategoriNama: string; total: number; jumlah: number }
    >()

    for (const item of filteredPengeluaran) {
      const key = item.kategoriId || item.kategoriNama || item.id
      const current = map.get(key) || {
        kategoriId: item.kategoriId,
        kategoriNama: item.kategoriNama || "Tanpa Kategori",
        total: 0,
        jumlah: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filteredPengeluaran])

  const tokoBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { tokoId: string; tokoNama: string; total: number; jumlah: number; bulanAktif: number }
    >()
    const bulanMap = new Map<string, Set<string>>()

    for (const item of filteredPengeluaran) {
      const key = item.tokoId || item.tokoNama || item.id
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        total: 0,
        jumlah: 0,
        bulanAktif: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)

      if (!bulanMap.has(key)) bulanMap.set(key, new Set<string>())
      bulanMap.get(key)?.add(item.bulanKey)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        bulanAktif: bulanMap.get(item.tokoId || item.tokoNama || "")?.size || 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [filteredPengeluaran])

  const chartData = useMemo(() => {
    const map = new Map<
      string,
      { bulanKey: string; total: number; jumlah: number; tokoCount: number; kategoriCount: number }
    >()
    const tokoPerBulan = new Map<string, Set<string>>()
    const kategoriPerBulan = new Map<string, Set<string>>()

    for (const item of filteredPengeluaran) {
      const key = item.bulanKey
      const current = map.get(key) || {
        bulanKey: key,
        total: 0,
        jumlah: 0,
        tokoCount: 0,
        kategoriCount: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)

      if (!tokoPerBulan.has(key)) tokoPerBulan.set(key, new Set<string>())
      if (!kategoriPerBulan.has(key)) kategoriPerBulan.set(key, new Set<string>())
      tokoPerBulan.get(key)?.add(item.tokoId || item.tokoNama || item.id)
      kategoriPerBulan.get(key)?.add(item.kategoriId || item.kategoriNama || item.id)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        tokoCount: tokoPerBulan.get(item.bulanKey)?.size || 0,
        kategoriCount: kategoriPerBulan.get(item.bulanKey)?.size || 0,
      }))
      .sort((a, b) => a.bulanKey.localeCompare(b.bulanKey))
  }, [filteredPengeluaran])

  const maxChartValue = Math.max(...chartData.map((item) => item.total), 0)

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
                  Laporan Pengeluaran
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Pantau total pengeluaran, grafik bulanan, kategori, dan ranking toko.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={fetchAll}
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
              <button type="button" onClick={() => setError(null)} className="text-red-500">
                <X size={14} strokeWidth={3} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Total Pengeluaran"
            value={formatRupiah(totalPengeluaran)}
            subValue="Sesuai filter"
            tone="rose"
          />
          <StatCard
            icon={TrendingDown}
            label="Bulan Ini"
            value={formatRupiah(pengeluaranBulanIni)}
            subValue="Bulan berjalan"
            tone="sky"
          />
          <StatCard
            icon={Tags}
            label="Kategori"
            value={String(kategoriBreakdown.length)}
            subValue="Kategori terpakai"
            tone="blue"
          />
          <StatCard
            icon={Store}
            label="Toko"
            value={String(tokoBreakdown.length)}
            subValue="Toko terlibat"
            tone="slate"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.04 }}
          className="grid grid-cols-2 gap-2 sm:hidden"
        >
          <button
            type="button"
            onClick={() => setRankingModal("toko")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 shadow-sm transition hover:bg-sky-100"
          >
            <Store size={14} strokeWidth={2.5} />
            Ranking Toko
          </button>

          <button
            type="button"
            onClick={() => setRankingModal("kategori")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 shadow-sm transition hover:bg-sky-100"
          >
            <Tags size={14} strokeWidth={2.5} />
            Kategori
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Laporan</h2>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">
                Saring laporan berdasarkan toko, kategori, dan rentang bulan
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchAll}
                disabled={loading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:hidden"
              >
                <RefreshCw size={15} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setFilterMobileOpen((prev) => !prev)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.06em] transition sm:hidden ${
                  filterMobileOpen
                    ? "border-sky-200 bg-sky-100 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <ListFilter size={14} strokeWidth={2.5} />
                Filter
              </button>
            </div>
          </div>

          <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value)
                  setPage(1)
                }}
              />
            </div>
            <FilterSelect
              label="Toko"
              value={filterToko}
              onChange={(value) => {
                setFilterToko(value)
                setPage(1)
              }}
              icon={Store}
            >
              <option value="">Semua toko</option>
              {tokoList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nama}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Kategori"
              value={filterKategori}
              onChange={(value) => {
                setFilterKategori(value)
                setPage(1)
              }}
              icon={Tags}
            >
              <option value="">Semua kategori</option>
              {kategoriList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nama}
                </option>
              ))}
            </FilterSelect>
            <MonthInput
              label="Mulai"
              value={bulanMulai}
              onChange={(value) => {
                setBulanMulai(value)
                setPage(1)
              }}
            />
            <MonthInput
              label="Selesai"
              value={bulanSelesai}
              onChange={(value) => {
                setBulanSelesai(value)
                setPage(1)
              }}
            />
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
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <SearchInput
                    value={search}
                    onChange={(value) => {
                      setSearch(value)
                      setPage(1)
                    }}
                  />
                  <FilterSelect
                    label="Toko"
                    value={filterToko}
                    onChange={(value) => {
                      setFilterToko(value)
                      setPage(1)
                    }}
                    icon={Store}
                  >
                    <option value="">Semua toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Kategori"
                    value={filterKategori}
                    onChange={(value) => {
                      setFilterKategori(value)
                      setPage(1)
                    }}
                    icon={Tags}
                  >
                    <option value="">Semua kategori</option>
                    {kategoriList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FilterSelect>
                  <div className="grid grid-cols-2 gap-2">
                    <MonthInput
                      label="Mulai"
                      value={bulanMulai}
                      onChange={(value) => {
                        setBulanMulai(value)
                        setPage(1)
                      }}
                    />
                    <MonthInput
                      label="Selesai"
                      value={bulanSelesai}
                      onChange={(value) => {
                        setBulanSelesai(value)
                        setPage(1)
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetFilter}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
            >
              Reset Filter
            </button>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Memuat laporan pengeluaran...
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-7">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Chart Pengeluaran Bulanan
                    </p>
                    <h2 className="mt-1 text-sm font-black text-slate-800 sm:text-base">
                      Grafik total pengeluaran per bulan
                    </h2>
                  </div>

                  {chartData.length === 0 ? (
                    <EmptyState label="Belum ada data chart" />
                  ) : (
                    <div className="space-y-4">
                      {chartData.map((item) => {
                        const persen = maxChartValue > 0 ? (item.total / maxChartValue) * 100 : 0
                        return (
                          <div key={item.bulanKey}>
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                                {formatBulanKey(item.bulanKey)}
                              </p>
                              <p className="text-sm font-black text-sky-700">
                                {formatRupiah(item.total)}
                              </p>
                            </div>
                            <div className="h-4 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500"
                                style={{ width: `${Math.max(persen, 2)}%` }}
                              />
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-100">
                                Transaksi: {item.jumlah}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
                                Toko: {item.tokoCount}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                                Kategori: {item.kategoriCount}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Detail Pengeluaran
                      </p>
                      <h2 className="mt-1 text-sm font-black text-slate-800 sm:text-base">
                        Daftar transaksi sesuai filter
                      </h2>
                    </div>
                    <div className="w-full sm:w-36">
                      <FilterSelect
                        label="Tampil"
                        value={itemsPerPage}
                        onChange={(value) => {
                          setItemsPerPage(Number(value))
                          setPage(1)
                        }}
                      >
                        {ITEMS_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                  </div>

                  {pagedPengeluaran.length === 0 ? (
                    <EmptyState label="Belum ada data pengeluaran" />
                  ) : (
                    <div className="space-y-3">
                      {pagedPengeluaran.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700 ring-1 ring-sky-100">
                                  {formatBulanKey(item.bulanKey)}
                                </span>
                                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                                  {item.tokoNama || "Tanpa Toko"}
                                </span>
                              </div>

                              <p className="mt-3 text-sm font-black text-slate-800">
                                {item.kategoriNama || "Tanpa Kategori"}
                              </p>
                              {item.catatan ? (
                                <p className="mt-1 text-[12px] font-semibold text-slate-600">
                                  {item.catatan}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-col items-start gap-2 sm:items-end">
                              <p className="text-base font-black text-rose-600">
                                {formatRupiah(item.nominal)}
                              </p>
                              <button
                                type="button"
                                onClick={() => setSelectedDetail(item)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
                              >
                                <Eye size={14} strokeWidth={2.5} />
                                Detail
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {itemsPerPage !== 0 && totalPages > 1 && (
                    <div className="mt-4 flex justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => goPage(page - 1)}
                        disabled={page === 1}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronLeft size={14} strokeWidth={2.5} />
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(
                          (p) =>
                            totalPages <= 7 ||
                            p === 1 ||
                            p === totalPages ||
                            Math.abs(p - page) <= 2
                        )
                        .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                          if (
                            idx > 0 &&
                            typeof arr[idx - 1] === "number" &&
                            p - (arr[idx - 1] as number) > 1
                          ) {
                            acc.push("...")
                          }
                          acc.push(p)
                          return acc
                        }, [])
                        .map((p, idx) =>
                          p === "..." ? (
                            <span
                              key={`e-${idx}`}
                              className="px-1 text-xs font-bold text-slate-400"
                            >
                              ···
                            </span>
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
                  )}
                </section>
              </div>

              <div className="hidden space-y-4 sm:block xl:col-span-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Toko Pengeluaran Terbesar
                    </p>
                    <h2 className="mt-1 text-sm font-black text-slate-800 sm:text-base">
                      Ranking toko berdasarkan total pengeluaran
                    </h2>
                  </div>

                  {tokoBreakdown.length === 0 ? (
                    <EmptyState label="Belum ada data toko" />
                  ) : (
                    <div className="space-y-3">
                      {tokoBreakdown.slice(0, 8).map((item, idx) => (
                        <RankingCard
                          key={`${item.tokoId}-${idx}`}
                          index={idx + 1}
                          title={item.tokoNama}
                          subtitle={`${item.jumlah} transaksi · ${item.bulanAktif} bulan aktif`}
                          value={formatRupiah(item.total)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Kategori Teratas
                    </p>
                    <h2 className="mt-1 text-sm font-black text-slate-800 sm:text-base">
                      Ranking kategori dengan total tertinggi
                    </h2>
                  </div>

                  {kategoriBreakdown.length === 0 ? (
                    <EmptyState label="Belum ada data kategori" />
                  ) : (
                    <div className="space-y-3">
                      {kategoriBreakdown.slice(0, 8).map((item, idx) => (
                        <RankingCard
                          key={`${item.kategoriId}-${idx}`}
                          index={idx + 1}
                          title={item.kategoriNama}
                          subtitle={`${item.jumlah} transaksi`}
                          value={formatRupiah(item.total)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        )}

        <Modal
          open={Boolean(rankingModal)}
          title={rankingModal === "toko" ? "Ranking Toko" : "Ranking Kategori"}
          subtitle={
            rankingModal === "toko"
              ? "Toko pengeluaran terbesar"
              : "Kategori pengeluaran terbesar"
          }
          onClose={() => setRankingModal(null)}
        >
          {rankingModal === "toko" ? (
            tokoBreakdown.length === 0 ? (
              <EmptyState label="Belum ada data toko" />
            ) : (
              <div className="space-y-3">
                {tokoBreakdown.slice(0, 10).map((item, idx) => (
                  <RankingCard
                    key={`${item.tokoId}-${idx}`}
                    index={idx + 1}
                    title={item.tokoNama}
                    subtitle={`${item.jumlah} transaksi · ${item.bulanAktif} bulan aktif`}
                    value={formatRupiah(item.total)}
                  />
                ))}
              </div>
            )
          ) : rankingModal === "kategori" ? (
            kategoriBreakdown.length === 0 ? (
              <EmptyState label="Belum ada data kategori" />
            ) : (
              <div className="space-y-3">
                {kategoriBreakdown.slice(0, 10).map((item, idx) => (
                  <RankingCard
                    key={`${item.kategoriId}-${idx}`}
                    index={idx + 1}
                    title={item.kategoriNama}
                    subtitle={`${item.jumlah} transaksi`}
                    value={formatRupiah(item.total)}
                  />
                ))}
              </div>
            )
          ) : null}
        </Modal>

        <Modal
          open={Boolean(selectedDetail)}
          title="Detail Pengeluaran"
          subtitle={selectedDetail?.kategoriNama || ""}
          onClose={() => setSelectedDetail(null)}
        >
          {selectedDetail ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <DetailBox label="Bulan" value={formatBulanKey(selectedDetail.bulanKey)} />
              <DetailBox label="Nominal" value={formatRupiah(selectedDetail.nominal)} strong />
              <DetailBox label="Toko" value={selectedDetail.tokoNama || "-"} />
              <DetailBox label="Kategori" value={selectedDetail.kategoriNama || "-"} />
              <DetailBox label="Tanggal Key" value={selectedDetail.tanggalKey || "-"} />
              <DetailBox label="Bulan Key" value={selectedDetail.bulanKey || "-"} />
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Catatan
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {selectedDetail.catatan || "-"}
                </p>
              </div>
            </div>
          ) : null}
        </Modal>
      </main>
    </div>
  )
}

function RankingCard({
  index,
  title,
  subtitle,
  value,
}: {
  index: number
  title: string
  subtitle: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">
              {index}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-800">{title || "-"}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {subtitle}
              </p>
            </div>
          </div>
        </div>
        <p className="shrink-0 text-right text-sm font-black text-rose-600">{value}</p>
      </div>
    </div>
  )
}

function DetailBox({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 text-sm ${strong ? "font-black text-rose-600" : "font-black text-slate-800"}`}>
        {value}
      </p>
    </div>
  )
}
