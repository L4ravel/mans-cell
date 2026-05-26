"use client"

/*
  Halaman ini menampilkan jadwal kehadiran karyawan berdasarkan pengaturan jam absensi dinamis.
  Revisi:
  - Konsisten dengan pola jadwal PTK, tetapi sumber karyawan memakai default -> toko -> karyawan.
  - Tidak memakai default statis jika dokumen pengaturan_jam_absensi/default belum ada.
  - Mendukung effectiveSchedules agar perubahan jadwal berlaku mulai tanggal tertentu.
  - Mendukung jenisPengaturan: hari menampilkan jadwal harian, tanggal menampilkan jadwal per tanggal.
  - Warna disesuaikan dengan layout karyawan Mans-Cell: sky/blue.
*/

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle,
  Building2,
  Calendar,
  CalendarDays,
  Cpu,
  Moon,
  Store,
  UserCog,
} from "lucide-react"
import { auth, db } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"

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

type JadwalForm = {
  weeklySchedule: Record<number, DaySchedule>
  monthlyOverrides: Record<string, Record<string, DaySchedule>>
  effectiveSchedules: EffectiveSchedule[]
}

type JadwalSource = "karyawan" | "toko" | "default" | "none"

type ResolvedJadwal = JadwalForm & {
  source: JadwalSource
  karyawanId: string | null
  namaKaryawan: string
  tokoId: string
  tokoNama: string
  jenisPengaturan?: "hari" | "tanggal" | null
  message?: string
}

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

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
  const emptyWeekly = createEmptyWeeklySchedule()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...emptyWeekly }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]

      if (!raw) continue

      normalized[i] = {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
        jamMasuk: raw.jamMasuk || "",
        jamPulang: raw.jamPulang || "",
        lintasTanggal:
          typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
      }
    }

    return normalized
  }

  const hasLegacy =
    typeof data?.jamMasuk === "string" ||
    typeof data?.jamPulang === "string" ||
    Array.isArray(data?.hariLibur)

  if (!hasLegacy) return emptyWeekly

  const jamMasuk = data?.jamMasuk || ""
  const jamPulang = data?.jamPulang || ""
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : []
  const migrated: Record<number, DaySchedule> = { ...emptyWeekly }

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

function normalizeMonthlyOverrides(
  data: any,
  weeklySchedule: Record<number, DaySchedule>
): Record<string, Record<string, DaySchedule>> {
  if (!data?.monthlyOverrides || typeof data.monthlyOverrides !== "object") {
    return {}
  }

  const result: Record<string, Record<string, DaySchedule>> = {}

  Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
    if (!dates || typeof dates !== "object") return

    result[monthKey] = {}

    Object.entries(dates as Record<string, any>).forEach(([dateKey, raw]) => {
      const dayIndex = new Date(`${dateKey}T00:00:00`).getDay()
      const fallback = weeklySchedule[dayIndex]

      result[monthKey][dateKey] = {
        enabled:
          typeof raw?.enabled === "boolean"
            ? raw.enabled
            : fallback?.enabled ?? false,
        jamMasuk: raw?.jamMasuk || fallback?.jamMasuk || "",
        jamPulang: raw?.jamPulang || fallback?.jamPulang || "",
        lintasTanggal:
          typeof raw?.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
      }
    })
  })

  return result
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

function createResolvedJadwal(
  data: any,
  source: JadwalSource,
  karyawanId: string | null,
  namaKaryawan: string,
  tokoId: string,
  tokoNama: string,
  selectedMonth: string,
  message?: string
): ResolvedJadwal {
  const monthStartDate = `${selectedMonth}-01`
  const effectiveData = resolveEffectiveDataForDate(data, monthStartDate) || data
  const weeklySchedule = normalizeWeeklySchedule(effectiveData)
  const monthlyOverrides = normalizeMonthlyOverrides(effectiveData, weeklySchedule)

  return {
    weeklySchedule,
    monthlyOverrides,
    effectiveSchedules: normalizeEffectiveSchedules(data),
    source,
    karyawanId,
    namaKaryawan,
    tokoId,
    tokoNama,
    jenisPengaturan:
      data?.jenisPengaturan === "tanggal"
        ? "tanggal"
        : data?.jenisPengaturan === "hari"
          ? "hari"
          : "hari",
    message,
  }
}

function createEmptyResolved({
  karyawanId,
  namaKaryawan,
  tokoId,
  tokoNama,
  message,
}: {
  karyawanId: string | null
  namaKaryawan: string
  tokoId: string
  tokoNama: string
  message: string
}): ResolvedJadwal {
  return {
    weeklySchedule: createEmptyWeeklySchedule(),
    monthlyOverrides: {},
    effectiveSchedules: [],
    source: "none",
    karyawanId,
    namaKaryawan,
    tokoId,
    tokoNama,
    jenisPengaturan: null,
    message,
  }
}

function getCurrentMonthValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function getDaysInMonth(monthValue: string) {
  const [yearStr, monthStr] = monthValue.split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!year || !month) return []

  const totalDays = new Date(year, month, 0).getDate()
  const dates: Array<{
    dateKey: string
    dayNumber: number
    dayIndex: number
    dayName: string
  }> = []

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month - 1, day)
    const dayIndex = date.getDay()
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

    dates.push({
      dateKey,
      dayNumber: day,
      dayIndex,
      dayName: HARI[dayIndex],
    })
  }

  return dates
}

function pickKaryawanId(raw: any) {
  return (
    raw?.karyawanId ||
    raw?.permissions?.karyawanId ||
    raw?.permissions?.karyawanid ||
    null
  )
}

function pickTokoId(raw: any) {
  return raw?.tokoId || raw?.permissions?.tokoId || raw?.toko?.id || ""
}

function pickTokoNama(raw: any) {
  return raw?.tokoNama || raw?.permissions?.tokoNama || raw?.toko?.nama || ""
}

function sourceMeta(source: JadwalSource) {
  if (source === "karyawan") {
    return {
      label: "Individu",
      icon: UserCog,
      className: "bg-sky-100 text-sky-700",
    }
  }

  if (source === "toko") {
    return {
      label: "Toko",
      icon: Store,
      className: "bg-blue-100 text-blue-700",
    }
  }

  if (source === "default") {
    return {
      label: "Default",
      icon: Building2,
      className: "bg-cyan-100 text-cyan-700",
    }
  }

  return {
    label: "Belum Diatur",
    icon: AlertCircle,
    className: "bg-amber-100 text-amber-700",
  }
}

function isScheduleComplete(item?: DaySchedule) {
  return !!item?.jamMasuk && !!item?.jamPulang
}

function getScheduleForDate(data: any, dateKey: string): DaySchedule {
  const effectiveData = resolveEffectiveDataForDate(data, dateKey) || data
  const weeklySchedule = normalizeWeeklySchedule(effectiveData)
  const monthKey = dateKey.slice(0, 7)
  const dayIndex = new Date(`${dateKey}T00:00:00`).getDay()

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
      jamPulang: monthlyOverride.jamPulang || weeklySchedule[dayIndex]?.jamPulang || "",
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

function getMonthlyResolvedOverrides(
  data: any,
  monthDates: ReturnType<typeof getDaysInMonth>
) {
  const result: Record<string, DaySchedule> = {}

  monthDates.forEach((item) => {
    const effectiveData = resolveEffectiveDataForDate(data, item.dateKey) || data
    const monthKey = item.dateKey.slice(0, 7)

    const hasOverride =
      effectiveData?.monthlyOverrides?.[monthKey]?.[item.dateKey] ||
      effectiveData?.monthlyOverrides?.[monthKey]?.[String(item.dateKey)]

    if (hasOverride) {
      result[item.dateKey] = getScheduleForDate(data, item.dateKey)
    }
  })

  return result
}

export default function JadwalKehadiranPage() {
  const [loading, setLoading] = useState(true)
  const [jadwal, setJadwal] = useState<ResolvedJadwal | null>(null)
  const [rawScheduleData, setRawScheduleData] = useState<any | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue())

  const monthDates = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth])

  const isTanggalScheduleActive = jadwal?.jenisPengaturan === "tanggal"

  const currentMonthOverrides = useMemo(() => {
    if (!rawScheduleData || !isTanggalScheduleActive) return {}
    return getMonthlyResolvedOverrides(rawScheduleData, monthDates)
  }, [rawScheduleData, monthDates, isTanggalScheduleActive])

  const weeklyScheduleForSelectedMonth = useMemo(() => {
    if (!rawScheduleData) return jadwal?.weeklySchedule || createEmptyWeeklySchedule()

    const lastDate = monthDates[monthDates.length - 1]?.dateKey || `${selectedMonth}-01`
    const effectiveData = resolveEffectiveDataForDate(rawScheduleData, lastDate) || rawScheduleData

    return normalizeWeeklySchedule(effectiveData)
  }, [rawScheduleData, jadwal?.weeklySchedule, monthDates, selectedMonth])

  const totalJadwalKhusus = useMemo(
    () => Object.keys(currentMonthOverrides).length,
    [currentMonthOverrides]
  )

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false)
        setJadwal(null)
        setRawScheduleData(null)
        return
      }

      setLoading(true)

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid))

        if (!userSnap.exists()) {
          setJadwal(null)
          setRawScheduleData(null)
          setLoading(false)
          return
        }

        const rawUser = userSnap.data()
        const karyawanId = pickKaryawanId(rawUser)
        const namaKaryawan = rawUser?.nama || rawUser?.name || ""
        const tokoId = pickTokoId(rawUser)
        const tokoNama = pickTokoNama(rawUser)

        if (!karyawanId) {
          setJadwal(
            createEmptyResolved({
              karyawanId: null,
              namaKaryawan,
              tokoId,
              tokoNama,
              message: "Akun ini belum terhubung dengan data karyawan.",
            })
          )
          setRawScheduleData(null)
          setLoading(false)
          return
        }

        const defaultSnap = await getDoc(doc(db, "pengaturan_jam_absensi", "default"))

        if (!defaultSnap.exists()) {
          setJadwal(
            createEmptyResolved({
              karyawanId,
              namaKaryawan,
              tokoId,
              tokoNama,
              message: "Jadwal default sistem belum diatur oleh admin.",
            })
          )
          setRawScheduleData(null)
          setLoading(false)
          return
        }

        let mergedData = defaultSnap.data()
        let source: JadwalSource = "default"

        if (tokoId) {
          const tokoSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `toko_${tokoId}`)
          )

          if (tokoSnap.exists()) {
            mergedData = mergeScheduleData(mergedData, tokoSnap.data())
            source = "toko"
          }
        }

        const karyawanSnap = await getDoc(
          doc(db, "pengaturan_jam_absensi", `karyawan_${karyawanId}`)
        )

        if (karyawanSnap.exists()) {
          mergedData = mergeScheduleData(mergedData, karyawanSnap.data())
          source = "karyawan"
        }

        setRawScheduleData(mergedData)
        setJadwal(
          createResolvedJadwal(
            mergedData,
            source,
            karyawanId,
            namaKaryawan,
            tokoId,
            tokoNama,
            selectedMonth
          )
        )
      } catch (error) {
        console.error("Gagal memuat jadwal kehadiran:", error)
        setJadwal(null)
        setRawScheduleData(null)
      } finally {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [selectedMonth])

  const meta = sourceMeta(jadwal?.source || "none")
  const SourceIcon = meta.icon

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="relative overflow-hidden rounded-[1.35rem] border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(2,132,199,0.24)] sm:px-5 sm:py-5"
        >
          <div className="relative z-10 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
              <Calendar size={27} className="text-white" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Jadwal Kehadiran
              </h1>

              {!loading && jadwal && jadwal.source !== "none" ? (
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Jadwal mengikuti pengaturan jam absensi {meta.label.toLowerCase()}.
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Jadwal harian dan tanggal khusus karyawan.
                </p>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        {loading && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-sky-100 bg-white p-8 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-2 border-sky-400 border-t-transparent"
            />
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Memuat jadwal...
            </p>
          </div>
        )}

        {!loading && !jadwal && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-sky-100 bg-white p-8 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50">
              <Calendar size={28} className="text-sky-300" strokeWidth={2} />
            </div>

            <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
              Jadwal tidak ditemukan
            </p>
          </div>
        )}

        {!loading && jadwal?.source === "none" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertCircle size={28} strokeWidth={2.5} />
            </div>

            <p className="text-center text-xs font-bold uppercase tracking-widest text-amber-700">
              Jadwal Belum Diatur
            </p>

            <p className="text-center text-xs font-semibold text-amber-700/80">
              {jadwal.message || "Hubungi admin."}
            </p>
          </div>
        )}

        {!loading && jadwal && jadwal.source !== "none" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoCard label="Nama" value={jadwal.namaKaryawan || "-"} />
            <InfoCard label="Toko" value={jadwal.tokoNama || "-"} />
          </div>
        )}

        {!loading && jadwal && jadwal.source !== "none" && !isTanggalScheduleActive && (
          <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60">
            <div className="flex items-center justify-between gap-2 border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50/60 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                Jadwal Harian
              </p>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${meta.className}`}
              >
                <SourceIcon size={12} strokeWidth={2.5} />
                {meta.label}
              </span>
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50/60">
                  <tr>
                    {["Hari", "Status", "Jam Masuk", "Jam Pulang"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {HARI.map((hari, index) => {
                    const item = weeklyScheduleForSelectedMonth[index]
                    const complete = isScheduleComplete(item)
                    const masuk = !!item?.enabled && complete

                    return (
                      <tr
                        key={hari}
                        className="border-t border-slate-100 transition-colors hover:bg-sky-50/35"
                      >
                        <td className="px-5 py-3 font-black text-slate-800">
                          {hari}
                        </td>

                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                              masuk
                                ? "bg-sky-100 text-sky-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {masuk ? "Masuk" : "Libur"}
                          </span>
                        </td>

                        <td className="px-5 py-3 font-semibold text-slate-700">
                          {masuk ? item.jamMasuk : "—"}
                        </td>

                        <td className="px-5 py-3 font-semibold text-slate-700">
                          {masuk ? item.jamPulang : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 sm:hidden">
              {HARI.map((hari, index) => {
                const item = weeklyScheduleForSelectedMonth[index]
                const complete = isScheduleComplete(item)
                const masuk = !!item?.enabled && complete

                return (
                  <div
                    key={hari}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div>
                      <p className="text-sm font-black text-slate-800">{hari}</p>

                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {masuk ? `${item.jamMasuk} – ${item.jamPulang}` : "Libur"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black ${
                        masuk
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {masuk ? "Masuk" : "Libur"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!loading && jadwal && jadwal.source !== "none" && isTanggalScheduleActive && (
          <div className="space-y-3">
            <div className="rounded-xl border-l-4 border-l-sky-500 border-b border-r border-t border-sky-100 bg-white p-3 shadow-sm shadow-sky-500/5 sm:p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Bulan
                  </label>

                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full appearance-none rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Khusus
                  </label>

                  <div className="flex h-[42px] items-center rounded-lg border-2 border-slate-200 bg-white px-3">
                    <p className="text-sm font-bold leading-none text-slate-700">
                      {totalJadwalKhusus} tanggal
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60">
              <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50/60 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Jadwal Per Tanggal · {selectedMonth}
                  </p>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${meta.className}`}
                  >
                    <SourceIcon size={12} strokeWidth={2.5} />
                    {meta.label}
                  </span>
                </div>
              </div>

              {monthDates.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs font-semibold text-slate-500">
                    Bulan tidak valid.
                  </p>
                </div>
              ) : totalJadwalKhusus === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50">
                    <CalendarDays
                      size={28}
                      className="text-sky-300"
                      strokeWidth={2}
                    />
                  </div>

                  <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                    Tidak Ada Jadwal Per Tanggal
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-sm">
                      <thead className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50/60">
                        <tr>
                          {[
                            "Tanggal",
                            "Hari",
                            "Status",
                            "Jam Masuk",
                            "Jam Pulang",
                            "Tipe",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {monthDates
                          .filter((item) => currentMonthOverrides[item.dateKey])
                          .map((item) => {
                            const schedule = currentMonthOverrides[item.dateKey]
                            const complete = isScheduleComplete(schedule)
                            const masuk = schedule.enabled && complete

                            return (
                              <tr
                                key={item.dateKey}
                                className="border-t border-slate-100 transition-colors hover:bg-sky-50/35"
                              >
                                <td className="px-5 py-3 font-black text-slate-800">
                                  {item.dateKey}
                                </td>

                                <td className="px-5 py-3 font-semibold text-slate-700">
                                  {item.dayName}
                                </td>

                                <td className="px-5 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                                      masuk
                                        ? "bg-sky-100 text-sky-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {masuk ? "Masuk" : "Libur"}
                                  </span>
                                </td>

                                <td className="px-5 py-3 font-semibold text-slate-700">
                                  {masuk ? schedule.jamMasuk : "—"}
                                </td>

                                <td className="px-5 py-3 font-semibold text-slate-700">
                                  {masuk ? schedule.jamPulang : "—"}
                                </td>

                                <td className="px-5 py-3">
                                  {masuk && schedule.lintasTanggal ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">
                                      <Moon size={11} strokeWidth={2.5} />
                                      Lintas Tanggal
                                    </span>
                                  ) : (
                                    <span className="text-xs font-semibold text-slate-400">
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>

                  <div className="divide-y divide-slate-100 sm:hidden">
                    {monthDates
                      .filter((item) => currentMonthOverrides[item.dateKey])
                      .map((item) => {
                        const schedule = currentMonthOverrides[item.dateKey]
                        const complete = isScheduleComplete(schedule)
                        const masuk = schedule.enabled && complete

                        return (
                          <div key={item.dateKey} className="px-4 py-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-black text-slate-800">
                                    {item.dayName}, {item.dayNumber}
                                  </p>

                                  {masuk && schedule.lintasTanggal && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-violet-700">
                                      <Moon size={9} strokeWidth={2.5} />
                                      Lintas
                                    </span>
                                  )}
                                </div>

                                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                                  {item.dateKey}
                                </p>

                                <p className="mt-1 text-xs font-bold text-slate-600">
                                  {masuk ? `${schedule.jamMasuk} – ${schedule.jamPulang}` : "Libur"}
                                </p>
                              </div>

                              <span
                                className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black ${
                                  masuk
                                    ? "bg-sky-100 text-sky-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {masuk ? "Masuk" : "Libur"}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function InfoCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-500/5 ring-1 ring-sky-100/60">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black text-slate-800">
        {value || "-"}
      </p>
    </div>
  )
}
