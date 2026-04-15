// Halaman admin untuk mengatur jam absensi default, per toko, dan per karyawan.
// Karyawan yang ada di koleksi tidak_wajib_absensi dengan status aktif disembunyikan dari pemilihan individu.

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore"
import { motion } from "framer-motion"
import {
  Clock3,
  Store,
  UserCog,
  Cpu,
  Search,
  ChevronDown,
  Save,
  Loader2,
  CalendarClock,
  CalendarDays,
  RotateCcw,
} from "lucide-react"

type Karyawan = {
  id: string // karyawanId
  uid: string // users doc id / uid
  nama: string
  tokoId: string
  tokoNama: string
  email?: string
}

type KaryawanActiveItem = {
  karyawanId: string
  nama: string
  tokoId: string
  tokoNama: string
}

type TokoItem = {
  id: string
  nama: string
}

type DaySchedule = {
  enabled: boolean
  jamMasuk: string
  jamPulang: string
}

type JadwalForm = {
  weeklySchedule: Record<number, DaySchedule>
  monthlyOverrides: Record<string, Record<string, DaySchedule>>
}

type TouchedWeeklyMap = Record<number, boolean>
type TouchedMonthlyMap = Record<string, Record<string, boolean>>

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

function cloneDefaultForm(): JadwalForm {
  return {
    weeklySchedule: createDefaultWeeklySchedule(),
    monthlyOverrides: {},
  }
}

function createEmptyTouchedWeekly(): TouchedWeeklyMap {
  return {
    0: false,
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
  }
}

function getCurrentMonthValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function createDefaultDateSchedule(fromWeekly?: DaySchedule): DaySchedule {
  return {
    enabled: fromWeekly?.enabled ?? true,
    jamMasuk: fromWeekly?.jamMasuk ?? "07:30",
    jamPulang: fromWeekly?.jamPulang ?? "14:00",
  }
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

function getHariLiburFromWeeklySchedule(
  weeklySchedule: Record<number, DaySchedule>
): number[] {
  return Array.from({ length: 7 }, (_, index) => index).filter(
    (dayIndex) => !weeklySchedule[dayIndex]?.enabled
  )
}

function mergeFormWithData(baseForm: JadwalForm, data: any): JadwalForm {
  const nextForm: JadwalForm = {
    weeklySchedule: { ...baseForm.weeklySchedule },
    monthlyOverrides: { ...baseForm.monthlyOverrides },
  }

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]
      if (!raw) continue

      nextForm.weeklySchedule[i] = {
        enabled:
          typeof raw.enabled === "boolean"
            ? raw.enabled
            : nextForm.weeklySchedule[i]?.enabled ?? true,
        jamMasuk: raw.jamMasuk || nextForm.weeklySchedule[i]?.jamMasuk || "07:30",
        jamPulang: raw.jamPulang || nextForm.weeklySchedule[i]?.jamPulang || "14:00",
      }
    }
  } else if (
    data &&
    (typeof data?.jamMasuk === "string" ||
      typeof data?.jamPulang === "string" ||
      Array.isArray(data?.hariLibur))
  ) {
    const legacyWeekly = normalizeWeeklySchedule(data)
    for (let i = 0; i < 7; i++) {
      nextForm.weeklySchedule[i] = legacyWeekly[i]
    }
  }

  if (data?.monthlyOverrides && typeof data.monthlyOverrides === "object") {
    Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
      if (!dates || typeof dates !== "object") return

      nextForm.monthlyOverrides[monthKey] = {
        ...(nextForm.monthlyOverrides[monthKey] || {}),
      }

      Object.entries(dates as Record<string, any>).forEach(([dateKey, raw]) => {
        const fallbackDayIndex = new Date(dateKey).getDay()
        const fallbackBase =
          nextForm.monthlyOverrides[monthKey]?.[dateKey] ||
          createDefaultDateSchedule(nextForm.weeklySchedule[fallbackDayIndex])

        nextForm.monthlyOverrides[monthKey][dateKey] = {
          enabled:
            typeof raw?.enabled === "boolean" ? raw.enabled : fallbackBase.enabled,
          jamMasuk: raw?.jamMasuk || fallbackBase.jamMasuk,
          jamPulang: raw?.jamPulang || fallbackBase.jamPulang,
        }
      })
    })
  }

  return nextForm
}

function getTouchedWeeklyFromData(data: any): TouchedWeeklyMap {
  const touched = createEmptyTouchedWeekly()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]
      touched[i] = !!raw
    }
    return touched
  }

  if (
    data &&
    (typeof data?.jamMasuk === "string" ||
      typeof data?.jamPulang === "string" ||
      Array.isArray(data?.hariLibur))
  ) {
    for (let i = 0; i < 7; i++) touched[i] = true
  }

  return touched
}

function getTouchedMonthlyFromData(data: any): TouchedMonthlyMap {
  const touched: TouchedMonthlyMap = {}

  if (!data?.monthlyOverrides || typeof data.monthlyOverrides !== "object") {
    return touched
  }

  Object.entries(data.monthlyOverrides).forEach(([monthKey, dates]) => {
    if (!dates || typeof dates !== "object") return

    touched[monthKey] = {}
    Object.keys(dates as Record<string, any>).forEach((dateKey) => {
      touched[monthKey][dateKey] = true
    })
  })

  return touched
}

function getWeeklyCardClass(enabled: boolean, touched: boolean) {
  if (!enabled) return "border-slate-200 bg-slate-50"
  if (touched) return "border-emerald-200 bg-emerald-50/60"
  return "border-cyan-200 bg-cyan-50/40"
}

function getDateCardClass(enabled: boolean, touched: boolean) {
  if (!enabled) return "border-slate-200 bg-slate-50"
  if (touched) return "border-emerald-200 bg-emerald-50/60"
  return "border-cyan-200 bg-cyan-50/40"
}

function getStatusText(enabled: boolean, touched: boolean) {
  if (!enabled) return "Libur"
  if (touched) return "Diatur di level ini"
  return "Mengikuti fallback"
}

function getStatusTextClass(enabled: boolean, touched: boolean) {
  if (!enabled) return "text-slate-400"
  if (touched) return "text-emerald-500"
  return "text-cyan-500"
}

function getFieldClass(enabled: boolean, touched: boolean, disabled: boolean) {
  if (disabled) {
    return "w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl bg-slate-100 text-slate-400 font-semibold text-sm disabled:cursor-not-allowed"
  }

  if (touched) {
    return "w-full px-3 py-2.5 border-2 border-emerald-200 rounded-xl bg-white text-slate-800 font-semibold text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-all"
  }

  if (enabled) {
    return "w-full px-3 py-2.5 border-2 border-cyan-200 rounded-xl bg-white text-slate-800 font-semibold text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
  }

  return "w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl bg-white text-slate-800 font-semibold text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
}

export default function PengaturanJamPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [karyawanActiveLoading, setKaryawanActiveLoading] = useState(false)

  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([])
  const [tokoList, setTokoList] = useState<TokoItem[]>([])
  const [karyawanActiveList, setKaryawanActiveList] = useState<KaryawanActiveItem[]>([])
  const [tidakWajibAbsensiIds, setTidakWajibAbsensiIds] = useState<string[]>([])

  const [mode, setMode] = useState<"default" | "toko" | "karyawan">("default")
  const [selectedTokoId, setSelectedTokoId] = useState("")
  const [selectedKaryawanId, setSelectedKaryawanId] = useState("")
  const [search, setSearch] = useState("")

  const [karyawanTab, setKaryawanTab] = useState<"hari" | "tanggal">("hari")
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue())

  const [form, setForm] = useState<JadwalForm>(cloneDefaultForm())
  const [weeklyTouched, setWeeklyTouched] = useState<TouchedWeeklyMap>(
    createEmptyTouchedWeekly()
  )
  const [monthlyTouched, setMonthlyTouched] = useState<TouchedMonthlyMap>({})

  const selectedToko = useMemo(
    () => tokoList.find((t) => t.id === selectedTokoId) || null,
    [tokoList, selectedTokoId]
  )

  const selectedKaryawan = useMemo(
    () => karyawanList.find((k) => k.id === selectedKaryawanId) || null,
    [karyawanList, selectedKaryawanId]
  )

  const filteredKaryawan = useMemo(() => {
    const keyword = search.toLowerCase()
    return karyawanList.filter((k) => {
      if (tidakWajibAbsensiIds.includes(k.id)) return false
      return k.nama.toLowerCase().includes(keyword)
    })
  }, [karyawanList, search, tidakWajibAbsensiIds])

  const filteredKaryawanActiveList = useMemo(() => {
    const keyword = search.toLowerCase()
    return karyawanActiveList.filter((item) => {
      if (tidakWajibAbsensiIds.includes(item.karyawanId)) return false
      const matchToko = selectedTokoId ? item.tokoId === selectedTokoId : true
      const matchNama = item.nama.toLowerCase().includes(keyword)
      return matchToko && matchNama
    })
  }, [karyawanActiveList, selectedTokoId, search, tidakWajibAbsensiIds])

  const monthDates = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth])

  const currentMonthOverrides = useMemo(() => {
    return form.monthlyOverrides[selectedMonth] || {}
  }, [form.monthlyOverrides, selectedMonth])

  const currentMonthTouched = useMemo(() => {
    return monthlyTouched[selectedMonth] || {}
  }, [monthlyTouched, selectedMonth])

  const updateWeeklySchedule = (
    dayIndex: number,
    key: keyof DaySchedule,
    value: boolean | string
  ) => {
    setForm((prev) => ({
      ...prev,
      weeklySchedule: {
        ...prev.weeklySchedule,
        [dayIndex]: {
          ...prev.weeklySchedule[dayIndex],
          [key]: value,
        },
      },
    }))

    setWeeklyTouched((prev) => ({
      ...prev,
      [dayIndex]: true,
    }))
  }

  const updateDateSchedule = (
    dateKey: string,
    key: keyof DaySchedule,
    value: boolean | string
  ) => {
    setForm((prev) => {
      const fallbackDayIndex = new Date(dateKey).getDay()
      const base =
        prev.monthlyOverrides[selectedMonth]?.[dateKey] ||
        createDefaultDateSchedule(prev.weeklySchedule[fallbackDayIndex])

      return {
        ...prev,
        monthlyOverrides: {
          ...prev.monthlyOverrides,
          [selectedMonth]: {
            ...(prev.monthlyOverrides[selectedMonth] || {}),
            [dateKey]: {
              ...base,
              [key]: value,
            },
          },
        },
      }
    })

    setMonthlyTouched((prev) => ({
      ...prev,
      [selectedMonth]: {
        ...(prev[selectedMonth] || {}),
        [dateKey]: true,
      },
    }))
  }

  const fetchTokoList = async () => {
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: TokoItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data()
        return {
          id: docSnap.id,
          nama: d.nama || d.kode || docSnap.id,
        }
      })

      setTokoList(list)
    } catch (error) {
      console.error("Gagal fetch toko:", error)
      setTokoList([])
    }
  }

  const fetchTidakWajibAbsensiIds = async () => {
  try {
    const snap = await getDocs(collection(db, "karyawan_tidak_wajib_absen"))

    const ids = snap.docs
      .map((docSnap) => {
        const d = docSnap.data() as any
        return d?.karyawanId || ""
      })
      .filter(Boolean)

    setTidakWajibAbsensiIds(Array.from(new Set(ids)))
  } catch (error) {
    console.error("Gagal fetch tidak wajib absensi:", error)
    setTidakWajibAbsensiIds([])
  }
}

  const fetchKaryawanByToko = async (tokoId?: string) => {
    try {
      if (!tokoId) {
        setKaryawanList([])
        return
      }

      const tokoNama = tokoList.find((t) => t.id === tokoId)?.nama || ""

      let snap
      try {
        const qRef = query(
          collection(db, "users"),
          where("tokoId", "==", tokoId),
          where("role", "==", "karyawan"),
          orderBy("nama")
        )
        snap = await getDocs(qRef)
      } catch {
        const fallbackQRef = query(
          collection(db, "users"),
          where("tokoId", "==", tokoId),
          orderBy("nama")
        )
        snap = await getDocs(fallbackQRef)
      }

      const list: Karyawan[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data()

          const isKaryawan =
            d.role === "karyawan" ||
            (Array.isArray(d.roles) && d.roles.includes("karyawan"))

          const karyawanId =
            d.karyawanId ||
            d.permissions?.karyawanId ||
            d.permissions?.karyawanid ||
            ""

          const userTokoId =
            d.tokoId ||
            d.permissions?.tokoId ||
            d.toko?.id ||
            ""

          const userTokoNama =
            d.tokoNama ||
            d.toko?.nama ||
            tokoNama

          if (!isKaryawan || !karyawanId) return null

          return {
            id: karyawanId,
            uid: d.uid || docSnap.id,
            nama: d.nama || "",
            tokoId: userTokoId,
            tokoNama: userTokoNama,
            email: d.email || "",
          }
        })
        .filter(Boolean) as Karyawan[]

      setKaryawanList(list)
    } catch (error) {
      console.error("Gagal fetch karyawan by toko:", error)
      setKaryawanList([])
    }
  }

  const fetchKaryawanActiveList = async () => {
    setKaryawanActiveLoading(true)
    try {
      const qRef = query(
        collection(db, "pengaturan_jam_absensi"),
        where("scope", "==", "karyawan"),
        orderBy("nama")
      )
      const snap = await getDocs(qRef)

      const list: KaryawanActiveItem[] = snap.docs
        .map((docSnap) => {
          const d = docSnap.data()
          return {
            karyawanId: d.karyawanId || "",
            nama: d.nama || "",
            tokoId: d.tokoId || "",
            tokoNama: d.tokoNama || "",
          }
        })
        .filter((item) => item.karyawanId)

      setKaryawanActiveList(list)
    } catch (error) {
      console.error("Gagal fetch karyawan aktif:", error)
      setKaryawanActiveList([])
    } finally {
      setKaryawanActiveLoading(false)
    }
  }

  const loadTargetData = async () => {
    setLoading(true)
    try {
      const defaultSnap = await getDoc(doc(db, "pengaturan_jam_absensi", "default"))
      const defaultData = defaultSnap.exists() ? defaultSnap.data() : null

      let resolvedForm = cloneDefaultForm()
      let touchedWeeklyMap = createEmptyTouchedWeekly()
      let touchedMonthlyMap: TouchedMonthlyMap = {}

      if (defaultData) {
        resolvedForm = mergeFormWithData(resolvedForm, defaultData)
      }

      if (mode === "default") {
        if (defaultData) {
          touchedWeeklyMap = getTouchedWeeklyFromData(defaultData)
          touchedMonthlyMap = getTouchedMonthlyFromData(defaultData)
        }

        setForm(resolvedForm)
        setWeeklyTouched(touchedWeeklyMap)
        setMonthlyTouched(touchedMonthlyMap)
        return
      }

      if (!selectedTokoId) {
        setForm(resolvedForm)
        setWeeklyTouched(createEmptyTouchedWeekly())
        setMonthlyTouched({})
        setLoading(false)
        return
      }

      const tokoSnap = await getDoc(
        doc(db, "pengaturan_jam_absensi", `toko_${selectedTokoId}`)
      )
      const tokoData = tokoSnap.exists() ? tokoSnap.data() : null

      if (tokoData) {
        resolvedForm = mergeFormWithData(resolvedForm, tokoData)
      }

      if (mode === "toko") {
        if (tokoData) {
          touchedWeeklyMap = getTouchedWeeklyFromData(tokoData)
          touchedMonthlyMap = getTouchedMonthlyFromData(tokoData)
        }

        setForm(resolvedForm)
        setWeeklyTouched(touchedWeeklyMap)
        setMonthlyTouched(touchedMonthlyMap)
        return
      }

      if (!selectedKaryawanId) {
        setForm(resolvedForm)
        setWeeklyTouched(createEmptyTouchedWeekly())
        setMonthlyTouched({})
        setLoading(false)
        return
      }

      const karyawanSnap = await getDoc(
        doc(db, "pengaturan_jam_absensi", `karyawan_${selectedKaryawanId}`)
      )
      const karyawanData = karyawanSnap.exists() ? karyawanSnap.data() : null

      if (karyawanData) {
        resolvedForm = mergeFormWithData(resolvedForm, karyawanData)
        touchedWeeklyMap = getTouchedWeeklyFromData(karyawanData)
        touchedMonthlyMap = getTouchedMonthlyFromData(karyawanData)
      }

      setForm(resolvedForm)
      setWeeklyTouched(touchedWeeklyMap)
      setMonthlyTouched(touchedMonthlyMap)
    } catch (error) {
      console.error("Gagal load pengaturan jam:", error)
      setForm(cloneDefaultForm())
      setWeeklyTouched(createEmptyTouchedWeekly())
      setMonthlyTouched({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return
      await Promise.all([
        fetchTokoList(),
        fetchKaryawanActiveList(),
        fetchTidakWajibAbsensiIds(),
      ])
      await loadTargetData()
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (mode !== "karyawan") return

    if (!selectedTokoId) {
      setKaryawanList([])
      return
    }

    fetchKaryawanByToko(selectedTokoId)
  }, [mode, selectedTokoId, tokoList])

  useEffect(() => {
    loadTargetData()
  }, [mode, selectedTokoId, selectedKaryawanId])

  useEffect(() => {
    if (
      selectedKaryawanId &&
      tidakWajibAbsensiIds.includes(selectedKaryawanId)
    ) {
      setSelectedKaryawanId("")
    }
  }, [selectedKaryawanId, tidakWajibAbsensiIds])

  const handleSelectActiveKaryawan = async (item: KaryawanActiveItem) => {
    if (tidakWajibAbsensiIds.includes(item.karyawanId)) return

    setMode("karyawan")
    setSelectedTokoId(item.tokoId)
    setSelectedKaryawanId(item.karyawanId)
    setSearch("")
    await fetchKaryawanByToko(item.tokoId)
  }

  const handleResetKaryawan = async () => {
    if (!selectedKaryawanId || !selectedKaryawan) return

    const confirmed = window.confirm(
      `Reset pengaturan karyawan untuk ${selectedKaryawan.nama}?\n\nSetelah di-reset, karyawan ini akan mengikuti default toko. Jika toko tidak punya pengaturan, maka akan mengikuti default sistem.`
    )

    if (!confirmed) return

    setSaving(true)
    try {
      await deleteDoc(
        doc(db, "pengaturan_jam_absensi", `karyawan_${selectedKaryawanId}`)
      )

      await fetchKaryawanActiveList()
      setSelectedKaryawanId("")
      setForm(cloneDefaultForm())
      setWeeklyTouched(createEmptyTouchedWeekly())
      setMonthlyTouched({})

      alert(
        "Pengaturan karyawan berhasil di-reset. Sekarang karyawan akan mengikuti default toko atau default sistem."
      )
    } catch (error) {
      console.error("Gagal reset pengaturan karyawan:", error)
      alert("Gagal reset pengaturan karyawan.")
    } finally {
      setSaving(false)
    }
  }

  const handleSimpan = async () => {
    setSaving(true)
    try {
      let refId = "default"
      let payload: Record<string, any> = {
        scope: "default",
      }

      if (mode === "toko") {
        if (!selectedTokoId || !selectedToko) {
          setSaving(false)
          return
        }

        refId = `toko_${selectedTokoId}`
        payload = {
          scope: "toko",
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
        }
      }

      if (mode === "karyawan") {
        if (!selectedKaryawanId || !selectedKaryawan) {
          setSaving(false)
          return
        }

        refId = `karyawan_${selectedKaryawanId}`
        payload = {
          scope: "karyawan",
          karyawanId: selectedKaryawan.id,
          nama: selectedKaryawan.nama,
          tokoId: selectedKaryawan.tokoId,
          tokoNama: selectedKaryawan.tokoNama,
          uid: selectedKaryawan.uid,
          email: selectedKaryawan.email || null,
        }
      }

      await setDoc(
        doc(db, "pengaturan_jam_absensi", refId),
        {
          ...payload,
          weeklySchedule: form.weeklySchedule,
          monthlyOverrides: form.monthlyOverrides,
          hariLibur: getHariLiburFromWeeklySchedule(form.weeklySchedule),
          jamMasuk: form.weeklySchedule[1]?.jamMasuk || "07:30",
          jamPulang: form.weeklySchedule[1]?.jamPulang || "14:00",
          updatedAt: new Date(),
        },
        { merge: true }
      )

      if (mode === "karyawan") {
        await fetchKaryawanActiveList()
      }

      alert("Pengaturan jam absensi berhasil disimpan.")
    } catch (error) {
      console.error("Gagal simpan:", error)
      alert("Gagal menyimpan pengaturan jam absensi.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900 overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-cyan-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-200/50 sm:h-14 sm:w-14">
    <Clock3 size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
  </div>

  <div className="min-w-0 self-center sm:self-auto">
    <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
      Pengaturan Jam Absensi
    </h1>
    <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
      Default · Per Toko · Per Karyawan
    </p>
  </div>
</div>
        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Level Pengaturan
            </p>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => {
                  setMode("default")
                  setSelectedKaryawanId("")
                }}
                className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all ${
                  mode === "default"
                    ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-200/50"
                    : "border-2 border-slate-200 bg-white text-slate-700"
                }`}
              >
                <CalendarClock size={16} strokeWidth={2.5} />
                Default Sistem
              </button>

              <button
                onClick={() => {
                  setMode("toko")
                  setSelectedKaryawanId("")
                }}
                className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all ${
                  mode === "toko"
                    ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-200/50"
                    : "border-2 border-slate-200 bg-white text-slate-700"
                }`}
              >
                <Store size={16} strokeWidth={2.5} />
                Per Toko
              </button>

              <button
                onClick={() => setMode("karyawan")}
                className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all ${
                  mode === "karyawan"
                    ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-200/50"
                    : "border-2 border-slate-200 bg-white text-slate-700"
                }`}
              >
                <UserCog size={16} strokeWidth={2.5} />
                Per Karyawan
              </button>
            </div>

            {mode === "karyawan" && (
              <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700">
                    Karyawan Aktif
                  </p>
                  {karyawanActiveLoading && (
                    <Loader2 size={14} className="animate-spin text-cyan-600" />
                  )}
                </div>

                <div className="relative">
                  <select
                    value={selectedTokoId}
                    onChange={(e) => {
                      setSelectedTokoId(e.target.value)
                      setSelectedKaryawanId("")
                    }}
                    className="appearance-none w-full pl-3 pr-8 py-2.5 rounded-xl border-2 border-cyan-100 bg-white text-sm font-semibold text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  >
                    <option value="">Semua Toko</option>
                    {tokoList.map((toko) => (
                      <option key={toko.id} value={toko.id}>
                        {toko.nama}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    strokeWidth={2.5}
                  />
                </div>

                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    strokeWidth={2.5}
                  />
                  <input
                    placeholder="Cari nama override karyawan..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border-2 border-cyan-100 bg-white text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto rounded-xl border border-cyan-100 bg-white">
                  {filteredKaryawanActiveList.length === 0 ? (
                    <div className="px-3 py-4 text-xs font-semibold text-slate-400">
                      Belum ada karyawan yang aktif mode override.
                    </div>
                  ) : (
                    filteredKaryawanActiveList.map((item) => (
                      <button
                        key={item.karyawanId}
                        onClick={() => handleSelectActiveKaryawan(item)}
                        className={`w-full px-3 py-3 text-left border-b border-slate-100 last:border-b-0 transition-colors ${
                          selectedKaryawanId === item.karyawanId
                            ? "bg-cyan-50"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-sm font-black text-slate-800">{item.nama}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">
                          {item.tokoNama || "-"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {(mode === "toko" || mode === "karyawan") && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Target Override
              </p>

              <div className="relative">
                <select
                  value={selectedTokoId}
                  onChange={(e) => {
                    setSelectedTokoId(e.target.value)
                    setSelectedKaryawanId("")
                  }}
                  className="appearance-none w-full pl-3 pr-8 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                >
                  <option value="">Pilih Toko</option>
                  {tokoList.map((toko) => (
                    <option key={toko.id} value={toko.id}>
                      {toko.nama}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  strokeWidth={2.5}
                />
              </div>

              {mode === "karyawan" && (
                <>
                  {!selectedTokoId ? (
                    <div className="px-3 py-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
                      Pilih toko dulu untuk menampilkan daftar karyawan.
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                      {filteredKaryawan.length === 0 ? (
                        <div className="px-3 py-4 text-xs font-semibold text-slate-400">
                          Data karyawan tidak ditemukan.
                        </div>
                      ) : (
                        filteredKaryawan.map((karyawan) => (
                          <button
                            key={karyawan.id}
                            onClick={() => setSelectedKaryawanId(karyawan.id)}
                            className={`w-full px-3 py-3 text-left border-b border-slate-100 last:border-b-0 transition-colors ${
                              selectedKaryawanId === karyawan.id
                                ? "bg-cyan-50"
                                : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            <p className="text-sm font-black text-slate-800">
                              {karyawan.nama}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">
                              {karyawan.tokoNama || "-"}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                Form Jam Absensi
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-1">
                {mode === "default"
                  ? "Sedang mengatur default sistem"
                  : mode === "toko"
                  ? `Sedang mengatur toko: ${selectedToko?.nama || "-"}`
                  : `Sedang mengatur karyawan: ${selectedKaryawan?.nama || "-"}`}
              </p>
            </div>

            {mode === "karyawan" && selectedKaryawanId && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setKaryawanTab("hari")}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                    karyawanTab === "hari"
                      ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-200/50"
                      : "border-2 border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Per Hari
                </button>
                <button
                  onClick={() => setKaryawanTab("tanggal")}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                    karyawanTab === "tanggal"
                      ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-200/50"
                      : "border-2 border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Per Tanggal
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-[10px] font-black uppercase tracking-wide">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Sudah diatur
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 px-3 py-1 text-[10px] font-black uppercase tracking-wide">
              <span className="h-2 w-2 rounded-full bg-cyan-500" />
              Belum disentuh
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-wide">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Libur
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-cyan-500" />
            </div>
          ) : (
            <>
              {(mode !== "karyawan" || karyawanTab === "hari") && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Jadwal Per Hari
                  </p>

                  <div className="space-y-3">
                    {HARI.map((hari, index) => {
                      const item = form.weeklySchedule[index]
                      const touched = !!weeklyTouched[index]

                      return (
                        <div
                          key={index}
                          className={`rounded-2xl border p-3 sm:p-4 transition-all ${getWeeklyCardClass(
                            item.enabled,
                            touched
                          )}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="sm:w-40">
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.enabled}
                                  onChange={(e) =>
                                    updateWeeklySchedule(index, "enabled", e.target.checked)
                                  }
                                  className={`${touched ? "accent-emerald-500" : "accent-cyan-500"}`}
                                />
                                <span className="text-sm font-black text-slate-800">
                                  {hari}
                                </span>
                              </label>
                              <p
                                className={`text-[10px] font-bold uppercase tracking-wide mt-1 ${getStatusTextClass(
                                  item.enabled,
                                  touched
                                )}`}
                              >
                                {getStatusText(item.enabled, touched)}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                              <FieldTime
                                label="Jam Masuk"
                                value={item.jamMasuk}
                                onChange={(v) => updateWeeklySchedule(index, "jamMasuk", v)}
                                disabled={!item.enabled}
                                touched={touched}
                              />
                              <FieldTime
                                label="Jam Pulang"
                                value={item.jamPulang}
                                onChange={(v) => updateWeeklySchedule(index, "jamPulang", v)}
                                disabled={!item.enabled}
                                touched={touched}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {mode === "karyawan" && karyawanTab === "tanggal" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Override Per Tanggal
                      </p>
                      <p className="text-xs font-semibold text-slate-500 mt-1">
                        Pilih bulan lalu atur tanggal tertentu. Jadwal tanggal akan override
                        jadwal mingguan.
                      </p>
                    </div>

                    <div className="w-full sm:w-56">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                        Bulan
                      </label>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl bg-white text-slate-800 font-semibold text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {monthDates.map((item) => {
                      const baseWeekly = form.weeklySchedule[item.dayIndex]
                      const schedule =
                        currentMonthOverrides[item.dateKey] ||
                        createDefaultDateSchedule(baseWeekly)
                      const touched = !!currentMonthTouched[item.dateKey]

                      return (
                        <div
                          key={item.dateKey}
                          className={`rounded-2xl border p-3 sm:p-4 transition-all ${getDateCardClass(
                            schedule.enabled,
                            touched
                          )}`}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <div className="flex items-center gap-2">
                                  <CalendarDays
                                    size={16}
                                    className={touched ? "text-emerald-600" : "text-cyan-600"}
                                  />
                                  <p className="text-sm font-black text-slate-800">
                                    {item.dayName}, {item.dayNumber}
                                  </p>
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1">
                                  {item.dateKey}
                                </p>
                              </div>

                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={schedule.enabled}
                                  onChange={(e) =>
                                    updateDateSchedule(item.dateKey, "enabled", e.target.checked)
                                  }
                                  className={`${touched ? "accent-emerald-500" : "accent-cyan-500"}`}
                                />
                                <span className="text-sm font-bold text-slate-700">
                                  {schedule.enabled ? "Masuk" : "Libur"}
                                </span>
                              </label>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <FieldTime
                                label="Jam Masuk"
                                value={schedule.jamMasuk}
                                onChange={(v) => updateDateSchedule(item.dateKey, "jamMasuk", v)}
                                disabled={!schedule.enabled}
                                touched={touched}
                              />
                              <FieldTime
                                label="Jam Pulang"
                                value={schedule.jamPulang}
                                onChange={(v) => updateDateSchedule(item.dateKey, "jamPulang", v)}
                                disabled={!schedule.enabled}
                                touched={touched}
                              />
                            </div>

                            <div className="text-[11px] font-semibold text-slate-500">
                              Status tanggal ini:{" "}
                              <span
                                className={
                                  schedule.enabled
                                    ? touched
                                      ? "text-emerald-600"
                                      : "text-cyan-600"
                                    : "text-slate-500"
                                }
                              >
                                {getStatusText(schedule.enabled, touched)}
                              </span>
                              <span className="text-slate-400"> · </span>
                              Default hari ini:{" "}
                              {baseWeekly.enabled
                                ? `${baseWeekly.jamMasuk} - ${baseWeekly.jamPulang}`
                                : "Libur"}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  onClick={handleSimpan}
                  disabled={
                    saving ||
                    (mode === "toko" && !selectedTokoId) ||
                    (mode === "karyawan" && !selectedKaryawanId)
                  }
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 font-black uppercase tracking-[0.1em] text-white text-[11px] shadow-lg shadow-cyan-200/50 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save size={16} strokeWidth={2.5} />
                      Simpan Pengaturan
                    </>
                  )}
                </button>

                {mode === "karyawan" && selectedKaryawanId && (
                  <button
                    onClick={handleResetKaryawan}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-rose-200 bg-white font-black uppercase tracking-[0.1em] text-rose-600 text-[11px] shadow-sm hover:bg-rose-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={16} strokeWidth={2.5} />
                    Reset ke Default
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function FieldTime({
  label,
  value,
  onChange,
  disabled = false,
  touched = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  touched?: boolean
}) {
  return (
    <div>
      <label
        className={`text-[10px] font-black uppercase tracking-widest mb-1 block ${
          touched ? "text-emerald-500" : "text-slate-400"
        }`}
      >
        {label}
      </label>
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={getFieldClass(!disabled, touched, disabled)}
      />
    </div>
  )
}