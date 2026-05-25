"use client"

/*
  Laporan Absensi Karyawan.
  Revisi:
  - Tanpa cache localStorage.
  - Data utama dari absensi_karyawan.
  - Support dokumen lama/baru: tanggal atau tanggalKerja.
  - Jam masuk/pulang tampil dari field jamMasuk dan jamPulang.
  - Profil karyawan digabung dari koleksi karyawan untuk nama, jabatan, tokoNama.
  - Filter toko memakai karyawan.tokoNama.
  - Jadwal dinamis dari pengaturan_jam_absensi.
  - Prioritas jadwal: default -> toko -> karyawan.
  - Support effectiveSchedules, monthlyOverrides, dan lintasTanggal.
  - Alfa virtual dihitung dari karyawan aktif + jadwal dinamis + karyawan_tidak_wajib_absen.
  - Karyawan tidak wajib absen tidak muncul dan tidak dihitung alfa.
  - Layout dikonsistenkan dengan dashboard/laporan terbaru: tema sky-blue, wrapper aman untuk shell/sidebar, filter collapse, dan mobile card rapi.
  - Pagination: 10, 25, 50, 100, Semua.
*/

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, query, where } from "firebase/firestore"
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  Filter,
  RefreshCw,
  Search,
  Store,
  UserX,
  Users,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type KaryawanItem = {
  id: string
  nama: string
  jabatan: string
  tokoId: string
  tokoNama: string
  aktif: boolean
}

type TokoItem = {
  id: string
  nama: string
}

type DaySchedule = {
  enabled: boolean
  jamMasuk: string
  jamPulang: string
  lintasTanggal?: boolean
}

type EffectiveSchedule = {
  effectiveFrom: string
  weeklySchedule?: Record<string | number, Partial<DaySchedule>>
  monthlyOverrides?: Record<string, Record<string, Partial<DaySchedule>>>
  note?: string
  createdAt?: any
  createdBy?: string
}

type ResolvedSchedule = {
  schedule: DaySchedule | null
  source: "default" | "toko" | "karyawan" | null
  mode: "weekly" | "monthly_override" | null
  configured: boolean
  isLibur: boolean
}

type PengaturanMap = Record<string, any>

type AbsensiKaryawan = {
  id: string
  karyawanId?: string
  userId?: string
  namaKaryawan?: string
  nama?: string
  karyawanNama?: string

  tokoId?: string
  tokoNama?: string
  toko?: { id?: string; nama?: string } | null

  jabatan?: string | null

  tanggal?: string
  tanggalKerja?: string
  tahun?: number
  bulan?: number
  bulanKey?: string

  jamMasuk?: string | null
  jamPulang?: string | null

  jadwalJamMasuk?: string | null
  jadwalJamPulang?: string | null
  jadwalMasuk?: string | null
  jadwalPulang?: string | null
  jadwalSumber?: "default" | "toko" | "karyawan" | string | null
  jadwalMode?: "weekly" | "monthly_override" | string | null
  jadwalLintasTanggal?: boolean
  lintasTanggal?: boolean

  status: string
  approvalStatus?: string
  approvalFinalStatus?: string

  alasanMasuk?: string | null
  alasanPulang?: string | null
  alasanIzin?: string | null
  keteranganMasuk?: string | null
  keteranganPulang?: string | null
  keteranganIzin?: string | null
  metode?: string | null
}

type AbsensiRow = Omit<AbsensiKaryawan, "id" | "tanggal"> & {
  id: string
  karyawanId: string
  namaKaryawan: string
  jabatan: string
  tokoId: string
  tokoNama: string
  tanggal: string
  tanggalKerja: string
  jamMasuk: string | null
  jamPulang: string | null
  status: string
  approvalStatus?: string
  isAlfa?: boolean
  jadwalMasuk?: string | null
  jadwalPulang?: string | null
  jadwalSumber?: "default" | "toko" | "karyawan" | string | null
  jadwalMode?: "weekly" | "monthly_override" | string | null
  lintasTanggal?: boolean
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "Semua" },
]

const STATUS_LIST = [
  { value: "", label: "Semua Status" },
  { value: "hadir", label: "Hadir" },
  { value: "terlambat", label: "Terlambat" },
  { value: "pulang_cepat", label: "Pulang Cepat" },
  { value: "terlambat_pulang_cepat", label: "Terlambat + Pulang Cepat" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
  { value: "alfa", label: "Alfa" },
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

const getTodayLocal = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const getHari = (t: string) => {
  if (!t) return "-"
  return new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "short",
  })
}

const toMinutes = (t?: string | null) => {
  if (!t || !t.includes(":")) return 0
  const [h, m] = t.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

const getMonthKey = (dateKey: string) => dateKey.slice(0, 7)
const getDayIndex = (tanggal: string) => new Date(`${tanggal}T00:00:00`).getDay()

const isBeforeOrEqualMarch2026 = (tanggal: string) => {
  const d = new Date(`${tanggal}T00:00:00`)
  const tahun = d.getFullYear()
  const bulan = d.getMonth() + 1
  return tahun < 2026 || (tahun === 2026 && bulan <= 3)
}

const canCountAlphaForDate = (tanggal: string) => !isBeforeOrEqualMarch2026(tanggal)

const buildTanggalKeysForAlfa = (params: {
  tahun: number
  bulan: number
  tanggalFilter: string
}) => {
  const { tahun, bulan, tanggalFilter } = params

  if (tanggalFilter) {
    return canCountAlphaForDate(tanggalFilter) ? [tanggalFilter] : []
  }

  if (!tahun || !bulan) return []

  const today = getTodayLocal()
  const daysInMonth = new Date(tahun, bulan, 0).getDate()

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0")
    const month = String(bulan).padStart(2, "0")
    return `${tahun}-${month}-${day}`
  }).filter((tanggal) => tanggal <= today && canCountAlphaForDate(tanggal))
}

function createEmptyWeeklySchedule(): Record<number, DaySchedule> {
  return {
    0: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    1: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    2: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    3: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    4: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    5: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
    6: { enabled: false, jamMasuk: "", jamPulang: "", lintasTanggal: false },
  }
}

function normalizeEffectiveSchedules(data: any): EffectiveSchedule[] {
  if (!Array.isArray(data?.effectiveSchedules)) return []

  return data.effectiveSchedules
    .filter((item: any) => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.effectiveFrom === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom)
      )
    })
    .sort((a: EffectiveSchedule, b: EffectiveSchedule) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom)
    )
}

function removeEffectiveMeta(data: any) {
  const { effectiveSchedules, ...rest } = data || {}
  return rest
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> {
  const empty = createEmptyWeeklySchedule()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...empty }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]

      if (raw) {
        normalized[i] = {
          enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
          jamMasuk: raw.jamMasuk || "",
          jamPulang: raw.jamPulang || "",
          lintasTanggal:
            typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
        }
      }
    }

    return normalized
  }

  const hasLegacy =
    typeof data?.jamMasuk === "string" ||
    typeof data?.jamPulang === "string" ||
    Array.isArray(data?.hariLibur)

  if (!hasLegacy) return empty

  const jamMasuk = data?.jamMasuk || ""
  const jamPulang = data?.jamPulang || ""
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : []
  const migrated: Record<number, DaySchedule> = { ...empty }

  for (let i = 0; i < 7; i++) {
    migrated[i] = {
      enabled: !hariLibur.includes(i),
      jamMasuk,
      jamPulang,
      lintasTanggal: false,
    }
  }

  return migrated
}

function mergeScheduleData(baseData: any, overrideData: any) {
  const merged = {
    ...(baseData || {}),
    ...(overrideData || {}),
    weeklySchedule: {
      ...(baseData?.weeklySchedule || {}),
      ...(overrideData?.weeklySchedule || {}),
    },
    monthlyOverrides: {
      ...(baseData?.monthlyOverrides || {}),
      ...(overrideData?.monthlyOverrides || {}),
    },
    effectiveSchedules: [
      ...normalizeEffectiveSchedules(baseData),
      ...normalizeEffectiveSchedules(overrideData),
    ].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
  }

  Object.entries(overrideData?.monthlyOverrides || {}).forEach(([monthKey, dates]) => {
    merged.monthlyOverrides[monthKey] = {
      ...(baseData?.monthlyOverrides?.[monthKey] || {}),
      ...(dates as Record<string, any>),
    }
  })

  return merged
}

function resolveEffectiveDataForDate(data: any, tanggal: string) {
  if (!data) return null

  const base = removeEffectiveMeta(data)
  const schedules = normalizeEffectiveSchedules(data)

  let resolved = { ...base }

  schedules.forEach((entry) => {
    if (entry.effectiveFrom <= tanggal) {
      resolved = mergeScheduleData(resolved, {
        weeklySchedule: entry.weeklySchedule || {},
        monthlyOverrides: entry.monthlyOverrides || {},
      })
    }
  })

  return resolved
}

function getResolvedScheduleData(
  karyawan: KaryawanItem,
  pengaturanMap: PengaturanMap
): { data: any | null; source: "default" | "toko" | "karyawan" | null } {
  const defaultData = pengaturanMap.default || null
  const tokoData =
    pengaturanMap[`toko_${karyawan.tokoId}`] ||
    pengaturanMap[`toko_${karyawan.tokoNama}`] ||
    null
  const individuData = pengaturanMap[`karyawan_${karyawan.id}`] || null

  let resolvedData: any = defaultData
  let source: "default" | "toko" | "karyawan" | null = defaultData ? "default" : null

  if (resolvedData && tokoData) {
    resolvedData = mergeScheduleData(resolvedData, tokoData)
    source = "toko"
  } else if (tokoData) {
    resolvedData = tokoData
    source = "toko"
  }

  if (resolvedData && individuData) {
    resolvedData = mergeScheduleData(resolvedData, individuData)
    source = "karyawan"
  } else if (individuData) {
    resolvedData = individuData
    source = "karyawan"
  }

  return { data: resolvedData || null, source }
}

function getScheduleForDate(
  karyawan: KaryawanItem,
  tanggal: string,
  pengaturanMap: PengaturanMap
): ResolvedSchedule {
  const resolved = getResolvedScheduleData(karyawan, pengaturanMap)

  if (!resolved.data) {
    return {
      schedule: null,
      source: null,
      mode: null,
      configured: false,
      isLibur: true,
    }
  }

  const effectiveData = resolveEffectiveDataForDate(resolved.data, tanggal) || resolved.data
  const weeklySchedule = normalizeWeeklySchedule(effectiveData)
  const dayIndex = getDayIndex(tanggal)
  const monthKey = getMonthKey(tanggal)

  const monthlyOverride =
    effectiveData?.monthlyOverrides?.[monthKey]?.[tanggal] ||
    effectiveData?.monthlyOverrides?.[monthKey]?.[String(tanggal)]

  if (monthlyOverride && typeof monthlyOverride === "object") {
    const schedule: DaySchedule = {
      enabled:
        typeof monthlyOverride.enabled === "boolean"
          ? monthlyOverride.enabled
          : weeklySchedule[dayIndex]?.enabled ?? false,
      jamMasuk: monthlyOverride.jamMasuk || weeklySchedule[dayIndex]?.jamMasuk || "",
      jamPulang: monthlyOverride.jamPulang || weeklySchedule[dayIndex]?.jamPulang || "",
      lintasTanggal:
        typeof monthlyOverride.lintasTanggal === "boolean"
          ? monthlyOverride.lintasTanggal
          : weeklySchedule[dayIndex]?.lintasTanggal ?? false,
    }

    const configured = !!schedule.jamMasuk && !!schedule.jamPulang

    return {
      schedule,
      source: resolved.source,
      mode: "monthly_override",
      configured,
      isLibur: !schedule.enabled || !configured,
    }
  }

  const schedule =
    weeklySchedule[dayIndex] || {
      enabled: false,
      jamMasuk: "",
      jamPulang: "",
      lintasTanggal: false,
    }

  const configured = !!schedule.jamMasuk && !!schedule.jamPulang

  return {
    schedule,
    source: resolved.source,
    mode: "weekly",
    configured,
    isLibur: !schedule.enabled || !configured,
  }
}

const hitungTerlambatMenit = (jamMasuk: string | null, jadwalMasuk?: string | null) => {
  if (!jamMasuk || !jadwalMasuk) return null
  const diff = toMinutes(jamMasuk) - toMinutes(jadwalMasuk)
  return diff > 0 ? diff : null
}

const getTokoNamaFromKaryawan = (data: any) => {
  return String(data?.tokoNama || "").trim()
}

const getKaryawanIdFromAbsensi = (data: any) => {
  return String(data?.karyawanId || data?.karyawan_id || data?.userId || "").trim()
}

const getTanggalAbsensi = (data: any) => {
  return String(data?.tanggalKerja || data?.tanggal || "").trim()
}

const getNamaKaryawanFromAbsensi = (data: any, profile?: KaryawanItem) => {
  return String(
    data?.namaKaryawan ||
      data?.nama ||
      data?.karyawanNama ||
      profile?.nama ||
      "-"
  ).trim()
}

const getJadwalMasukFromAbsensi = (data: any) => {
  return String(data?.jadwalJamMasuk || data?.jadwalMasuk || "").trim() || null
}

const getJadwalPulangFromAbsensi = (data: any) => {
  return String(data?.jadwalJamPulang || data?.jadwalPulang || "").trim() || null
}

function SelisihMasukBadge({
  jamMasuk,
  jadwalMasuk,
}: {
  jamMasuk: string | null
  jadwalMasuk?: string | null
}) {
  if (!jamMasuk) return <span className="text-xs text-slate-300">—</span>
  if (!jadwalMasuk) return <span className="text-xs text-slate-300">—</span>

  const diff = toMinutes(jamMasuk) - toMinutes(jadwalMasuk)

  if (diff <= 0) {
    return (
      <span className="inline-flex rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
        {diff === 0 ? "Tepat waktu" : `${Math.abs(diff)}m awal`}
      </span>
    )
  }

  return (
    <span className="inline-flex rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
      {diff}m terlambat
    </span>
  )
}

function SelisihPulangBadge({
  jamPulang,
  jadwalPulang,
}: {
  jamPulang: string | null
  jadwalPulang?: string | null
}) {
  if (!jamPulang) return <span className="text-xs text-slate-300">—</span>
  if (!jadwalPulang) return <span className="text-xs text-slate-300">—</span>

  const diff = toMinutes(jamPulang) - toMinutes(jadwalPulang)

  if (diff >= 0) {
    return (
      <span className="inline-flex rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
        {diff === 0 ? "Tepat waktu" : `${diff}m lama`}
      </span>
    )
  }

  return (
    <span className="inline-flex rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
      {Math.abs(diff)}m awal
    </span>
  )
}

function StatusBadge({ d }: { d: AbsensiRow }) {
  if (d.status === "alfa") {
    return (
      <span className="inline-flex rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-bold capitalize text-rose-700">
        alfa
      </span>
    )
  }

  if (
    (d.status === "izin" || d.status === "sakit") &&
    d.approvalStatus !== "approved"
  ) {
    return <span className="text-xs text-slate-300">—</span>
  }

  const terlambatMenit =
    d.status.includes("terlambat") && d.jamMasuk
      ? hitungTerlambatMenit(d.jamMasuk, d.jadwalMasuk)
      : null

  const label =
    d.status.includes("terlambat") && terlambatMenit
      ? d.status === "terlambat_pulang_cepat"
        ? `terlambat ${terlambatMenit}m + pc`
        : `terlambat ${terlambatMenit}m`
      : d.status === "terlambat_pulang_cepat"
        ? "terlambat + pc"
        : d.status

  const colorMap: Record<string, string> = {
    hadir: "bg-sky-100 text-sky-700",
    masuk: "bg-sky-100 text-sky-700",
    terlambat: "bg-yellow-100 text-yellow-700",
    pulang_cepat: "bg-orange-100 text-orange-700",
    terlambat_pulang_cepat: "bg-orange-100 text-orange-700",
    izin: "bg-sky-100 text-sky-700",
    sakit: "bg-red-100 text-red-700",
    alfa: "bg-rose-100 text-rose-700",
  }

  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold capitalize ${
        colorMap[d.status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {label.replaceAll("_", " ")}
    </span>
  )
}

function ApprovalBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-xs text-slate-300">—</span>

  const colorMap: Record<string, string> = {
    approved: "bg-sky-100 text-sky-700",
    pending: "bg-amber-100 text-amber-700",
    rejected: "bg-rose-100 text-rose-700",
  }

  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold capitalize ${
        colorMap[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
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
  onChange: (v: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
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
  const [showFilter, setShowFilter] = useState(false)

  const [tokoList, setTokoList] = useState<TokoItem[]>([])

  const isSearchMode = searchQuery.trim().length > 0
  const isDailyMode = Boolean(tanggalFilter)

  const fetchPengaturanJam = async () => {
    const snap = await getDocs(collection(db, "pengaturan_jam_absensi"))
    const map: PengaturanMap = {}

    snap.docs.forEach((docSnap) => {
      map[docSnap.id] = docSnap.data()
    })

    return map
  }

  const fetchTidakWajibSet = async () => {
    const snap = await getDocs(collection(db, "karyawan_tidak_wajib_absen"))
    const set = new Set<string>()

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any
      const status = String(data?.status || "").toLowerCase()
      const aktif =
        data?.aktif === true ||
        data?.isActive === true ||
        status === "aktif" ||
        status === "active" ||
        !status

      const karyawanId = String(data?.karyawanId || docSnap.id || "").trim()
      if (aktif && karyawanId) set.add(karyawanId)
    })

    return set
  }

  const fetchMasterKaryawan = async () => {
    const snap = await getDocs(collection(db, "karyawan"))
    const map = new Map<string, KaryawanItem>()

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any
      const tokoNama = getTokoNamaFromKaryawan(data)

      const item: KaryawanItem = {
        id: String(data?.karyawanId || docSnap.id || "").trim(),
        nama: String(data?.nama || data?.namaKaryawan || data?.displayName || "").trim(),
        jabatan: String(data?.jabatan || "-").trim() || "-",
        tokoId: tokoNama,
        tokoNama,
        aktif: data?.aktif !== false,
      }

      if (item.id) map.set(item.id, item)
    })

    return map
  }

  const buildTokoListFromKaryawanMap = (karyawanMap: Map<string, KaryawanItem>) => {
    const tokoMap = new Map<string, TokoItem>()

    Array.from(karyawanMap.values()).forEach((item) => {
      const tokoNama = String(item.tokoNama || "").trim()
      if (!tokoNama) return
      tokoMap.set(tokoNama, { id: tokoNama, nama: tokoNama })
    })

    setTokoList(
      Array.from(tokoMap.values()).sort((a, b) =>
        a.nama.localeCompare(b.nama, "id")
      )
    )
  }

  const fetchAbsensiDocs = async () => {
    const docMap = new Map<string, any>()

    if (tanggalFilter) {
      const [snapTanggalKerja, snapTanggal] = await Promise.all([
        getDocs(
          query(
            collection(db, "absensi_karyawan"),
            where("tanggalKerja", "==", tanggalFilter)
          )
        ),
        getDocs(
          query(
            collection(db, "absensi_karyawan"),
            where("tanggal", "==", tanggalFilter)
          )
        ),
      ])

      snapTanggalKerja.docs.forEach((docSnap) => docMap.set(docSnap.id, docSnap))
      snapTanggal.docs.forEach((docSnap) => docMap.set(docSnap.id, docSnap))

      return Array.from(docMap.values())
    }

    const snap = await getDocs(
      query(
        collection(db, "absensi_karyawan"),
        where("tahun", "==", tahun),
        where("bulan", "==", bulan)
      )
    )

    snap.docs.forEach((docSnap) => docMap.set(docSnap.id, docSnap))
    return Array.from(docMap.values())
  }

  const enrichRowsWithSchedule = (
    rows: AbsensiRow[],
    karyawanMap: Map<string, KaryawanItem>,
    pengaturanMap: PengaturanMap
  ): AbsensiRow[] => {
    return rows.map((row) => {
      const profile = row.karyawanId ? karyawanMap.get(row.karyawanId) : undefined

      if (!profile || !row.tanggal) {
        return {
          ...row,
          jadwalMasuk: row.jadwalMasuk || getJadwalMasukFromAbsensi(row),
          jadwalPulang: row.jadwalPulang || getJadwalPulangFromAbsensi(row),
        }
      }

      const resolved = getScheduleForDate(profile, row.tanggal, pengaturanMap)

      return {
        ...row,
        jadwalMasuk:
          getJadwalMasukFromAbsensi(row) || resolved.schedule?.jamMasuk || null,
        jadwalPulang:
          getJadwalPulangFromAbsensi(row) || resolved.schedule?.jamPulang || null,
        jadwalSumber: row.jadwalSumber || resolved.source,
        jadwalMode: row.jadwalMode || resolved.mode,
        lintasTanggal:
          typeof row.jadwalLintasTanggal === "boolean"
            ? row.jadwalLintasTanggal
            : !!resolved.schedule?.lintasTanggal,
      }
    })
  }

  const buildAlfaRows = (params: {
    rows: AbsensiRow[]
    karyawanMap: Map<string, KaryawanItem>
    tidakWajibSet: Set<string>
    pengaturanMap: PengaturanMap
    tanggalKeysForAlfa: string[]
  }) => {
    const { rows, karyawanMap, tidakWajibSet, pengaturanMap, tanggalKeysForAlfa } = params

    const existingKaryawanDateSet = new Set(
      rows
        .map((d) => {
          const karyawanId = String(d.karyawanId || "").trim()
          const tanggal = String(d.tanggal || "").trim()
          if (!karyawanId || !tanggal) return ""
          return `${tanggal}__${karyawanId}`
        })
        .filter(Boolean)
    )

    const alfaRows: AbsensiRow[] = []

    tanggalKeysForAlfa.forEach((tanggalAlfa) => {
      Array.from(karyawanMap.values())
        .filter((karyawan) => karyawan.aktif)
        .filter((karyawan) => !tidakWajibSet.has(karyawan.id))
        .filter((karyawan) => !tokoFilter || karyawan.tokoNama === tokoFilter)
        .filter((karyawan) => !existingKaryawanDateSet.has(`${tanggalAlfa}__${karyawan.id}`))
        .forEach((karyawan) => {
          const resolved = getScheduleForDate(karyawan, tanggalAlfa, pengaturanMap)

          if (!resolved.configured || resolved.isLibur) return

          alfaRows.push({
            id: `alfa_${karyawan.id}_${tanggalAlfa}`,
            karyawanId: karyawan.id,
            namaKaryawan: karyawan.nama || "-",
            tanggal: tanggalAlfa,
            tanggalKerja: tanggalAlfa,
            tahun: Number(tanggalAlfa.slice(0, 4)),
            bulan: Number(tanggalAlfa.slice(5, 7)),
            jamMasuk: null,
            jamPulang: null,
            status: "alfa",
            approvalStatus: "approved",
            alasanMasuk: null,
            alasanPulang: null,
            alasanIzin: null,
            keteranganMasuk: null,
            keteranganPulang: null,
            keteranganIzin: null,
            metode: null,
            jabatan: karyawan.jabatan || "-",
            tokoId: karyawan.tokoNama,
            tokoNama: karyawan.tokoNama || "-",
            isAlfa: true,
            jadwalMasuk: resolved.schedule?.jamMasuk || null,
            jadwalPulang: resolved.schedule?.jamPulang || null,
            jadwalSumber: resolved.source,
            jadwalMode: resolved.mode,
            lintasTanggal: !!resolved.schedule?.lintasTanggal,
          })
        })
    })

    return alfaRows
  }

  const fetchData = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    try {
      const [absensiDocs, karyawanMap, pengaturanMap, tidakWajibSet] =
        await Promise.all([
          fetchAbsensiDocs(),
          fetchMasterKaryawan(),
          fetchPengaturanJam(),
          fetchTidakWajibSet(),
        ])

      buildTokoListFromKaryawanMap(karyawanMap)

      let rows = absensiDocs.map((docSnap) => {
        const data = docSnap.data() as AbsensiKaryawan
        const karyawanId = getKaryawanIdFromAbsensi(data)
        const profile = karyawanId ? karyawanMap.get(karyawanId) : undefined
        const tanggal = getTanggalAbsensi(data)

        const row: AbsensiRow = {
          ...data,
          id: docSnap.id,
          karyawanId,
          tanggal,
          tanggalKerja: data.tanggalKerja || tanggal,
          namaKaryawan: getNamaKaryawanFromAbsensi(data, profile),
          jabatan: String(data.jabatan || profile?.jabatan || "-").trim() || "-",
          tokoId: String(data.tokoNama || profile?.tokoNama || "").trim(),
          tokoNama: String(data.tokoNama || profile?.tokoNama || "-").trim() || "-",
          jamMasuk: data.jamMasuk || null,
          jamPulang: data.jamPulang || null,
          jadwalMasuk: getJadwalMasukFromAbsensi(data),
          jadwalPulang: getJadwalPulangFromAbsensi(data),
          lintasTanggal: !!(data.jadwalLintasTanggal || data.lintasTanggal),
        }

        return row
      })

      rows = rows.filter((row) => {
        if (!row.karyawanId) return false
        if (!row.tanggal) return false
        if (tidakWajibSet.has(row.karyawanId)) return false
        if (tokoFilter && row.tokoNama !== tokoFilter) return false

        if (
          (row.status === "izin" || row.status === "sakit") &&
          row.approvalStatus !== "approved"
        ) {
          return approvalFilter === "pending" || approvalFilter === "rejected"
        }

        return true
      })

      rows = enrichRowsWithSchedule(rows, karyawanMap, pengaturanMap)

      const shouldBuildAlfa =
        (!statusFilter || statusFilter === "alfa") &&
        (!approvalFilter || approvalFilter === "approved")

      const tanggalKeysForAlfa = shouldBuildAlfa
        ? buildTanggalKeysForAlfa({ tahun, bulan, tanggalFilter })
        : []

      if (tanggalKeysForAlfa.length > 0) {
        rows = [
          ...rows,
          ...buildAlfaRows({
            rows,
            karyawanMap,
            tidakWajibSet,
            pengaturanMap,
            tanggalKeysForAlfa,
          }),
        ]
      }

      rows.sort((a, b) => {
        if ((a.tanggal || "") !== (b.tanggal || "")) {
          return (b.tanggal || "").localeCompare(a.tanggal || "")
        }

        if (a.status === "alfa" && b.status !== "alfa") return 1
        if (a.status !== "alfa" && b.status === "alfa") return -1

        const aJam = a.jamMasuk || a.jamPulang || ""
        const bJam = b.jamMasuk || b.jamPulang || ""

        if (aJam !== bJam) return bJam.localeCompare(aJam)

        return (a.namaKaryawan || "").localeCompare(b.namaKaryawan || "", "id")
      })

      setAllData(rows)
      setTotalCount(rows.length)
    } catch (err) {
      console.error("Gagal memuat laporan absensi karyawan:", err)
      setAllData([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchData()
      else {
        setAllData([])
        setTotalCount(0)
        setTokoList([])
      }
    })

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setCurrentPage(1)
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun, bulan, tanggalFilter, tokoFilter, statusFilter, approvalFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, itemsPerPage])

  const clientFiltered = useMemo(() => {
    return allData.filter((d) => {
      if (statusFilter && d.status !== statusFilter) return false

      if (approvalFilter) {
        const approvalStatus = d.approvalStatus || "approved"
        if (approvalStatus !== approvalFilter) return false
      }

      if (
        !approvalFilter &&
        (d.status === "izin" || d.status === "sakit") &&
        d.approvalStatus !== "approved"
      ) {
        return false
      }

      if (
        isSearchMode &&
        ![
          d.namaKaryawan || "",
          d.jabatan || "",
          d.tokoNama || "",
          d.status || "",
          d.alasanIzin || "",
          d.alasanMasuk || "",
          d.alasanPulang || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      ) {
        return false
      }

      return true
    })
  }, [allData, approvalFilter, isSearchMode, searchQuery, statusFilter])

  const summaryCounts = useMemo(() => {
    return clientFiltered.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.status === "hadir" || row.status === "masuk") acc.hadir += 1
        if (row.status === "alfa") acc.alfa += 1
        return acc
      },
      { total: 0, hadir: 0, alfa: 0 }
    )
  }, [clientFiltered])

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
          <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">
            ···
          </span>
        ) : (
          <motion.button
            key={p}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => goToPage(p as number)}
            className={`h-8 min-w-[2rem] rounded-xl px-2 text-xs font-black transition-all ${
              currentPage === p
                ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-200/50"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p}
          </motion.button>
        )
      )

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BarChart3 size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Laporan Absensi Karyawan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  {isDailyMode
                    ? `Fokus tanggal ${tanggalFilter}`
                    : "Rekap kehadiran karyawan per bulan."}
                </p>
              </div>
            </div>

          
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
          >
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex">
                <ClipboardList size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[9px] sm:tracking-[0.14em]">
                  Data
                </p>
                <p className="mt-0.5 text-sm font-black leading-tight text-slate-800 sm:text-xl">
                  {summaryCounts.total}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
          >
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex">
                <Store size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[9px] sm:tracking-[0.14em]">
                  Toko
                </p>
                <p className="mt-0.5 text-sm font-black leading-tight text-slate-800 sm:text-xl">
                  {tokoList.length}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
          >
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex">
                <Users size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[9px] sm:tracking-[0.14em]">
                  Hadir
                </p>
                <p className="mt-0.5 text-sm font-black leading-tight text-slate-800 sm:text-xl">
                  {summaryCounts.hadir}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
          >
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 sm:flex">
                <Calendar size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[9px] sm:tracking-[0.14em]">
                  Alfa
                </p>
                <p className="mt-0.5 text-sm font-black leading-tight text-slate-800 sm:text-xl">
                  {summaryCounts.alfa}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {isSearchMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
            >
              <AlertCircle
                size={14}
                className="shrink-0 text-amber-500"
                strokeWidth={2.5}
              />
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Mode pencarian aktif
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <button
            type="button"
            onClick={() => setShowFilter((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 lg:hidden"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <Filter size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                  Filter Data
                </p>
              </div>
            </div>

            <ChevronRight
              size={18}
              strokeWidth={2.5}
              className={`shrink-0 text-slate-400 transition-transform ${
                showFilter ? "rotate-90" : "rotate-0"
              }`}
            />
          </button>

          <div className="hidden border-b border-slate-100 px-4 py-3 lg:block">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <Filter size={17} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                  Filter Data
                </p>
              </div>
            </div>
          </div>

          <div className={`${showFilter ? "block" : "hidden"} border-t border-slate-100 p-4 lg:block lg:border-t-0`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div>
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={tanggalFilter}
                  onChange={(e) => setTanggalFilter(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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

              <FilterSelect label="Toko" value={tokoFilter} onChange={setTokoFilter} icon={Store}>
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

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Cari Karyawan
                </label>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nama / jabatan / toko / status..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all placeholder:font-normal placeholder:text-slate-300 hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Mode Tanggal
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTanggalFilter(today)
                      setTahun(new Date().getFullYear())
                      setBulan(new Date().getMonth() + 1)
                    }}
                    className="flex-1 rounded-xl border-2 border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-100"
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
          </div>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
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
            className="flex flex-col items-center justify-center gap-3 py-16"
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
          <div className="space-y-2 sm:hidden">
            {finalData.map((d, idx) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.03 }}
                className="space-y-2.5 bg-transparent p-0 shadow-none sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-3 sm:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{d.namaKaryawan}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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

                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-1">
                  <div>
                    <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Masuk
                    </p>
                    <p className="mb-1 text-xs font-bold text-slate-700">
                      {d.jamMasuk ?? "—"}
                    </p>
                    <SelisihMasukBadge jamMasuk={d.jamMasuk} jadwalMasuk={d.jadwalMasuk} />
                  </div>

                  <div>
                    <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Pulang
                    </p>
                    <p className="mb-1 text-xs font-bold text-slate-700">
                      {d.jamPulang ?? "—"}
                    </p>
                    <SelisihPulangBadge jamPulang={d.jamPulang} jadwalPulang={d.jadwalPulang} />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-1">
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
            className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 bg-white/80">
                  <tr>
                    {[
                      { label: "No", cls: "text-center w-10" },
                      { label: "Nama Karyawan", cls: "text-left" },
                      { label: "Jabatan", cls: "text-left" },
                      { label: "Toko", cls: "text-left" },
                      { label: "Tanggal", cls: "text-left" },
                      { label: "Jadwal", cls: "text-center" },
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
                        className={`whitespace-nowrap px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${h.cls}`}
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
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                        {itemsPerPage === 0
                          ? i + 1
                          : (currentPage - 1) * itemsPerPage + i + 1}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">
                        {d.namaKaryawan}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-500">
                        {d.jabatan || <span className="text-slate-300">—</span>}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-500">
                        {d.tokoNama || <span className="text-slate-300">—</span>}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5">
                        <p className="font-bold text-slate-700">{d.tanggal}</p>
                        <p className="text-[10px] text-slate-400">{getHari(d.tanggal)}</p>
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 text-center">
                        {d.jadwalMasuk && d.jadwalPulang ? (
                          <div>
                            <p className="font-black text-slate-700">
                              {d.jadwalMasuk} - {d.jadwalPulang}
                            </p>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                              {d.jadwalMode === "monthly_override" ? "Tanggal" : "Harian"}
                              {d.lintasTanggal ? " · Lintas" : ""}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-center font-bold text-slate-700">
                        {d.jamMasuk ?? <span className="text-slate-300">—</span>}
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <SelisihMasukBadge jamMasuk={d.jamMasuk} jadwalMasuk={d.jadwalMasuk} />
                      </td>

                      <td className="px-3 py-2.5 text-center font-bold text-slate-700">
                        {d.jamPulang ?? <span className="text-slate-300">—</span>}
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <SelisihPulangBadge jamPulang={d.jamPulang} jadwalPulang={d.jadwalPulang} />
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge d={d} />
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <ApprovalBadge status={d.approvalStatus} />
                      </td>

                      <td className="min-w-[120px] space-y-1 px-3 py-2.5">
                        {d.alasanIzin && (
                          <span className="inline-flex rounded-lg bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-800">
                            {d.alasanIzin}
                          </span>
                        )}
                        {d.alasanMasuk && (
                          <span className="inline-flex rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                            {d.alasanMasuk}
                          </span>
                        )}
                        {d.alasanPulang && (
                          <span className="inline-flex rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                            {d.alasanPulang}
                          </span>
                        )}
                        {!d.alasanIzin && !d.alasanMasuk && !d.alasanPulang && (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="min-w-[140px] px-3 py-2.5 text-[11px] font-semibold text-slate-500">
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

        {!loading && clientFiltered.length > 0 && itemsPerPage !== 0 && finalTotalPages > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center justify-end gap-3"
          >
            <div className="flex items-center gap-1.5">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>

              {renderPageNumbers()}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === finalTotalPages || loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
