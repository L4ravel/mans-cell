/*
  Footer absensi karyawan.
  Revisi:
  - Tombol absensi aktif hanya jika jadwal hari ini ada dan enabled.
  - Jika tidak ada jadwal, jadwal per tanggal belum dibuat, atau hari libur, tombol nonaktif.
  - Resolver jadwal mengikuti pengaturan_jam_absensi: default -> toko -> karyawan.
  - Mendukung effectiveSchedules dan monthlyOverrides.
  - Warna disamakan dengan tema Mans-Cell sky/blue dan footer diperkecil.
*/

"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Fingerprint } from "lucide-react"
import { motion } from "framer-motion"
import { auth, db } from "@/lib/firebase"
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

type FooterState = {
  ready: boolean
  bolehAbsensi: boolean
  label: string
  jamMasuk: string
  jamPulang: string
}

const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  enabled: true,
  jamMasuk: "07:30",
  jamPulang: "14:00",
  lintasTanggal: false,
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, "0")
  const dd = String(today.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function getDayIndex(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getDay()
}

function createDefaultWeeklySchedule(): Record<number, DaySchedule> {
  return {
    0: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
    1: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
    2: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
    3: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
    4: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
    5: { enabled: false, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
    6: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00", lintasTanggal: false },
  }
}

function hasLegacySchedule(data: any) {
  return (
    typeof data?.jamMasuk === "string" ||
    typeof data?.jamPulang === "string" ||
    Array.isArray(data?.hariLibur)
  )
}

function hasWeeklySchedule(data: any) {
  return data?.weeklySchedule && typeof data.weeklySchedule === "object"
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> | null {
  const defaults = createDefaultWeeklySchedule()

  if (hasWeeklySchedule(data)) {
    const normalized: Record<number, DaySchedule> = { ...defaults }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]

      if (!raw) continue

      normalized[i] = {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults[i].enabled,
        jamMasuk: raw.jamMasuk || defaults[i].jamMasuk,
        jamPulang: raw.jamPulang || defaults[i].jamPulang,
        lintasTanggal: typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
      }
    }

    return normalized
  }

  if (hasLegacySchedule(data)) {
    const jamMasuk = data?.jamMasuk || "07:30"
    const jamPulang = data?.jamPulang || "14:00"
    const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : [5]
    const migrated: Record<number, DaySchedule> = { ...defaults }

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

  return null
}

function normalizeMonthlySchedule(
  raw: any,
  fallback?: DaySchedule | null,
): DaySchedule | null {
  if (!raw || typeof raw !== "object") return null

  const base = fallback || DEFAULT_DAY_SCHEDULE

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    jamMasuk: raw.jamMasuk || base.jamMasuk,
    jamPulang: raw.jamPulang || base.jamPulang,
    lintasTanggal: typeof raw.lintasTanggal === "boolean" ? raw.lintasTanggal : false,
  }
}

function getMonthlySchedule(
  data: any,
  dateString: string,
  fallback?: DaySchedule | null,
): DaySchedule | null {
  const monthKey = getMonthKey(dateString)
  const raw =
    data?.monthlyOverrides?.[monthKey]?.[dateString] ||
    data?.monthlyOverrides?.[monthKey]?.[String(dateString)]

  return normalizeMonthlySchedule(raw, fallback)
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
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    )
}

function removeEffectiveMeta(data: any) {
  const { effectiveSchedules, ...rest } = data || {}
  return rest
}

function resolveEffectiveDataForDate(data: any, dateString: string) {
  if (!data) return null

  const base = removeEffectiveMeta(data)
  const schedules = normalizeEffectiveSchedules(data)
  let resolved = { ...base }

  schedules.forEach((entry) => {
    if (entry.effectiveFrom <= dateString) {
      resolved = mergeScheduleData(resolved, {
        weeklySchedule: entry.weeklySchedule || {},
        monthlyOverrides: entry.monthlyOverrides || {},
      })
    }
  })

  return resolved
}

function applyNormalLayer(
  current: DaySchedule | null,
  data: any,
  dateString: string,
): DaySchedule | null {
  if (!data) return current

  const effectiveData = resolveEffectiveDataForDate(data, dateString) || data
  const dayIndex = getDayIndex(dateString)
  const weekly = normalizeWeeklySchedule(effectiveData)
  let next = current

  if (weekly) {
    next = weekly[dayIndex] || next
  }

  const monthly = getMonthlySchedule(effectiveData, dateString, next)
  if (monthly) {
    next = monthly
  }

  return next
}

function resolveFinalSchedule({
  dateString,
  defaultData,
  tokoData,
  karyawanData,
}: {
  dateString: string
  defaultData: any
  tokoData: any
  karyawanData: any
}): DaySchedule | null {
  let schedule: DaySchedule | null = null

  schedule = applyNormalLayer(schedule, defaultData, dateString)
  schedule = applyNormalLayer(schedule, tokoData, dateString)

  const effectiveKaryawanData = karyawanData
    ? resolveEffectiveDataForDate(karyawanData, dateString) || karyawanData
    : null

  if (effectiveKaryawanData?.jenisPengaturan === "tanggal") {
    return getMonthlySchedule(effectiveKaryawanData, dateString, schedule)
  }

  schedule = applyNormalLayer(schedule, effectiveKaryawanData, dateString)

  return schedule
}

export default function Footer() {
  const [state, setState] = useState<FooterState>({
    ready: false,
    bolehAbsensi: false,
    label: "Memeriksa jadwal",
    jamMasuk: "",
    jamPulang: "",
  })

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setState({
          ready: true,
          bolehAbsensi: false,
          label: "Tidak ada jadwal",
          jamMasuk: "",
          jamPulang: "",
        })
        return
      }

      try {
        const tanggal = getTodayDateString()

        const userSnap = await getDoc(doc(db, "users", user.uid))
        if (!userSnap.exists()) {
          setState({
            ready: true,
            bolehAbsensi: false,
            label: "Tidak ada jadwal",
            jamMasuk: "",
            jamPulang: "",
          })
          return
        }

        const userData = userSnap.data()

        const karyawanId =
          userData?.permissions?.karyawanId ||
          userData?.permissions?.karyawanid ||
          userData?.karyawanId ||
          ""

        const tokoId =
          userData?.permissions?.tokoId ||
          userData?.tokoId ||
          userData?.toko?.id ||
          ""

        if (!karyawanId) {
          setState({
            ready: true,
            bolehAbsensi: false,
            label: "Tidak ada jadwal",
            jamMasuk: "",
            jamPulang: "",
          })
          return
        }

        const [defaultSnap, tokoSnap, karyawanSnap] = await Promise.all([
          getDoc(doc(db, "pengaturan_jam_absensi", "default")),
          tokoId
            ? getDoc(doc(db, "pengaturan_jam_absensi", `toko_${tokoId}`))
            : Promise.resolve(null),
          getDoc(doc(db, "pengaturan_jam_absensi", `karyawan_${karyawanId}`)),
        ])

        const schedule = resolveFinalSchedule({
          dateString: tanggal,
          defaultData: defaultSnap.exists() ? defaultSnap.data() : null,
          tokoData: tokoSnap && tokoSnap.exists() ? tokoSnap.data() : null,
          karyawanData: karyawanSnap.exists() ? karyawanSnap.data() : null,
        })

        if (!schedule || !schedule.enabled) {
          setState({
            ready: true,
            bolehAbsensi: false,
            label: "Tidak ada jadwal",
            jamMasuk: "",
            jamPulang: "",
          })
          return
        }

        setState({
          ready: true,
          bolehAbsensi: true,
          label: "Konfirmasi Absensi",
          jamMasuk: schedule.jamMasuk,
          jamPulang: schedule.jamPulang,
        })
      } catch (error) {
        console.error("Gagal cek jadwal absensi footer:", error)

        setState({
          ready: true,
          bolehAbsensi: false,
          label: "Tidak ada jadwal",
          jamMasuk: "",
          jamPulang: "",
        })
      }
    })

    return () => unsub()
  }, [])

  if (!state.ready) return null

  const tombol = (
    <motion.div
      whileTap={state.bolehAbsensi ? { scale: 0.985 } : {}}
      className={`flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] shadow-sm ring-1 transition-all ${
        state.bolehAbsensi
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sky-500/15 ring-white/30"
          : "cursor-not-allowed bg-slate-100 text-slate-400 ring-slate-200"
      }`}
    >
      <Fingerprint size={17} strokeWidth={2.5} />
      <span>{state.label}</span>
      {state.bolehAbsensi && state.jamMasuk && state.jamPulang && (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] tracking-normal text-sky-50 ring-1 ring-white/15">
          {state.jamMasuk}-{state.jamPulang}
        </span>
      )}
    </motion.div>
  )

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 shadow-[0_-8px_28px_rgba(15,23,42,0.05)] backdrop-blur">
      <div className="mx-auto max-w-2xl px-3 py-2">
        {state.bolehAbsensi ? <Link href="/karyawan/absensi">{tombol}</Link> : tombol}

        <p className="mt-1 text-center text-[8px] font-bold uppercase tracking-[0.18em] text-slate-300">
          Mans-Cell Versi Beta © 2026
        </p>
      </div>
    </div>
  )
}
