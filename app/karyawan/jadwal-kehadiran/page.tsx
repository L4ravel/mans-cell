"use client"

/*
  Halaman ini menampilkan jadwal kehadiran karyawan berdasarkan prioritas karyawan, toko, lalu default sistem.
  Tampilan dibuat konsisten dengan halaman referensi, dan bagian sumber aktif sengaja dihapus agar lebih ringkas.
*/

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Calendar,
  CalendarDays,
  Cpu,
} from "lucide-react"
import { auth, db } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"

type DaySchedule = {
  enabled: boolean
  jamMasuk: string
  jamPulang: string
}

type JadwalForm = {
  weeklySchedule: Record<number, DaySchedule>
  monthlyOverrides: Record<string, Record<string, DaySchedule>>
}

type JadwalSource = "karyawan" | "toko" | "default"

type ResolvedJadwal = JadwalForm & {
  source: JadwalSource
  karyawanId: string | null
  namaKaryawan: string
  tokoId: string
  tokoNama: string
}

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

const createDefaultWeeklySchedule = (): Record<number, DaySchedule> => ({
  0: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  1: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  2: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  3: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  4: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  5: { enabled: false, jamMasuk: "07:30", jamPulang: "14:00" },
  6: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
})

const DEFAULT_FORM: JadwalForm = {
  weeklySchedule: createDefaultWeeklySchedule(),
  monthlyOverrides: {},
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> {
  const defaultWeekly = createDefaultWeeklySchedule()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...defaultWeekly }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]
      if (raw) {
        normalized[i] = {
          enabled:
            typeof raw.enabled === "boolean"
              ? raw.enabled
              : defaultWeekly[i].enabled,
          jamMasuk: raw.jamMasuk || defaultWeekly[i].jamMasuk,
          jamPulang: raw.jamPulang || defaultWeekly[i].jamPulang,
        }
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
    }
  }

  return migrated
}

function normalizeMonthlyOverrides(
  data: any
): Record<string, Record<string, DaySchedule>> {
  if (!data?.monthlyOverrides || typeof data.monthlyOverrides !== "object") {
    return {}
  }

  const result: Record<string, Record<string, DaySchedule>> = {}

  Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
    if (!dates || typeof dates !== "object") return

    result[monthKey] = {}

    Object.entries(dates as Record<string, any>).forEach(([dateKey, raw]) => {
      result[monthKey][dateKey] = {
        enabled: typeof raw?.enabled === "boolean" ? raw.enabled : true,
        jamMasuk: raw?.jamMasuk || "07:30",
        jamPulang: raw?.jamPulang || "14:00",
      }
    })
  })

  return result
}

function mergeSchedule(base: JadwalForm, data: any): JadwalForm {
  return {
    weeklySchedule: normalizeWeeklySchedule({
      ...base,
      ...data,
      weeklySchedule: data?.weeklySchedule || base.weeklySchedule,
    }),
    monthlyOverrides: {
      ...base.monthlyOverrides,
      ...normalizeMonthlyOverrides(data),
    },
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
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`

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

function createResolvedJadwal(
  form: JadwalForm,
  source: JadwalSource,
  karyawanId: string | null,
  namaKaryawan: string,
  tokoId: string,
  tokoNama: string
): ResolvedJadwal {
  return {
    ...form,
    source,
    karyawanId,
    namaKaryawan,
    tokoId,
    tokoNama,
  }
}

export default function JadwalKehadiranPage() {
  const [loading, setLoading] = useState(true)
  const [jadwal, setJadwal] = useState<ResolvedJadwal | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue())

  const monthDates = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth])

  const currentMonthOverrides = useMemo(
    () => jadwal?.monthlyOverrides?.[selectedMonth] || {},
    [jadwal, selectedMonth]
  )

  const totalJadwalKhusus = useMemo(
    () => Object.keys(currentMonthOverrides).length,
    [currentMonthOverrides]
  )

  const dayIndexesWithOverride = useMemo<Set<number>>(() => {
    const set = new Set<number>()

    for (const dateKey of Object.keys(currentMonthOverrides)) {
      const found = monthDates.find((d) => d.dateKey === dateKey)
      if (found) set.add(found.dayIndex)
    }

    return set
  }, [currentMonthOverrides, monthDates])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setJadwal(null)
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid))
        if (!userSnap.exists()) {
          setJadwal(null)
          setLoading(false)
          return
        }

        const raw = userSnap.data()
        const namaKaryawan = raw?.nama || ""
        const karyawanId = pickKaryawanId(raw)
        const tokoId =
          raw?.tokoId || raw?.permissions?.tokoId || raw?.toko?.id || ""
        const tokoNama =
          raw?.tokoNama || raw?.toko?.nama || raw?.permissions?.tokoNama || ""

        let mergedForm: JadwalForm = {
          weeklySchedule: createDefaultWeeklySchedule(),
          monthlyOverrides: {},
        }

        const defaultSnap = await getDoc(doc(db, "pengaturan_jam_absensi", "default"))
        if (defaultSnap.exists()) {
          mergedForm = mergeSchedule(mergedForm, defaultSnap.data())
        }

        if (tokoId) {
          const tokoSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `toko_${tokoId}`)
          )

          if (tokoSnap.exists()) {
            mergedForm = mergeSchedule(mergedForm, tokoSnap.data())
          }
        }

        if (karyawanId) {
          const karyawanSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `karyawan_${karyawanId}`)
          )

          if (karyawanSnap.exists()) {
            mergedForm = mergeSchedule(mergedForm, karyawanSnap.data())
            setJadwal(
              createResolvedJadwal(
                mergedForm,
                "karyawan",
                karyawanId,
                namaKaryawan,
                tokoId,
                tokoNama
              )
            )
            setLoading(false)
            return
          }
        }

        if (tokoId) {
          const tokoSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `toko_${tokoId}`)
          )

          if (tokoSnap.exists()) {
            setJadwal(
              createResolvedJadwal(
                mergedForm,
                "toko",
                karyawanId,
                namaKaryawan,
                tokoId,
                tokoNama
              )
            )
            setLoading(false)
            return
          }
        }

        setJadwal(
          createResolvedJadwal(
            mergedForm,
            "default",
            karyawanId,
            namaKaryawan,
            tokoId,
            tokoNama
          )
        )
      } catch (error) {
        console.error("Gagal memuat jadwal kehadiran:", error)
        setJadwal(null)
      } finally {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute left-0 top-1/4 h-96 w-96 rounded-full bg-cyan-200/30 blur-[120px]" />
        <div className="absolute right-0 bottom-1/3 h-96 w-96 rounded-full bg-emerald-200/30 blur-[120px]" />
      </div>

      <main className="relative z-10 w-full p-3 sm:p-4 lg:p-5 pb-28 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border-l-4 border-l-cyan-500 border border-slate-200 bg-white p-4 sm:p-5 sm:py-8 shadow-sm"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-200/50">
              <Calendar size={28} className="text-white sm:w-8 sm:h-8" strokeWidth={2.5} />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
                Jadwal Kehadiran
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
                Jadwal Mingguan · Jadwal Khusus Tanggal
              </p>
            </div>
          </div>

          <div className="absolute right-0 top-0 opacity-[0.03]">
            <Cpu size={160} strokeWidth={1} />
          </div>
        </motion.div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent"
            />
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Memuat jadwal kehadiran...
            </p>
          </div>
        )}

        {!loading && !jadwal && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Calendar size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">
              Jadwal tidak ditemukan
            </p>
            <p className="text-xs font-semibold text-slate-500 text-center">
              Pengaturan jadwal kehadiran belum tersedia untuk akun ini.
            </p>
          </div>
        )}

        {!loading && jadwal && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                  Profil Jadwal
                </p>

                <div className="space-y-3">
                  <InfoRow label="Nama" value={jadwal.namaKaryawan || "-"} />
                  <InfoRow label="Toko" value={jadwal.tokoNama || "-"} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                  Ringkasan Bulan
                </p>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Jadwal Khusus
                    </p>
                    <p className="text-lg font-black text-slate-800 mt-1">
                      {totalJadwalKhusus} tanggal
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                      Bulan
                    </label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-700 uppercase tracking-wide">
                  Jadwal Per Hari
                </p>
                {dayIndexesWithOverride.size > 0 && (
                  <p className="text-[10px] font-semibold text-slate-400">
                    Hari yang punya jadwal khusus disembunyikan
                  </p>
                )}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
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
                      if (dayIndexesWithOverride.has(index)) return null

                      const item = jadwal.weeklySchedule[index]

                      return (
                        <tr
                          key={hari}
                          className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-5 py-3 font-black text-slate-800">{hari}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                                item.enabled
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.enabled ? "Masuk" : "Libur"}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-semibold text-slate-700">
                            {item.enabled ? item.jamMasuk : "—"}
                          </td>
                          <td className="px-5 py-3 font-semibold text-slate-700">
                            {item.enabled ? item.jamPulang : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden divide-y divide-slate-100">
                {HARI.map((hari, index) => {
                  if (dayIndexesWithOverride.has(index)) return null

                  const item = jadwal.weeklySchedule[index]

                  return (
                    <div
                      key={hari}
                      className="px-4 py-3.5 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-black text-slate-800">{hari}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                          {item.enabled ? `${item.jamMasuk} – ${item.jamPulang}` : "Libur"}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black ${
                          item.enabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.enabled ? "Masuk" : "Libur"}
                      </span>
                    </div>
                  )
                })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="space-y-3"
            >
              <div className="rounded-xl border-l-4 border-l-blue-500 border border-slate-200 bg-white p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <CalendarDays size={16} className="text-blue-600" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                    Jadwal Khusus Per Tanggal
                  </h3>
                </div>             
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Jadwal Khusus · {selectedMonth}
                  </p>
                </div>

                {monthDates.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-xs font-semibold text-slate-500">Bulan tidak valid.</p>
                  </div>
                ) : totalJadwalKhusus === 0 ? (
                  <div className="p-8 flex flex-col items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <CalendarDays size={28} className="text-slate-300" strokeWidth={2} />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">
                      Tidak Ada Jadwal Khusus
                    </p>
                    <p className="text-xs font-semibold text-slate-500 text-center">
                      Bulan ini mengikuti jadwal harian biasa.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                          <tr>
                            {["Tanggal", "Hari", "Status", "Jam Masuk", "Jam Pulang"].map(
                              (h) => (
                                <th
                                  key={h}
                                  className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400"
                                >
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {monthDates
                            .filter((item) => currentMonthOverrides[item.dateKey])
                            .map((item) => {
                              const schedule = currentMonthOverrides[item.dateKey]

                              return (
                                <tr
                                  key={item.dateKey}
                                  className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors"
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
                                        schedule.enabled
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {schedule.enabled ? "Masuk" : "Libur"}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 font-semibold text-slate-700">
                                    {schedule.enabled ? schedule.jamMasuk : "—"}
                                  </td>
                                  <td className="px-5 py-3 font-semibold text-slate-700">
                                    {schedule.enabled ? schedule.jamPulang : "—"}
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>

                    <div className="sm:hidden divide-y divide-slate-100">
                      {monthDates
                        .filter((item) => currentMonthOverrides[item.dateKey])
                        .map((item) => {
                          const schedule = currentMonthOverrides[item.dateKey]

                          return (
                            <div
                              key={item.dateKey}
                              className="px-4 py-3.5 flex items-center justify-between gap-3"
                            >
                              <div>
                                <p className="text-sm font-black text-slate-800">
                                  {item.dayName}, {item.dayNumber}
                                </p>
                                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                  {item.dateKey}
                                </p>
                                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                  {schedule.enabled
                                    ? `${schedule.jamMasuk} – ${schedule.jamPulang}`
                                    : "Libur"}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-black ${
                                  schedule.enabled
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {schedule.enabled ? "Masuk" : "Libur"}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </main>
    </div>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="text-sm font-black text-slate-800 mt-1 break-words">
        {value || "-"}
      </p>
    </div>
  )
}