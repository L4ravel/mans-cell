// Dashboard absensi admin untuk menampilkan ringkasan absensi harian dan bulanan.
// Wajib absen hari ini = total karyawan aktif - karyawan tidak wajib absen - karyawan libur hari ini.

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore"
import {
  Users,
  CheckCircle2,
  Clock,
  HeartPulse,
  Hand,
  Timer,
  AlertCircle,
  BarChart2,
  Cpu,
  UserX,
  Store,
  type LucideIcon,
} from "lucide-react"
import { motion } from "framer-motion"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

type DailySummary = {
  id: string
  tanggal: string
  tahun?: number
  bulan?: number
  hadir?: number
  izin?: number
  sakit?: number
  terlambat?: number
  pulangCepat?: number
  kedatangan?: number
  alfa?: number
  jumlahKaryawan?: number
  jumlahWajibAbsen?: number
  totalKaryawan?: number
  wajibAbsen?: number
}

type ChartMode =
  | "hadir"
  | "alfa"
  | "izin"
  | "sakit"
  | "terlambat"
  | "pulangCepat"
  | "kedatangan"

type ChartModeConfig = {
  key: ChartMode
  label: string
  color: string
  icon: LucideIcon
}

type SummaryCardColor = keyof typeof colorConfig

type SummaryCardItem = {
  label: string
  value: number
  icon: LucideIcon
  color: SummaryCardColor
}

type KaryawanAktif = {
  id: string
  tokoId: string
  tokoNama: string
  aktif: boolean
}

type DaySchedule = {
  enabled?: boolean
  jamMasuk?: string
  jamPulang?: string
}

type PengaturanJamDoc = {
  scope?: "default" | "toko" | "karyawan"
  tokoId?: string
  karyawanId?: string
  weeklySchedule?: Record<string, DaySchedule> | Record<number, DaySchedule>
  monthlyOverrides?: Record<string, Record<string, DaySchedule>>
  hariLibur?: number[] | Record<string, number>
}

const CHART_MODES: ChartModeConfig[] = [
  { key: "hadir", label: "Hadir", color: "#10b981", icon: CheckCircle2 },
  { key: "alfa", label: "Alfa", color: "#ef4444", icon: UserX },
  { key: "izin", label: "Izin", color: "#3b82f6", icon: Hand },
  { key: "sakit", label: "Sakit", color: "#a855f7", icon: HeartPulse },
  { key: "terlambat", label: "Terlambat", color: "#f97316", icon: Clock },
  { key: "pulangCepat", label: "Pulang Cepat", color: "#eab308", icon: Timer },
  { key: "kedatangan", label: "Tidak Absen Pulang", color: "#64748b", icon: AlertCircle },
]

function toDateString(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getMonthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { start, end, lastDay }
}

function buildDailySummaryMap(
  records: DailySummary[],
  year: number,
  month: number
): Record<string, DailySummary> {
  const summaryMap: Record<string, DailySummary> = {}
  const { start, lastDay } = getMonthDateRange(year, month)

  for (let i = 1; i <= lastDay; i++) {
    const tanggal = `${start.slice(0, 8)}${String(i).padStart(2, "0")}`
    summaryMap[tanggal] = {
      id: tanggal,
      tanggal,
      tahun: year,
      bulan: month,
      hadir: 0,
      izin: 0,
      sakit: 0,
      terlambat: 0,
      pulangCepat: 0,
      kedatangan: 0,
      alfa: 0,
    }
  }

  records.forEach((item) => {
    if (!item.tanggal) return
    summaryMap[item.tanggal] = {
      id: item.id,
      tanggal: item.tanggal,
      tahun: item.tahun ?? year,
      bulan: item.bulan ?? month,
      hadir: item.hadir ?? 0,
      izin: item.izin ?? 0,
      sakit: item.sakit ?? 0,
      terlambat: item.terlambat ?? 0,
      pulangCepat: item.pulangCepat ?? 0,
      kedatangan: item.kedatangan ?? 0,
      alfa: item.alfa ?? 0,
      jumlahKaryawan: item.jumlahKaryawan ?? item.totalKaryawan,
      jumlahWajibAbsen: item.jumlahWajibAbsen ?? item.wajibAbsen,
      totalKaryawan: item.totalKaryawan,
      wajibAbsen: item.wajibAbsen,
    }
  })

  return summaryMap
}

function normalizeWeeklyEnabled(
  data: PengaturanJamDoc | undefined,
  dayIndex: number
) {
  if (!data) return null

  if (data.weeklySchedule && typeof data.weeklySchedule === "object") {
    const item =
      (data.weeklySchedule as any)?.[dayIndex] ??
      (data.weeklySchedule as any)?.[String(dayIndex)]

    if (item && typeof item.enabled === "boolean") {
      return item.enabled
    }
  }

  const hariLibur = Array.isArray(data.hariLibur)
    ? data.hariLibur
    : Object.values(data.hariLibur ?? {})

  if (Array.isArray(hariLibur) && hariLibur.length > 0) {
    return !hariLibur.includes(dayIndex)
  }

  return null
}

function normalizeMonthlyEnabled(
  data: PengaturanJamDoc | undefined,
  todayStr: string
) {
  if (!data?.monthlyOverrides || typeof data.monthlyOverrides !== "object") {
    return null
  }

  const [year, month] = todayStr.split("-")
  const monthKey = `${year}-${month}`
  const monthData = data.monthlyOverrides[monthKey]
  const dateData = monthData?.[todayStr]

  if (dateData && typeof dateData.enabled === "boolean") {
    return dateData.enabled
  }

  return null
}

function resolveIsMasukHariIni({
  defaultConfig,
  tokoConfig,
  karyawanConfig,
  todayStr,
  dayIndex,
}: {
  defaultConfig?: PengaturanJamDoc
  tokoConfig?: PengaturanJamDoc
  karyawanConfig?: PengaturanJamDoc
  todayStr: string
  dayIndex: number
}) {
  const karyawanMonthly = normalizeMonthlyEnabled(karyawanConfig, todayStr)
  if (karyawanMonthly !== null) return karyawanMonthly

  const karyawanWeekly = normalizeWeeklyEnabled(karyawanConfig, dayIndex)
  if (karyawanWeekly !== null) return karyawanWeekly

  const tokoMonthly = normalizeMonthlyEnabled(tokoConfig, todayStr)
  if (tokoMonthly !== null) return tokoMonthly

  const tokoWeekly = normalizeWeeklyEnabled(tokoConfig, dayIndex)
  if (tokoWeekly !== null) return tokoWeekly

  const defaultMonthly = normalizeMonthlyEnabled(defaultConfig, todayStr)
  if (defaultMonthly !== null) return defaultMonthly

  const defaultWeekly = normalizeWeeklyEnabled(defaultConfig, dayIndex)
  if (defaultWeekly !== null) return defaultWeekly

  return true
}

export default function DashboardAbsensiAdminPage() {
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const [tokoNama, setTokoNama] = useState("")
  const [jumlahKaryawan, setJumlahKaryawan] = useState(0)
  const [jumlahWajibAbsen, setJumlahWajibAbsen] = useState(0)
  const [dailyData, setDailyData] = useState<DailySummary[]>([])

  const [barChartMode, setBarChartMode] = useState<ChartMode>("hadir")
  const [lineChartMode, setLineChartMode] = useState<ChartMode>("hadir")

  const now = new Date()
  const bulan = now.getMonth() + 1
  const tahun = now.getFullYear()
  const todayStr = toDateString(now)
  const hariIniIndex = now.getDay()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) return

      setLoading(true)

      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid))
        if (userSnap.exists()) {
          const userData = userSnap.data()
          setTokoNama(userData?.tokoNama || userData?.toko?.nama || "Toko Admin")
        } else {
          setTokoNama("Toko Admin")
        }

        const totalKaryawanSnap = await getDoc(doc(db, "total_karyawan", "summary"))
        const totalKaryawanAktif = totalKaryawanSnap.exists()
          ? Number(totalKaryawanSnap.data()?.totalAktif ?? 0)
          : 0
        setJumlahKaryawan(totalKaryawanAktif)

        const [karyawanSnap, pengaturanSnap, tidakWajibSnap] = await Promise.all([
          getDocs(query(collection(db, "karyawan"), where("aktif", "==", true))),
          getDocs(collection(db, "pengaturan_jam_absensi")),
          getDocs(collection(db, "karyawan_tidak_wajib_absen")),
        ])

        const karyawanAktif: KaryawanAktif[] = karyawanSnap.docs.map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            tokoId: x?.tokoId || "",
            tokoNama: x?.tokoNama || "",
            aktif: x?.aktif ?? true,
          }
        })

        const tidakWajibSet = new Set<string>(
          tidakWajibSnap.docs
            .map((d) => {
              const x = d.data() as any
              return x?.karyawanId || ""
            })
            .filter(Boolean)
        )

        let defaultConfig: PengaturanJamDoc | undefined
        const tokoConfigMap = new Map<string, PengaturanJamDoc>()
        const karyawanConfigMap = new Map<string, PengaturanJamDoc>()

        pengaturanSnap.docs.forEach((d) => {
          const x = d.data() as PengaturanJamDoc

          if (x.scope === "default" || d.id === "default") {
            defaultConfig = x
            return
          }

          if (x.scope === "toko" && x.tokoId) {
            tokoConfigMap.set(x.tokoId, x)
            return
          }

          if (x.scope === "karyawan" && x.karyawanId) {
            karyawanConfigMap.set(x.karyawanId, x)
          }
        })

        let wajibAbsenHitung = 0

        for (const karyawan of karyawanAktif) {
          if (tidakWajibSet.has(karyawan.id)) continue

          const isMasukHariIni = resolveIsMasukHariIni({
            defaultConfig,
            tokoConfig: tokoConfigMap.get(karyawan.tokoId),
            karyawanConfig: karyawanConfigMap.get(karyawan.id),
            todayStr,
            dayIndex: hariIniIndex,
          })

          if (isMasukHariIni) {
            wajibAbsenHitung += 1
          }
        }

        setJumlahWajibAbsen(wajibAbsenHitung)

        const { start, end } = getMonthDateRange(tahun, bulan)
        const summarySnap = await getDocs(
          query(
            collection(db, "absensi_admin_summary_day"),
            where("tanggal", ">=", start),
            where("tanggal", "<=", end)
          )
        )

        const records: DailySummary[] = summarySnap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            tanggal: data.tanggal || "",
            tahun: data.tahun,
            bulan: data.bulan,
            hadir: Number(data.hadir ?? 0),
            izin: Number(data.izin ?? 0),
            sakit: Number(data.sakit ?? 0),
            terlambat: Number(data.terlambat ?? 0),
            pulangCepat: Number(data.pulangCepat ?? 0),
            kedatangan: Number(data.kedatangan ?? 0),
            alfa: Number(data.alfa ?? 0),
            jumlahKaryawan:
              data.jumlahKaryawan != null ? Number(data.jumlahKaryawan) : undefined,
            jumlahWajibAbsen:
              data.jumlahWajibAbsen != null ? Number(data.jumlahWajibAbsen) : undefined,
            totalKaryawan:
              data.totalKaryawan != null ? Number(data.totalKaryawan) : undefined,
            wajibAbsen:
              data.wajibAbsen != null ? Number(data.wajibAbsen) : undefined,
          }
        })

        const summaryMap = buildDailySummaryMap(records, tahun, bulan)
        const summaryList = Object.values(summaryMap).sort((a, b) =>
          a.tanggal.localeCompare(b.tanggal)
        )
        setDailyData(summaryList)
      } catch (err) {
        console.error("Gagal load dashboard absensi:", err)
        setDailyData([])
        setJumlahKaryawan(0)
        setJumlahWajibAbsen(0)
        setTokoNama("")
      } finally {
        setLoading(false)
      }
    }

    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchData()
    })

    return () => unsub()
  }, [bulan, tahun, todayStr, hariIniIndex])

  const todayData = useMemo(
    () => dailyData.find((d) => d.tanggal === todayStr) ?? null,
    [dailyData, todayStr]
  )

  const hadirValue = todayData?.hadir ?? 0

  const wajibAbsenHariIni =
    jumlahWajibAbsen ||
    todayData?.jumlahWajibAbsen ||
    todayData?.wajibAbsen ||
    0

  const alfaValue = todayData
    ? todayData.alfa ??
      Math.max(
        wajibAbsenHariIni -
          ((todayData.hadir ?? 0) + (todayData.izin ?? 0) + (todayData.sakit ?? 0)),
        0
      )
    : 0

  const hadirPct =
    wajibAbsenHariIni > 0
      ? ((hadirValue / wajibAbsenHariIni) * 100).toFixed(1)
      : "0.0"

  const daysInMonth = new Date(tahun, bulan, 0).getDate()

  const getValueForMode = (d: DailySummary | undefined, mode: ChartMode): number => {
    if (!d) return 0
    if (mode === "alfa") {
      return d.alfa ??
        Math.max(
          wajibAbsenHariIni - ((d.hadir ?? 0) + (d.izin ?? 0) + (d.sakit ?? 0)),
          0
        )
    }
    return Number(d[mode] ?? 0)
  }

  const barChartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, "0")
    const fullDate = `${tahun}-${String(bulan).padStart(2, "0")}-${day}`
    const found = dailyData.find((d) => d.tanggal === fullDate)
    return {
      tanggal: day,
      value: getValueForMode(found, barChartMode),
    }
  })

  const monthlyLineData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const mm = String(month).padStart(2, "0")
    const monthData =
      month === bulan
        ? dailyData.filter((d) => d.tanggal.startsWith(`${tahun}-${mm}`))
        : []

    const total =
      lineChartMode === "alfa"
        ? monthData.reduce((sum, d) => sum + getValueForMode(d, "alfa"), 0)
        : monthData.reduce((sum, d) => sum + Number(d[lineChartMode] ?? 0), 0)

    return {
      bulan: new Date(tahun, i).toLocaleString("id-ID", { month: "short" }),
      value: total,
    }
  })

  const pieChartData = todayData
    ? [
        { name: "Hadir", value: hadirValue },
        { name: "Tidak Hadir", value: Math.max(wajibAbsenHariIni - hadirValue, 0) },
      ]
    : []

  const PIE_COLORS = ["#10b981", "#f43f5e"]

  const summaryCards: SummaryCardItem[] = [
    { label: "Total Karyawan", value: jumlahKaryawan, icon: Users, color: "blue" },
    { label: "Wajib Absen Hari Ini", value: wajibAbsenHariIni, icon: Store, color: "blue" },
    { label: "Hadir Hari Ini", value: hadirValue, icon: CheckCircle2, color: "green" },
    { label: "Izin Hari Ini", value: todayData?.izin ?? 0, icon: Hand, color: "blue" },
    { label: "Sakit Hari Ini", value: todayData?.sakit ?? 0, icon: HeartPulse, color: "purple" },
    { label: "Alfa", value: alfaValue, icon: UserX, color: "red" },
    { label: "Terlambat", value: todayData?.terlambat ?? 0, icon: Clock, color: "orange" },
    { label: "Pulang Cepat", value: todayData?.pulangCepat ?? 0, icon: Timer, color: "yellow" },
    { label: "Tidak Absen Pulang", value: todayData?.kedatangan ?? 0, icon: AlertCircle, color: "slate" },
  ]

  const cycleBarChartMode = () => {
    const currentIdx = CHART_MODES.findIndex((m) => m.key === barChartMode)
    setBarChartMode(CHART_MODES[(currentIdx + 1) % CHART_MODES.length].key)
  }

  const cycleLineChartMode = () => {
    const currentIdx = CHART_MODES.findIndex((m) => m.key === lineChartMode)
    setLineChartMode(CHART_MODES[(currentIdx + 1) % CHART_MODES.length].key)
  }

  const barModeConfig = CHART_MODES.find((m) => m.key === barChartMode)!
  const lineModeConfig = CHART_MODES.find((m) => m.key === lineChartMode)!

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 shadow-lg shadow-blue-200/50 sm:h-14 sm:w-14">
    <BarChart2 size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
  </div>

  <div className="min-w-0 self-center sm:self-auto">
    <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
      Dashboard Absensi
    </h1>
    <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
      {tokoNama || "Toko Admin"} •{" "}
      {now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
    </p>
  </div>
</div>
        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-blue-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {summaryCards.map((card, idx) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: idx * 0.05 }}
              >
                <SummaryCard {...card} />
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="relative overflow-hidden rounded-xl border-l-4 border-l-emerald-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <CheckCircle2 size={16} className="text-emerald-600" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Kehadiran Hari Ini
                  </h2>
                  <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                    {now.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {pieChartData.length > 0 ? (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <text
                        x="50%"
                        y="46%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                          fontSize: 24,
                          fontWeight: 900,
                          fill: "#10b981",
                          letterSpacing: "-0.5px",
                        }}
                      >
                        {hadirPct}%
                      </text>
                      <g>
                        <rect
                          x="50%"
                          y="48%"
                          width="70"
                          height="20"
                          rx="10"
                          transform="translate(-35, 0)"
                          fill="#ecfdf5"
                        />
                        <text
                          x="50%"
                          y="55%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            fill: "#059669",
                            letterSpacing: "0.5px",
                          }}
                        >
                          KEHADIRAN
                        </text>
                      </g>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={3}
                        cornerRadius={5}
                        stroke="none"
                      >
                        {pieChartData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                        formatter={(value, name) => [`${Number(value)} karyawan`, String(name)]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: "11px", fontWeight: 700, paddingTop: "12px" }}
                        formatter={(value: string) => {
                          const item = pieChartData.find((d) => d.name === value)
                          const val = item?.value ?? 0
                          const pct =
                            wajibAbsenHariIni > 0
                              ? ((val / wajibAbsenHariIni) * 100).toFixed(1)
                              : "0.0"
                          return `${value}: ${val} (${pct}%)`
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[260px] items-center justify-center">
                  <p className="text-xs text-slate-400 font-semibold">
                    Belum ada data hari ini
                  </p>
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="relative overflow-hidden lg:col-span-3 rounded-xl border-l-4 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              style={{ borderLeftColor: barModeConfig.color }}
              onClick={cycleBarChartMode}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${barModeConfig.color}20` }}
                  >
                    <barModeConfig.icon
                      size={16}
                      style={{ color: barModeConfig.color }}
                      strokeWidth={2.5}
                    />
                  </div>
                  <div>
                    <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide">
                      {barModeConfig.label} Harian
                    </h2>
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                      {now.toLocaleString("id-ID", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Klik untuk ganti
                  </p>
                </div>
              </div>

              <div className="h-[150px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barChartData}
                    barCategoryGap="20%"
                    margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="tanggal"
                      interval={isMobile ? 2 : 0}
                      tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                      tickMargin={6}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                      cursor={{ fill: "#f1f5f9" }}
                      formatter={(value) => [`${value} karyawan`, barModeConfig.label]}
                    />
                    <Bar dataKey="value" fill={barModeConfig.color} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="relative overflow-hidden rounded-xl border-l-4 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            style={{ borderLeftColor: lineModeConfig.color }}
            onClick={cycleLineChartMode}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${lineModeConfig.color}20` }}
                >
                  <lineModeConfig.icon
                    size={16}
                    style={{ color: lineModeConfig.color }}
                    strokeWidth={2.5}
                  />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Tren {lineModeConfig.label} Bulanan
                  </h2>
                  <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                    Januari — Desember {tahun}
                  </p>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Klik untuk ganti
                </p>
              </div>
            </div>

            <div className="h-[150px] sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyLineData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <XAxis
                    dataKey="bulan"
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                    formatter={(value) => [`${value} karyawan`, `Total ${lineModeConfig.label}`]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={lineModeConfig.color}
                    strokeWidth={3}
                    dot={{ r: 5, fill: lineModeConfig.color, strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{
                      r: 7,
                      fill: lineModeConfig.color,
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

const colorConfig = {
  green: {
    border: "border-l-green-500",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-600",
    watermark: "text-green-500/5",
  },
  blue: {
    border: "border-l-blue-500",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-600",
    watermark: "text-blue-500/5",
  },
  red: {
    border: "border-l-red-500",
    iconBg: "bg-red-500/10",
    iconColor: "text-red-600",
    watermark: "text-red-500/5",
  },
  orange: {
    border: "border-l-orange-500",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-600",
    watermark: "text-orange-500/5",
  },
  yellow: {
    border: "border-l-yellow-500",
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-600",
    watermark: "text-yellow-500/5",
  },
  slate: {
    border: "border-l-slate-400",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    watermark: "text-slate-400/5",
  },
  purple: {
    border: "border-l-purple-500",
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-600",
    watermark: "text-purple-500/5",
  },
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: LucideIcon
  color: SummaryCardColor
}) {
  const c = colorConfig[color]

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-l-4 ${c.border} border-t border-r border-b border-slate-200 bg-white p-3 sm:p-4 hover:shadow-md transition-all duration-300 group`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className={`flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl ${c.iconBg} group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon size={17} className={`sm:w-[19px] sm:h-[19px] ${c.iconColor}`} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-tight truncate">
            {label}
          </p>
          <p className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">
            {value}
          </p>
        </div>
      </div>
      <div className="absolute -right-4 -bottom-4 pointer-events-none">
        <Icon size={68} className={c.watermark} strokeWidth={1.5} />
      </div>
    </div>
  )
}