// Route API ini menangani GET laporan absensi dan POST absensi karyawan.
// Revisi:
// - Dibuat konsisten dengan API Absensi PTK secure.
// - Tanggal, jam, tanggalKerja, status, dan metode dari client tidak dipercaya.
// - Tanggal dan jam dihitung dari server timezone Asia/Makassar.
// - Jadwal absensi dibaca ulang dari pengaturan_jam_absensi.
// - Prioritas jadwal: default -> toko -> karyawan.
// - Support effectiveSchedules, monthlyOverrides, dan lintasTanggal.
// - Status terlambat dan pulang cepat dihitung server-side.
// - Masuk/pulang wajib lokasi GPS dan divalidasi radius dari server.
// - Lokasi absensi bisa dari karyawan_lokasi_absensi atau toko.
// - Izin/sakit pending approval dan tidak langsung masuk summary.
// - Summary harian global dan summary bulanan karyawan tetap di-update agar dashboard irit read.

import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAuth } from "@/lib/verifyAuth"

const SERVER_TZ = "Asia/Makassar"
const OPEN_BEFORE_MINUTES = 60
const CLOSE_AFTER_MINUTES = 240
const DEFAULT_RADIUS_KM = 0.2

type AbsensiType = "masuk" | "pulang" | "izin" | "sakit"

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

type ScheduleResolved = {
  tanggalKerja: string
  schedule: DaySchedule
  mode: "weekly" | "monthly_override"
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

type TransactionResult =
  | {
      action: "created"
      type: AbsensiType
      statusFinal: string
      isNeedApproval: boolean
    }
  | {
      action: "pulang"
      type: "pulang"
      statusFinal: string
      isNeedApproval: false
      currentData: FirebaseFirestore.DocumentData
      isLintasTanggal: boolean
    }

// =========================
// SERVER TIME
// =========================
function getServerNow() {
  const now = new Date()

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(now)

  const get = (type: string) => parts.find((p) => p.type === type)?.value || ""

  const year = get("year")
  const month = get("month")
  const day = get("day")
  const hour = get("hour")
  const minute = get("minute")

  return {
    nowMs: now.getTime(),
    tanggal: `${year}-${month}-${day}`,
    jam: `${hour}:${minute}`,
    minuteOfDay: Number(hour) * 60 + Number(minute),
  }
}

function toMinutes(time: string | null | undefined) {
  const s = String(time || "").trim()
  if (!s || !s.includes(":")) return 0

  const [h, m] = s.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0

  return h * 60 + m
}

function formatMinute(totalMinute: number) {
  const normalized = Math.max(0, totalMinute)
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0")
  const mm = String(normalized % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

// =========================
// DATE HELPER
// =========================
function isValidDateKey(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))
}

function getDateParts(dateString: string) {
  return {
    tahun: Number(dateString.slice(0, 4)),
    bulan: Number(dateString.slice(5, 7)),
    hari: dateString.slice(8, 10),
    bulanKey: dateString.slice(0, 7),
  }
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

// =========================
// NUMBER / SUMMARY HELPER
// =========================
function num(value: any) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function getEmptySummary() {
  return {
    hadir: 0,
    izin: 0,
    sakit: 0,
    terlambat: 0,
    pulangCepat: 0,
    kedatangan: 0,
  }
}

// =========================
// SCHEDULE HELPER
// =========================
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
        isValidDateKey(item.effectiveFrom)
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

  Object.entries(overrideData?.monthlyOverrides || {}).forEach(
    ([monthKey, dates]) => {
      merged.monthlyOverrides[monthKey] = {
        ...(baseData?.monthlyOverrides?.[monthKey] || {}),
        ...(dates as Record<string, any>),
      }
    }
  )

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
        jamMasuk:
          monthlyOverride.jamMasuk || weeklySchedule[hariKe]?.jamMasuk || "",
        jamPulang:
          monthlyOverride.jamPulang || weeklySchedule[hariKe]?.jamPulang || "",
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

function resolveScheduleForPulang(
  data: any,
  today: string,
  nowMinute: number
): ScheduleResolved {
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

function getWindowInfo(params: {
  schedule: DaySchedule
  tanggalKerja: string
  currentTanggal: string
  nowMinute: number
}) {
  const { schedule, tanggalKerja, currentTanggal, nowMinute } = params

  if (!schedule.enabled || !isValidSchedule(schedule)) {
    return {
      isActive: false,
      jamBukaMinute: 0,
      jamTutupMinute: 0,
      jamMasukMinute: 0,
      jamPulangMinute: 0,
    }
  }

  const jamMasukMinute = toMinutes(schedule.jamMasuk)
  const jamPulangMinute = toMinutes(schedule.jamPulang)
  const jamBukaMinute = Math.max(0, jamMasukMinute - OPEN_BEFORE_MINUTES)
  const jamTutupMinute = jamPulangMinute + CLOSE_AFTER_MINUTES

  if (schedule.lintasTanggal) {
    if (currentTanggal === tanggalKerja) {
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

async function loadMergedScheduleData(params: {
  karyawanId: string
  tokoId: string
}) {
  const { karyawanId, tokoId } = params

  const defaultSnap = await adminDb
    .collection("pengaturan_jam_absensi")
    .doc("default")
    .get()

  let mergedData: any = defaultSnap.exists ? defaultSnap.data() : null
  let sumber: "default" | "toko" | "individu" | null = defaultSnap.exists
    ? "default"
    : null

  if (tokoId) {
    const tokoSnap = await adminDb
      .collection("pengaturan_jam_absensi")
      .doc(`toko_${tokoId}`)
      .get()

    if (tokoSnap.exists) {
      mergedData = mergedData
        ? mergeScheduleData(mergedData, tokoSnap.data())
        : tokoSnap.data()
      sumber = "toko"
    }
  }

  if (karyawanId) {
    const individuSnap = await adminDb
      .collection("pengaturan_jam_absensi")
      .doc(`karyawan_${karyawanId}`)
      .get()

    if (individuSnap.exists) {
      mergedData = mergedData
        ? mergeScheduleData(mergedData, individuSnap.data())
        : individuSnap.data()
      sumber = "individu"
    }
  }

  if (!mergedData || !sumber) return null

  return {
    data: mergedData,
    sumber,
  }
}

// =========================
// LOCATION HELPER
// =========================
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

function hitungJarakKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
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

async function loadLokasiAbsensiForKaryawan(params: {
  karyawanId: string
  karyawan: FirebaseFirestore.DocumentData
  tokoId: string
}) {
  const { karyawanId, karyawan, tokoId } = params

  const lokasiIndividuSnap = await adminDb
    .collection("karyawan_lokasi_absensi")
    .doc(karyawanId)
    .get()

  if (lokasiIndividuSnap.exists) {
    const lokasiIndividu = lokasiIndividuSnap.data()

    if (lokasiIndividu?.tipeLokasiAbsensi === "bebas") {
      return createLokasiBebas()
    }

    if (lokasiIndividu?.tipeLokasiAbsensi === "custom") {
      const fromIndividu = extractLokasiAbsensi(lokasiIndividu, {
        label: lokasiIndividu?.nama
          ? `Lokasi ${lokasiIndividu.nama}`
          : "Lokasi Individu",
        sumber: "individu",
        tokoId,
      })

      if (fromIndividu) return fromIndividu
    }
  }

  const fromKaryawanToko = extractLokasiAbsensi(karyawan?.toko, {
    label: karyawan?.toko?.nama || "Lokasi Toko",
    sumber: "toko",
    tokoId,
  })

  if (fromKaryawanToko) return fromKaryawanToko

  if (tokoId) {
    const tokoSnap = await adminDb.collection("toko").doc(tokoId).get()

    if (tokoSnap.exists) {
      const tokoData = tokoSnap.data()
      const fromTokoDoc = extractLokasiAbsensi(tokoData, {
        label: tokoData?.nama || "Lokasi Toko",
        sumber: "toko",
        tokoId,
      })

      if (fromTokoDoc) return fromTokoDoc
    }
  }

  return null
}

async function validateLokasiServer(params: {
  type: AbsensiType
  body: any
  karyawanId: string
  karyawan: FirebaseFirestore.DocumentData
  tokoId: string
}) {
  const { type, body, karyawanId, karyawan, tokoId } = params

  if (type === "izin" || type === "sakit") {
    return {
      lokasi: null as LokasiAbsensi | null,
      userLat: null as number | null,
      userLng: null as number | null,
      userAccuracy: null as number | null,
      jarakKm: null as number | null,
    }
  }

  const lokasiTarget = await loadLokasiAbsensiForKaryawan({
    karyawanId,
    karyawan,
    tokoId,
  })

  if (!lokasiTarget) {
    throw new Error("LOKASI_BELUM_DIATUR")
  }

  const userLat = readNumber(body?.lokasi?.lat, body?.lat, body?.latitude)
  const userLng = readNumber(body?.lokasi?.lng, body?.lng, body?.longitude)
  const userAccuracy = readNumber(body?.lokasi?.accuracy, body?.accuracy)

  if (userLat === null || userLng === null) {
    throw new Error("LOKASI_CLIENT_WAJIB")
  }

  if (userAccuracy !== null && userAccuracy > 100) {
    throw new Error("GPS_TIDAK_AKURAT")
  }

  if (lokasiTarget.bebas) {
    return {
      lokasi: lokasiTarget,
      userLat,
      userLng,
      userAccuracy,
      jarakKm: null,
    }
  }

  const jarakKm = hitungJarakKm(userLat, userLng, lokasiTarget.lat, lokasiTarget.lng)

  if (jarakKm > lokasiTarget.radiusKm) {
    throw new Error("DI_LUAR_RADIUS")
  }

  return {
    lokasi: lokasiTarget,
    userLat,
    userLng,
    userAccuracy,
    jarakKm,
  }
}

// =========================
// STATUS HELPER
// =========================
function getStatusFinalMasukByServer(params: {
  type: AbsensiType
  nowMinute: number
  jamMasukMinute: number
}) {
  const { type, nowMinute, jamMasukMinute } = params

  if (type === "izin") return "izin"
  if (type === "sakit") return "sakit"
  if (type === "masuk" && nowMinute > jamMasukMinute) return "terlambat"

  return "masuk"
}

function getStatusFinalPulangByServer(params: {
  currentStatus?: string
  nowMinute: number
  jamPulangMinute: number
}) {
  const { currentStatus, nowMinute, jamPulangMinute } = params

  const isPulangCepat = nowMinute < jamPulangMinute

  if (isPulangCepat) {
    if (currentStatus === "terlambat") return "terlambat_pulang_cepat"
    return "pulang_cepat"
  }

  if (currentStatus === "terlambat") return "terlambat"

  return "hadir"
}

function getBodyText(body: any, key: string) {
  return String(body?.[key] || "").trim()
}

function validateRequiredNote(params: {
  type: AbsensiType
  statusFinal: string
  body: any
}) {
  const { type, statusFinal, body } = params

  if (type === "izin") {
    return null
  }

  if (type === "sakit") {
    return null
  }

  if (type === "masuk" && statusFinal === "terlambat") {
    const alasan = getBodyText(body, "alasanMasuk")
    const ket = getBodyText(body, "keteranganMasuk")

    if (!alasan) return "Alasan terlambat wajib dipilih"
    if (!ket) return "Keterangan terlambat wajib diisi"

    return null
  }

  if (type === "pulang" && statusFinal.includes("pulang_cepat")) {
    const alasan = getBodyText(body, "alasanPulang")
    const ket = getBodyText(body, "keteranganPulang")

    if (!alasan) return "Alasan pulang cepat wajib dipilih"
    if (!ket) return "Keterangan pulang cepat wajib diisi"

    return null
  }

  return null
}

// =========================
// KARYAWAN HELPER
// =========================
function getTokoIdFromKaryawan(karyawan: FirebaseFirestore.DocumentData) {
  return String(
    karyawan?.tokoId ||
      karyawan?.toko?.id ||
      karyawan?.permissions?.tokoId ||
      ""
  ).trim()
}

function getTokoNamaFromKaryawan(karyawan: FirebaseFirestore.DocumentData) {
  return String(
    karyawan?.tokoNama ||
      karyawan?.toko?.nama ||
      karyawan?.namaToko ||
      "Tanpa Toko"
  ).trim()
}

function getUnitKerjaIdFromKaryawan(karyawan: FirebaseFirestore.DocumentData) {
  return String(
    karyawan?.unitKerja?.id ||
      karyawan?.unitKerjaId ||
      ""
  ).trim()
}

function getUnitKerjaNamaFromKaryawan(karyawan: FirebaseFirestore.DocumentData) {
  return String(
    karyawan?.unitKerja?.nama ||
      karyawan?.unitKerjaNama ||
      karyawan?.unitKerja ||
      ""
  ).trim()
}

function getKaryawanIdFromAuth(auth: any) {
  return (
    auth?.karyawanId ||
    auth?.user?.karyawanId ||
    auth?.user?.karyawanid ||
    auth?.user?.permissions?.karyawanId ||
    auth?.user?.permissions?.karyawanid ||
    auth?.user?.permissions?.karyawan_id ||
    null
  )
}

// =========================
// BULANAN CODE
// =========================
function getBulananCodeMasuk(type: string, serverStatus?: string) {
  if (type === "izin") return "I"
  if (type === "sakit") return "S"
  if (type === "masuk" && serverStatus === "terlambat") return "T"
  if (type === "masuk") return "-"
  return "-"
}

function getBulananCodePulang(prev: string | undefined, serverStatus?: string) {
  if (serverStatus?.includes("pulang_cepat")) {
    if (prev === "T") return "TPC"
    return "PC"
  }

  if (prev === "-" || prev === undefined) return "H"

  return prev
}

// =========================
// BULANAN KARYAWAN
// =========================
async function updateBulananMasuk(params: {
  karyawanId: string
  karyawan: FirebaseFirestore.DocumentData
  tanggalKerja: string
  type: string
  serverStatus?: string
  now: number
}) {
  const { karyawanId, karyawan, tanggalKerja, type, serverStatus, now } = params
  const { tahun, bulan, hari, bulanKey } = getDateParts(tanggalKerja)

  const bulananRef = adminDb
    .collection("absensi_karyawan_bulanan")
    .doc(`${karyawanId}_${bulanKey}`)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(bulananRef)
    const base = snap.exists ? snap.data()! : { days: {} }

    const days = base.days || {}
    days[hari] = getBulananCodeMasuk(type, serverStatus)

    tx.set(
      bulananRef,
      {
        ...base,
        days,
        karyawanId,
        namaKaryawan: karyawan.nama || "",
        nik: karyawan.nik || null,
        tokoId: getTokoIdFromKaryawan(karyawan),
        tokoNama: getTokoNamaFromKaryawan(karyawan),
        unitKerja: karyawan.unitKerja || null,
        unitKerjaId: getUnitKerjaIdFromKaryawan(karyawan),
        unitKerjaNama: getUnitKerjaNamaFromKaryawan(karyawan),
        jabatan: karyawan.jabatan || null,
        tahun,
        bulan,
        bulanKey,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

async function updateBulananPulang(params: {
  karyawanId: string
  karyawan: FirebaseFirestore.DocumentData
  tanggalKerja: string
  serverStatus?: string
  now: number
}) {
  const { karyawanId, karyawan, tanggalKerja, serverStatus, now } = params
  const { tahun, bulan, hari, bulanKey } = getDateParts(tanggalKerja)

  const bulananRef = adminDb
    .collection("absensi_karyawan_bulanan")
    .doc(`${karyawanId}_${bulanKey}`)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(bulananRef)
    const base = snap.exists ? snap.data()! : { days: {} }

    const days = base.days || {}
    const prev = days[hari]

    days[hari] = getBulananCodePulang(prev, serverStatus)

    tx.set(
      bulananRef,
      {
        ...base,
        days,
        karyawanId,
        namaKaryawan: karyawan.nama || "",
        nik: karyawan.nik || null,
        tokoId: getTokoIdFromKaryawan(karyawan),
        tokoNama: getTokoNamaFromKaryawan(karyawan),
        unitKerja: karyawan.unitKerja || null,
        unitKerjaId: getUnitKerjaIdFromKaryawan(karyawan),
        unitKerjaNama: getUnitKerjaNamaFromKaryawan(karyawan),
        jabatan: karyawan.jabatan || null,
        tahun,
        bulan,
        bulanKey,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

// =========================
// SUMMARY KARYAWAN
// =========================
async function updateKaryawanSummaryMasuk(params: {
  karyawanId: string
  karyawan: FirebaseFirestore.DocumentData
  tanggalKerja: string
  type: string
  serverStatus?: string
  now: number
}) {
  const { karyawanId, karyawan, tanggalKerja, type, serverStatus, now } = params
  const { tahun, bulan, bulanKey } = getDateParts(tanggalKerja)

  const summaryRef = adminDb
    .collection("absensi_karyawan_summary")
    .doc(`${karyawanId}_${bulanKey}`)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(summaryRef)
    const base = snap.exists ? snap.data()! : getEmptySummary()

    if (type === "masuk") {
      base.hadir = num(base.hadir) + 1
      base.kedatangan = num(base.kedatangan) + 1
    }

    if (type === "masuk" && serverStatus === "terlambat") {
      base.terlambat = num(base.terlambat) + 1
    }

    tx.set(
      summaryRef,
      {
        ...base,
        karyawanId,
        namaKaryawan: karyawan.nama || "",
        nik: karyawan.nik || null,
        tokoId: getTokoIdFromKaryawan(karyawan),
        tokoNama: getTokoNamaFromKaryawan(karyawan),
        unitKerja: karyawan.unitKerja || null,
        unitKerjaId: getUnitKerjaIdFromKaryawan(karyawan),
        unitKerjaNama: getUnitKerjaNamaFromKaryawan(karyawan),
        jabatan: karyawan.jabatan || null,
        tahun,
        bulan,
        bulanKey,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

async function updateKaryawanSummaryPulang(params: {
  karyawanId: string
  karyawan: FirebaseFirestore.DocumentData
  tanggalKerja: string
  currentData: FirebaseFirestore.DocumentData
  serverStatus?: string
  now: number
}) {
  const { karyawanId, karyawan, tanggalKerja, currentData, serverStatus, now } =
    params
  const { tahun, bulan, bulanKey } = getDateParts(tanggalKerja)

  const summaryRef = adminDb
    .collection("absensi_karyawan_summary")
    .doc(`${karyawanId}_${bulanKey}`)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(summaryRef)
    const base = snap.exists ? snap.data()! : getEmptySummary()

    if (currentData?.jamMasuk && serverStatus?.includes("pulang_cepat")) {
      base.pulangCepat = num(base.pulangCepat) + 1
    }

    if (currentData?.jamMasuk) {
      base.kedatangan = Math.max(0, num(base.kedatangan) - 1)
    }

    tx.set(
      summaryRef,
      {
        ...base,
        karyawanId,
        namaKaryawan: karyawan.nama || "",
        nik: karyawan.nik || null,
        tokoId: getTokoIdFromKaryawan(karyawan),
        tokoNama: getTokoNamaFromKaryawan(karyawan),
        unitKerja: karyawan.unitKerja || null,
        unitKerjaId: getUnitKerjaIdFromKaryawan(karyawan),
        unitKerjaNama: getUnitKerjaNamaFromKaryawan(karyawan),
        jabatan: karyawan.jabatan || null,
        tahun,
        bulan,
        bulanKey,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

// =========================
// SUMMARY GLOBAL HARIAN
// =========================
async function updateAdminSummaryMasuk(params: {
  tanggalKerja: string
  type: string
  statusFinal: string
  now: number
}) {
  const { tanggalKerja, type, statusFinal, now } = params
  const { tahun, bulan, bulanKey } = getDateParts(tanggalKerja)

  const adminSummaryRef = adminDb
    .collection("absensi_admin_summary_day")
    .doc(`global_${tanggalKerja}`)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(adminSummaryRef)
    const base = snap.exists ? snap.data()! : getEmptySummary()

    if (type === "masuk") {
      base.hadir = num(base.hadir) + 1
      base.kedatangan = num(base.kedatangan) + 1

      if (statusFinal === "terlambat") {
        base.terlambat = num(base.terlambat) + 1
      }
    }

    tx.set(
      adminSummaryRef,
      {
        ...base,
        tanggal: tanggalKerja,
        tanggalKerja,
        tahun,
        bulan,
        bulanKey,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

async function updateAdminSummaryPulang(params: {
  tanggalKerja: string
  currentData: FirebaseFirestore.DocumentData
  serverStatus?: string
  now: number
}) {
  const { tanggalKerja, currentData, serverStatus, now } = params
  const { tahun, bulan, bulanKey } = getDateParts(tanggalKerja)

  const adminSummaryRef = adminDb
    .collection("absensi_admin_summary_day")
    .doc(`global_${tanggalKerja}`)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(adminSummaryRef)
    const base = snap.exists ? snap.data()! : getEmptySummary()

    if (currentData?.jamMasuk && serverStatus?.includes("pulang_cepat")) {
      base.pulangCepat = num(base.pulangCepat) + 1
    }

    if (currentData?.jamMasuk) {
      base.kedatangan = Math.max(0, num(base.kedatangan) - 1)
    }

    tx.set(
      adminSummaryRef,
      {
        ...base,
        tanggal: tanggalKerja,
        tanggalKerja,
        tahun,
        bulan,
        bulanKey,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

// =========================
// GET — LAPORAN ABSENSI KARYAWAN
// =========================
export async function GET(req: Request) {
  const auth = await verifyAuth(req, ["admin", "superadmin", "karyawan"])
  if ("status" in auth) return auth

  const role = auth.roles.includes("karyawan") ? "karyawan" : auth.roles[0]
  const authKaryawanId = getKaryawanIdFromAuth(auth)

  const { searchParams } = new URL(req.url)

  const tanggal = searchParams.get("tanggal")
  const tanggalKerja = searchParams.get("tanggalKerja")
  const bulan = searchParams.get("bulan")
  const tahun = searchParams.get("tahun")
  const summary = searchParams.get("summary")
  const tokoId = searchParams.get("tokoId")
  const unitKerjaId = searchParams.get("unitKerjaId")
  const queryKaryawanId = searchParams.get("karyawanId")
  const approvalStatus = searchParams.get("approvalStatus")
  const pendingOnly = searchParams.get("pendingOnly")

  if (summary === "true") {
    if (!tahun || !bulan) {
      return NextResponse.json(
        { error: "tahun dan bulan wajib untuk summary" },
        { status: 400 }
      )
    }

    if (role === "karyawan" && !authKaryawanId) {
      return NextResponse.json(
        { error: "Karyawan tidak terhubung dengan data karyawan" },
        { status: 400 }
      )
    }

    const targetKaryawanId =
      role === "karyawan" ? authKaryawanId : queryKaryawanId

    if (!targetKaryawanId) {
      return NextResponse.json(
        { error: "karyawanId wajib untuk admin/superadmin pada mode summary" },
        { status: 400 }
      )
    }

    const bulanPad = String(bulan).padStart(2, "0")
    const summaryId = `${targetKaryawanId}_${tahun}-${bulanPad}`

    const summaryRef = adminDb
      .collection("absensi_karyawan_summary")
      .doc(summaryId)

    const snap = await summaryRef.get()

    if (!snap.exists) {
      return NextResponse.json({
        data: getEmptySummary(),
      })
    }

    return NextResponse.json({
      data: snap.data(),
    })
  }

  try {
    let queryRef: FirebaseFirestore.Query = adminDb.collection("absensi_karyawan")

    if (role === "karyawan") {
      if (!authKaryawanId) {
        return NextResponse.json(
          { error: "Karyawan tidak terhubung dengan data karyawan" },
          { status: 400 }
        )
      }

      queryRef = queryRef.where("karyawanId", "==", authKaryawanId)
    } else if (queryKaryawanId) {
      queryRef = queryRef.where("karyawanId", "==", queryKaryawanId)
    }

    if (tanggalKerja) queryRef = queryRef.where("tanggalKerja", "==", tanggalKerja)
    else if (tanggal) queryRef = queryRef.where("tanggal", "==", tanggal)

    if (tahun) queryRef = queryRef.where("tahun", "==", Number(tahun))
    if (bulan) queryRef = queryRef.where("bulan", "==", Number(bulan))
    if (tokoId) queryRef = queryRef.where("tokoId", "==", tokoId)
    if (unitKerjaId) queryRef = queryRef.where("unitKerjaId", "==", unitKerjaId)

    if (pendingOnly === "true") {
      queryRef = queryRef
        .where("status", "in", ["izin", "sakit"])
        .where("approvalStatus", "==", "pending")
    } else if (approvalStatus) {
      queryRef = queryRef.where("approvalStatus", "==", approvalStatus)
    }

    const snap = await queryRef.get()

    const data = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))

    return NextResponse.json({ data })
  } catch (err) {
    console.error("GET absensi karyawan error:", err)
    return NextResponse.json(
      { error: "Gagal mengambil data absensi karyawan" },
      { status: 500 }
    )
  }
}

// =========================
// POST — ABSENSI KARYAWAN SECURE
// =========================
export async function POST(req: Request) {
  const auth = await verifyAuth(req, ["karyawan"])
  if ("status" in auth) return auth

  const karyawanId = getKaryawanIdFromAuth(auth)
  const userId = auth.uid

  if (!karyawanId) {
    return NextResponse.json(
      { error: "Karyawan tidak terhubung dengan akun" },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body request tidak valid" },
      { status: 400 }
    )
  }

  const type = String(body.type || "").trim() as AbsensiType

  if (!["masuk", "pulang", "izin", "sakit"].includes(type)) {
    return NextResponse.json(
      { error: "Tipe absensi tidak valid" },
      { status: 400 }
    )
  }

  try {
    const serverNow = getServerNow()
    const now = serverNow.nowMs
    const serverTanggal = serverNow.tanggal
    const serverJam = serverNow.jam
    const serverMinute = serverNow.minuteOfDay

    const karyawanSnap = await adminDb.collection("karyawan").doc(karyawanId).get()

    if (!karyawanSnap.exists) {
      return NextResponse.json(
        { error: "Data karyawan tidak ditemukan" },
        { status: 404 }
      )
    }

    const tidakWajibSnap = await adminDb
      .collection("karyawan_tidak_wajib_absen")
      .doc(karyawanId)
      .get()

    if (tidakWajibSnap.exists) {
      return NextResponse.json(
        { error: "Karyawan ini tidak wajib absen" },
        { status: 403 }
      )
    }

    const karyawan = karyawanSnap.data()!
    const tokoId = getTokoIdFromKaryawan(karyawan)
    const tokoNama = getTokoNamaFromKaryawan(karyawan)
    const unitKerjaId = getUnitKerjaIdFromKaryawan(karyawan)
    const unitKerjaNama = getUnitKerjaNamaFromKaryawan(karyawan)

    const mergedSchedule = await loadMergedScheduleData({
      karyawanId,
      tokoId,
    })

    if (!mergedSchedule?.data) {
      return NextResponse.json(
        { error: "Pengaturan jam absensi belum tersedia" },
        { status: 400 }
      )
    }

    const scheduleResolved: ScheduleResolved =
      type === "pulang"
        ? resolveScheduleForPulang(
            mergedSchedule.data,
            serverTanggal,
            serverMinute
          )
        : {
            tanggalKerja: serverTanggal,
            ...getScheduleForDate(mergedSchedule.data, serverTanggal),
          }

    const tanggalKerja = scheduleResolved.tanggalKerja
    const schedule = scheduleResolved.schedule

    if (!isValidSchedule(schedule)) {
      return NextResponse.json(
        { error: "Jadwal absensi untuk tanggal ini belum lengkap" },
        { status: 400 }
      )
    }

    if (!schedule.enabled) {
      return NextResponse.json(
        { error: "Hari ini tidak aktif untuk absensi" },
        { status: 403 }
      )
    }

    const windowInfo = getWindowInfo({
      schedule,
      tanggalKerja,
      currentTanggal: serverTanggal,
      nowMinute: serverMinute,
    })

    if ((type === "masuk" || type === "pulang") && !windowInfo.isActive) {
      return NextResponse.json(
        {
          error: `Absensi belum/tidak tersedia. Jam buka ${formatMinute(
            windowInfo.jamBukaMinute
          )}, jam tutup ${formatMinute(windowInfo.jamTutupMinute)}.`,
        },
        { status: 403 }
      )
    }

    const lokasiValidation = await validateLokasiServer({
      type,
      body,
      karyawanId,
      karyawan,
      tokoId,
    })

    const docId = `${karyawanId}_${tanggalKerja}`
    const ref = adminDb.collection("absensi_karyawan").doc(docId)

    const { tahun, bulan, bulanKey } = getDateParts(tanggalKerja)

    let transactionResult: TransactionResult | null = null

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)

      if (!snap.exists) {
        if (!["masuk", "izin", "sakit"].includes(type)) {
          throw new Error("BELUM_ABSEN_MASUK")
        }

        const statusFinal = getStatusFinalMasukByServer({
          type,
          nowMinute: serverMinute,
          jamMasukMinute: windowInfo.jamMasukMinute,
        })

        const noteError = validateRequiredNote({
          type,
          statusFinal,
          body,
        })

        if (noteError) {
          throw new Error(`VALIDATION:${noteError}`)
        }

        const isNeedApproval = type === "izin" || type === "sakit"

        tx.set(ref, {
          karyawanId,
          userId,

          namaKaryawan: karyawan.nama || "",
          nik: karyawan.nik || null,

          tokoId,
          tokoNama,

          unitKerja: karyawan.unitKerja || null,
          unitKerjaId,
          unitKerjaNama,

          jabatan: karyawan.jabatan || null,

          tanggal: tanggalKerja,
          tanggalKerja,

          tanggalMasukReal: type === "masuk" ? serverTanggal : null,
          tanggalPulangReal: null,
          tanggalPengajuanReal:
            type === "izin" || type === "sakit" ? serverTanggal : null,

          tahun,
          bulan,
          bulanKey,

          jamMasuk: type === "masuk" ? serverJam : null,
          jamPulang: null,

          jadwalJamMasuk: schedule.jamMasuk,
          jadwalJamPulang: schedule.jamPulang,
          jadwalLintasTanggal: !!schedule.lintasTanggal,
          jadwalSumber: mergedSchedule.sumber,
          jadwalMode: scheduleResolved.mode,

          status: statusFinal,
          approvalStatus: isNeedApproval ? "pending" : "approved",

          alasanMasuk:
            type === "masuk" ? getBodyText(body, "alasanMasuk") || null : null,
          keteranganMasuk:
            type === "masuk"
              ? getBodyText(body, "keteranganMasuk") || null
              : null,

          alasanIzin:
            type === "izin" || type === "sakit"
              ? getBodyText(body, "alasanIzin") || type
              : null,
          keteranganIzin:
            type === "izin" || type === "sakit"
              ? getBodyText(body, "keteranganIzin") || null
              : null,

          alasanPulang: null,
          keteranganPulang: null,

          metode:
            type === "masuk" || type === "pulang"
              ? "gps_server_validated"
              : "server_validated",

          lokasiAbsensiMode: lokasiValidation.lokasi?.bebas
            ? "bebas"
            : lokasiValidation.lokasi
              ? "radius"
              : null,
          lokasiAbsensiSumber: lokasiValidation.lokasi?.sumber || null,
          lokasiAbsensiLabel: lokasiValidation.lokasi?.label || null,
          lokasiTarget:
            lokasiValidation.lokasi && !lokasiValidation.lokasi.bebas
              ? {
                  lat: lokasiValidation.lokasi.lat,
                  lng: lokasiValidation.lokasi.lng,
                  radiusKm: lokasiValidation.lokasi.radiusKm,
                }
              : null,
          lokasiUser:
            lokasiValidation.userLat !== null && lokasiValidation.userLng !== null
              ? {
                  lat: lokasiValidation.userLat,
                  lng: lokasiValidation.userLng,
                  accuracy: lokasiValidation.userAccuracy,
                }
              : null,
          lokasiJarakKm: lokasiValidation.jarakKm,

          isLintasTanggal: false,

          serverTanggal,
          serverJam,

          clientTanggalIgnored: body?.tanggal || null,
          clientJamIgnored: body?.jam || null,
          clientTanggalKerjaIgnored: body?.tanggalKerja || null,
          clientStatusIgnored: body?.status || null,
          clientMetodeIgnored: body?.metode || null,

          createdAt: now,
          createdBy: userId,
        })

        transactionResult = {
          action: "created",
          type,
          statusFinal,
          isNeedApproval,
        }

        return
      }

      const currentData = snap.data()!

      if (type === "pulang") {
        if (currentData?.jamPulang) {
          throw new Error("SUDAH_ABSEN_PULANG")
        }

        if (!currentData?.jamMasuk) {
          throw new Error("BELUM_ABSEN_MASUK")
        }

        const statusFinal = getStatusFinalPulangByServer({
          currentStatus: currentData?.status,
          nowMinute: serverMinute,
          jamPulangMinute: windowInfo.jamPulangMinute,
        })

        const noteError = validateRequiredNote({
          type,
          statusFinal,
          body,
        })

        if (noteError) {
          throw new Error(`VALIDATION:${noteError}`)
        }

        const isLintasTanggal = serverTanggal !== tanggalKerja

        tx.update(ref, {
          jamPulang: serverJam,

          status: statusFinal,

          tanggalPulangReal: serverTanggal,
          isLintasTanggal,

          alasanPulang: getBodyText(body, "alasanPulang") || null,
          keteranganPulang: getBodyText(body, "keteranganPulang") || null,

          jadwalJamMasuk: schedule.jamMasuk,
          jadwalJamPulang: schedule.jamPulang,
          jadwalLintasTanggal: !!schedule.lintasTanggal,
          jadwalSumber: mergedSchedule.sumber,
          jadwalMode: scheduleResolved.mode,

          lokasiAbsensiMode: lokasiValidation.lokasi?.bebas
            ? "bebas"
            : lokasiValidation.lokasi
              ? "radius"
              : null,
          lokasiAbsensiSumber: lokasiValidation.lokasi?.sumber || null,
          lokasiAbsensiLabel: lokasiValidation.lokasi?.label || null,
          lokasiTarget:
            lokasiValidation.lokasi && !lokasiValidation.lokasi.bebas
              ? {
                  lat: lokasiValidation.lokasi.lat,
                  lng: lokasiValidation.lokasi.lng,
                  radiusKm: lokasiValidation.lokasi.radiusKm,
                }
              : null,
          lokasiUser:
            lokasiValidation.userLat !== null && lokasiValidation.userLng !== null
              ? {
                  lat: lokasiValidation.userLat,
                  lng: lokasiValidation.userLng,
                  accuracy: lokasiValidation.userAccuracy,
                }
              : null,
          lokasiJarakKm: lokasiValidation.jarakKm,

          approvalStatus: "approved",

          serverTanggalPulang: serverTanggal,
          serverJamPulang: serverJam,

          clientTanggalPulangIgnored: body?.tanggal || null,
          clientJamPulangIgnored: body?.jam || null,
          clientTanggalKerjaPulangIgnored: body?.tanggalKerja || null,
          clientStatusPulangIgnored: body?.status || null,

          updatedAt: now,
          updatedBy: userId,
        })

        transactionResult = {
          action: "pulang",
          type: "pulang",
          statusFinal,
          isNeedApproval: false,
          currentData,
          isLintasTanggal,
        }

        return
      }

      if (type === "masuk" && currentData?.jamMasuk) {
        throw new Error("SUDAH_ABSEN_MASUK")
      }

      if ((type === "izin" || type === "sakit") && currentData?.status) {
        throw new Error("SUDAH_ABSEN_HARI_INI")
      }

      throw new Error("SUDAH_ABSEN_HARI_INI")
    })

    if (!transactionResult) {
      return NextResponse.json(
        { error: "Gagal memproses absensi" },
        { status: 500 }
      )
    }

    const result = transactionResult as TransactionResult

    if (result.action === "created") {
      await updateBulananMasuk({
        karyawanId,
        karyawan,
        tanggalKerja,
        type: result.type,
        serverStatus: result.statusFinal,
        now,
      })

      if (!result.isNeedApproval) {
        await updateKaryawanSummaryMasuk({
          karyawanId,
          karyawan,
          tanggalKerja,
          type: result.type,
          serverStatus: result.statusFinal,
          now,
        })

        await updateAdminSummaryMasuk({
          tanggalKerja,
          type: result.type,
          statusFinal: result.statusFinal,
          now,
        })
      }

      return NextResponse.json({
        success: true,
        tanggalKerja,
        serverTanggal,
        serverJam,
        status: result.statusFinal,
        approvalStatus: result.isNeedApproval ? "pending" : "approved",
        message: result.isNeedApproval
          ? "Pengajuan berhasil, menunggu persetujuan"
          : result.statusFinal === "terlambat"
            ? "Absen masuk berhasil sebagai terlambat"
            : "Absen masuk berhasil",
      })
    }

    if (result.action === "pulang") {
      await updateBulananPulang({
        karyawanId,
        karyawan,
        tanggalKerja,
        serverStatus: result.statusFinal,
        now,
      })

      await updateKaryawanSummaryPulang({
        karyawanId,
        karyawan,
        tanggalKerja,
        currentData: result.currentData,
        serverStatus: result.statusFinal,
        now,
      })

      await updateAdminSummaryPulang({
        tanggalKerja,
        currentData: result.currentData,
        serverStatus: result.statusFinal,
        now,
      })

      return NextResponse.json({
        success: true,
        tanggalKerja,
        serverTanggal,
        serverJam,
        isLintasTanggal: result.isLintasTanggal,
        status: result.statusFinal,
        message: result.statusFinal.includes("pulang_cepat")
          ? "Absensi pulang berhasil sebagai pulang cepat"
          : "Absensi pulang berhasil",
      })
    }

    return NextResponse.json({
      success: true,
      tanggalKerja,
      serverTanggal,
      serverJam,
    })
  } catch (err: any) {
    const msg = String(err?.message || "")

    if (msg.startsWith("VALIDATION:")) {
      return NextResponse.json(
        { error: msg.replace("VALIDATION:", "") },
        { status: 400 }
      )
    }

    if (msg === "LOKASI_BELUM_DIATUR") {
      return NextResponse.json(
        { error: "Lokasi absensi belum diatur di database" },
        { status: 400 }
      )
    }

    if (msg === "LOKASI_CLIENT_WAJIB") {
      return NextResponse.json(
        { error: "Lokasi GPS wajib dikirim untuk absensi masuk/pulang" },
        { status: 400 }
      )
    }

    if (msg === "GPS_TIDAK_AKURAT") {
      return NextResponse.json(
        { error: "Akurasi GPS terlalu rendah. Aktifkan GPS asli lalu coba lagi" },
        { status: 400 }
      )
    }

    if (msg === "DI_LUAR_RADIUS") {
      return NextResponse.json(
        { error: "Anda berada di luar radius absensi" },
        { status: 403 }
      )
    }

    if (msg === "BELUM_ABSEN_MASUK") {
      return NextResponse.json(
        { error: "Belum absen masuk" },
        { status: 400 }
      )
    }

    if (msg === "SUDAH_ABSEN_MASUK") {
      return NextResponse.json(
        {
          code: "ALREADY_ABSENT",
          error: "Anda sudah absensi masuk",
        },
        { status: 409 }
      )
    }

    if (msg === "SUDAH_ABSEN_PULANG") {
      return NextResponse.json(
        {
          code: "ALREADY_ABSENT",
          error: "Anda sudah absensi pulang",
        },
        { status: 409 }
      )
    }

    if (msg === "SUDAH_ABSEN_HARI_INI") {
      return NextResponse.json(
        {
          code: "ALREADY_ABSENT",
          error: "Anda sudah absensi hari ini",
        },
        { status: 409 }
      )
    }

    console.error("POST absensi karyawan error:", err)

    return NextResponse.json(
      { error: "Gagal menyimpan absensi karyawan" },
      { status: 500 }
    )
  }
}
