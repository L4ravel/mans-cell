"use client"

/*
  Halaman ini menampilkan laporan absensi bulanan per toko.
  Hari libur diambil dinamis dari koleksi pengaturan_jam_absensi per karyawan, tanpa hardcode libur permanen.
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
  toko?: TokoRef
  tahun: number
  bulan: number
  days: Record<string, string>
}

type Summary = {
  karyawanId: string
  hadir: number
  izin: number
  sakit: number
  terlambat: number
  pulangCepat: number
}

type UserDoc = {
  uid?: string
  karyawanId?: string
  nama?: string
  tokoId?: string
  tokoNama?: string
  role?: string
  roles?: string[]
}

type WeeklyScheduleItem = {
  enabled?: boolean
  hari?: number | string
  day?: number | string
  dayIndex?: number | string
  weekday?: number | string
  name?: string
}

type PengaturanJamAbsensiDoc = {
  karyawanId?: string
  hariLibur?: Array<number | string>
  weeklySchedule?: WeeklyScheduleItem[] | Record<string, WeeklyScheduleItem>
}

const CODE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  H: { label: "Hadir", bg: "bg-emerald-500", text: "text-white" },
  I: { label: "Izin", bg: "bg-yellow-400", text: "text-slate-900" },
  S: { label: "Sakit", bg: "bg-red-400", text: "text-white" },
  A: { label: "Alfa", bg: "bg-rose-700", text: "text-white" },
  T: { label: "Terlambat", bg: "bg-orange-500", text: "text-white" },
  PC: { label: "Pulang Cepat", bg: "bg-blue-500", text: "text-white" },
  TPC: { label: "Terlambat+PC", bg: "bg-violet-600", text: "text-white" },
  L: { label: "Libur", bg: "bg-slate-200", text: "text-slate-500" },
  "-": { label: "Tidak Absen Pulang", bg: "bg-slate-500", text: "text-white" },
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
  "-": [100, 116, 139],
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  minggu: 0,
  sunday: 0,
  ahad: 0,
  senin: 1,
  monday: 1,
  selasa: 2,
  tuesday: 2,
  rabu: 3,
  wednesday: 3,
  kamis: 4,
  thursday: 4,
  jumat: 5,
  friday: 5,
  sabtu: 6,
  saturday: 6,
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

const normalizeDayIndex = (value: unknown): number | null => {
  if (typeof value === "number" && value >= 0 && value <= 6) return value

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase()

    if (trimmed in DAY_NAME_TO_INDEX) return DAY_NAME_TO_INDEX[trimmed]

    const parsed = Number(trimmed)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 6) return parsed
  }

  return null
}

const buildHariLiburSet = (config?: PengaturanJamAbsensiDoc): Set<number> => {
  const result = new Set<number>()

  if (!config) return result

  for (const item of config.hariLibur ?? []) {
    const idx = normalizeDayIndex(item)
    if (idx !== null) result.add(idx)
  }

  const weeklySchedule = config.weeklySchedule

  if (Array.isArray(weeklySchedule)) {
    weeklySchedule.forEach((item, index) => {
      const dayIndex =
        normalizeDayIndex(item?.dayIndex) ??
        normalizeDayIndex(item?.hari) ??
        normalizeDayIndex(item?.day) ??
        normalizeDayIndex(item?.weekday) ??
        normalizeDayIndex(item?.name) ??
        index

      if (dayIndex >= 0 && dayIndex <= 6 && item?.enabled === false) {
        result.add(dayIndex)
      }
    })
  } else if (weeklySchedule && typeof weeklySchedule === "object") {
    Object.entries(weeklySchedule).forEach(([key, item]) => {
      const dayIndex =
        normalizeDayIndex(item?.dayIndex) ??
        normalizeDayIndex(item?.hari) ??
        normalizeDayIndex(item?.day) ??
        normalizeDayIndex(item?.weekday) ??
        normalizeDayIndex(item?.name) ??
        normalizeDayIndex(key)

      if (dayIndex !== null && item?.enabled === false) {
        result.add(dayIndex)
      }
    })
  }

  return result
}

export default function LaporanAbsenBulananPage() {
  const [loading, setLoading] = useState(true)
  const [bulanan, setBulanan] = useState<BulananDays[]>([])
  const [summary, setSummary] = useState<Record<string, Summary>>({})
  const [tidakWajibMap, setTidakWajibMap] = useState<Record<string, boolean>>({})
  const [pengaturanJamMap, setPengaturanJamMap] = useState<Record<string, PengaturanJamAbsensiDoc>>({})
  const [tokoFilter, setTokoFilter] = useState<string>("")
  const [tokoList, setTokoList] = useState<TokoRef[]>([])
  const [bulanFilter, setBulanFilter] = useState<number>(new Date().getMonth() + 1)
  const [tahunFilter, setTahunFilter] = useState<number>(new Date().getFullYear())
  const [downloading, setDownloading] = useState<"pdf" | "xls" | null>(null)

  const tahun = tahunFilter

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser
      if (!user) return
      setLoading(true)

      try {
        const qBulanan = query(
          collection(db, "absensi_karyawan_bulanan"),
          where("tahun", "==", tahun),
          where("bulan", "==", bulanFilter)
        )

        const qSummary = query(
          collection(db, "absensi_karyawan_summary"),
          where("tahun", "==", tahun),
          where("bulan", "==", bulanFilter)
        )

        const [snapBulanan, snapSummary, snapUsers, snapTidakWajib, snapPengaturanJam] = await Promise.all([
          getDocs(qBulanan),
          getDocs(qSummary),
          getDocs(collection(db, "users")),
          getDocs(collection(db, "karyawan_tidak_wajib_absen")),
          getDocs(collection(db, "pengaturan_jam_absensi")),
        ])

        const userMapByKaryawanId: Record<string, UserDoc> = {}
        const tokoMap: Record<string, TokoRef> = {}

        snapUsers.docs.forEach((d) => {
          const data = d.data() as UserDoc
          const karyawanId = data.karyawanId
          if (karyawanId) {
            userMapByKaryawanId[karyawanId] = data
          }
          if (data.tokoId && data.tokoNama) {
            tokoMap[data.tokoId] = { id: data.tokoId, nama: data.tokoNama }
          }
        })

        const bulananData = snapBulanan.docs.map((d) => {
          const data = d.data() as any
          const karyawanId = data.karyawanId ?? data.ptkId ?? d.id
          const userData = userMapByKaryawanId[karyawanId]

          return {
            karyawanId,
            namaKaryawan: data.namaKaryawan ?? data.namaPtk ?? userData?.nama ?? "-",
            toko:
              data.toko?.id && data.toko?.nama
                ? { id: data.toko.id, nama: data.toko.nama }
                : userData?.tokoId && userData?.tokoNama
                ? { id: userData.tokoId, nama: userData.tokoNama }
                : undefined,
            tahun: data.tahun,
            bulan: data.bulan,
            days: data.days ?? {},
          } as BulananDays
        })

        const summaryMap: Record<string, Summary> = {}
        snapSummary.docs.forEach((d) => {
          const data = d.data() as any
          const karyawanId = data.karyawanId ?? data.ptkId ?? d.id
          summaryMap[karyawanId] = {
            karyawanId,
            hadir: data.hadir ?? 0,
            izin: data.izin ?? 0,
            sakit: data.sakit ?? 0,
            terlambat: data.terlambat ?? 0,
            pulangCepat: data.pulangCepat ?? 0,
          }
        })

        const mapTidakWajib: Record<string, boolean> = {}
        snapTidakWajib.docs.forEach((d) => {
          mapTidakWajib[d.id] = true
          const data = d.data() as any
          if (data.karyawanId) mapTidakWajib[data.karyawanId] = true
        })

        const mapPengaturanJam: Record<string, PengaturanJamAbsensiDoc> = {}
        snapPengaturanJam.docs.forEach((d) => {
          const data = d.data() as PengaturanJamAbsensiDoc
          const karyawanId = data.karyawanId ?? d.id
          if (karyawanId) {
            mapPengaturanJam[karyawanId] = data
          }
        })

        bulananData.forEach((row) => {
          if (row.toko?.id && row.toko?.nama) {
            tokoMap[row.toko.id] = row.toko
          }
        })

        setBulanan(bulananData)
        setSummary(summaryMap)
        setTidakWajibMap(mapTidakWajib)
        setPengaturanJamMap(mapPengaturanJam)
        setTokoList(Object.values(tokoMap).sort((a, b) => a.nama.localeCompare(b.nama)))
      } catch (err) {
        console.error(err)
        setBulanan([])
        setSummary({})
        setTidakWajibMap({})
        setPengaturanJamMap({})
        setTokoList([])
      } finally {
        setLoading(false)
      }
    }

    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchData()
    })

    return () => unsub()
  }, [bulanFilter, tahunFilter, tahun])

  const daysInMonth = new Date(tahun, bulanFilter, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isLibur = (karyawanId: string, dateObj: Date) => {
    const config = pengaturanJamMap[karyawanId]
    if (!config) return false

    const hariLiburSet = buildHariLiburSet(config)
    return hariLiburSet.has(dateObj.getDay())
  }

  const hitungEfektif = (karyawanId: string): number => {
    let n = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(tahun, bulanFilter - 1, d)
      dateObj.setHours(0, 0, 0, 0)
      if (dateObj > today) continue
      if (!canCountAlphaForDate(dateObj, bulanFilter, tahun)) continue
      if (!isLibur(karyawanId, dateObj)) n++
    }
    return n
  }

  const hitungHadir = (row: BulananDays): number => {
    let n = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(tahun, bulanFilter - 1, d)
      dateObj.setHours(0, 0, 0, 0)
      if (dateObj > today || isLibur(row.karyawanId, dateObj)) continue
      const code = row.days?.[String(d).padStart(2, "0")]
      if (["H", "T", "PC", "TPC", "-"].includes(code)) n++
    }
    return n
  }

  const hitungAlfa = (row: BulananDays): number => {
    let n = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(tahun, bulanFilter - 1, d)
      dateObj.setHours(0, 0, 0, 0)

      if (dateObj > today || isLibur(row.karyawanId, dateObj)) continue
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
    if (isLibur(row.karyawanId, dateObj)) return "L"

    const existingCode = row.days?.[String(dayNum).padStart(2, "0")]
    if (existingCode) return existingCode

    if (!canCountAlphaForDate(dateObj, bulanFilter, tahun)) return ""
    return "A"
  }

  const hitungPersen = (row: BulananDays): number => {
    const efektif = hitungEfektif(row.karyawanId)
    if (efektif === 0) return 0
    return Math.round((hitungHadir(row) / efektif) * 100)
  }

  const hitungPersenIzin = (row: BulananDays): number => {
    const efektif = hitungEfektif(row.karyawanId)
    const izin = summary[row.karyawanId]?.izin ?? 0
    if (efektif === 0) return 0
    return Math.round((izin / efektif) * 100)
  }

  const hitungPersenSakit = (row: BulananDays): number => {
    const efektif = hitungEfektif(row.karyawanId)
    const sakit = summary[row.karyawanId]?.sakit ?? 0
    if (efektif === 0) return 0
    return Math.round((sakit / efektif) * 100)
  }

  const filteredBulanan = bulanan.filter(
    (row) => (!tokoFilter || row.toko?.id === tokoFilter) && !tidakWajibMap[row.karyawanId]
  )

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
      totalEfektif += hitungEfektif(row.karyawanId)
    })

    const persen = totalEfektif > 0 ? Math.round((totalHadir / totalEfektif) * 100) : 0
    return { totalHadir, totalIzin, totalSakit, totalAlfa, totalEfektif, persen }
  })()

  const buildTableData = () => {
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
    const header = ["No", "Nama Karyawan", "% Hadir", "% Izin", "% Sakit", "Hadir", "Izin", "Sakit", "Alfa", ...dayHeaders]

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

      const statsItems: Array<{ label: string; val: string; color: [number, number, number] }> = [
        { label: "Total Karyawan", val: String(filteredBulanan.length), color: [30, 41, 59] },
        {
          label: "% Kehadiran",
          val: `${agg.persen}%`,
          color: agg.persen >= 90 ? [5, 150, 105] : agg.persen >= 75 ? [161, 98, 7] : [190, 18, 60],
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
              doc.setTextColor(isLight ? 30 : 255, isLight ? 41 : 255, isLight ? 59 : 255)
              doc.setFontSize(6.5)
              doc.text(val, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 0.5, {
                align: "center",
                baseline: "middle",
              })
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

      doc.save(`Absensi_${namaToko.replace(/\s+/g, "_")}_${bulanNama.replace(/\s+/g, "_")}.pdf`)
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
        ["No", "Nama Karyawan", "% Hadir", "% Izin", "% Sakit", "Hadir", "Izin", "Sakit", "Alfa", "Hari Efektif"],
      ]

      filteredBulanan.forEach((row, idx) => {
        const s = summary[row.karyawanId]
        const hadir = hitungHadir(row)
        const alfa = hitungAlfa(row)
        const efektif = hitungEfektif(row.karyawanId)
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
      XLSX.writeFile(wb, `Absensi_${namaToko.replace(/\s+/g, "_")}_${bulanNama.replace(/\s+/g, "_")}.xlsx`)
    } catch (err) {
      console.error("XLS error:", err)
      alert("Gagal membuat file Excel. Silakan coba lagi.")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-violet-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 shadow-lg shadow-violet-200/50">
            <ClipboardList size={24} className="text-white sm:w-7 sm:h-7" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
              Laporan Absensi Bulanan
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
              Rekap kehadiran per individu karyawan
            </p>
          </div>
        </div>
        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-xl border-l-4 border-l-purple-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
            <Filter size={14} className="text-purple-600" strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Filter Laporan</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Toko</label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2} />
              <select
                value={tokoFilter}
                onChange={(e) => setTokoFilter(e.target.value)}
                className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white pl-8 pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-purple-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="">Pilih Toko</option>
                {tokoList.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2.5} />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Bulan</label>
            <div className="relative">
              <select
                value={bulanFilter}
                onChange={(e) => setBulanFilter(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-purple-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString("id-ID", { month: "long" })}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2.5} />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Tahun</label>
            <div className="relative">
              <select
                value={tahunFilter}
                onChange={(e) => setTahunFilter(Number(e.target.value))}
                className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-purple-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2.5} />
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
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-violet-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat data...</p>
          </div>
        </div>
      )}

      {!loading && !tokoFilter && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 gap-3">
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
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 bg-slate-50">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/10">
                  <TrendingUp size={12} className="text-violet-600" strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                  Ringkasan Kehadiran · {namaToko} · {bulanNama}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-slate-100">
                <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center p-4 gap-1">
                  <span className={`text-3xl font-black tabular-nums ${pctTextColor(agg.persen)}`}>
                    {agg.persen}%
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Kehadiran</span>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${pctBarColor(agg.persen)}`}
                      style={{ width: `${agg.persen}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-slate-400 text-center">
                    {agg.totalHadir} hadir dari {agg.totalEfektif} hari efektif
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center p-4 gap-0.5">
                  <span className="text-xl font-black text-emerald-600 tabular-nums">{agg.totalHadir}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Hadir</span>
                </div>

                <div className="flex flex-col items-center justify-center p-4 gap-0.5">
                  <span className="text-xl font-black text-yellow-600 tabular-nums">{agg.totalIzin}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Izin</span>
                </div>

                <div className="flex flex-col items-center justify-center p-4 gap-0.5">
                  <span className="text-xl font-black text-red-500 tabular-nums">{agg.totalSakit}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Sakit</span>
                </div>

                <div className="flex flex-col items-center justify-center p-4 gap-0.5">
                  <span className="text-xl font-black text-rose-700 tabular-nums">{agg.totalAlfa}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Alfa</span>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-black text-slate-700 uppercase tracking-wide">{namaToko}</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {bulanNama} · {filteredBulanan.length} Karyawan
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CODE_CONFIG).map(([code, cfg]) => (
                  <span key={code} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${cfg.bg} ${cfg.text}`}>
                    {code}
                    <span className="font-normal opacity-80 hidden sm:inline">= {cfg.label}</span>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-0 sm:ml-2">
                <button
                  onClick={handleDownloadPDF}
                  disabled={!!downloading || filteredBulanan.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600 transition-all hover:bg-red-100 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-emerald-700 transition-all hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading === "xls" ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-emerald-300 border-t-emerald-700"
                    />
                  ) : (
                    <FileSpreadsheet size={13} strokeWidth={2.5} />
                  )}
                  {downloading === "xls" ? "Membuat..." : "Excel"}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="sticky left-0 z-10 bg-slate-800 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap w-8">#</th>
                  <th className="sticky left-8 z-10 bg-slate-800 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap min-w-[180px]">
                    Nama Karyawan
                  </th>
                  <th className="px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap min-w-[120px]" colSpan={3}>
                    % Kehadiran / Izin / Sakit
                  </th>
                  <th className="px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap">Hdr</th>
                  <th className="px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap">Izn</th>
                  <th className="px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap">Skt</th>
                  <th className="px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.12em] whitespace-nowrap">Alf</th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i} className="px-1.5 py-2.5 text-center text-[9px] font-black whitespace-nowrap w-7 bg-slate-800">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredBulanan.length === 0 && (
                  <tr>
                    <td colSpan={9 + daysInMonth} className="px-4 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
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
                      className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="sticky left-8 z-10 bg-white px-3 py-2 font-bold text-slate-800 whitespace-nowrap border-r border-slate-100">
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
                            persenIzin > 0 ? "bg-yellow-50 border-yellow-200 text-yellow-700" : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          {persenIzin}%
                        </span>
                      </td>

                      <td className="px-1.5 py-2 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                            persenSakit > 0 ? "bg-red-50 border-red-200 text-red-600" : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          {persenSakit}%
                        </span>
                      </td>

                      <td className="px-2 py-2 text-center font-black text-emerald-600">{hadir}</td>
                      <td className="px-2 py-2 text-center font-black text-yellow-600">{s?.izin ?? 0}</td>
                      <td className="px-2 py-2 text-center font-black text-red-500">{s?.sakit ?? 0}</td>
                      <td className="px-2 py-2 text-center font-black text-rose-700">{alfa}</td>

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
                  <tr className="border-t-2 border-slate-300 bg-slate-800">
                    <td className="sticky left-0 z-10 bg-slate-800 px-3 py-2.5 text-center" />
                    <td className="sticky left-8 z-10 bg-slate-800 px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-white border-r border-slate-700">
                      Total {filteredBulanan.length} Karyawan
                    </td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className={`inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${pctBadgeClass(agg.persen)}`}>
                        {agg.persen}%
                      </span>
                    </td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums bg-yellow-50 border-yellow-200 text-yellow-700">
                        {agg.totalEfektif > 0 ? Math.round((agg.totalIzin / agg.totalEfektif) * 100) : 0}%
                      </span>
                    </td>
                    <td className="px-1.5 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-lg border px-1.5 py-0.5 text-[10px] font-black tabular-nums bg-red-50 border-red-200 text-red-600">
                        {agg.totalEfektif > 0 ? Math.round((agg.totalSakit / agg.totalEfektif) * 100) : 0}%
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-emerald-400">{agg.totalHadir}</td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-yellow-400">{agg.totalIzin}</td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-red-400">{agg.totalSakit}</td>
                    <td className="px-2 py-2.5 text-center text-xs font-black text-rose-400">{agg.totalAlfa}</td>
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