"use client"

/*
  Halaman ini menampilkan laporan absensi karyawan dengan filter tanggal/bulan, pencarian, pagination, dan approval.
  Data absensi diambil dari absensi_karyawan lalu digabung ke koleksi karyawan untuk mengambil jabatan dan toko terbaru.
*/

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore"
import {
  ClipboardList,
  Cpu,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Store,
  RefreshCw,
  Search,
  AlertCircle,
  Briefcase,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

/* ═══════════════════════════════════════
   TYPES
═══════════════════════════════════════ */
type KaryawanItem = {
  id: string
  nama?: string
  jabatan?: string
  tokoId?: string
  tokoNama?: string
}

type TokoItem = {
  id: string
  nama: string
}

type AbsensiKaryawan = {
  id: string
  karyawanId?: string
  userId?: string
  namaKaryawan: string
  tanggal: string
  tahun?: number
  bulan?: number
  jamMasuk: string | null
  jamPulang: string | null
  status: string
  approvalStatus?: string
  alasanMasuk?: string | null
  alasanPulang?: string | null
  alasanIzin?: string | null
  keteranganMasuk?: string | null
  keteranganPulang?: string | null
  keteranganIzin?: string | null
  metode?: string | null
}

type AbsensiRow = AbsensiKaryawan & {
  jabatan: string
  tokoId: string
  tokoNama: string
}

/* ═══════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════ */
const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const STATUS_LIST = [
  { value: "", label: "Semua Status" },
  { value: "hadir", label: "Hadir" },
  { value: "terlambat", label: "Terlambat" },
  { value: "pulang_cepat", label: "Pulang Cepat" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
]

const APPROVAL_LIST = [
  { value: "", label: "Semua Approval" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
]

const BULAN_LIST = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
const getTodayLocal = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

const getHari = (t: string) =>
  new Date(t).toLocaleDateString("id-ID", { weekday: "short" })

const hitungTerlambatMenit = (j: string | null) => {
  if (!j) return null
  const diff = toMinutes(j) - 8 * 60
  return diff > 0 ? diff : null
}

/* ═══════════════════════════════════════
   BADGE COMPONENTS
═══════════════════════════════════════ */
function SelisihMasukBadge({ jamMasuk }: { jamMasuk: string | null }) {
  if (!jamMasuk) return <span className="text-slate-300 text-xs">—</span>

  const diff = toMinutes(jamMasuk) - toMinutes("08:00")

  if (diff <= 0) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">
        {diff === 0 ? "Tepat waktu" : `${Math.abs(diff)}m awal`}
      </span>
    )
  }

  return (
    <span className="inline-flex px-2 py-0.5 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-bold">
      {diff}m terlambat
    </span>
  )
}

function SelisihPulangBadge({ jamPulang }: { jamPulang: string | null }) {
  if (!jamPulang) return <span className="text-slate-300 text-xs">—</span>

  const diff = toMinutes(jamPulang) - toMinutes("21:00")

  if (diff >= 0) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">
        {diff === 0 ? "Tepat waktu" : `${diff}m lama`}
      </span>
    )
  }

  return (
    <span className="inline-flex px-2 py-0.5 rounded-lg bg-orange-100 text-orange-700 text-[10px] font-bold">
      {Math.abs(diff)}m awal
    </span>
  )
}

function StatusBadge({ d }: { d: AbsensiRow }) {
  const label =
    d.status === "terlambat" && d.jamMasuk
      ? `terlambat ${hitungTerlambatMenit(d.jamMasuk)}m`
      : d.status

  const colorMap: Record<string, string> = {
    hadir: "bg-emerald-100 text-emerald-700",
    terlambat: "bg-yellow-100 text-yellow-700",
    pulang_cepat: "bg-orange-100 text-orange-700",
    izin: "bg-blue-100 text-blue-700",
    sakit: "bg-red-100 text-red-700",
  }

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold capitalize ${
        colorMap[d.status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </span>
  )
}

function ApprovalBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-slate-300 text-xs">—</span>

  const colorMap: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    rejected: "bg-rose-100 text-rose-700",
  }

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold capitalize ${
        colorMap[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  )
}

/* ═══════════════════════════════════════
   FILTER SELECT
═══════════════════════════════════════ */
function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
}: {
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <div>
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            strokeWidth={2}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20`}
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════
   PAGE COMPONENT
═══════════════════════════════════════ */
export default function LaporanAbsensiKaryawanPage() {
  const today = getTodayLocal()

  const [allData, setAllData] = useState<AbsensiRow[]>([])
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [bulan, setBulan] = useState(new Date().getMonth() + 1)
  const [tanggalFilter, setTanggalFilter] = useState(today)
  const [tokoFilter, setTokoFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [approvalFilter, setApprovalFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const [tokoList, setTokoList] = useState<TokoItem[]>([])

  const isSearchMode = searchQuery.trim().length > 0
  const isDailyMode = Boolean(tanggalFilter)

  const buildAbsensiConstraints = () => {
    const c: any[] = []

    if (tanggalFilter) {
      c.push(where("tanggal", "==", tanggalFilter))
    } else {
      c.push(where("tahun", "==", tahun), where("bulan", "==", bulan))
    }

    if (statusFilter) {
      c.push(where("status", "==", statusFilter))
    }

    if (approvalFilter) {
      c.push(where("approvalStatus", "==", approvalFilter))
    }

    c.push(orderBy("tanggal", "desc"))
    return c
  }

  const fetchMasterToko = async () => {
    try {
      const snap = await getDocs(collection(db, "karyawan"))

      const tokoMap = new Map<string, TokoItem>()

      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any
        const tokoId = data?.tokoId || ""
        const tokoNama = data?.tokoNama || ""

        if (!tokoId || !tokoNama) return
        tokoMap.set(tokoId, { id: tokoId, nama: tokoNama })
      })

      setTokoList(
        Array.from(tokoMap.values()).sort((a, b) =>
          a.nama.localeCompare(b.nama, "id")
        )
      )
    } catch (err) {
      console.error("Gagal memuat master toko:", err)
      setTokoList([])
    }
  }

  const fetchData = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    try {
      const absensiConstraints = buildAbsensiConstraints()

      const [absensiSnap, karyawanSnap] = await Promise.all([
        getDocs(query(collection(db, "absensi_karyawan"), ...absensiConstraints)),
        getDocs(collection(db, "karyawan")),
      ])

      const karyawanMap = new Map<string, KaryawanItem>()
      karyawanSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any
        karyawanMap.set(docSnap.id, {
          id: docSnap.id,
          nama: data?.nama || "",
          jabatan: data?.jabatan || "-",
          tokoId: data?.tokoId || "",
          tokoNama: data?.tokoNama || "-",
        })
      })

      let rows = absensiSnap.docs.map((docSnap) => {
        const data = docSnap.data() as AbsensiKaryawan
        const profile = data.karyawanId ? karyawanMap.get(data.karyawanId) : undefined

        return {
          ...data,
          id: docSnap.id,
          namaKaryawan: data.namaKaryawan || profile?.nama || "-",
          jabatan: profile?.jabatan || "-",
          tokoId: profile?.tokoId || "",
          tokoNama: profile?.tokoNama || "-",
        }
      }) as AbsensiRow[]

      if (tokoFilter) {
        rows = rows.filter((item) => item.tokoId === tokoFilter)
      }

      rows.sort((a, b) => {
        if ((a.tanggal || "") !== (b.tanggal || "")) {
          return (b.tanggal || "").localeCompare(a.tanggal || "")
        }

        const aJam = a.jamMasuk || a.jamPulang || ""
        const bJam = b.jamMasuk || b.jamPulang || ""

        if (aJam !== bJam) {
          return bJam.localeCompare(aJam)
        }

        return (a.namaKaryawan || "").localeCompare(b.namaKaryawan || "", "id")
      })

      setAllData(rows)
      setTotalCount(rows.length)
    } catch (err) {
      console.error(err)
      setAllData([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMasterToko()

    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchData()
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
    fetchData()
  }, [tahun, bulan, tanggalFilter, tokoFilter, statusFilter, approvalFilter])

  const clientFiltered = useMemo(() => {
    return allData.filter((d) => {
      if (
        isSearchMode &&
        ![
          d.namaKaryawan || "",
          d.jabatan || "",
          d.tokoNama || "",
          d.status || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      ) {
        return false
      }

      return true
    })
  }, [allData, isSearchMode, searchQuery])

  const finalTotalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(clientFiltered.length / itemsPerPage))

  const finalData =
    itemsPerPage === 0
      ? clientFiltered
      : clientFiltered.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage
        )

  const goToPage = async (p: number) => {
    const target = Math.max(1, Math.min(finalTotalPages, p))
    setCurrentPage(target)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const renderPageNumbers = () =>
    Array.from({ length: finalTotalPages }, (_, i) => i + 1)
      .filter(
        (p) =>
          finalTotalPages <= 7 ||
          p === 1 ||
          p === finalTotalPages ||
          Math.abs(p - currentPage) <= 2
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
          <span key={`e-${idx}`} className="px-1 text-slate-400 text-xs font-bold">
            ···
          </span>
        ) : (
          <motion.button
            key={p}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => goToPage(p as number)}
            className={`h-8 min-w-[2rem] px-2 rounded-xl text-xs font-black transition-all ${
              currentPage === p
                ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-sm shadow-cyan-200/50"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p}
          </motion.button>
        )
      )

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-cyan-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-200/50">
              <ClipboardList
                size={24}
                className="text-white sm:w-7 sm:h-7"
                strokeWidth={2.5}
              />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
                Laporan Absensi Karyawan
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
                {isDailyMode ? `Fokus tanggal ${tanggalFilter}` : "Rekap kehadiran per bulan"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && totalCount > 0 && (
              <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-cyan-500 px-2.5 shadow-sm shadow-cyan-200/50">
                <span className="text-xs font-black text-white">{clientFiltered.length}</span>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <motion.span
                animate={loading ? { rotate: 360 } : {}}
                transition={
                  loading
                    ? { duration: 0.8, repeat: Infinity, ease: "linear" }
                    : {}
                }
              >
                <RefreshCw size={14} className="text-slate-500" strokeWidth={2.5} />
              </motion.span>
            </motion.button>
          </div>
        </div>

        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <AnimatePresence>
        {isSearchMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200"
          >
            <AlertCircle
              size={14}
              className="text-amber-500 flex-shrink-0"
              strokeWidth={2.5}
            />
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">
              Mode pencarian aktif
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
            <Filter size={14} className="text-blue-600" strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
            Filter Data
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Tanggal
            </label>
            <input
              type="date"
              value={tanggalFilter}
              onChange={(e) => setTanggalFilter(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <FilterSelect label="Tahun" value={tahun} onChange={(v) => setTahun(Number(v))}>
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Bulan" value={bulan} onChange={(v) => setBulan(Number(v))}>
            {BULAN_LIST.map((n, i) => (
              <option key={i + 1} value={i + 1}>
                {n}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Toko"
            value={tokoFilter}
            onChange={setTokoFilter}
            icon={Store}
          >
            <option value="">Semua Toko</option>
            {tokoList.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            icon={Briefcase}
          >
            {STATUS_LIST.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Approval"
            value={approvalFilter}
            onChange={setApprovalFilter}
          >
            {APPROVAL_LIST.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </FilterSelect>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Cari Karyawan
            </label>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                strokeWidth={2}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nama / jabatan / toko / status..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white pl-8 pr-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Tampilkan"
            value={itemsPerPage}
            onChange={(v) => setItemsPerPage(Number(v))}
          >
            {ITEMS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} data
              </option>
            ))}
          </FilterSelect>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Mode Tanggal
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTanggalFilter(today)
                  setTahun(new Date().getFullYear())
                  setBulan(new Date().getMonth() + 1)
                }}
                className="flex-1 rounded-xl border-2 border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm font-bold text-cyan-700 hover:bg-cyan-100"
              >
                Hari Ini
              </button>
              <button
                onClick={() => setTanggalFilter("")}
                className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Mode Bulan
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-cyan-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && finalData.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 gap-3"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <ClipboardList size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tidak ada data absensi
          </p>
        </motion.div>
      )}

      {!loading && finalData.length > 0 && (
        <div className="sm:hidden space-y-2">
          {finalData.map((d, idx) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.03 }}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{d.namaKaryawan}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">
                    {d.jabatan} · {d.tokoNama}
                  </p>
                </div>
                <StatusBadge d={d} />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {getHari(d.tanggal)},
                </span>
                <span className="text-xs font-bold text-slate-600">{d.tanggal}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Masuk
                  </p>
                  <p className="text-xs font-bold text-slate-700 mb-1">
                    {d.jamMasuk ?? "—"}
                  </p>
                  <SelisihMasukBadge jamMasuk={d.jamMasuk} />
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Pulang
                  </p>
                  <p className="text-xs font-bold text-slate-700 mb-1">
                    {d.jamPulang ?? "—"}
                  </p>
                  <SelisihPulangBadge jamPulang={d.jamPulang} />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Approval
                </span>
                <ApprovalBadge status={d.approvalStatus} />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && finalData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/80 border-b border-slate-200">
                <tr>
                  {[
                    { label: "No", cls: "text-center w-10" },
                    { label: "Nama Karyawan", cls: "text-left" },
                    { label: "Jabatan", cls: "text-left" },
                    { label: "Toko", cls: "text-left" },
                    { label: "Tanggal", cls: "text-left" },
                    { label: "Jam Masuk", cls: "text-center" },
                    { label: "Ketepatan Masuk", cls: "text-center" },
                    { label: "Jam Pulang", cls: "text-center" },
                    { label: "Ketepatan Pulang", cls: "text-center" },
                    { label: "Status", cls: "text-center" },
                    { label: "Approval", cls: "text-center" },
                    { label: "Alasan", cls: "text-left" },
                    { label: "Keterangan", cls: "text-left" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap ${h.cls}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {finalData.map((d, i) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.015 }}
                    className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                      {itemsPerPage === 0
                        ? i + 1
                        : (currentPage - 1) * itemsPerPage + i + 1}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                      {d.namaKaryawan}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 font-semibold whitespace-nowrap">
                      {d.jabatan || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 font-semibold whitespace-nowrap">
                      {d.tokoNama || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="font-bold text-slate-700">{d.tanggal}</p>
                      <p className="text-[10px] text-slate-400">{getHari(d.tanggal)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-slate-700">
                      {d.jamMasuk ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SelisihMasukBadge jamMasuk={d.jamMasuk} />
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-slate-700">
                      {d.jamPulang ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SelisihPulangBadge jamPulang={d.jamPulang} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge d={d} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ApprovalBadge status={d.approvalStatus} />
                    </td>
                    <td className="px-3 py-2.5 space-y-1 min-w-[120px]">
                      {d.alasanIzin && (
                        <span className="inline-flex px-2 py-0.5 rounded-lg bg-yellow-100 text-yellow-800 text-[10px] font-bold">
                          {d.alasanIzin}
                        </span>
                      )}
                      {d.alasanMasuk && (
                        <span className="inline-flex px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                          {d.alasanMasuk}
                        </span>
                      )}
                      {d.alasanPulang && (
                        <span className="inline-flex px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-bold">
                          {d.alasanPulang}
                        </span>
                      )}
                      {!d.alasanIzin && !d.alasanMasuk && !d.alasanPulang && (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 font-semibold min-w-[140px] text-[11px]">
                      {d.keteranganIzin ||
                        d.keteranganMasuk ||
                        d.keteranganPulang || <span className="text-slate-300">—</span>}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!loading && clientFiltered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 flex-wrap"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {itemsPerPage === 0
              ? `${clientFiltered.length} data`
              : `Hal ${currentPage}/${finalTotalPages} · ${clientFiltered.length} data`}
          </p>

          {itemsPerPage !== 0 && finalTotalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>

              {renderPageNumbers()}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === finalTotalPages || loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}