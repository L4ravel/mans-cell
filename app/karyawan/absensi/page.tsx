/*
  Halaman absensi harian karyawan berbasis GPS.
  Revisi:
  - Layout dikonsistensikan dengan sistem Absensi PTK.
  - Jadwal dinamis memakai pengaturan_jam_absensi.
  - Prioritas jadwal: default sistem -> toko -> karyawan.
  - Mendukung effectiveSchedules, monthlyOverrides, dan lintasTanggal.
  - Tanggal kerja dipisah dari tanggal real agar shift lintas tanggal tetap aman.
  - Karyawan tidak wajib absen menampilkan animasi no-absen.
  - Lokasi toko dinamis, validasi radius GPS, dan validasi akurasi GPS.
  - Izin dibuat seperti sakit: tanpa pilihan jenis izin.
  - Tombol dibuat compact modern dan hanya berwarna ketika benar-benar bisa diklik.
*/

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import AnimasiWaktu from "./animasi"
import AnimasiNoAbsen from "./animasi_noabsen"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertCircle,
  Calendar,
  Clock,
  Cpu,
  FileText,
  Globe2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
} from "lucide-react"
// @ts-ignore
import "leaflet/dist/leaflet.css"

type ModalType =
  | null
  | "izin"
  | "sakit"
  | "terlambat"
  | "pulang_cepat"

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

type JadwalAbsensi = {
  jamMasuk: string
  jamPulang: string
  isLibur: boolean
  lintasTanggal: boolean
  tanggalKerja: string
  sumber: "default" | "toko" | "individu" | null
  mode: "weekly" | "monthly_override" | null
  configured: boolean
  message?: string
}

type LokasiAbsensi = {
  lat: number
  lng: number
  radiusKm: number
  label: string
  bebas?: boolean
  sumber?: "toko" | "individu"
  tokoId?: string
}

const ALASAN_KHUSUS = [
  "Sistem Error",
  "Lupa",
  "Tidak ada koneksi internet",
  "Ada keperluan mendadak",
  "Lainnya",
]

const OPEN_BEFORE_MINUTES = 60
const CLOSE_AFTER_MINUTES = 240
const DEFAULT_RADIUS_KM = 0.2

const EMPTY_JADWAL: JadwalAbsensi = {
  jamMasuk: "",
  jamPulang: "",
  isLibur: true,
  lintasTanggal: false,
  tanggalKerja: "",
  sumber: null,
  mode: null,
  configured: false,
  message: "Jadwal absensi belum diatur.",
}

function toMinutes(time: string) {
  if (!time || !time.includes(":")) return 0
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function getYesterdayDateString(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() - 1)

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")

  return `${yyyy}-${mm}-${dd}`
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

function getScheduleForDate(
  data: any,
  dateString: string
): { schedule: DaySchedule; mode: "weekly" | "monthly_override" } {
  const effectiveData = resolveEffectiveDataForDate(data, dateString) || data
  const weeklySchedule = normalizeWeeklySchedule(effectiveData)
  const hariKe = new Date(`${dateString}T00:00:00`).getDay()
  const monthKey = getMonthKey(dateString)

  const monthlyOverride =
    effectiveData?.monthlyOverrides?.[monthKey]?.[dateString] ||
    effectiveData?.monthlyOverrides?.[monthKey]?.[String(dateString)]

  if (monthlyOverride && typeof monthlyOverride === "object") {
    return {
      schedule: {
        enabled:
          typeof monthlyOverride.enabled === "boolean"
            ? monthlyOverride.enabled
            : weeklySchedule[hariKe]?.enabled ?? false,
        jamMasuk: monthlyOverride.jamMasuk || weeklySchedule[hariKe]?.jamMasuk || "",
        jamPulang: monthlyOverride.jamPulang || weeklySchedule[hariKe]?.jamPulang || "",
        lintasTanggal:
          typeof monthlyOverride.lintasTanggal === "boolean"
            ? monthlyOverride.lintasTanggal
            : weeklySchedule[hariKe]?.lintasTanggal ?? false,
      },
      mode: "monthly_override",
    }
  }

  return {
    schedule: weeklySchedule[hariKe] || {
      enabled: false,
      jamMasuk: "",
      jamPulang: "",
      lintasTanggal: false,
    },
    mode: "weekly",
  }
}

function isValidSchedule(schedule: DaySchedule) {
  return !!schedule.jamMasuk && !!schedule.jamPulang
}

function resolveScheduleForNow(
  data: any,
  today: string,
  nowMinute: number
): {
  tanggalKerja: string
  schedule: DaySchedule
  mode: "weekly" | "monthly_override"
} {
  const yesterday = getYesterdayDateString(today)
  const yesterdayResolved = getScheduleForDate(data, yesterday)
  const yesterdaySchedule = yesterdayResolved.schedule

  if (
    yesterdaySchedule.enabled &&
    yesterdaySchedule.lintasTanggal &&
    isValidSchedule(yesterdaySchedule)
  ) {
    const jamPulangYesterday = toMinutes(yesterdaySchedule.jamPulang)
    const closeYesterday = jamPulangYesterday + CLOSE_AFTER_MINUTES

    if (nowMinute <= closeYesterday) {
      return {
        tanggalKerja: yesterday,
        schedule: yesterdaySchedule,
        mode: yesterdayResolved.mode,
      }
    }
  }

  const todayResolved = getScheduleForDate(data, today)

  return {
    tanggalKerja: today,
    schedule: todayResolved.schedule,
    mode: todayResolved.mode,
  }
}

function getWindowInfo(jadwal: JadwalAbsensi, currentTanggal: string, nowMinute: number) {
  if (!jadwal.configured || !jadwal.jamMasuk || !jadwal.jamPulang) {
    return {
      isActive: false,
      jamBukaMinute: 0,
      jamTutupMinute: 0,
      jamMasukMinute: 0,
      jamPulangMinute: 0,
    }
  }

  const jamMasukMinute = toMinutes(jadwal.jamMasuk)
  const jamPulangMinute = toMinutes(jadwal.jamPulang)
  const jamBukaMinute = Math.max(0, jamMasukMinute - OPEN_BEFORE_MINUTES)
  const jamTutupMinute = jamPulangMinute + CLOSE_AFTER_MINUTES

  if (jadwal.lintasTanggal) {
    if (currentTanggal === jadwal.tanggalKerja) {
      return {
        isActive: nowMinute >= jamBukaMinute,
        jamBukaMinute,
        jamTutupMinute,
        jamMasukMinute,
        jamPulangMinute,
      }
    }

    return {
      isActive: nowMinute <= jamTutupMinute,
      jamBukaMinute,
      jamTutupMinute,
      jamMasukMinute,
      jamPulangMinute,
    }
  }

  return {
    isActive: nowMinute >= jamBukaMinute && nowMinute <= jamTutupMinute,
    jamBukaMinute,
    jamTutupMinute,
    jamMasukMinute,
    jamPulangMinute,
  }
}

function formatMinute(totalMinute: number) {
  const normalized = Math.max(0, totalMinute)
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0")
  const mm = String(normalized % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

function readNumber(...values: any[]) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }

  return null
}

function extractLokasiAbsensi(
  data: any,
  options?: {
    label?: string
    sumber?: "toko" | "individu"
    tokoId?: string
  }
): LokasiAbsensi | null {
  if (!data) return null

  const lat = readNumber(
    data?.lokasiAbsensi?.lat,
    data?.lokasiAbsensi?.latitude,
    data?.gps?.lat,
    data?.gps?.latitude,
    data?.absensi?.lat,
    data?.absensi?.latitude,
    data?.lat,
    data?.latitude
  )

  const lng = readNumber(
    data?.lokasiAbsensi?.lng,
    data?.lokasiAbsensi?.longitude,
    data?.gps?.lng,
    data?.gps?.longitude,
    data?.absensi?.lng,
    data?.absensi?.longitude,
    data?.lng,
    data?.longitude
  )

  const radiusKm = readNumber(
    data?.lokasiAbsensi?.radiusKm,
    data?.lokasiAbsensi?.radius,
    data?.gps?.radiusKm,
    data?.gps?.radius,
    data?.absensi?.radiusKm,
    data?.absensi?.radius,
    data?.radiusKm,
    data?.radius
  )

  if (lat === null || lng === null) return null

  return {
    lat,
    lng,
    radiusKm: radiusKm || DEFAULT_RADIUS_KM,
    label: options?.label || data?.nama || "Lokasi Absensi",
    sumber: options?.sumber || "toko",
    tokoId: options?.tokoId || data?.tokoId || "",
  }
}

function createLokasiBebas(): LokasiAbsensi {
  return {
    lat: 0,
    lng: 0,
    radiusKm: 0,
    label: "Bebas Lokasi",
    bebas: true,
    sumber: "individu",
  }
}

function getModalTitle(modal: ModalType) {
  if (modal === "izin") return "Form Izin"
  if (modal === "sakit") return "Form Sakit"
  if (modal === "terlambat") return "Alasan Terlambat"
  if (modal === "pulang_cepat") return "Alasan Pulang Cepat"
  return "Form Absensi"
}

function pickUserKaryawanId(raw: any, uid: string) {
  return (
    raw?.permissions?.karyawanId ||
    raw?.permissions?.karyawanid ||
    raw?.permissions?.karyawan_id ||
    raw?.karyawanId ||
    raw?.karyawanid ||
    raw?.karyawan_id ||
    uid
  )
}

function pickUserTokoId(raw: any) {
  return (
    raw?.permissions?.tokoId ||
    raw?.permissions?.tokoid ||
    raw?.permissions?.toko_id ||
    raw?.tokoId ||
    raw?.tokoid ||
    raw?.toko_id ||
    raw?.toko?.id ||
    ""
  )
}

export default function AbsensiKaryawanPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [tanggal, setTanggal] = useState("")
  const [jam, setJam] = useState("")

  const [modal, setModal] = useState<ModalType>(null)
  const [alasan, setAlasan] = useState("")
  const [keterangan, setKeterangan] = useState("")
  const [pendingType, setPendingType] = useState<"masuk" | "pulang" | null>(null)
  const [mounted, setMounted] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsConfirmModal, setGpsConfirmModal] = useState(false)
  const [jadwalLoading, setJadwalLoading] = useState(true)
  const [lokasiLoading, setLokasiLoading] = useState(true)

  const wajibAlasan = modal === "terlambat" || modal === "pulang_cepat"
  const wajibKeterangan = modal === "terlambat" || modal === "pulang_cepat"
  const alasanBelumDipilih = wajibAlasan && !alasan
  const keteranganBelumDiisi = wajibKeterangan && !keterangan.trim()
  const submitModalDisabled = loading || alasanBelumDipilih || keteranganBelumDiisi

  const [alertModal, setAlertModal] = useState<{
    show: boolean
    type: "success" | "error" | "warning" | "info"
    title: string
    message: string
  } | null>(null)

  const [sudahMasuk, setSudahMasuk] = useState(false)
  const [sudahPulang, setSudahPulang] = useState(false)
  const [sudahIzinAtauSakit, setSudahIzinAtauSakit] = useState(false)
  const [sudahAbsenHariIni, setSudahAbsenHariIni] = useState(false)

  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null)

  const [karyawanId, setKaryawanId] = useState<string | null>(null)
  const [isTidakWajib, setIsTidakWajib] = useState(false)
  const [jadwalAbsensi, setJadwalAbsensi] = useState<JadwalAbsensi>(EMPTY_JADWAL)
  const [lokasiAbsensi, setLokasiAbsensi] = useState<LokasiAbsensi | null>(null)

  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const [Leaflet, setLeaflet] = useState<any>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const userMarkerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const geoWatchIdRef = useRef<number | null>(null)
  const hasCenteredToUserRef = useRef(false)
  const hasCenteredToTokoRef = useRef(false)
  const userInteractingRef = useRef(false)

  const isLokasiBebas = !!lokasiAbsensi?.bebas
  const isGpsAkurat = userAccuracy !== null && userAccuracy <= 50

  const showAlert = (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message: string
  ) => {
    setAlertModal({ show: true, type, title, message })
  }

  const closeAlert = () => {
    if (alertModal?.type === "success") {
      setAlertModal(null)
      router.push("/karyawan")
      return
    }

    setAlertModal(null)
  }

  const hitungJarakKm = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ) => {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const diDalamRadius =
    isLokasiBebas
      ? userLat !== null && userLng !== null
      : userLat !== null &&
        userLng !== null &&
        lokasiAbsensi !== null &&
        hitungJarakKm(userLat, userLng, lokasiAbsensi.lat, lokasiAbsensi.lng) <=
          lokasiAbsensi.radiusKm

  const nowMinute = jam ? toMinutes(jam) : 0

  const windowInfo = getWindowInfo(jadwalAbsensi, tanggal, nowMinute)
  const jamBukaMinute = windowInfo.jamBukaMinute
  const jamTutupMinute = windowInfo.jamTutupMinute
  const jamMasukMinute = windowInfo.jamMasukMinute
  const jamPulangMinute = windowInfo.jamPulangMinute

  const isHariLibur = mounted ? jadwalAbsensi.isLibur : false

  const isJamAbsensiAktif =
    mounted &&
    !jadwalLoading &&
    !lokasiLoading &&
    jadwalAbsensi.configured &&
    lokasiAbsensi !== null &&
    !isHariLibur &&
    windowInfo.isActive

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()

      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, "0")
      const dd = String(now.getDate()).padStart(2, "0")

      const hh = String(now.getHours()).padStart(2, "0")
      const min = String(now.getMinutes()).padStart(2, "0")

      setTanggal(`${yyyy}-${mm}-${dd}`)
      setJam(`${hh}:${min}`)
    }

    updateTime()
    const interval = setInterval(updateTime, 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let active = true

    ;(async () => {
      const L = (await import("leaflet")) as any

      delete (L.Icon.Default.prototype as any)._getIconUrl

      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      if (active) setLeaflet(L)
    })()

    return () => {
      active = false
    }
  }, [])

  const saveToLocal = (data: {
    sudahMasuk?: boolean
    sudahPulang?: boolean
    sudahIzinAtauSakit?: boolean
  }) => {
    const key = `absensi-karyawan-${jadwalAbsensi.tanggalKerja || tanggal}`
    const prev = JSON.parse(localStorage.getItem(key) || "{}")

    localStorage.setItem(
      key,
      JSON.stringify({
        sudahMasuk: data.sudahMasuk ?? prev.sudahMasuk ?? false,
        sudahPulang: data.sudahPulang ?? prev.sudahPulang ?? false,
        sudahIzinAtauSakit:
          data.sudahIzinAtauSakit ?? prev.sudahIzinAtauSakit ?? false,
      })
    )
  }

  const loadLokasiAbsensi = useCallback(
    async (currentKaryawanId: string, userData: any, currentTokoId: string) => {
      setLokasiLoading(true)

      try {
        if (currentKaryawanId) {
          const lokasiIndividuSnap = await getDoc(
            doc(db, "karyawan_lokasi_absensi", currentKaryawanId)
          )

          if (lokasiIndividuSnap.exists()) {
            const lokasiIndividu = lokasiIndividuSnap.data()

            if (lokasiIndividu?.tipeLokasiAbsensi === "bebas") {
              setLokasiAbsensi(createLokasiBebas())
              return
            }

            if (lokasiIndividu?.tipeLokasiAbsensi === "custom") {
              const fromIndividu = extractLokasiAbsensi(lokasiIndividu, {
                label: lokasiIndividu?.nama
                  ? `Lokasi ${lokasiIndividu.nama}`
                  : "Lokasi Individu",
                sumber: "individu",
                tokoId: currentTokoId,
              })

              if (fromIndividu) {
                setLokasiAbsensi(fromIndividu)
                return
              }
            }
          }
        }

        const fromUserToko = extractLokasiAbsensi(userData?.toko, {
          label: userData?.toko?.nama || "Lokasi Toko",
          sumber: "toko",
          tokoId: currentTokoId,
        })

        if (fromUserToko) {
          setLokasiAbsensi(fromUserToko)
          return
        }

        if (currentTokoId) {
          const tokoSnap = await getDoc(doc(db, "toko", currentTokoId))

          if (tokoSnap.exists()) {
            const tokoData = tokoSnap.data()
            const fromTokoDoc = extractLokasiAbsensi(tokoData, {
              label: tokoData?.nama || "Lokasi Toko",
              sumber: "toko",
              tokoId: currentTokoId,
            })

            if (fromTokoDoc) {
              setLokasiAbsensi(fromTokoDoc)
              return
            }
          }
        }

        setLokasiAbsensi(null)
      } catch (error) {
        console.error("Error load lokasi absensi karyawan:", error)
        setLokasiAbsensi(null)
      } finally {
        setLokasiLoading(false)
      }
    },
    []
  )

  const loadPengaturanJamAbsensi = useCallback(
    async (currentKaryawanId: string, currentTokoId: string, currentTanggal: string) => {
      setJadwalLoading(true)

      try {
        const defaultSnap = await getDoc(doc(db, "pengaturan_jam_absensi", "default"))

        let mergedData: any = defaultSnap.exists() ? defaultSnap.data() : null
        let sumber: "default" | "toko" | "individu" | null = defaultSnap.exists()
          ? "default"
          : null

        if (currentTokoId) {
          const tokoSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `toko_${currentTokoId}`)
          )

          if (tokoSnap.exists()) {
            mergedData = mergedData
              ? mergeScheduleData(mergedData, tokoSnap.data())
              : tokoSnap.data()
            sumber = "toko"
          }
        }

        if (currentKaryawanId) {
          const individuSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `karyawan_${currentKaryawanId}`)
          )

          if (individuSnap.exists()) {
            mergedData = mergedData
              ? mergeScheduleData(mergedData, individuSnap.data())
              : individuSnap.data()
            sumber = "individu"
          }
        }

        if (!mergedData) {
          setJadwalAbsensi({
            ...EMPTY_JADWAL,
            tanggalKerja: currentTanggal,
            message: "Jadwal absensi belum diatur. Hubungi admin.",
          })
          return
        }

        const resolved = resolveScheduleForNow(
          mergedData,
          currentTanggal,
          toMinutes(jam || "00:00")
        )

        const schedule = resolved.schedule

        if (!isValidSchedule(schedule)) {
          setJadwalAbsensi({
            ...EMPTY_JADWAL,
            tanggalKerja: resolved.tanggalKerja,
            sumber,
            mode: resolved.mode,
            configured: false,
            message: "Jadwal untuk tanggal ini belum lengkap.",
          })
          return
        }

        setJadwalAbsensi({
          jamMasuk: schedule.jamMasuk,
          jamPulang: schedule.jamPulang,
          isLibur: !schedule.enabled,
          lintasTanggal: !!schedule.lintasTanggal,
          tanggalKerja: resolved.tanggalKerja,
          sumber,
          mode: resolved.mode,
          configured: true,
        })
      } catch (error) {
        console.error("Error load pengaturan jam absensi:", error)
        setJadwalAbsensi({
          ...EMPTY_JADWAL,
          tanggalKerja: currentTanggal,
          message: "Gagal memuat pengaturan jam absensi.",
        })
      } finally {
        setJadwalLoading(false)
      }
    },
    [jam]
  )

  useEffect(() => {
    if (!tanggal) return

    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setSudahMasuk(false)
        setSudahPulang(false)
        setSudahIzinAtauSakit(false)
        setSudahAbsenHariIni(false)
        setIsTidakWajib(false)
        setJadwalAbsensi({ ...EMPTY_JADWAL, tanggalKerja: tanggal })
        setLokasiAbsensi(null)
        setJadwalLoading(false)
        setLokasiLoading(false)
        return
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid))

        if (!userSnap.exists()) {
          setSudahMasuk(false)
          setSudahPulang(false)
          setSudahIzinAtauSakit(false)
          setSudahAbsenHariIni(false)
          setIsTidakWajib(false)
          setJadwalAbsensi({
            ...EMPTY_JADWAL,
            tanggalKerja: tanggal,
            message: "Data akun tidak ditemukan.",
          })
          setLokasiAbsensi(null)
          setJadwalLoading(false)
          setLokasiLoading(false)
          return
        }

        const userData = userSnap.data()
        const karyawanIdValue = pickUserKaryawanId(userData, user.uid)
        const tokoIdValue = pickUserTokoId(userData)

        setKaryawanId(karyawanIdValue)

        const tidakWajibSnap = await getDoc(
          doc(db, "karyawan_tidak_wajib_absen", karyawanIdValue)
        )

        setIsTidakWajib(tidakWajibSnap.exists())

        await Promise.all([
          loadLokasiAbsensi(karyawanIdValue, userData, tokoIdValue),
          loadPengaturanJamAbsensi(karyawanIdValue, tokoIdValue, tanggal),
        ])
      } catch (error) {
        console.error("Error dalam auth listener:", error)
        setIsTidakWajib(false)
        setJadwalAbsensi({
          ...EMPTY_JADWAL,
          tanggalKerja: tanggal,
          message: "Gagal memuat data absensi.",
        })
        setLokasiAbsensi(null)
        setLokasiLoading(false)
        setJadwalLoading(false)
      }
    })

    return () => {
      unsubAuth()
    }
  }, [tanggal, loadLokasiAbsensi, loadPengaturanJamAbsensi])

  useEffect(() => {
    if (!karyawanId || !jadwalAbsensi.tanggalKerja) return

    const docId = `${karyawanId}_${jadwalAbsensi.tanggalKerja}`
    const absensiRef = doc(db, "absensi_karyawan", docId)

    const unsub = onSnapshot(
      absensiRef,
      (snap) => {
        if (!snap.exists()) {
          setSudahMasuk(false)
          setSudahPulang(false)
          setSudahIzinAtauSakit(false)
          setSudahAbsenHariIni(false)

          const key = `absensi-karyawan-${jadwalAbsensi.tanggalKerja}`
          localStorage.removeItem(key)
          return
        }

        const data = snap.data()
        const isMasuk = !!data?.jamMasuk
        const isPulang = !!data?.jamPulang
        const isIzinSakit = data?.status === "izin" || data?.status === "sakit"

        setSudahMasuk(isMasuk)
        setSudahPulang(isPulang)
        setSudahIzinAtauSakit(isIzinSakit)
        setSudahAbsenHariIni(isMasuk || isIzinSakit)

        saveToLocal({
          sudahMasuk: isMasuk,
          sudahPulang: isPulang,
          sudahIzinAtauSakit: isIzinSakit,
        })
      },
      (error) => {
        console.error("Firestore listener error:", error)
      }
    )

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karyawanId, jadwalAbsensi.tanggalKerja])

  const stopWatchLocation = useCallback(() => {
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current)
      geoWatchIdRef.current = null
    }
  }, [])

  const startWatchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showAlert("error", "GPS Tidak Tersedia", "Browser Anda tidak mendukung GPS.")
      return
    }

    setGpsLoading(true)
    stopWatchLocation()

    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setUserAccuracy(pos.coords.accuracy ?? null)
        setGpsLoading(false)
      },
      (err) => {
        console.error("GPS error:", err)
        setUserLat(null)
        setUserLng(null)
        setUserAccuracy(null)
        setGpsLoading(false)

        let errorMsg = "Tidak dapat mengakses lokasi GPS."
        if (err.code === 1) {
          errorMsg = "Izin akses lokasi ditolak. Silakan aktifkan GPS anda."
        } else if (err.code === 2) {
          errorMsg = "Lokasi tidak tersedia. Pastikan GPS perangkat aktif."
        } else if (err.code === 3) {
          errorMsg = "Waktu tunggu GPS habis. Silakan coba lagi."
        }

        showAlert("error", "GPS Error", errorMsg)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 20000,
      }
    )
  }, [stopWatchLocation])

  const handleRefreshGPS = async () => {
    if (!navigator.geolocation) {
      showAlert("error", "Tidak Support", "Browser tidak mendukung GPS.")
      return
    }

    try {
      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      })

      if (permission.state === "denied") {
        showAlert(
          "error",
          "GPS Ditolak",
          "Izin GPS sudah diblokir. Aktifkan kembali izin lokasi dari pengaturan browser / device."
        )
        return
      }

      if (permission.state === "granted") {
        startWatchLocation()
        return
      }

      setGpsConfirmModal(true)
    } catch {
      setGpsConfirmModal(true)
    }
  }

  const handleConfirmGPS = () => {
    setGpsConfirmModal(false)
    startWatchLocation()
  }

  const handleCancelGPS = () => {
    setGpsConfirmModal(false)
  }

  useEffect(() => {
    if (!mounted) return

    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (res.state === "granted" || res.state === "prompt") {
          startWatchLocation()
        }
      })
      .catch(() => {
        startWatchLocation()
      })

    return () => {
      stopWatchLocation()
    }
  }, [mounted, startWatchLocation, stopWatchLocation])

  useEffect(() => {
    if (
      !Leaflet ||
      !isJamAbsensiAktif ||
      !mapRef.current ||
      !lokasiAbsensi ||
      lokasiAbsensi.bebas
    ) {
      return
    }

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = Leaflet.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([lokasiAbsensi.lat, lokasiAbsensi.lng], 14)

      Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapInstanceRef.current)

      mapInstanceRef.current.on("dragstart", () => {
        userInteractingRef.current = true
      })

      mapInstanceRef.current.on("zoomstart", () => {
        userInteractingRef.current = true
      })

      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 300)

      setIsMapReady(true)
    }

    return () => {
      if ((!isJamAbsensiAktif || lokasiAbsensi?.bebas) && mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        userMarkerRef.current = null
        circleRef.current = null
        hasCenteredToUserRef.current = false
        hasCenteredToTokoRef.current = false
        userInteractingRef.current = false
        setIsMapReady(false)
      }
    }
  }, [Leaflet, isJamAbsensiAktif, lokasiAbsensi])

  useEffect(() => {
    if (
      !Leaflet ||
      !mapInstanceRef.current ||
      !isMapReady ||
      !lokasiAbsensi ||
      lokasiAbsensi.bebas
    ) {
      return
    }

    const radius = lokasiAbsensi.radiusKm * 1000

    if (circleRef.current) {
      mapInstanceRef.current.removeLayer(circleRef.current)
    }

    circleRef.current = Leaflet.circle([lokasiAbsensi.lat, lokasiAbsensi.lng], {
      radius,
      color: "green",
      weight: 2,
      fillColor: "rgb(20, 231, 83)",
      fillOpacity: 0.25,
    }).addTo(mapInstanceRef.current)

    if (!hasCenteredToTokoRef.current && userLat === null && userLng === null) {
      mapInstanceRef.current.setView([lokasiAbsensi.lat, lokasiAbsensi.lng], 14)
      hasCenteredToTokoRef.current = true
    }

    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize()
    }, 200)
  }, [Leaflet, lokasiAbsensi, userLat, userLng, isMapReady])

  useEffect(() => {
    if (!Leaflet || !mapInstanceRef.current || !isMapReady) return
    if (userLat === null || userLng === null) return

    const gpsIcon = Leaflet.divIcon({
      className: "",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #3b82f6, #06b6d4);
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(59,130,246,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })

    if (!userMarkerRef.current) {
      userMarkerRef.current = Leaflet.marker([userLat, userLng], { icon: gpsIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup("Lokasi Anda")
    } else {
      userMarkerRef.current.setLatLng([userLat, userLng])
      userMarkerRef.current.setIcon(gpsIcon)
    }

    if (!hasCenteredToUserRef.current && !userInteractingRef.current) {
      mapInstanceRef.current.setView([userLat, userLng], 16)
      hasCenteredToUserRef.current = true
    }
  }, [Leaflet, userLat, userLng, isMapReady])

  const submitAbsensi = async (payload: Record<string, any>) => {
    const user = auth.currentUser
    if (!user) return

    if (!jadwalAbsensi.tanggalKerja) {
      showAlert("error", "Tanggal Kerja Tidak Ada", "Jadwal kerja belum valid.")
      return
    }

    const butuhGPS = payload.type === "masuk" || payload.type === "pulang"

    if (
      payload.status === "terlambat" &&
      (!payload.alasanMasuk || !payload.keteranganMasuk?.trim())
    ) {
      showAlert(
        "warning",
        "Data Belum Lengkap",
        "Alasan dan keterangan terlambat wajib diisi."
      )
      return
    }

    if (
      payload.status === "pulang_cepat" &&
      (!payload.alasanPulang || !payload.keteranganPulang?.trim())
    ) {
      showAlert(
        "warning",
        "Data Belum Lengkap",
        "Alasan dan keterangan pulang cepat wajib diisi."
      )
      return
    }

    setLoading(true)

    const token = await user.getIdToken()

    if (butuhGPS && !lokasiAbsensi) {
      showAlert(
        "error",
        "Lokasi Belum Diatur",
        "Lokasi absensi belum diatur di database."
      )
      setLoading(false)
      return
    }

    if (butuhGPS && (userLat === null || userLng === null)) {
      showAlert("error", "GPS Tidak Aktif", "GPS wajib aktif untuk absen masuk atau pulang.")
      setLoading(false)
      return
    }

    if (butuhGPS && userAccuracy !== null && userAccuracy > 100) {
      showAlert(
        "error",
        "GPS Tidak Akurat",
        `Akurasi lokasi terlalu rendah (${Math.round(userAccuracy)} meter). Matikan sensor lokasi palsu, aktifkan GPS asli, lalu coba lagi.`
      )
      setLoading(false)
      return
    }

    const res = await fetch("/api/laporan-absensi-karyawan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tanggal,
        tanggalKerja: jadwalAbsensi.tanggalKerja,
        jam,
        metode: butuhGPS ? "gps" : "manual",
        lokasi: butuhGPS
          ? {
              lat: userLat,
              lng: userLng,
              accuracy: userAccuracy,
            }
          : null,
        lokasiAbsensiMode: isLokasiBebas ? "bebas" : "radius",
        lokasiAbsensiSumber: lokasiAbsensi?.sumber || null,
        lokasiAbsensiTarget:
          butuhGPS && lokasiAbsensi && !isLokasiBebas
            ? {
                lat: lokasiAbsensi.lat,
                lng: lokasiAbsensi.lng,
                radiusKm: lokasiAbsensi.radiusKm,
                label: lokasiAbsensi.label,
              }
            : null,
        tokoId: lokasiAbsensi?.tokoId || null,
        ...payload,
      }),
    })

    const data = await res.json()

    if (res.status === 409 && data.code === "ALREADY_ABSENT") {
      let pesan = "Anda sudah absensi hari kerja ini"

      if (payload.type === "masuk") {
        pesan = "Anda sudah absensi masuk pada tanggal kerja ini"
        setSudahMasuk(true)
        saveToLocal({ sudahMasuk: true })
      } else if (payload.type === "pulang") {
        pesan = "Anda sudah absensi pulang pada tanggal kerja ini"
        setSudahPulang(true)
        saveToLocal({ sudahPulang: true })
      } else if (payload.status === "izin") {
        pesan = "Anda sudah mengajukan izin pada tanggal kerja ini"
        setSudahIzinAtauSakit(true)
        saveToLocal({ sudahIzinAtauSakit: true })
      } else if (payload.status === "sakit") {
        pesan = "Anda sudah mengajukan sakit pada tanggal kerja ini"
        setSudahIzinAtauSakit(true)
        saveToLocal({ sudahIzinAtauSakit: true })
      }

      showAlert("warning", "Sudah Absen", pesan)
      setLoading(false)
      return
    }

    if (!res.ok) {
      showAlert(
        "error",
        "Gagal Absensi",
        data.error || "Terjadi kesalahan saat melakukan absensi."
      )
      setLoading(false)
      setPendingType(null)
      return
    }

    if (payload.status === "izin" || payload.status === "sakit") {
      setSudahIzinAtauSakit(true)
      saveToLocal({ sudahIzinAtauSakit: true })
    }

    if (payload.type === "masuk") {
      setSudahMasuk(true)
      saveToLocal({ sudahMasuk: true })
    }

    if (payload.type === "pulang") {
      setSudahPulang(true)
      saveToLocal({ sudahPulang: true })
    }

    setLoading(false)
    setModal(null)
    setAlasan("")
    setKeterangan("")
    setPendingType(null)
    showAlert("success", "Berhasil", "Absensi Anda telah berhasil disimpan.")
  }

  const handleMasukPulang = (type: "masuk" | "pulang") => {
    setPendingType(type)
    setAlasan("")
    setKeterangan("")

    if (jadwalLoading || lokasiLoading) {
      showAlert("info", "Memuat Data", "Pengaturan absensi masih dimuat.")
      setPendingType(null)
      return
    }

    if (!jadwalAbsensi.configured) {
      showAlert(
        "warning",
        "Jadwal Belum Diatur",
        jadwalAbsensi.message || "Jadwal absensi belum diatur."
      )
      setPendingType(null)
      return
    }

    if (!lokasiAbsensi) {
      showAlert(
        "warning",
        "Lokasi Belum Diatur",
        "Lokasi absensi belum diatur di database."
      )
      setPendingType(null)
      return
    }

    if (isHariLibur) {
      showAlert("warning", "Hari Libur", "Tanggal kerja ini termasuk libur absensi.")
      setPendingType(null)
      return
    }

    if (!isJamAbsensiAktif) {
      if (nowMinute < jamBukaMinute && !jadwalAbsensi.lintasTanggal) {
        showAlert(
          "warning",
          "Belum Waktu Absensi",
          `Absensi dibuka mulai pukul ${formatMinute(jamBukaMinute)}.`
        )
      } else {
        showAlert(
          "warning",
          "Waktu Absensi Selesai",
          `Absensi ditutup pukul ${formatMinute(jamTutupMinute)}.`
        )
      }
      setPendingType(null)
      return
    }

    if (userLat === null || userLng === null) {
      showAlert("error", "GPS Tidak Aktif", "GPS wajib aktif untuk melakukan absensi.")
      setPendingType(null)
      return
    }

    if (!isLokasiBebas && !diDalamRadius) {
      showAlert(
        "error",
        "Di Luar Radius",
        "Anda berada di luar radius absensi. Masuk dan pulang hanya bisa dilakukan di lokasi yang ditentukan."
      )
      setPendingType(null)
      return
    }

    if (!isGpsAkurat) {
      showAlert(
        "warning",
        "GPS Belum Akurat",
        userAccuracy === null
          ? "Sistem belum membaca akurasi GPS. Tunggu sebentar atau tekan refresh."
          : `Akurasi GPS masih ${Math.round(userAccuracy)} meter. Tunggu sampai lebih akurat.`
      )
      setPendingType(null)
      return
    }

    if (type === "masuk" && sudahMasuk) {
      showAlert("warning", "Sudah Absen", "Anda sudah melakukan absen masuk pada tanggal kerja ini.")
      setPendingType(null)
      return
    }

    if (type === "pulang" && !sudahMasuk) {
      showAlert("warning", "Belum Absen Masuk", "Silakan absen masuk terlebih dahulu.")
      setPendingType(null)
      return
    }

    if (type === "pulang" && sudahPulang) {
      showAlert("warning", "Sudah Absen", "Anda sudah melakukan absen pulang pada tanggal kerja ini.")
      setPendingType(null)
      return
    }

    if (type === "masuk") {
      if (nowMinute > jamMasukMinute && tanggal === jadwalAbsensi.tanggalKerja) {
        setModal("terlambat")
        return
      }

      submitAbsensi({
        type: "masuk",
        status: "hadir",
        alasanMasuk: null,
        keteranganMasuk: null,
      })
      return
    }

    const isPulangCepatNormal =
      !jadwalAbsensi.lintasTanggal &&
      tanggal === jadwalAbsensi.tanggalKerja &&
      nowMinute < jamPulangMinute

    const isPulangCepatLintasTanggal =
      jadwalAbsensi.lintasTanggal &&
      (tanggal === jadwalAbsensi.tanggalKerja || nowMinute < jamPulangMinute)

    if (isPulangCepatNormal || isPulangCepatLintasTanggal) {
      setModal("pulang_cepat")
      return
    }

    submitAbsensi({
      type: "pulang",
      status: "hadir",
      alasanPulang: null,
      keteranganPulang: null,
    })
  }

  const handleSubmitModal = () => {
    if (!modal) return
    if (submitModalDisabled) return

    const isMasuk = pendingType === "masuk" || modal === "terlambat"
    const isPulang = pendingType === "pulang" || modal === "pulang_cepat"

    submitAbsensi({
      type: isMasuk ? "masuk" : isPulang ? "pulang" : modal,
      status:
        modal === "terlambat"
          ? "terlambat"
          : modal === "pulang_cepat"
            ? "pulang_cepat"
            : modal === "izin"
              ? "izin"
              : modal === "sakit"
                ? "sakit"
                : "hadir",
      ...(modal === "izin" || modal === "sakit"
        ? {
            alasanIzin: modal,
            keteranganIzin: keterangan,
          }
        : isMasuk
          ? {
              alasanMasuk: alasan,
              keteranganMasuk: keterangan.trim(),
            }
          : {
              alasanPulang: alasan,
              keteranganPulang: keterangan.trim(),
            }),
    })
  }

  const handleIzin = () => {
    if (sudahMasuk || sudahPulang) {
      showAlert("warning", "Tidak Bisa Izin", "Anda sudah absen pada tanggal kerja ini. Lakukan izin dari menu pulang cepat.")
      return
    }

    setAlasan("")
    setKeterangan("")
    setModal("izin")
  }

  const handleSakit = () => {
    if (sudahMasuk || sudahPulang) {
      showAlert(
        "error",
        "Tidak Bisa Izin Sakit",
        "Anda sudah absen pada tanggal kerja ini. Lakukan izin sakit dari menu pulang cepat."
      )
      return
    }

    setAlasan("")
    setKeterangan("")
    setModal("sakit")
  }

  const AbsensiStepButton = ({
    label,
    description,
    icon: Icon,
    disabled,
    loading: actionLoading,
    onClick,
    active,
    done,
    tone,
  }: {
    label: string
    description: string
    icon: any
    disabled?: boolean
    loading?: boolean
    onClick: () => void
    active?: boolean
    done?: boolean
    tone: "cyan" | "emerald"
  }) => {
    const toneClass =
      tone === "cyan"
        ? {
            active:
              "border-cyan-400 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)]",
            done: "border-cyan-200 bg-cyan-50 text-cyan-700",
            idle: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100/80",
            icon: "bg-white/85 text-cyan-700 shadow-sm",
          }
        : {
            active:
              "border-emerald-400 bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]",
            done: "border-emerald-200 bg-emerald-50 text-emerald-700",
            idle: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/80",
            icon: "bg-white/85 text-emerald-700 shadow-sm",
          }

    const clickableClass = active ? toneClass.active : done ? toneClass.done : toneClass.idle

    const stateClass = disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 opacity-80"
      : clickableClass

    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={description}
        className={`relative flex h-[54px] min-w-0 items-center gap-2.5 rounded-2xl border px-2.5 text-left transition-colors sm:px-3 ${stateClass}`}
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            disabled
              ? "bg-white text-slate-300"
              : active
                ? "bg-white/18 text-white ring-1 ring-white/20"
                : done
                  ? "bg-white text-current shadow-sm"
                  : toneClass.icon
          }`}
        >
          {actionLoading ? (
            <Loader2 size={18} className="animate-spin" strokeWidth={2.6} />
          ) : (
            <Icon size={18} strokeWidth={2.7} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-[0.08em] sm:text-xs sm:tracking-[0.12em]">
              {actionLoading ? "PROSES" : label.toUpperCase()}
            </p>
            {(active || done) && !disabled && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                  active ? "bg-white/18 text-white" : "bg-white text-current"
                }`}
              >
                {done ? "Ok" : "Aktif"}
              </span>
            )}
          </div>
          <p
            className={`mt-0.5 whitespace-nowrap text-[9px] font-semibold leading-tight sm:text-[10px] ${
              disabled ? "text-slate-300" : active ? "text-white/82" : "text-slate-500"
            }`}
          >
            {description}
          </p>
        </div>
      </motion.button>
    )
  }

  const AbsensiSecondaryButton = ({
    label,
    icon: Icon,
    disabled,
    onClick,
    tone,
  }: {
    label: string
    icon: any
    disabled?: boolean
    onClick: () => void
    tone: "rose" | "amber"
  }) => {
    const toneClass =
      tone === "rose"
        ? "border-rose-100 bg-rose-50/80 text-rose-700 hover:border-rose-200 hover:bg-rose-100/80"
        : "border-amber-100 bg-amber-50/80 text-amber-700 hover:border-amber-200 hover:bg-amber-100/80"

    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border px-3 text-[11px] font-black uppercase tracking-[0.1em] transition-colors ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 opacity-75"
            : toneClass
        }`}
      >
        <Icon size={15} strokeWidth={2.7} />
        {label}
      </motion.button>
    )
  }

  return (
    <>
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-white text-slate-900">
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden lg:hidden">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-300/25 blur-[110px]" />
          <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-yellow-200/20 blur-[120px]" />
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-200/20 blur-[110px]" />
        </div>

        {isTidakWajib ? (
          <div className="relative z-10 flex min-h-screen items-center justify-center bg-white p-4">
            <AnimasiNoAbsen />
          </div>
        ) : (
          <main className="relative z-10 mx-auto w-full max-w-5xl space-y-4 p-3 pb-28 sm:p-4 lg:p-5">
            <div className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5">
              <div className="relative z-10 flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                  <MapPin size={27} strokeWidth={2.5} />
                </div>

                <div className="min-w-0">
                  <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                    Absensi Karyawan
                  </h1>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-50/80 sm:text-sm">
                    Catat kehadiran harian dengan verifikasi lokasi dan jadwal yang berlaku.
                  </p>
                </div>
              </div>

              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl lg:hidden" />
              <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl lg:hidden" />
              <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
                <Cpu size={170} className="text-white" strokeWidth={1} />
              </div>
            </div>

            {jadwalLoading || lokasiLoading ? (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm lg:border-slate-200"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  className="h-8 w-8 rounded-full border-2 border-emerald-400 border-t-transparent lg:border-slate-300 lg:border-t-transparent"
                />

                <div className="text-center">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Memuat pengaturan absensi...
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    Sistem sedang membaca jadwal dan lokasi absensi.
                  </p>
                </div>
              </motion.div>
            ) : isJamAbsensiAktif ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white lg:border-slate-200">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-yellow-50/60 px-4 py-3 lg:border-slate-200 lg:bg-white lg:bg-none">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                        Lokasi Absensi
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        GPS wajib aktif untuk masuk dan pulang
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                        diDalamRadius
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {isLokasiBebas ? <Globe2 size={12} /> : <MapPin size={12} />}
                      {diDalamRadius ? "Siap" : "Cek GPS"}
                    </span>
                  </div>

                  <div className="space-y-3 p-3 sm:p-4">
                    {!isLokasiBebas && (
                      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                        <div ref={mapRef} className="z-0 h-64 w-full sm:h-80" />
                      </div>
                    )}

                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                          gpsLoading
                            ? "bg-blue-100"
                            : userLat !== null && userLng !== null
                              ? diDalamRadius
                                ? "bg-emerald-100"
                                : "bg-orange-100"
                              : "bg-red-100"
                        }`}
                      >
                        {gpsLoading ? (
                          <Loader2
                            size={16}
                            className="animate-spin text-blue-600"
                            strokeWidth={2.5}
                          />
                        ) : isLokasiBebas ? (
                          <Globe2
                            size={16}
                            strokeWidth={2.5}
                            className={
                              userLat !== null && userLng !== null
                                ? "text-emerald-600"
                                : "text-red-600"
                            }
                          />
                        ) : (
                          <MapPin
                            size={16}
                            strokeWidth={2.5}
                            className={
                              userLat !== null && userLng !== null
                                ? diDalamRadius
                                  ? "text-emerald-600"
                                  : "text-orange-600"
                                : "text-red-600"
                            }
                          />
                        )}
                      </div>

                      <div className="flex-1 leading-tight">
                        {gpsLoading ? (
                          <p className="text-[10px] font-black uppercase tracking-wide text-blue-600">
                            Mencari lokasi GPS...
                          </p>
                        ) : userLat !== null && userLng !== null ? (
                          isLokasiBebas ? (
                            <div className="flex flex-col items-start gap-0.5">
                              <p className="text-[10px] font-black uppercase tracking-wide text-violet-700">
                                Bebas lokasi
                              </p>
                              <p className="text-[10px] font-semibold text-slate-500">
                                GPS aktif dan lokasi real akan dikirim
                              </p>
                            </div>
                          ) : diDalamRadius ? (
                            <div className="flex flex-col items-start gap-0.5">
                              <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                                Di dalam radius {lokasiAbsensi?.label || "toko"}
                              </p>
                              <p className="text-[10px] font-semibold text-slate-500">
                                Akurasi {userAccuracy ? `${Math.round(userAccuracy)}m` : "-"}
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-0.5">
                              <p className="text-[10px] font-black uppercase tracking-wide text-orange-700">
                                Di luar radius {lokasiAbsensi?.label || "toko"}
                              </p>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">
                                Tidak bisa melakukan absensi
                              </p>
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col items-start gap-0.5">
                            <p className="text-[10px] font-black uppercase tracking-wide text-red-600">
                              GPS tidak aktif
                            </p>
                            <p className="text-[10px] font-semibold text-slate-500">
                              Klik refresh untuk mengaktifkan
                            </p>
                          </div>
                        )}
                      </div>

                      {(userLat === null || userLng === null || gpsLoading) && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          onClick={handleRefreshGPS}
                          disabled={gpsLoading}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw
                            size={13}
                            className={gpsLoading ? "animate-spin" : ""}
                            strokeWidth={2.6}
                          />
                          {gpsLoading ? "Mencari..." : "Refresh"}
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white lg:border-slate-200">
                    <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-yellow-50/60 px-4 py-3 lg:border-slate-200 lg:bg-white lg:bg-none">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                        Status Jadwal
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        Jam real dan tanggal kerja aktif
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-4">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Tanggal Real
                        </label>
                        <input
                          type="date"
                          value={tanggal}
                          disabled
                          className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Jam
                        </label>
                        <input
                          type="time"
                          value={jam}
                          disabled
                          className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"
                        />
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Masuk
                        </p>
                        <p className="mt-0.5 text-sm font-black text-slate-800">
                          {jadwalAbsensi.jamMasuk || "--:--"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Pulang
                        </p>
                        <p className="mt-0.5 text-sm font-black text-slate-800">
                          {jadwalAbsensi.jamPulang || "--:--"}
                        </p>
                      </div>
                    </div>

                    {jadwalAbsensi.tanggalKerja && jadwalAbsensi.tanggalKerja !== tanggal && (
                      <div className="mx-4 mb-4 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-[11px] font-semibold text-violet-700">
                        Shift lintas tanggal aktif. Absensi ini dihitung untuk tanggal kerja{" "}
                        <span className="font-black">{jadwalAbsensi.tanggalKerja}</span>.
                      </div>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm lg:border-slate-200">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                          Panel Absensi
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                          Masuk dulu, lalu pulang setelah selesai.
                        </p>
                      </div>

                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                          diDalamRadius && isGpsAkurat
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {diDalamRadius && isGpsAkurat ? "GPS Ready" : "Cek GPS"}
                      </span>
                    </div>

                    <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-1.5 shadow-inner">
                      <div className="grid grid-cols-2 gap-1.5">
                        <AbsensiStepButton
                          label="Masuk"
                          description={sudahMasuk ? "Sudah tersimpan" : "Catat kehadiran"}
                          icon={LogIn}
                          disabled={sudahAbsenHariIni || !diDalamRadius || !isGpsAkurat || loading}
                          loading={loading && pendingType === "masuk"}
                          onClick={() => handleMasukPulang("masuk")}
                          active={!sudahMasuk && !sudahIzinAtauSakit}
                          done={sudahMasuk}
                          tone="cyan"
                        />

                        <AbsensiStepButton
                          label="Pulang"
                          description={
                            sudahPulang
                              ? "Sudah lengkap"
                              : sudahMasuk
                                ? "Tombol aktif"
                                : "Aktif setelah masuk"
                          }
                          icon={LogOut}
                          disabled={
                            !sudahMasuk ||
                            sudahPulang ||
                            sudahIzinAtauSakit ||
                            !diDalamRadius ||
                            !isGpsAkurat ||
                            loading
                          }
                          loading={loading && pendingType === "pulang"}
                          onClick={() => handleMasukPulang("pulang")}
                          active={sudahMasuk && !sudahPulang && !sudahIzinAtauSakit}
                          done={sudahPulang}
                          tone="emerald"
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <AbsensiSecondaryButton
                        label="Izin"
                        icon={FileText}
                        disabled={loading || sudahMasuk || sudahPulang || sudahIzinAtauSakit}
                        onClick={handleIzin}
                        tone="amber"
                      />

                      <AbsensiSecondaryButton
                        label="Sakit"
                        icon={AlertCircle}
                        disabled={loading || sudahMasuk || sudahPulang || sudahIzinAtauSakit}
                        onClick={handleSakit}
                        tone="rose"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative z-10 flex min-h-[70vh] items-center justify-center bg-white p-4">
                <AnimasiWaktu
                  jamMasuk={jadwalAbsensi.jamMasuk}
                  jamPulang={jadwalAbsensi.jamPulang}
                  hariLibur={jadwalAbsensi.isLibur ? [new Date(`${tanggal}T00:00:00`).getDay()] : []}
                />
              </div>
            )}
          </main>
        )}
      </div>

      <AnimatePresence mode="wait">
        {modal && (
          <motion.div
            key={`form-modal-${modal}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 18 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${
                    modal === "izin"
                      ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200/50"
                      : modal === "sakit"
                        ? "bg-gradient-to-br from-red-400 to-pink-500 shadow-red-200/50"
                        : "bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-emerald-200/50"
                  }`}
                >
                  {modal === "izin" ? (
                    <FileText size={24} className="text-white" strokeWidth={2.5} />
                  ) : modal === "sakit" ? (
                    <AlertCircle size={24} className="text-white" strokeWidth={2.5} />
                  ) : (
                    <Clock size={24} className="text-white" strokeWidth={2.5} />
                  )}
                </div>
                <h2 className="text-xl font-black tracking-tight text-slate-800">
                  {getModalTitle(modal)}
                </h2>
              </div>

              {(modal === "terlambat" || modal === "pulang_cepat") && (
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Alasan
                  </label>
                  <select
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  >
                    <option value="">Pilih alasan</option>
                    {ALASAN_KHUSUS.map((a, i) => (
                      <option key={`${modal}-${i}-${a}`} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Keterangan
                </label>
                <textarea
                  rows={3}
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  placeholder="Tuliskan keterangan..."
                />
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={() => setModal(null)}
                  className="flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Batal
                </motion.button>

                <motion.button
                  whileTap={{ scale: submitModalDisabled ? 1 : 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  disabled={submitModalDisabled}
                  onClick={handleSubmitModal}
                  className="flex-1 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-emerald-200/50 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Mengirim..." : "Kirim"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {gpsConfirmModal && (
          <motion.div
            key="gps-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 18 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <MapPin size={24} strokeWidth={2.5} />
                </div>
                <h2 className="text-xl font-black tracking-tight text-slate-800">
                  Aktifkan GPS?
                </h2>
              </div>

              <p className="text-sm font-medium leading-relaxed text-slate-600">
                Sistem perlu membaca lokasi perangkat agar absensi masuk dan pulang bisa diverifikasi.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelGPS}
                  className="rounded-full border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGPS}
                  className="rounded-full bg-emerald-600 px-4 py-3 text-xs font-black text-white"
                >
                  Aktifkan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {alertModal && (
          <motion.div
            key={`alert-modal-${alertModal.type}-${alertModal.title}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
            onClick={closeAlert}
          >
            <motion.div
              initial={{ scale: 0.96, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 18 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${
                    alertModal.type === "success"
                      ? "bg-gradient-to-br from-emerald-400 to-green-500 shadow-emerald-200/50"
                      : alertModal.type === "error"
                        ? "bg-gradient-to-br from-red-400 to-pink-500 shadow-red-200/50"
                        : alertModal.type === "warning"
                          ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200/50"
                          : "bg-gradient-to-br from-blue-400 to-cyan-500 shadow-blue-200/50"
                  }`}
                >
                  {alertModal.type === "success" ? (
                    <svg
                      className="h-6 w-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : alertModal.type === "error" ? (
                    <svg
                      className="h-6 w-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : alertModal.type === "warning" ? (
                    <AlertCircle size={24} className="text-white" strokeWidth={2.5} />
                  ) : (
                    <MapPin size={24} className="text-white" strokeWidth={2.5} />
                  )}
                </div>
                <h2 className="text-xl font-black tracking-tight text-slate-800">
                  {alertModal.title}
                </h2>
              </div>

              <p className="pl-1 text-sm font-medium leading-relaxed text-slate-600">
                {alertModal.message}
              </p>

              <div className="pt-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={closeAlert}
                  className={`w-full rounded-full px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg transition-all ${
                    alertModal.type === "success"
                      ? "bg-gradient-to-r from-emerald-400 to-green-500 shadow-emerald-200/50 hover:shadow-xl"
                      : alertModal.type === "error"
                        ? "bg-gradient-to-r from-red-400 to-pink-500 shadow-red-200/50 hover:shadow-xl"
                        : alertModal.type === "warning"
                          ? "bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-200/50 hover:shadow-xl"
                          : "bg-gradient-to-r from-blue-400 to-cyan-500 shadow-blue-200/50 hover:shadow-xl"
                  }`}
                >
                  Tutup
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
