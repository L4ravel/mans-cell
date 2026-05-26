"use client"

/*
  Halaman beranda karyawan Mans-Cell.
  Isi: tombol cepat Panel Transaksi, Jadwal, Ganti Password,
  tab Laporan Kehadiran dan Rekapan Kehadiran, serta rekap yang konsisten
  dengan pengaturan_jam_absensi: default sistem -> toko -> karyawan.
*/

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Eye,
  EyeOff,
  Filter,
  Hand,
  HeartPulse,
  KeyRound,
  Loader2,
  ShoppingCart,
  User,
  X,
  XCircle,
} from "lucide-react"
import { auth } from "@/lib/firebase"
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth"
import { motion } from "framer-motion"
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore"
import Footer from "./footer"

type Absensi = {
  id: string
  tanggal: string
  status: string
  approvalStatus?: "pending" | "approved" | "rejected" | null
  jamMasuk: string | null
  jamPulang: string | null
  alasanMasuk?: string | null
  keteranganMasuk?: string | null
  alasanPulang?: string | null
  keteranganPulang?: string | null
  alasanIzin?: string | null
  keteranganIzin?: string | null
}

type RekapAbsensi = {
  hadir: number
  izin: number
  sakit: number
  terlambat: number
  pulangCepat: number
  kedatangan: number
  bulan: number
  tahun: number
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

type ResolvedScheduleData = {
  weeklySchedule: Record<number, DaySchedule>
  monthlyOverrides: Record<string, Record<string, DaySchedule>>
  jenisPengaturan?: "hari" | "tanggal" | null
}

type AbsensiCache = {
  uid: string
  rows: Absensi[]
  updatedAt: number
}

type RekapCache = {
  uid: string
  karyawanId: string
  bulan: number
  tahun: number
  rekap: RekapAbsensi | null
  liburFinalMap: Record<string, boolean>
  jadwalData: ResolvedScheduleData | null
  updatedAt: number
}

const CACHE_KEY = "absensi_karyawan_cache"
const CACHE_LATEST_KEY = `${CACHE_KEY}_latest`
const CACHE_LAST_UID_KEY = `${CACHE_KEY}_last_uid`
const CACHE_REKAP_KEY = "absensi_karyawan_rekap_cache"
const ITEMS_PER_PAGE = 7

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

const getHari = (tanggal: string) => {
  return new Date(`${tanggal}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
  })
}

const getDaysInMonth = (bulan: number, tahun: number) => {
  return new Date(tahun, bulan, 0).getDate()
}

const formatDateKey = (tahun: number, bulan: number, hari: number) => {
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`
}

const getMonthKeyFromDateKey = (dateKey: string) => {
  return dateKey.slice(0, 7)
}

const formatNamaKaryawan = (nama: string) => {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .map((kata) => kata.toUpperCase())
    .join(" ")
}

const formatTanggalMasehi = (date: Date) => {
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

const HIJRI_MONTHS_ID = [
  "Muharram",
  "Safar",
  "Rabiul Awal",
  "Rabiul Akhir",
  "Jumadil Awal",
  "Jumadil Akhir",
  "Rajab",
  "Syakban",
  "Ramadan",
  "Syawal",
  "Zulkaidah",
  "Zulhijah",
]

const gregorianToHijriApprox = (date: Date) => {
  const gYear = date.getFullYear()
  const gMonth = date.getMonth() + 1
  const gDay = date.getDate()

  let m = gMonth
  let y = gYear

  if (m < 3) {
    y -= 1
    m += 12
  }

  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  const jd =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    gDay +
    b -
    1524

  const islamicEpoch = 1948439.5
  const days = Math.floor(jd - islamicEpoch)
  const hijriYear = Math.floor((30 * days + 10646) / 10631)
  const firstDayOfYear =
    Math.floor((hijriYear - 1) * 354 + (3 + 11 * hijriYear) / 30) +
    islamicEpoch

  let month = Math.ceil((jd - 29 - firstDayOfYear) / 29.5) + 1
  month = Math.min(Math.max(month, 1), 12)

  const firstDayOfMonth =
    Math.floor((hijriYear - 1) * 354 + (3 + 11 * hijriYear) / 30) +
    Math.ceil(29.5 * (month - 1)) +
    islamicEpoch

  const day = Math.max(1, Math.floor(jd - firstDayOfMonth + 1))

  return { day, month, year: hijriYear }
}

const formatTanggalHijriah = (date: Date) => {
  try {
    const formatter = new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })

    const text = formatter.format(date)
    const hasInvalidEra =
      text.toLowerCase().includes("sebelum masehi") ||
      text.toLowerCase().includes("sm") ||
      text.toLowerCase().includes("bc")

    const yearMatch = text.match(/\d{3,4}/g)
    const hijriYear = yearMatch ? Number(yearMatch[yearMatch.length - 1]) : 0

    if (!hasInvalidEra && hijriYear >= 1300 && hijriYear <= 1600) {
      return text.replace(/\s*h$/i, " H")
    }
  } catch {}

  const fallback = gregorianToHijriApprox(date)
  return `${fallback.day} ${HIJRI_MONTHS_ID[fallback.month - 1]} ${fallback.year} H`
}

const createDefaultWeeklySchedule = (): Record<number, DaySchedule> => ({
  0: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  1: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  2: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  3: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  4: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  5: { enabled: false, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  6: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
})

const createDefaultScheduleData = (): ResolvedScheduleData => ({
  weeklySchedule: createDefaultWeeklySchedule(),
  monthlyOverrides: {},
  jenisPengaturan: null,
})

const createDefaultDateSchedule = (fromWeekly?: DaySchedule): DaySchedule => ({
  enabled: fromWeekly?.enabled ?? true,
  jamMasuk: fromWeekly?.jamMasuk ?? "07:30",
  jamPulang: fromWeekly?.jamPulang ?? "14:00",
  lintasTanggal: fromWeekly?.lintasTanggal ?? false,
})

const normalizeWeeklySchedule = (data: any): Record<number, DaySchedule> => {
  const defaultWeekly = createDefaultWeeklySchedule()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...defaultWeekly }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]
      if (!raw) continue

      normalized[i] = {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultWeekly[i].enabled,
        jamMasuk: raw.jamMasuk || defaultWeekly[i].jamMasuk,
        jamPulang: raw.jamPulang || defaultWeekly[i].jamPulang,
        lintasTanggal: typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
      }
    }

    return normalized
  }

  const jamMasuk = data?.jamMasuk || "07:30"
  const jamPulang = data?.jamPulang || "14:00"
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : [5]
  const migrated: Record<number, DaySchedule> = {}

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

const normalizeMonthlyOverrides = (
  data: any,
  baseWeekly: Record<number, DaySchedule>,
): Record<string, Record<string, DaySchedule>> => {
  const normalized: Record<string, Record<string, DaySchedule>> = {}

  if (!data?.monthlyOverrides || typeof data.monthlyOverrides !== "object") {
    return normalized
  }

  Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
    if (!dates || typeof dates !== "object") return

    normalized[monthKey] = {}

    Object.entries(dates as Record<string, any>).forEach(([dateKey, raw]) => {
      const dayIndex = new Date(`${dateKey}T00:00:00`).getDay()
      const fallbackBase = createDefaultDateSchedule(baseWeekly[dayIndex])

      normalized[monthKey][dateKey] = {
        enabled: typeof raw?.enabled === "boolean" ? raw.enabled : fallbackBase.enabled,
        jamMasuk: raw?.jamMasuk || fallbackBase.jamMasuk,
        jamPulang: raw?.jamPulang || fallbackBase.jamPulang,
        lintasTanggal: typeof raw?.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
      }
    })
  })

  return normalized
}

const normalizeEffectiveSchedules = (data: any): EffectiveSchedule[] => {
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
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    )
}

const removeEffectiveMeta = (data: any) => {
  const { effectiveSchedules, ...rest } = data || {}
  return rest
}

const mergeScheduleData = (baseData: any, overrideData: any) => {
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

const resolveEffectiveDataForDate = (data: any, dateKey: string) => {
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

const mergeResolvedSchedule = (
  base: ResolvedScheduleData,
  rawData: any,
  dateKey: string,
): ResolvedScheduleData => {
  if (!rawData) return base

  const effectiveData = resolveEffectiveDataForDate(rawData, dateKey) || rawData
  const weeklySchedule = normalizeWeeklySchedule(effectiveData)
  const monthlyOverrides = normalizeMonthlyOverrides(effectiveData, weeklySchedule)
  const jenisPengaturan =
    effectiveData?.jenisPengaturan === "hari" || effectiveData?.jenisPengaturan === "tanggal"
      ? effectiveData.jenisPengaturan
      : base.jenisPengaturan ?? null

  const nextMonthlyOverrides: Record<string, Record<string, DaySchedule>> = {
    ...base.monthlyOverrides,
  }

  Object.entries(monthlyOverrides).forEach(([monthKey, dates]) => {
    nextMonthlyOverrides[monthKey] = {
      ...(nextMonthlyOverrides[monthKey] || {}),
      ...dates,
    }
  })

  return {
    weeklySchedule: {
      ...base.weeklySchedule,
      ...weeklySchedule,
    },
    monthlyOverrides: nextMonthlyOverrides,
    jenisPengaturan,
  }
}

const resolveScheduleChainForDate = ({
  dateKey,
  defaultData,
  tokoData,
  karyawanData,
}: {
  dateKey: string
  defaultData: any
  tokoData: any
  karyawanData: any
}): ResolvedScheduleData => {
  let resolved = createDefaultScheduleData()
  resolved = mergeResolvedSchedule(resolved, defaultData, dateKey)
  resolved = mergeResolvedSchedule(resolved, tokoData, dateKey)
  resolved = mergeResolvedSchedule(resolved, karyawanData, dateKey)
  return resolved
}

const getScheduleForDate = (scheduleData: ResolvedScheduleData | null, dateKey: string) => {
  const baseData = scheduleData || createDefaultScheduleData()
  const dayIndex = new Date(`${dateKey}T00:00:00`).getDay()
  const monthKey = getMonthKeyFromDateKey(dateKey)
  const monthlySchedule = baseData.monthlyOverrides?.[monthKey]?.[dateKey]

  if (monthlySchedule) return monthlySchedule

  return baseData.weeklySchedule?.[dayIndex] || createDefaultDateSchedule()
}

const getAbsensiCacheKey = (uid: string) => `${CACHE_KEY}_${uid}`

const getRekapCacheKey = (uid: string, karyawanId: string, bulan: number, tahun: number) => {
  return `${CACHE_REKAP_KEY}_${uid}_${karyawanId}_${tahun}_${bulan}`
}

const dedupeAbsensiRows = (rows: Absensi[]) => {
  const map = new Map<string, Absensi>()

  rows.forEach((row) => {
    if (!row?.id) return
    map.set(row.id, row)
  })

  return Array.from(map.values()).sort((a, b) => {
    const tanggalCompare = String(b.tanggal || "").localeCompare(String(a.tanggal || ""))
    if (tanggalCompare !== 0) return tanggalCompare
    return String(b.id || "").localeCompare(String(a.id || ""))
  })
}

const saveCache = (uid: string, rows: Absensi[]) => {
  if (typeof window === "undefined") return

  try {
    const nextRows = dedupeAbsensiRows(rows)
    const payload: AbsensiCache = {
      uid,
      rows: nextRows,
      updatedAt: Date.now(),
    }

    window.localStorage.setItem(getAbsensiCacheKey(uid), JSON.stringify(payload))
    window.localStorage.setItem(CACHE_LATEST_KEY, JSON.stringify(payload))
    window.localStorage.setItem(CACHE_LAST_UID_KEY, uid)
  } catch {}
}

const loadLatestCache = (): Absensi[] => {
  if (typeof window === "undefined") return []

  try {
    const latestRaw = window.localStorage.getItem(CACHE_LATEST_KEY)

    if (latestRaw) {
      const latestParsed = JSON.parse(latestRaw) as Partial<AbsensiCache>
      if (Array.isArray(latestParsed.rows)) {
        const rows = dedupeAbsensiRows(latestParsed.rows as Absensi[])
        if (rows.length > 0) return rows
      }
    }

    const lastUid = window.localStorage.getItem(CACHE_LAST_UID_KEY)

    if (lastUid) {
      const byUidRaw = window.localStorage.getItem(getAbsensiCacheKey(lastUid))
      if (byUidRaw) {
        const byUidParsed = JSON.parse(byUidRaw) as Partial<AbsensiCache>
        if (Array.isArray(byUidParsed.rows)) {
          const rows = dedupeAbsensiRows(byUidParsed.rows as Absensi[])
          if (rows.length > 0) return rows
        }
      }
    }

    const legacyRaw = window.localStorage.getItem(CACHE_KEY)

    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw)
      const legacyRows = Array.isArray(legacyParsed?.rows) ? (legacyParsed.rows as Absensi[]) : []
      return dedupeAbsensiRows(legacyRows)
    }

    return []
  } catch {
    return []
  }
}

const loadCache = (uid: string): Absensi[] | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(getAbsensiCacheKey(uid))

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AbsensiCache>

      if (parsed.uid === uid && Array.isArray(parsed.rows)) {
        const rows = dedupeAbsensiRows(parsed.rows as Absensi[])
        if (rows.length > 0) return rows
      }
    }

    const latestRaw = window.localStorage.getItem(CACHE_LATEST_KEY)

    if (latestRaw) {
      const latestParsed = JSON.parse(latestRaw) as Partial<AbsensiCache>
      const latestRows = Array.isArray(latestParsed.rows)
        ? dedupeAbsensiRows(latestParsed.rows as Absensi[])
        : []

      if (latestRows.length > 0) {
        saveCache(uid, latestRows)
        return latestRows
      }
    }

    const legacyRaw = window.localStorage.getItem(CACHE_KEY)

    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw)
      const legacyRows = Array.isArray(legacyParsed?.rows) ? (legacyParsed.rows as Absensi[]) : []
      const nextRows = dedupeAbsensiRows(legacyRows)

      if (nextRows.length > 0) {
        saveCache(uid, nextRows)
        return nextRows
      }
    }

    return null
  } catch {
    return null
  }
}

const saveRekapCache = ({
  uid,
  karyawanId,
  bulan,
  tahun,
  rekap,
  liburFinalMap,
  jadwalData,
}: {
  uid: string
  karyawanId: string
  bulan: number
  tahun: number
  rekap: RekapAbsensi | null
  liburFinalMap: Record<string, boolean>
  jadwalData: ResolvedScheduleData | null
}) => {
  if (typeof window === "undefined") return

  try {
    const payload: RekapCache = {
      uid,
      karyawanId,
      bulan,
      tahun,
      rekap,
      liburFinalMap,
      jadwalData,
      updatedAt: Date.now(),
    }

    window.localStorage.setItem(
      getRekapCacheKey(uid, karyawanId, bulan, tahun),
      JSON.stringify(payload),
    )
  } catch {}
}

const loadRekapCache = (
  uid: string,
  karyawanId: string,
  bulan: number,
  tahun: number,
): RekapCache | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(getRekapCacheKey(uid, karyawanId, bulan, tahun))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<RekapCache>

    if (parsed.uid !== uid) return null
    if (parsed.karyawanId !== karyawanId) return null
    if (parsed.bulan !== bulan) return null
    if (parsed.tahun !== tahun) return null

    return {
      uid,
      karyawanId,
      bulan,
      tahun,
      rekap: parsed.rekap ?? null,
      liburFinalMap:
        parsed.liburFinalMap && typeof parsed.liburFinalMap === "object"
          ? parsed.liburFinalMap
          : {},
      jadwalData: parsed.jadwalData ?? null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

const mapAbsensiDoc = (snapDoc: QueryDocumentSnapshot): Absensi => {
  const item = snapDoc.data()

  return {
    id: snapDoc.id,
    tanggal: item.tanggal || "",
    status: item.status || "",
    approvalStatus: item.approvalStatus ?? null,
    jamMasuk: item.jamMasuk ?? null,
    jamPulang: item.jamPulang ?? null,
    alasanMasuk: item.alasanMasuk ?? null,
    keteranganMasuk: item.keteranganMasuk ?? null,
    alasanPulang: item.alasanPulang ?? null,
    keteranganPulang: item.keteranganPulang ?? null,
    alasanIzin: item.alasanIzin ?? null,
    keteranganIzin: item.keteranganIzin ?? null,
  }
}

export default function KaryawanPage() {
  const initialNow = new Date()
  const [today, setToday] = useState<Date | null>(null)
  const [data, setData] = useState<Absensi[]>(() => loadLatestCache())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"laporan" | "rekap">("laporan")
  const [rekap, setRekap] = useState<RekapAbsensi | null>(null)
  const [loadingRekap, setLoadingRekap] = useState(false)
  const [bulan, setBulan] = useState(initialNow.getMonth() + 1)
  const [tahun, setTahun] = useState(initialNow.getFullYear())
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [karyawanId, setKaryawanId] = useState<string | null>(null)
  const [tokoId, setTokoId] = useState<string | null>(null)
  const [namaKaryawan, setNamaKaryawan] = useState<string>("")
  const [liburFinalMap, setLiburFinalMap] = useState<Record<string, boolean>>({})
  const [jadwalData, setJadwalData] = useState<ResolvedScheduleData | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    setToday(new Date())
  }, [])

  useEffect(() => {
    let unsubUserDoc: Unsubscribe | null = null
    let unsubAbsensi: Unsubscribe | null = null
    let activeUid = ""
    let activeKaryawanId = ""

    const cleanupAbsensiListener = () => {
      if (unsubAbsensi) {
        unsubAbsensi()
        unsubAbsensi = null
      }

      activeKaryawanId = ""
      setLastDoc(null)
      setHasMore(true)
    }

    const cleanupUserListener = () => {
      if (unsubUserDoc) {
        unsubUserDoc()
        unsubUserDoc = null
      }

      cleanupAbsensiListener()
    }

    const listenAbsensi = (nextUid: string, nextKaryawanId: string) => {
      if (!nextUid || !nextKaryawanId) {
        cleanupAbsensiListener()
        return
      }

      if (activeKaryawanId === nextKaryawanId && unsubAbsensi) return

      cleanupAbsensiListener()
      activeKaryawanId = nextKaryawanId

      const db = getFirestore()
      const q = query(
        collection(db, "absensi_karyawan"),
        where("karyawanId", "==", nextKaryawanId),
        orderBy("tanggal", "desc"),
        limit(ITEMS_PER_PAGE),
      )

      unsubAbsensi = onSnapshot(
        q,
        (snap) => {
          const firstPageRows = snap.docs.map(mapAbsensiDoc)

          setData((prevRows) => {
            const firstPageIds = new Set(firstPageRows.map((row) => row.id))
            const oldRowsOutsideFirstPage = prevRows.filter((row) => !firstPageIds.has(row.id))
            const nextRows = dedupeAbsensiRows([...firstPageRows, ...oldRowsOutsideFirstPage])

            saveCache(nextUid, nextRows)
            return nextRows
          })

          setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
          setHasMore(snap.docs.length === ITEMS_PER_PAGE)
          setLoading(false)
        },
        (error) => {
          console.error("Error in snapshot listener:", error)

          const cachedRows = loadCache(nextUid)
          if (cachedRows) setData(cachedRows)

          setLoading(false)
        },
      )
    }

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        cleanupUserListener()
        activeUid = ""
        setUid(null)
        setKaryawanId(null)
        setTokoId(null)
        setNamaKaryawan("")
        setData([])
        setLoading(false)
        return
      }

      const nextUid = user.uid

      if (activeUid === nextUid && unsubUserDoc) return

      cleanupUserListener()
      activeUid = nextUid
      setUid(nextUid)

      const cachedRows = loadCache(nextUid)

      if (cachedRows && cachedRows.length > 0) {
        setData(cachedRows)
        setLoading(false)
      } else {
        setLoading(true)
      }

      const db = getFirestore()

      unsubUserDoc = onSnapshot(
        doc(db, "users", nextUid),
        (snap) => {
          if (!snap.exists()) {
            cleanupAbsensiListener()
            setKaryawanId(null)
            setTokoId(null)
            setNamaKaryawan("")
            setLoading(false)
            return
          }

          const raw = snap.data()
          setNamaKaryawan(raw?.nama || "")

          const userKaryawanId =
            raw?.karyawanId || raw?.permissions?.karyawanId || raw?.permissions?.karyawanid || null

          const userTokoId = raw?.tokoId || raw?.permissions?.tokoId || raw?.toko?.id || null

          if (!userKaryawanId) {
            cleanupAbsensiListener()
            setKaryawanId(null)
            setTokoId(userTokoId)
            setLoading(false)
            return
          }

          setKaryawanId(userKaryawanId)
          setTokoId(userTokoId)
          listenAbsensi(nextUid, userKaryawanId)
        },
        (error) => {
          console.error("Gagal realtime user karyawan:", error)
          cleanupAbsensiListener()

          const cachedRowsAfterError = loadCache(nextUid)
          if (cachedRowsAfterError) setData(cachedRowsAfterError)

          setLoading(false)
        },
      )
    })

    return () => {
      unsubAuth()
      cleanupUserListener()
    }
  }, [])

  useEffect(() => {
    if (activeTab !== "rekap" || !uid || !karyawanId) return

    const cached = loadRekapCache(uid, karyawanId, bulan, tahun)

    if (cached) {
      setRekap(cached.rekap)
      setLiburFinalMap(cached.liburFinalMap)
      setJadwalData(cached.jadwalData)
      setLoadingRekap(false)
    } else {
      setRekap(null)
      setLiburFinalMap({})
      setJadwalData(null)
      setLoadingRekap(true)
    }

    const db = getFirestore()

    let latestRekap: RekapAbsensi | null = cached?.rekap ?? null
    let latestLiburMap: Record<string, boolean> = cached?.liburFinalMap ?? {}
    let latestDefaultData: any = null
    let latestTokoData: any = null
    let latestKaryawanData: any = null
    let latestJadwalData: ResolvedScheduleData | null = cached?.jadwalData ?? null

    let summaryReady = false
    let liburReady = false
    let defaultReady = false
    let tokoReady = !tokoId
    let karyawanReady = false

    const buildScheduleForMonth = () => {
      const monthStart = formatDateKey(tahun, bulan, 1)
      latestJadwalData = resolveScheduleChainForDate({
        dateKey: monthStart,
        defaultData: latestDefaultData,
        tokoData: latestTokoData,
        karyawanData: latestKaryawanData,
      })
    }

    const applyRealtimeRekap = () => {
      if (!summaryReady || !liburReady || !defaultReady || !tokoReady || !karyawanReady) return

      buildScheduleForMonth()

      setRekap(latestRekap)
      setLiburFinalMap(latestLiburMap)
      setJadwalData(latestJadwalData)
      setLoadingRekap(false)

      saveRekapCache({
        uid,
        karyawanId,
        bulan,
        tahun,
        rekap: latestRekap,
        liburFinalMap: latestLiburMap,
        jadwalData: latestJadwalData,
      })
    }

    const summaryQuery = query(
      collection(db, "absensi_karyawan_summary"),
      where("karyawanId", "==", karyawanId),
      where("bulan", "==", bulan),
      where("tahun", "==", tahun),
    )

    const liburQuery = query(
      collection(db, "libur_final_karyawan"),
      where("karyawanId", "==", karyawanId),
      where("bulan", "==", bulan),
      where("tahun", "==", tahun),
    )

    const unsubSummary = onSnapshot(
      summaryQuery,
      (snap) => {
        if (snap.empty) {
          latestRekap = null
        } else {
          const d = snap.docs[0].data()

          latestRekap = {
            hadir: d.hadir ?? 0,
            izin: d.izin ?? 0,
            sakit: d.sakit ?? 0,
            terlambat: d.terlambat ?? 0,
            pulangCepat: d.pulangCepat ?? 0,
            kedatangan: d.kedatangan ?? 0,
            bulan: d.bulan ?? bulan,
            tahun: d.tahun ?? tahun,
          }
        }

        summaryReady = true
        applyRealtimeRekap()
      },
      (error) => {
        console.error("Gagal realtime rekap karyawan:", error)
        summaryReady = true
        applyRealtimeRekap()
      },
    )

    const unsubLibur = onSnapshot(
      liburQuery,
      (snap) => {
        const nextMap: Record<string, boolean> = {}

        snap.forEach((itemDoc) => {
          const item = itemDoc.data()
          if (item?.tanggal) nextMap[item.tanggal] = true
        })

        latestLiburMap = nextMap
        liburReady = true
        applyRealtimeRekap()
      },
      (error) => {
        console.error("Gagal realtime libur final karyawan:", error)
        liburReady = true
        applyRealtimeRekap()
      },
    )

    const unsubDefault = onSnapshot(
      doc(db, "pengaturan_jam_absensi", "default"),
      (snap) => {
        latestDefaultData = snap.exists() ? snap.data() : null
        defaultReady = true
        applyRealtimeRekap()
      },
      (error) => {
        console.error("Gagal realtime jadwal default:", error)
        latestDefaultData = null
        defaultReady = true
        applyRealtimeRekap()
      },
    )

    let unsubToko: Unsubscribe | null = null

    if (tokoId) {
      unsubToko = onSnapshot(
        doc(db, "pengaturan_jam_absensi", `toko_${tokoId}`),
        (snap) => {
          latestTokoData = snap.exists() ? snap.data() : null
          tokoReady = true
          applyRealtimeRekap()
        },
        (error) => {
          console.error("Gagal realtime jadwal toko:", error)
          latestTokoData = null
          tokoReady = true
          applyRealtimeRekap()
        },
      )
    }

    const unsubKaryawan = onSnapshot(
      doc(db, "pengaturan_jam_absensi", `karyawan_${karyawanId}`),
      (snap) => {
        latestKaryawanData = snap.exists() ? snap.data() : null
        karyawanReady = true
        applyRealtimeRekap()
      },
      (error) => {
        console.error("Gagal realtime jadwal karyawan:", error)
        latestKaryawanData = null
        karyawanReady = true
        applyRealtimeRekap()
      },
    )

    return () => {
      unsubSummary()
      unsubLibur()
      unsubDefault()
      if (unsubToko) unsubToko()
      unsubKaryawan()
    }
  }, [activeTab, uid, karyawanId, tokoId, bulan, tahun])

  const loadMore = async () => {
    if (!lastDoc || loadingMore || !hasMore || !karyawanId || !uid) return

    setLoadingMore(true)
    const db = getFirestore()

    try {
      const q = query(
        collection(db, "absensi_karyawan"),
        where("karyawanId", "==", karyawanId),
        orderBy("tanggal", "desc"),
        startAfter(lastDoc),
        limit(ITEMS_PER_PAGE),
      )

      const snap = await getDocs(q)
      const rows = snap.docs.map(mapAbsensiDoc)
      const newData = dedupeAbsensiRows([...data, ...rows])

      setData(newData)
      saveCache(uid, newData)
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
      setHasMore(snap.docs.length === ITEMS_PER_PAGE)
    } catch (error) {
      console.error("Error loading more:", error)
    } finally {
      setLoadingMore(false)
    }
  }

  const hariKerjaEfektif = useMemo(() => {
    const totalHari = getDaysInMonth(bulan, tahun)
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)

    const isCurrentMonth =
      tahun === todayDate.getFullYear() && bulan === todayDate.getMonth() + 1

    const isFutureMonth =
      tahun > todayDate.getFullYear() ||
      (tahun === todayDate.getFullYear() && bulan > todayDate.getMonth() + 1)

    if (isFutureMonth) return 0

    let total = 0

    for (let day = 1; day <= totalHari; day++) {
      const dateObj = new Date(tahun, bulan - 1, day)
      dateObj.setHours(0, 0, 0, 0)

      if (isCurrentMonth && dateObj > todayDate) continue

      const dateKey = formatDateKey(tahun, bulan, day)
      const isLiburFinal = liburFinalMap[dateKey] === true
      const schedule = getScheduleForDate(jadwalData, dateKey)

      if (isLiburFinal) continue
      if (!schedule.enabled) continue

      total += 1
    }

    return total
  }, [bulan, tahun, liburFinalMap, jadwalData])

  const alpha = useMemo(() => {
    if (!rekap) return 0

    const totalMasukValid =
      (rekap.hadir ?? 0) + (rekap.izin ?? 0) + (rekap.sakit ?? 0)

    return Math.max(0, hariKerjaEfektif - totalMasukValid)
  }, [rekap, hariKerjaEfektif])


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
    if (!user || !user.email) {
      alert("User tidak ditemukan. Silakan login ulang")
      return
    }

    try {
      setPasswordLoading(true)

      const credential = EmailAuthProvider.credential(user.email, oldPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)

      alert("Password berhasil diperbarui")
      setShowPasswordModal(false)
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowPass(false)
    } catch (error: any) {
      if (error?.code === "auth/wrong-password" || error?.code === "auth/invalid-credential") {
        alert("Password lama tidak benar")
      } else if (error?.code === "auth/weak-password") {
        alert("Password baru minimal 6 karakter")
      } else if (error?.code === "auth/requires-recent-login") {
        alert("Sesi login sudah kedaluwarsa, silakan logout dan login ulang")
      } else {
        alert("Gagal mengganti password")
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  const visibleData = useMemo(() => data, [data])

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-3 pb-24">
        <section className="relative overflow-hidden rounded-[1.35rem] border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24)] sm:px-5 sm:py-5">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <User size={27} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-50/80">
                  Beranda Karyawan
                </p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                  {formatNamaKaryawan(namaKaryawan) || "KARYAWAN"}
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Pantau laporan kehadiran, rekap bulanan, jadwal, dan akses transaksi.
                </p>
              </div>
            </div>          
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2 rounded-[1.5rem] bg-white p-2.5 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70 sm:p-3">
          <QuickActionCard
            href="/admin/transaksi"
            icon={ShoppingCart}
            label="Panel Transaksi"
            desc="Kasir"
          />
          <QuickActionCard
            href="/karyawan/jadwal-kehadiran"
            icon={CalendarClock}
            label="Jadwal"
            desc="Kehadiran"
          />
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="group flex min-h-[86px] flex-col items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-white via-sky-50/35 to-white px-2 py-2.5 text-center shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60 transition hover:bg-sky-50/70 hover:shadow-md hover:shadow-sky-500/10"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[1.05rem] bg-gradient-to-br from-sky-500/80 via-sky-600/70 to-blue-500/70 text-white shadow-sm ring-1 ring-white/70 transition group-hover:scale-[1.04]">
              <KeyRound size={20} strokeWidth={2.55} />
            </div>
            <p className="mt-1.5 line-clamp-1 text-[10px] font-black leading-[1.08] text-slate-700">
              Ganti Password
            </p>
            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Akun
            </p>
          </button>
        </section>

        <section className="overflow-hidden rounded-[1.5rem] bg-white p-3 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/80 via-sky-600/75 to-blue-500/75 text-white shadow-sm shadow-sky-500/10 ring-1 ring-white/70">
                <Calendar size={19} strokeWidth={2.6} />
              </div>

              <div className="min-w-0">
                <h2 className="text-sm font-black leading-tight text-slate-800">
                  Kehadiranku
                </h2>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {today ? formatTanggalMasehi(today) : "Memuat tanggal"}
                </p>
              </div>
            </div>

            <span className="hidden rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-sky-700 ring-1 ring-sky-100/70 sm:inline-flex">
              {today ? formatTanggalHijriah(today) : "Kalender"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-[1.35rem] bg-sky-50/45 p-1.5 ring-1 ring-sky-100/60">
            <button
              type="button"
              onClick={() => setActiveTab("laporan")}
              className={`flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-2 py-2 text-center transition ${
                activeTab === "laporan"
                  ? "bg-white text-sky-700 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/80"
                  : "text-slate-400 hover:bg-white/70 hover:text-sky-700"
              }`}
            >
              <Clock size={15} strokeWidth={2.6} />
              <span className="text-[10px] font-black uppercase tracking-[0.08em]">
                Laporan Kehadiran
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("rekap")}
              className={`flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-2 py-2 text-center transition ${
                activeTab === "rekap"
                  ? "bg-white text-sky-700 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/80"
                  : "text-slate-400 hover:bg-white/70 hover:text-sky-700"
              }`}
            >
              <Filter size={15} strokeWidth={2.6} />
              <span className="text-[10px] font-black uppercase tracking-[0.08em]">
                Rekapan Kehadiran
              </span>
            </button>
          </div>
        </section>

        {activeTab === "rekap" && (
          <section className="space-y-3">
            <div className="rounded-[1.5rem] bg-white p-3 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70 sm:p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100/70">
                  <Filter size={16} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    Filter Periode
                  </h3>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Rekap bulanan
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                    Bulan
                  </label>
                  <div className="relative">
                    <select
                      value={bulan}
                      onChange={(e) => setBulan(Number(e.target.value))}
                      className="w-full appearance-none rounded-xl border-2 border-sky-100 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    >
                      <option value={1}>Januari</option>
                      <option value={2}>Februari</option>
                      <option value={3}>Maret</option>
                      <option value={4}>April</option>
                      <option value={5}>Mei</option>
                      <option value={6}>Juni</option>
                      <option value={7}>Juli</option>
                      <option value={8}>Agustus</option>
                      <option value={9}>September</option>
                      <option value={10}>Oktober</option>
                      <option value={11}>November</option>
                      <option value={12}>Desember</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.5}
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                    Tahun
                  </label>
                  <div className="relative">
                    <select
                      value={tahun}
                      onChange={(e) => setTahun(Number(e.target.value))}
                      className="w-full appearance-none rounded-xl border-2 border-sky-100 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    >
                      <option value={2025}>2025</option>
                      <option value={2026}>2026</option>
                      <option value={2027}>2027</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.5}
                    />
                  </div>
                </div>
              </div>
            </div>

            {loadingRekap ? (
              <div className="rounded-[1.5rem] bg-white p-8 text-center shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70">
                <Loader2 size={26} className="mx-auto animate-spin text-sky-600" strokeWidth={2.5} />
                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Memuat rekap absensi...
                </p>
              </div>
            ) : rekap ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <RekapItem label="Hadir" value={rekap.hadir} iconType="check" color="green" />
                <RekapItem label="Alpha" value={alpha} iconType="x-circle" color="rose" />
                <RekapItem label="Izin" value={rekap.izin} iconType="hand" color="emerald" />
                <RekapItem label="Sakit" value={rekap.sakit} iconType="heart-pulse" color="red" />
                <RekapItem
                  label="Terlambat / Pulang Cepat"
                  value={`${rekap.terlambat}/${rekap.pulangCepat}`}
                  iconType="clock"
                  color="orange"
                />
                <RekapItem
                  label="Tidak Absen Pulang"
                  value={rekap.kedatangan}
                  iconType="alert-circle"
                  color="slate"
                />
              </div>
            ) : (
              <div className="rounded-[1.5rem] bg-white p-8 text-center shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-300">
                  <Calendar size={28} strokeWidth={2} />
                </div>
                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Tidak ada data rekap untuk periode ini
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === "laporan" && (
          <section className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/70">
            <div className="flex items-center justify-between gap-2 border-b border-sky-100 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100/70">
                  <Clock size={15} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                    Laporan Kehadiran Harian
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Riwayat terbaru
                  </p>
                </div>
              </div>

              {!loading && visibleData.length > 0 && (
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-sky-700 ring-1 ring-sky-100/70">
                  {visibleData.length} Data
                </span>
              )}
            </div>

            <div className="divide-y divide-slate-100 sm:hidden">
              {loading && visibleData.length === 0 && (
                <div className="flex flex-col items-center gap-3 p-8">
                  <Loader2 size={26} className="animate-spin text-sky-600" strokeWidth={2.5} />
                  <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                    Memuat data...
                  </p>
                </div>
              )}

              {!loading && visibleData.length === 0 && (
                <div className="flex flex-col items-center gap-3 p-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50">
                    <Calendar size={28} className="text-sky-300" strokeWidth={2} />
                  </div>
                  <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                    Belum ada data absensi
                  </p>
                </div>
              )}

              {visibleData.map((row) => (
                <div key={row.id} className="px-4 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black capitalize text-slate-800">
                        {getHari(row.tanggal)}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {row.tanggal}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <span className="text-xs font-black capitalize text-slate-800">
                        {row.status}
                      </span>
                      {row.approvalStatus === "pending" && (
                        <Clock size={14} className="text-orange-500" strokeWidth={2.5} />
                      )}
                      {row.approvalStatus === "approved" && (
                        <CheckCircle2 size={14} className="text-emerald-600" strokeWidth={2.5} />
                      )}
                      {row.approvalStatus === "rejected" && (
                        <XCircle size={14} className="text-red-600" strokeWidth={2.5} />
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Jam Masuk
                      </p>
                      <p className="text-sm font-bold text-slate-800">
                        {row.jamMasuk || <span className="font-normal text-slate-300">—</span>}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Jam Pulang
                      </p>
                      <p className="text-sm font-bold text-slate-800">
                        {row.jamPulang || <span className="font-normal text-slate-300">—</span>}
                      </p>
                    </div>
                  </div>

                  {(row.keteranganMasuk || row.keteranganPulang || row.keteranganIzin) && (
                    <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-2.5">
                      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Keterangan
                      </p>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {row.keteranganMasuk || row.keteranganPulang || row.keteranganIzin}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {hasMore && !loading && visibleData.length > 0 && (
                <div className="border-t border-sky-100 p-4">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 active:bg-sky-100 disabled:opacity-50"
                  >
                    {loadingMore ? "Memuat..." : "Muat Data Riwayat Absensi"}
                  </button>
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="border-b border-sky-100 bg-white">
                  <tr>
                    <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Hari
                    </th>
                    <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Tanggal
                    </th>
                    <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Masuk
                    </th>
                    <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Pulang
                    </th>
                    <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && visibleData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 size={26} className="animate-spin text-sky-600" strokeWidth={2.5} />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Memuat data...
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && visibleData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50">
                            <Calendar size={24} className="text-sky-300" strokeWidth={2} />
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Belum ada data absensi
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {visibleData.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-sky-50/30">
                      <td className="px-5 py-3 font-black capitalize text-slate-800">
                        {getHari(row.tanggal)}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-700">
                        {row.tanggal}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold capitalize text-slate-800">
                            {row.status}
                          </span>
                          {row.approvalStatus === "pending" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-100">
                              <Clock size={14} className="text-orange-500" strokeWidth={2.5} />
                            </div>
                          )}
                          {row.approvalStatus === "approved" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100">
                              <CheckCircle2 size={14} className="text-emerald-600" strokeWidth={2.5} />
                            </div>
                          )}
                          {row.approvalStatus === "rejected" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-red-100">
                              <XCircle size={14} className="text-red-600" strokeWidth={2.5} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-700">
                        {row.jamMasuk || <span className="font-normal text-slate-300">-</span>}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-700">
                        {row.jamPulang || <span className="font-normal text-slate-300">-</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {row.keteranganMasuk || row.keteranganPulang || row.keteranganIzin || (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {hasMore && !loading && visibleData.length > 0 && (
                    <tr>
                      <td colSpan={6} className="border-t border-sky-100 py-4 text-center">
                        <button
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="rounded-xl border border-sky-100 bg-white px-4 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                        >
                          {loadingMore ? "Memuat..." : "Muat Data Lagi"}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <PasswordModal
        open={showPasswordModal}
        loading={passwordLoading}
        showPass={showPass}
        oldPassword={oldPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        setOldPassword={setOldPassword}
        setNewPassword={setNewPassword}
        setConfirmPassword={setConfirmPassword}
        setShowPass={setShowPass}
        onClose={() => setShowPasswordModal(false)}
        onSave={handleChangePassword}
      />

      <Footer />
    </div>
  )
}

function QuickActionCard({
  href,
  icon: Icon,
  label,
  desc,
}: {
  href: string
  icon: any
  label: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[86px] flex-col items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-white via-sky-50/35 to-white px-2 py-2.5 text-center shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60 transition hover:bg-sky-50/70 hover:shadow-md hover:shadow-sky-500/10"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[1.05rem] bg-gradient-to-br from-sky-500/80 via-sky-600/70 to-blue-500/70 text-white shadow-sm ring-1 ring-white/70 transition group-hover:scale-[1.04]">
        <Icon size={20} strokeWidth={2.55} />
      </div>
      <p className="mt-1.5 line-clamp-1 text-[10px] font-black leading-[1.08] text-slate-700">
        {label}
      </p>
      <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {desc}
      </p>
    </Link>
  )
}

function PasswordModal({
  open,
  loading,
  showPass,
  oldPassword,
  newPassword,
  confirmPassword,
  setOldPassword,
  setNewPassword,
  setConfirmPassword,
  setShowPass,
  onClose,
  onSave,
}: {
  open: boolean
  loading: boolean
  showPass: boolean
  oldPassword: string
  newPassword: string
  confirmPassword: string
  setOldPassword: (value: string) => void
  setNewPassword: (value: string) => void
  setConfirmPassword: (value: string) => void
  setShowPass: (value: boolean) => void
  onClose: () => void
  onSave: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-2xl shadow-sky-900/10"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-5 py-5 text-white">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <KeyRound size={22} strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight">Ganti Password</h2>
                <p className="mt-1 text-xs font-semibold text-sky-50/85">
                  Perbarui keamanan akun karyawan.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 transition hover:bg-white/20"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        </div>

        <div className="space-y-4 p-5">
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
                  className="w-full rounded-xl border-2 border-sky-100 bg-white px-4 py-3 pr-12 font-semibold text-slate-800 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-sky-50"
                >
                  {showPass ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onSave}
              className="flex-1 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function RekapItem({
  label,
  value,
  iconType,
  color,
}: {
  label: string
  value: number | string
  iconType: "check" | "hand" | "heart-pulse" | "clock" | "alert-circle" | "x-circle"
  color: "green" | "emerald" | "red" | "orange" | "slate" | "rose"
}) {
  const colorConfig = {
    green: {
      border: "border-l-emerald-500",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      bgWatermark: "text-emerald-500/5",
    },
    emerald: {
      border: "border-l-emerald-500",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600",
      bgWatermark: "text-emerald-500/5",
    },
    red: {
      border: "border-l-red-500",
      iconBg: "bg-red-500/10",
      iconColor: "text-red-600",
      bgWatermark: "text-red-500/5",
    },
    orange: {
      border: "border-l-yellow-500",
      iconBg: "bg-yellow-500/10",
      iconColor: "text-yellow-600",
      bgWatermark: "text-yellow-500/5",
    },
    slate: {
      border: "border-l-slate-500",
      iconBg: "bg-slate-500/10",
      iconColor: "text-slate-600",
      bgWatermark: "text-slate-500/5",
    },
    rose: {
      border: "border-l-rose-500",
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600",
      bgWatermark: "text-rose-500/5",
    },
  }

  const iconMap = {
    check: Check,
    hand: Hand,
    "heart-pulse": HeartPulse,
    clock: Clock,
    "alert-circle": AlertCircle,
    "x-circle": XCircle,
  }

  const Icon = iconMap[iconType]
  const colors = colorConfig[color]

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border-l-4 ${colors.border} border-b border-r border-t border-sky-100 bg-white p-2.5 backdrop-blur-sm hover:bg-white hover:shadow-md lg:hover:shadow-none sm:p-4`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors.iconBg} sm:h-11 sm:w-11`}>
          <Icon size={18} className={`sm:h-[22px] sm:w-[22px] ${colors.iconColor}`} strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <p className="mb-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className="origin-left text-xl font-black leading-tight text-slate-800 sm:text-2xl">
            {value}
          </p>
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 opacity-100">
        <Icon size={80} className={colors.bgWatermark} strokeWidth={1.5} />
      </div>
    </div>
  )
}
