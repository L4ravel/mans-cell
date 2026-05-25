"use client"

/*
  Halaman ini menampilkan laporan absensi bulanan karyawan.
  Revisi:
  - Layout dan logika dikonsistensikan dengan laporan absensi bulanan PTK.
  - Jadwal dasar dibaca dari pengaturan_jam_absensi/default dan pengaturan_jam_absensi/toko_<tokoId>.
  - Jadwal individu dibaca dari pengaturan_jam_absensi/karyawan_<karyawanId>.
  - Prioritas jadwal: default -> toko -> karyawan.
  - Per tanggal/monthlyOverrides mengalahkan jadwal mingguan.
  - Mendukung effectiveSchedules agar perubahan jadwal berlaku mulai tanggal tertentu.
  - Tanggal sebelum effectiveFrom tetap memakai jadwal lama.
  - Hari efektif, alfa, hadir, dan kode L mengikuti jadwal dinamis.
  - Semua karyawan wajib tetap muncul walau belum pernah absen.
  - Karyawan hanya disembunyikan jika ada di karyawan_tidak_wajib_absen.
  - Data toko memakai fallback toko.id/nama, tokoId, tokoNama, atau string toko.
  - Ranking laporan memakai poin internal: H 100, T/PC 85, TPC 70, tidak absen pulang 65 dan tampil sebagai ?, S 70, I 60, A 0.
  - Poin tidak ditampilkan, hanya dipakai untuk menentukan posisi karyawan.
  - Cache localStorage 5 menit agar tidak reload terus.
  - Layout direvisi konsisten dengan dashboard/laporan absensi terbaru: header biru, filter collapse mobile, wrapper aman layout.
  - Warna utama disamakan dengan contoh: sky-500 → sky-600 → blue-500.
*/

import { useEffect, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, query, where } from "firebase/firestore"
import {
  ClipboardList,
  Cpu,
  Filter,
  ChevronDown,
  Building2,
  FileDown,
  FileSpreadsheet,
  TrendingUp,
} from "lucide-react"
import { motion } from "framer-motion"

type TokoRef = {
  id: string
  nama: string
}

type BulananDays = {
  karyawanId: string
  namaKaryawan: string
  toko: TokoRef
  tahun: number
  bulan: number
  days: Record<string, string>
}

type MasterKaryawan = {
  id: string
  nama: string
  toko: TokoRef
}

type Summary = {
  karyawanId: string
  hadir: number
  izin: number
  sakit: number
  terlambat: number
  pulangCepat: number
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

type PengaturanMap = Record<string, any>

const CODE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  H: { label: "Hadir", bg: "bg-emerald-500", text: "text-white" },
  I: { label: "Izin", bg: "bg-yellow-400", text: "text-slate-900" },
  S: { label: "Sakit", bg: "bg-red-400", text: "text-white" },
  A: { label: "Alfa", bg: "bg-rose-700", text: "text-white" },
  T: { label: "Terlambat", bg: "bg-orange-500", text: "text-white" },
  PC: { label: "Pulang Cepat", bg: "bg-blue-500", text: "text-white" },
  TPC: { label: "Terlambat+PC", bg: "bg-violet-600", text: "text-white" },
  L: { label: "Libur", bg: "bg-slate-200", text: "text-slate-500" },
  "?": { label: "Tidak Absen Pulang", bg: "bg-slate-500", text: "text-white" },
}

const POINT_CONFIG: Record<string, number> = {
  H: 100,
  T: 85,
  PC: 85,
  TPC: 70,
  "?": 65,
  "-": 65,
  S: 70,
  I: 60,
  A: 0,
}

const COLOR_MAP: Record<string, [number, number, number]> = {
  H: [16, 185, 129],
  I: [250, 204, 21],
  S: [248, 113, 113],
  A: [190, 18, 60],
  T: [249, 115, 22],
  PC: [59, 130, 246],
  TPC: [124, 58, 237],
  L: [226, 232, 240],
  "?": [100, 116, 139],
  "-": [100, 116, 139],
}

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }

    const s = document.createElement("script")
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })

const pctTextColor = (pct: number) => {
  if (pct >= 90) return "text-emerald-600"
  if (pct >= 75) return "text-yellow-600"
  return "text-rose-600"
}

const pctBadgeClass = (pct: number) => {
  if (pct >= 90) return "bg-emerald-50 border-emerald-200 text-emerald-700"
  if (pct >= 75) return "bg-yellow-50 border-yellow-200 text-yellow-700"
  return "bg-rose-50 border-rose-200 text-rose-700"
}

const pctBarColor = (pct: number) => {
  if (pct >= 90) return "bg-emerald-500"
  if (pct >= 75) return "bg-yellow-400"
  return "bg-rose-500"
}

const isBeforeOrEqualMarch2026 = (bulan: number, tahun: number) => {
  return tahun < 2026 || (tahun === 2026 && bulan <= 3)
}

const canCountAlphaForDate = (_dateObj: Date, bulan: number, tahun: number) => {
  if (isBeforeOrEqualMarch2026(bulan, tahun)) return false
  return true
}

function formatDateKeyLocal(dateObj: Date) {
  const yyyy = dateObj.getFullYear()
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0")
  const dd = String(dateObj.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getMonthKey(dateKey: string) {
  return dateKey.slice(0, 7)
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
  }

  Object.entries(overrideData?.monthlyOverrides || {}).forEach(([monthKey, dates]) => {
    merged.monthlyOverrides[monthKey] = {
      ...(baseData?.monthlyOverrides?.[monthKey] || {}),
      ...(dates as Record<string, any>),
    }
  })

  return merged
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

function resolveEffectiveDataForDate(data: any, dateKey: string) {
  if (!data) return null

  const base = removeEffectiveMeta(data)
  const schedules = normalizeEffectiveSchedules(data)

  let resolved = { ...base }

  schedules.forEach((entry) => {
    if (entry.effectiveFrom <= dateKey) {
      resolved = mergeScheduleData(resolved, {
        weeklySchedule: entry.weeklySchedule || {},
        monthlyOverrides: entry.monthlyOverrides || {},
      })
    }
  })

  return resolved
}

function normalizeTokoFromData(data: any): TokoRef {
  const namaRaw = String(
    data?.toko?.nama ||
      data?.tokoNama ||
      data?.namaToko ||
      (typeof data?.toko === "string" ? data.toko : "") ||
      "Tanpa Toko"
  ).trim()

  const idRaw = String(
    data?.toko?.id ||
      data?.tokoId ||
      data?.toko_id ||
      data?.idToko ||
      namaRaw ||
      "tanpa-toko"
  ).trim()

  const nama = namaRaw || "Tanpa Toko"
  const id = idRaw || nama || "tanpa-toko"

  return { id, nama }
}

function normalizeBulananRow(
  row: any,
  masterMap: Map<string, MasterKaryawan>
): BulananDays {
  const karyawanId = String(row?.karyawanId || row?.ptkId || "").trim()
  const master = masterMap.get(karyawanId)
  const toko = master?.toko || normalizeTokoFromData(row)

  return {
    karyawanId,
    namaKaryawan: String(
      row?.namaKaryawan ||
        row?.namaPtk ||
        master?.nama ||
        ""
    ).trim(),
    toko,
    tahun: Number(row?.tahun || 0),
    bulan: Number(row?.bulan || 0),
    days: row?.days && typeof row.days === "object" ? row.days : {},
  }
}

function getResolvedScheduleData(row: BulananDays, pengaturanMap: PengaturanMap) {
  const defaultData = pengaturanMap.default
  const tokoId = String(row.toko?.id || "").trim()
  const tokoNama = String(row.toko?.nama || "").trim()

  const tokoData =
    pengaturanMap[`toko_${tokoId}`] ||
    pengaturanMap[`toko_${tokoNama}`]

  const individuData = pengaturanMap[`karyawan_${row.karyawanId}`]

  let resolvedData: any = defaultData || null

  if (resolvedData && tokoData) {
    resolvedData = mergeScheduleData(resolvedData, tokoData)
  } else if (tokoData) {
    resolvedData = tokoData
  }

  if (resolvedData && individuData) {
    resolvedData = mergeScheduleData(resolvedData, individuData)
  } else if (individuData) {
    resolvedData = individuData
  }

  return resolvedData
}

function getScheduleForDate(data: any, dateObj: Date): DaySchedule | null {
  if (!data) return null

  const dateKey = formatDateKeyLocal(dateObj)
  const effectiveData = resolveEffectiveDataForDate(data, dateKey)

  if (!effectiveData) return null

  const weeklySchedule = normalizeWeeklySchedule(effectiveData)
  const dayIndex = dateObj.getDay()
  const monthKey = getMonthKey(dateKey)

  const monthlyOverride =
    effectiveData?.monthlyOverrides?.[monthKey]?.[dateKey] ||
    effectiveData?.monthlyOverrides?.[monthKey]?.[String(dateKey)]

  if (monthlyOverride && typeof monthlyOverride === "object") {
    return {
      enabled:
        typeof monthlyOverride.enabled === "boolean"
          ? monthlyOverride.enabled
          : weeklySchedule[dayIndex]?.enabled ?? false,
      jamMasuk: monthlyOverride.jamMasuk || weeklySchedule[dayIndex]?.jamMasuk || "",
      jamPulang:
        monthlyOverride.jamPulang || weeklySchedule[dayIndex]?.jamPulang || "",
      lintasTanggal:
        typeof monthlyOverride.lintasTanggal === "boolean"
          ? monthlyOverride.lintasTanggal
          : false,
    }
  }

  return (
    weeklySchedule[dayIndex] || {
      enabled: false,
      jamMasuk: "",
      jamPulang: "",
      lintasTanggal: false,
    }
  )
}

function isValidWorkSchedule(schedule: DaySchedule | null) {
  return !!schedule?.enabled && !!schedule?.jamMasuk && !!schedule?.jamPulang
}

function normalizeDisplayCode(code: string | undefined | null): string {
  if (code === "-") return "?"
  return code || ""
}

const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_PREFIX = "laporan_absen_bulanan_karyawan_v2"

type CachePayload = {
  cachedAt: number
  bulanan: BulananDays[]
  summary: Record<string, Summary>
  pengaturanMap: PengaturanMap
  tidakWajibMap: Record<string, boolean>
  tokoList: TokoRef[]
}

function getCacheKey(uid: string, bulan: number, tahun: number) {
  return `${CACHE_PREFIX}:${uid}:${tahun}:${bulan}`
}

function readCachePayload(cacheKey: string): CachePayload | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachePayload
    const cachedAt = Number(parsed?.cachedAt || 0)
    const expired = !cachedAt || Date.now() - cachedAt > CACHE_TTL_MS

    if (expired) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    return parsed
  } catch (err) {
    console.error("Cache laporan absensi karyawan rusak:", err)
    window.localStorage.removeItem(cacheKey)
    return null
  }
}

function writeCachePayload(cacheKey: string, payload: Omit<CachePayload, "cachedAt">) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        ...payload,
        cachedAt: Date.now(),
      })
    )
  } catch (err) {
    console.error("Gagal menyimpan cache laporan absensi karyawan:", err)
  }
}

function removeCachePayload(cacheKey: string) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(cacheKey)
  } catch (err) {
    console.error("Gagal menghapus cache laporan absensi karyawan:", err)
  }
}

export default function LaporanAbsenBulananPage() {
  const [loading, setLoading] = useState(true)
  const [bulanan, setBulanan] = useState<BulananDays[]>([])
  const [summary, setSummary] = useState<Record<string, Summary>>({})
  const [pengaturanMap, setPengaturanMap] = useState<PengaturanMap>({})
  const [tidakWajibMap, setTidakWajibMap] = useState<Record<string, boolean>>({})
  const [tokoFilter, setTokoFilter] = useState<string>("")
  const [tokoList, setTokoList] = useState<TokoRef[]>([])
  const [bulanFilter, setBulanFilter] = useState<number>(new Date().getMonth() + 1)
  const [tahunFilter, setTahunFilter] = useState<number>(new Date().getFullYear())
  const [downloading, setDownloading] = useState<"pdf" | "xls" | null>(null)
  const [showFilter, setShowFilter] = useState(false)

  const tahun = tahunFilter

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const applyCachePayload = (payload: CachePayload) => {
      setTidakWajibMap(payload.tidakWajibMap || {})
      setBulanan(payload.bulanan || [])
      setTokoList(payload.tokoList || [])
      setPengaturanMap(payload.pengaturanMap || {})
      setSummary(payload.summary || {})
    }

    const fetchData = async (cacheKey: string, options?: { showLoading?: boolean }) => {
      const user = auth.currentUser
      if (!user) return

      if (options?.showLoading !== false) {
        setLoading(true)
      }

      try {
        const snapTidakWajib = await getDocs(collection(db, "karyawan_tidak_wajib_absen"))
        const mapTidakWajib: Record<string, boolean> = {}

        snapTidakWajib.docs.forEach((d) => {
          mapTidakWajib[d.id] = true
          const data = d.data() as any
          if (data.karyawanId) mapTidakWajib[String(data.karyawanId)] = true
        })

        setTidakWajibMap(mapTidakWajib)

        const snapKaryawan = await getDocs(collection(db, "karyawan"))
        const masterKaryawan: MasterKaryawan[] = snapKaryawan.docs
          .map((d) => {
            const data = d.data() as any
            const toko = normalizeTokoFromData(data)

            return {
              id: String(data.karyawanId || d.id || "").trim(),
              nama: String(data.nama ?? data.namaKaryawan ?? data.displayName ?? "").trim(),
              toko,
            }
          })
          .filter((item) => item.id && item.nama)

        const masterMap = new Map<string, MasterKaryawan>()
        masterKaryawan.forEach((item) => {
          masterMap.set(item.id, item)
        })

        const qBulanan = query(
          collection(db, "absensi_karyawan_bulanan"),
          where("tahun", "==", tahun),
          where("bulan", "==", bulanFilter)
        )
        const snapBulanan = await getDocs(qBulanan)
        const bulananData = snapBulanan.docs
          .map((d) => normalizeBulananRow(d.data(), masterMap))
          .filter((row) => row.karyawanId && row.namaKaryawan)

        const bulananByKaryawanId = new Map<string, BulananDays>()

        bulananData.forEach((row) => {
          if (!row.karyawanId) return
          const master = masterMap.get(row.karyawanId)

          bulananByKaryawanId.set(row.karyawanId, {
            ...row,
            namaKaryawan: master?.nama || row.namaKaryawan,
            toko: master?.toko || row.toko,
          })
        })

        masterKaryawan.forEach((karyawan) => {
          if (mapTidakWajib[karyawan.id]) return
          if (bulananByKaryawanId.has(karyawan.id)) return

          bulananByKaryawanId.set(karyawan.id, {
            karyawanId: karyawan.id,
            namaKaryawan: karyawan.nama,
            toko: karyawan.toko,
            tahun,
            bulan: bulanFilter,
            days: {},
          })
        })

        const mergedBulanan = Array.from(bulananByKaryawanId.values())
          .filter((row) => !mapTidakWajib[row.karyawanId])
          .sort((a, b) => {
            const ai = `${a.toko?.nama ?? ""}__${a.namaKaryawan ?? ""}`
            const bi = `${b.toko?.nama ?? ""}__${b.namaKaryawan ?? ""}`
            return ai.localeCompare(bi, "id")
          })

        setBulanan(mergedBulanan)

        const tokoMap: Record<string, TokoRef> = {}

        mergedBulanan.forEach((row) => {
          const toko = row.toko || { id: "tanpa-toko", nama: "Tanpa Toko" }
          const key = toko.id || toko.nama || "tanpa-toko"
          tokoMap[key] = toko
        })

        const sortedTokoList = Object.values(tokoMap).sort((a, b) =>
          String(a.nama ?? "").localeCompare(String(b.nama ?? ""), "id")
        )

        setTokoList(sortedTokoList)

        const snapPengaturan = await getDocs(collection(db, "pengaturan_jam_absensi"))
        const nextPengaturanMap: PengaturanMap = {}

        snapPengaturan.docs.forEach((docSnap) => {
          nextPengaturanMap[docSnap.id] = docSnap.data()
        })

        setPengaturanMap(nextPengaturanMap)

        const qSummary = query(
          collection(db, "absensi_karyawan_summary"),
          where("tahun", "==", tahun),
          where("bulan", "==", bulanFilter)
        )
        const snapSummary = await getDocs(qSummary)
        const summaryMap: Record<string, Summary> = {}

        snapSummary.docs.forEach((d) => {
          const data = d.data() as any
          const karyawanId = String(data.karyawanId || data.ptkId || "").trim()
          if (!karyawanId) return

          summaryMap[karyawanId] = {
            karyawanId,
            hadir: Number(data.hadir ?? 0),
            izin: Number(data.izin ?? 0),
            sakit: Number(data.sakit ?? 0),
            terlambat: Number(data.terlambat ?? 0),
            pulangCepat: Number(data.pulangCepat ?? 0),
          }
        })

        setSummary(summaryMap)

        writeCachePayload(cacheKey, {
          bulanan: mergedBulanan,
          summary: summaryMap,
          pengaturanMap: nextPengaturanMap,
          tidakWajibMap: mapTidakWajib,
          tokoList: sortedTokoList,
        })
      } catch (err) {
        console.error(err)

        if (options?.showLoading !== false) {
          setBulanan([])
          setSummary({})
          setPengaturanMap({})
          setTidakWajibMap({})
          setTokoList([])
        }
      } finally {
        if (options?.showLoading !== false) {
          setLoading(false)
        }
      }
    }

    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) return

      const cacheKey = getCacheKey(u.uid, bulanFilter, tahun)
      const cached = readCachePayload(cacheKey)

      if (cached) {
        applyCachePayload(cached)
        setLoading(false)

        const remainingMs = Math.max(CACHE_TTL_MS - (Date.now() - cached.cachedAt), 0)

        refreshTimer = setTimeout(() => {
          removeCachePayload(cacheKey)
          fetchData(cacheKey, { showLoading: false })
        }, remainingMs)

        return
      }

      fetchData(cacheKey, { showLoading: true })
    })

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      unsub()
    }
  }, [bulanFilter, tahunFilter, tahun])

  const daysInMonth = new Date(tahun, bulanFilter, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const getScheduleStatus = (row: BulananDays, dateObj: Date) => {
    const resolvedData = getResolvedScheduleData(row, pengaturanMap)

    if (!resolvedData) {
      return {
        configured: false,
        isLibur: false,
        schedule: null as DaySchedule | null,
      }
    }

    const schedule = getScheduleForDate(resolvedData, dateObj)

    if (!schedule) {
      return {
        configured: false,
        isLibur: false,
        schedule: null as DaySchedule | null,
      }
    }

    return {
      configured: true,
      isLibur: !isValidWorkSchedule(schedule),
      schedule,
    }
  }

  const isHariKerjaEfektif = (row: BulananDays, dateObj: Date) => {
    const status = getScheduleStatus(row, dateObj)
    return status.configured && !status.isLibur
  }

  const hitungEfektif = (row: BulananDays): number => {
    let n = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(tahun, bulanFilter - 1, d)
      dateObj.setHours(0, 0, 0, 0)

      if (dateObj > today) continue
      if (!canCountAlphaForDate(dateObj, bulanFilter, tahun)) continue
      if (!isHariKerjaEfektif(row, dateObj)) continue

      n++
    }

    return n
  }

  const hitungHadir = (row: BulananDays): number => {
    let n = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(tahun, bulanFilter - 1, d)
      dateObj.setHours(0, 0, 0, 0)

      if (dateObj > today || !isHariKerjaEfektif(row, dateObj)) continue

      const code = normalizeDisplayCode(row.days?.[String(d).padStart(2, "0")])
      if (["H", "T", "PC", "TPC", "?"].includes(code)) n++
    }

    return n
  }

  const hitungAlfa = (row: BulananDays): number => {
    let n = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(tahun, bulanFilter - 1, d)
      dateObj.setHours(0, 0, 0, 0)

      if (dateObj > today || !isHariKerjaEfektif(row, dateObj)) continue
      if (!canCountAlphaForDate(dateObj, bulanFilter, tahun)) continue

      const code = row.days?.[String(d).padStart(2, "0")]
      if (!code) n++
    }

    return n
  }

  const getCode = (row: BulananDays, dayNum: number): string => {
    const dateObj = new Date(tahun, bulanFilter - 1, dayNum)
    dateObj.setHours(0, 0, 0, 0)

    if (dateObj > today) return ""

    const status = getScheduleStatus(row, dateObj)

    if (!status.configured) return ""
    if (status.isLibur) return "L"

    const existingCode = normalizeDisplayCode(row.days?.[String(dayNum).padStart(2, "0")])
    if (existingCode) return existingCode

    if (!canCountAlphaForDate(dateObj, bulanFilter, tahun)) return ""

    return "A"
  }

  const hitungPersen = (row: BulananDays): number => {
    const efektif = hitungEfektif(row)
    if (efektif === 0) return 0
    return Math.round((hitungHadir(row) / efektif) * 100)
  }

  const hitungPersenIzin = (row: BulananDays): number => {
    const efektif = hitungEfektif(row)
    const izin = summary[row.karyawanId]?.izin ?? 0
    if (efektif === 0) return 0
    return Math.round((izin / efektif) * 100)
  }

  const hitungPersenSakit = (row: BulananDays): number => {
    const efektif = hitungEfektif(row)
    const sakit = summary[row.karyawanId]?.sakit ?? 0
    if (efektif === 0) return 0
    return Math.round((sakit / efektif) * 100)
  }

  const hitungTotalPoin = (row: BulananDays): number => {
    let total = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const code = getCode(row, d)
      if (!code || code === "L") continue
      total += POINT_CONFIG[code] ?? 0
    }

    return total
  }

  const hitungNilaiPoin = (row: BulananDays): number => {
    const efektif = hitungEfektif(row)
    if (efektif === 0) return 0
    return Math.round(hitungTotalPoin(row) / efektif)
  }

  const filteredBulanan = bulanan
    .filter(
      (row) =>
        (!tokoFilter || row.toko?.id === tokoFilter) &&
        !tidakWajibMap[row.karyawanId]
    )
    .sort((a, b) => {
      const nilaiA = hitungNilaiPoin(a)
      const nilaiB = hitungNilaiPoin(b)
      if (nilaiB !== nilaiA) return nilaiB - nilaiA

      const persenA = hitungPersen(a)
      const persenB = hitungPersen(b)
      if (persenB !== persenA) return persenB - persenA

      const hadirA = hitungHadir(a)
      const hadirB = hitungHadir(b)
      if (hadirB !== hadirA) return hadirB - hadirA

      const alfaA = hitungAlfa(a)
      const alfaB = hitungAlfa(b)
      if (alfaA !== alfaB) return alfaA - alfaB

      const tokoA = String(a.toko?.nama || "")
      const tokoB = String(b.toko?.nama || "")
      const tokoCompare = tokoA.localeCompare(tokoB, "id")
      if (tokoCompare !== 0) return tokoCompare

      return String(a.namaKaryawan || "").localeCompare(
        String(b.namaKaryawan || ""),
        "id"
      )
    })

  const namaToko = tokoList.find((i) => i.id === tokoFilter)?.nama ?? ""
  const bulanNama = new Date(tahun, bulanFilter - 1).toLocaleString("id-ID", {
    month: "long",
    year: "numeric",
  })

  const agg = (() => {
    let totalHadir = 0
    let totalIzin = 0
    let totalSakit = 0
    let totalAlfa = 0
    let totalEfektif = 0

    filteredBulanan.forEach((row) => {
      const s = summary[row.karyawanId]

      totalHadir += hitungHadir(row)
      totalIzin += s?.izin ?? 0
      totalSakit += s?.sakit ?? 0
      totalAlfa += hitungAlfa(row)
      totalEfektif += hitungEfektif(row)
    })

    const persen =
      totalEfektif > 0 ? Math.round((totalHadir / totalEfektif) * 100) : 0

    return { totalHadir, totalIzin, totalSakit, totalAlfa, totalEfektif, persen }
  })()

  const buildTableData = () => {
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))

    const header = [
      "No",
      "Nama Karyawan",
      "% Hadir",
      "% Izin",
      "% Sakit",
      "Hadir",
      "Izin",
      "Sakit",
      "Alfa",
      ...dayHeaders,
    ]

    const rows = filteredBulanan.map((row, idx) => {
      const s = summary[row.karyawanId]
      const hadir = hitungHadir(row)
      const alfa = hitungAlfa(row)
      const persen = hitungPersen(row)
      const persenIzin = hitungPersenIzin(row)
      const persenSakit = hitungPersenSakit(row)
      const dayArr = Array.from({ length: daysInMonth }, (_, i) => getCode(row, i + 1))

      return [
        String(idx + 1),
        row.namaKaryawan,
        `${persen}%`,
        `${persenIzin}%`,
        `${persenSakit}%`,
        String(hadir),
        String(s?.izin ?? 0),
        String(s?.sakit ?? 0),
        String(alfa),
        ...dayArr,
      ]
    })

    return { header, rows }
  }

  const handleDownloadPDF = async () => {
    setDownloading("pdf")

    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js")

      const { jsPDF } = (window as any).jspdf
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" })

      doc.setFont("helvetica", "bold")
      doc.setFontSize(14)
      doc.setTextColor(30, 41, 59)
      doc.text("LAPORAN ABSENSI BULANAN KARYAWAN", 14, 15)

      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      doc.text(`Toko     : ${namaToko}`, 14, 22)
      doc.text(`Periode  : ${bulanNama}`, 14, 27)
      doc.text(
        `Dicetak  : ${new Date().toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}`,
        14,
        32
      )

      doc.setDrawColor(203, 213, 225)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(14, 35, 400, 14, 2, 2, "FD")

      const statsItems: Array<{
        label: string
        val: string
        color: [number, number, number]
      }> = [
        {
          label: "Total Karyawan",
          val: String(filteredBulanan.length),
          color: [30, 41, 59],
        },
        {
          label: "% Kehadiran",
          val: `${agg.persen}%`,
          color:
            agg.persen >= 90
              ? [5, 150, 105]
              : agg.persen >= 75
                ? [161, 98, 7]
                : [190, 18, 60],
        },
        { label: "Hadir", val: String(agg.totalHadir), color: [5, 150, 105] },
        { label: "Izin", val: String(agg.totalIzin), color: [161, 98, 7] },
        { label: "Sakit", val: String(agg.totalSakit), color: [220, 38, 38] },
        { label: "Alfa", val: String(agg.totalAlfa), color: [159, 18, 57] },
        { label: "Hari Efektif", val: String(agg.totalEfektif), color: [100, 116, 139] },
      ]

      statsItems.forEach((item, i) => {
        const x = 17 + i * 58

        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(...item.color)
        doc.text(item.val, x, 42)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(6)
        doc.setTextColor(148, 163, 184)
        doc.text(item.label, x, 46)
      })

      const { header, rows } = buildTableData()

      ;(doc as any).autoTable({
        head: [header],
        body: rows,
        startY: 52,
        styles: {
          fontSize: 6.5,
          cellPadding: 1.2,
          font: "helvetica",
          halign: "center",
          valign: "middle",
          lineWidth: 0.1,
          lineColor: [203, 213, 225],
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 7 },
          1: { cellWidth: 35, halign: "left" },
          2: { cellWidth: 11, fontStyle: "bold" },
          3: { cellWidth: 11, fontStyle: "bold" },
          4: { cellWidth: 11, fontStyle: "bold" },
          5: { cellWidth: 9, textColor: [5, 150, 105] },
          6: { cellWidth: 9, textColor: [161, 98, 7] },
          7: { cellWidth: 9, textColor: [220, 38, 38] },
          8: { cellWidth: 9, textColor: [159, 18, 57] },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        willDrawCell: (data: any) => {
          if (data.section === "body" && data.column.index === 2) {
            const pct = parseInt(String(data.cell.raw ?? "").replace("%", ""), 10)
            if (!isNaN(pct)) {
              const rgb: [number, number, number] =
                pct >= 90 ? [5, 150, 105] : pct >= 75 ? [161, 98, 7] : [190, 18, 60]
              doc.setTextColor(...rgb)
            }
          }

          if (data.section === "body" && data.column.index === 3) {
            const pct = parseInt(String(data.cell.raw ?? "").replace("%", ""), 10)
            if (!isNaN(pct) && pct > 0) doc.setTextColor(161, 98, 7)
            else doc.setTextColor(148, 163, 184)
          }

          if (data.section === "body" && data.column.index === 4) {
            const pct = parseInt(String(data.cell.raw ?? "").replace("%", ""), 10)
            if (!isNaN(pct) && pct > 0) doc.setTextColor(220, 38, 38)
            else doc.setTextColor(148, 163, 184)
          }

          if (data.section === "body" && data.column.index >= 9) {
            const val = String(data.cell.raw ?? "")
            const rgb = COLOR_MAP[val]

            if (rgb) {
              ;(doc as any).setFillColor(...rgb)
              doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F")

              const isLight = val === "I" || val === "L"
              doc.setTextColor(
                isLight ? 30 : 255,
                isLight ? 41 : 255,
                isLight ? 59 : 255
              )
              doc.setFontSize(6.5)
              doc.text(
                val,
                data.cell.x + data.cell.width / 2,
                data.cell.y + data.cell.height / 2 + 0.5,
                { align: "center", baseline: "middle" }
              )
              data.cell.text = []
            }
          }
        },
      })

      const finalY = (doc as any).lastAutoTable.finalY + 5
      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(100, 116, 139)
      doc.text("Keterangan:", 14, finalY)

      let lx = 14
      let ly = finalY + 5

      Object.entries(CODE_CONFIG).forEach(([code]) => {
        const rgb = COLOR_MAP[code] ?? [200, 200, 200]

        ;(doc as any).setFillColor(...rgb)
        doc.rect(lx, ly - 3, 5, 4, "F")
        doc.setTextColor(30, 41, 59)
        doc.setFont("helvetica", "normal")
        doc.text(`${code} = ${CODE_CONFIG[code].label}`, lx + 6, ly)

        lx += 40
        if (lx > 380) {
          lx = 14
          ly += 7
        }
      })

      doc.save(
        `Absensi_${namaToko.replace(/\s+/g, "_")}_${bulanNama.replace(/\s+/g, "_")}.pdf`
      )
    } catch (err) {
      console.error("PDF error:", err)
      alert("Gagal membuat PDF. Silakan coba lagi.")
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadXLS = async () => {
    setDownloading("xls")

    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js")

      const XLSX = (window as any).XLSX
      const wb = XLSX.utils.book_new()
      const tgl = new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })

      const { header, rows } = buildTableData()

      const ws1Data: any[][] = [
        ["LAPORAN ABSENSI BULANAN KARYAWAN"],
        [`Toko     : ${namaToko}`],
        [`Periode  : ${bulanNama}`],
        [`Dicetak  : ${tgl}`],
        [],
        [
          "",
          "TOTAL TOKO",
          `${agg.persen}%`,
          `${agg.totalEfektif > 0 ? Math.round((agg.totalIzin / agg.totalEfektif) * 100) : 0}%`,
          `${agg.totalEfektif > 0 ? Math.round((agg.totalSakit / agg.totalEfektif) * 100) : 0}%`,
          agg.totalHadir,
          agg.totalIzin,
          agg.totalSakit,
          agg.totalAlfa,
        ],
        [],
        header,
        ...rows,
        [],
        ["Keterangan:"],
        ...Object.entries(CODE_CONFIG).map(([c, cfg]) => [`${c} = ${cfg.label}`]),
      ]

      const ws1 = XLSX.utils.aoa_to_sheet(ws1Data)
      ws1["!cols"] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 7 },
        { wch: 7 },
        { wch: 7 },
        { wch: 7 },
        ...Array.from({ length: daysInMonth }, () => ({ wch: 4 })),
      ]

      const tc = 9 + daysInMonth
      ws1["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(tc - 1, 14) } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } },
      ]

      XLSX.utils.book_append_sheet(wb, ws1, "Rekap Harian")

      const dataLen = filteredBulanan.length
      const startRow = 9
      const endRow = startRow + dataLen - 1

      const ws2Data: any[][] = [
        ["REKAP SUMMARY KEHADIRAN KARYAWAN"],
        [`Toko     : ${namaToko}`],
        [`Periode  : ${bulanNama}`],
        [`Dicetak  : ${tgl}`],
        [],
        [
          "",
          "TOTAL SELURUH KARYAWAN",
          `${agg.persen}%`,
          `${agg.totalEfektif > 0 ? Math.round((agg.totalIzin / agg.totalEfektif) * 100) : 0}%`,
          `${agg.totalEfektif > 0 ? Math.round((agg.totalSakit / agg.totalEfektif) * 100) : 0}%`,
          agg.totalHadir,
          agg.totalIzin,
          agg.totalSakit,
          agg.totalAlfa,
          agg.totalEfektif,
        ],
        [],
        [
          "No",
          "Nama Karyawan",
          "% Hadir",
          "% Izin",
          "% Sakit",
          "Hadir",
          "Izin",
          "Sakit",
          "Alfa",
          "Hari Efektif",
        ],
      ]

      filteredBulanan.forEach((row, idx) => {
        const s = summary[row.karyawanId]
        const hadir = hitungHadir(row)
        const alfa = hitungAlfa(row)
        const efektif = hitungEfektif(row)
        const persen = hitungPersen(row)
        const persenIzin = hitungPersenIzin(row)
        const persenSakit = hitungPersenSakit(row)

        ws2Data.push([
          idx + 1,
          row.namaKaryawan,
          `${persen}%`,
          `${persenIzin}%`,
          `${persenSakit}%`,
          hadir,
          s?.izin ?? 0,
          s?.sakit ?? 0,
          alfa,
          efektif,
        ])
      })

      ws2Data.push([
        "",
        "TOTAL",
        `=IFERROR(AVERAGE(C${startRow}:C${endRow}),0)`,
        `=IFERROR(AVERAGE(D${startRow}:D${endRow}),0)`,
        `=IFERROR(AVERAGE(E${startRow}:E${endRow}),0)`,
        `=SUM(F${startRow}:F${endRow})`,
        `=SUM(G${startRow}:G${endRow})`,
        `=SUM(H${startRow}:H${endRow})`,
        `=SUM(I${startRow}:I${endRow})`,
        `=SUM(J${startRow}:J${endRow})`,
      ])

      const ws2 = XLSX.utils.aoa_to_sheet(ws2Data)
      ws2["!cols"] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 8 },
        { wch: 8 },
        { wch: 8 },
        { wch: 8 },
        { wch: 14 },
      ]

      ws2["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
      ]

      XLSX.utils.book_append_sheet(wb, ws2, "Summary")

      XLSX.writeFile(
        wb,
        `Absensi_${namaToko.replace(/\s+/g, "_")}_${bulanNama.replace(/\s+/g, "_")}.xlsx`
      )
    } catch (err) {
      console.error("XLS error:", err)
      alert("Gagal membuat file Excel. Silakan coba lagi.")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="relative min-h-full space-y-4 overflow-x-hidden bg-transparent pb-28 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24)] sm:px-5 sm:py-5"
      >
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
              <ClipboardList size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Laporan Absensi Bulanan
              </h1>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                Rekap kehadiran per individu karyawan
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

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <button
          type="button"
          onClick={() => setShowFilter((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 lg:hidden"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <Filter size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                Filter Laporan
              </p>
              <p className="truncate text-[11px] font-semibold text-slate-400">
                {namaToko || "Pilih Toko"} · {bulanNama}
              </p>
            </div>
          </div>
          <ChevronDown
            size={18}
            strokeWidth={2.5}
            className={`shrink-0 text-slate-400 transition-transform ${showFilter ? "rotate-180" : "rotate-0"}`}
          />
        </button>

        <div className="hidden border-b border-slate-100 px-4 py-3 lg:block">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Filter size={15} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              Filter Laporan
            </span>
          </div>
        </div>

        <div className={`${showFilter ? "block" : "hidden"} border-t border-slate-100 p-4 lg:block lg:border-t-0`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Toko
            </label>
            <div className="relative">
              <Building2
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <select
                value={tokoFilter}
                onChange={(e) => setTokoFilter(e.target.value)}
                className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="">Pilih Toko</option>
                {tokoList.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2.5}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Bulan
            </label>
            <div className="relative">
              <select
                value={bulanFilter}
                onChange={(e) => setBulanFilter(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString("id-ID", { month: "long" })}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2.5}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Tahun
            </label>
            <div className="relative">
              <select
                value={tahunFilter}
                onChange={(e) => setTahunFilter(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2.5}
              />
            </div>
          </div>
        </div>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 shadow-sm">
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

      {!loading && !tokoFilter && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 shadow-sm"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Building2 size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Pilih toko untuk menampilkan data
          </p>
        </motion.div>
      )}

      {!loading && tokoFilter && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="space-y-3"
        >
          {filteredBulanan.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 bg-white/80 px-4 py-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50">
                  <TrendingUp size={12} className="text-sky-600" strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                  Ringkasan Kehadiran · {namaToko} · {bulanNama}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-5 sm:divide-y-0">
                <div className="col-span-2 flex flex-col items-center justify-center gap-1 p-4 sm:col-span-1">
                  <span className={`text-3xl font-black tabular-nums ${pctTextColor(agg.persen)}`}>
                    {agg.persen}%
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Kehadiran
                  </span>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${pctBarColor(agg.persen)}`}
                      style={{ width: `${agg.persen}%` }}
                    />
                  </div>
                  <span className="text-center text-[8px] text-slate-400">
                    {agg.totalHadir} hadir dari {agg.totalEfektif} hari efektif
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-0.5 p-4">
                  <span className="text-xl font-black tabular-nums text-sky-600">
                    {agg.totalHadir}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Hadir
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-0.5 p-4">
                  <span className="text-xl font-black tabular-nums text-yellow-600">
                    {agg.totalIzin}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Izin
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-0.5 p-4">
                  <span className="text-xl font-black tabular-nums text-red-500">
                    {agg.totalSakit}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Sakit
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center gap-0.5 p-4">
                  <span className="text-xl font-black tabular-nums text-rose-700">
                    {agg.totalAlfa}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Alfa
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                {namaToko}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {bulanNama} · {filteredBulanan.length} Karyawan
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CODE_CONFIG).map(([code, cfg]) => (
                  <span
                    key={code}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-black ${cfg.bg} ${cfg.text}`}
                  >
                    {code}
                    <span className="hidden font-normal opacity-80 sm:inline">
                      = {cfg.label}
                    </span>
                  </span>
                ))}
              </div>

              <div className="ml-0 flex items-center gap-2 sm:ml-2">
                <button
                  onClick={handleDownloadPDF}
                  disabled={!!downloading || filteredBulanan.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading === "pdf" ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-red-300 border-t-red-600"
                    />
                  ) : (
                    <FileDown size={13} strokeWidth={2.5} />
                  )}
                  {downloading === "pdf" ? "Membuat..." : "PDF"}
                </button>

                <button
                  onClick={handleDownloadXLS}
                  disabled={!!downloading || filteredBulanan.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading === "xls" ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-sky-300 border-t-sky-700"
                    />
                  ) : (
                    <FileSpreadsheet size={13} strokeWidth={2.5} />
                  )}
                  {downloading === "xls" ? "Membuat..." : "Excel"}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-sky-600 text-white">
                  <th className="sticky left-0 z-10 w-8 whitespace-nowrap bg-sky-600 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.12em]">
                    #
                  </th>
                  <th className="sticky left-8 z-10 min-w-[180px] whitespace-nowrap bg-sky-600 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.12em]">
                    Nama Karyawan
                  </th>
                  <th
                    className="min-w-[120px] whitespace-nowrap px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em]"
                    colSpan={3}
                  >
                    % Kehadiran / Izin / Sakit
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em]">
                    Hdr
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em]">
                    Izn
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em]">
                    Skt
                  </th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em]">
                    Alf
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th
                      key={i}
                      className="w-7 whitespace-nowrap bg-sky-600 px-1.5 py-2.5 text-center text-[9px] font-black"
                    >
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredBulanan.length === 0 && (
                  <tr>
                    <td
                      colSpan={9 + daysInMonth}
                      className="px-4 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400"
                    >
                      Tidak ada data untuk toko ini
                    </td>
                  </tr>
                )}

                {filteredBulanan.map((row, idx) => {
                  const s = summary[row.karyawanId]
                  const hadir = hitungHadir(row)
                  const alfa = hitungAlfa(row)
                  const persen = hitungPersen(row)
                  const persenIzin = hitungPersenIzin(row)
                  const persenSakit = hitungPersenSakit(row)

                  return (
                    <motion.tr
                      key={row.karyawanId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      <td className="sticky left-8 z-10 whitespace-nowrap border-r border-slate-100 bg-white px-3 py-2 font-bold text-slate-800">
                        {row.namaKaryawan}
                      </td>

                      <td className="px-1.5 py-2 text-center">
                        <span className={`inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${pctBadgeClass(persen)}`}>
                          {persen}%
                        </span>
                      </td>

                      <td className="px-1.5 py-2 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                            persenIzin > 0
                              ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          {persenIzin}%
                        </span>
                      </td>

                      <td className="px-1.5 py-2 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                            persenSakit > 0
                              ? "bg-red-50 border-red-200 text-red-600"
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          {persenSakit}%
                        </span>
                      </td>

                      <td className="px-2 py-2 text-center font-black text-sky-600">
                        {hadir}
                      </td>

                      <td className="px-2 py-2 text-center font-black text-yellow-600">
                        {s?.izin ?? 0}
                      </td>

                      <td className="px-2 py-2 text-center font-black text-red-500">
                        {s?.sakit ?? 0}
                      </td>

                      <td className="px-2 py-2 text-center font-black text-rose-700">
                        {alfa}
                      </td>

                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const dayNum = i + 1
                        const code = getCode(row, dayNum)
                        const cfg = CODE_CONFIG[code]

                        return (
                          <td key={dayNum} className="px-0.5 py-1.5 text-center">
                            {code ? (
                              <span
                                className={`inline-flex min-w-[22px] items-center justify-center rounded-md py-0.5 text-[10px] font-black ${
                                  cfg ? `${cfg.bg} ${cfg.text}` : "text-slate-300"
                                }`}
                              >
                                {code}
                              </span>
                            ) : (
                              <span className="text-slate-200">·</span>
                            )}
                          </td>
                        )
                      })}
                    </motion.tr>
                  )
                })}

                {filteredBulanan.length > 0 && (
                  <tr className="border-t-2 border-sky-300 bg-sky-600">
                    <td className="sticky left-0 z-10 bg-sky-600 px-3 py-2.5 text-center" />
                    <td className="sticky left-8 z-10 border-r border-sky-500 bg-sky-600 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-white">
                      Total {filteredBulanan.length} Karyawan
                    </td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className={`inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${pctBadgeClass(agg.persen)}`}>
                        {agg.persen}%
                      </span>
                    </td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-lg border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-yellow-700">
                        {agg.totalEfektif > 0
                          ? Math.round((agg.totalIzin / agg.totalEfektif) * 100)
                          : 0}
                        %
                      </span>
                    </td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-red-600">
                        {agg.totalEfektif > 0
                          ? Math.round((agg.totalSakit / agg.totalEfektif) * 100)
                          : 0}
                        %
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-emerald-400">
                      {agg.totalHadir}
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-yellow-400">
                      {agg.totalIzin}
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-red-400">
                      {agg.totalSakit}
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-rose-400">
                      {agg.totalAlfa}
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => (
                      <td key={i} className="px-0.5 py-1.5" />
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}
