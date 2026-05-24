/*
  Halaman admin laporan keuntungan bersih.
  File ini membaca koleksi laporan_bulanan dan pengeluaran dari Firestore untuk menampilkan
  penghasilan kotor, total pengeluaran, keuntungan bersih per bulan, detail rekap bulanan,
  ranking toko, chart batang keuntungan bersih per bulan, filter kategori barang, dan filter satuan.

  Revisi:
  - filter kategori khusus kategori barang jualan
  - opsi kategori hanya dari laporan_bulanan.kategoriBreakdown
  - rekap dan ranking kategori fokus ke kategori barang yang dijual
  - tambah filter satuan dari kategoriBreakdown.satuanIds / satuanNamaList
  - tambah ranking satuan agar lebih mudah melihat keuntungan per unit
  - opsi kategori dan satuan ikut filter bulan + toko aktif agar tidak menampilkan sisa data lama
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Layers3,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  Ruler,
  Download,
} from "lucide-react"
import { motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type KategoriBreakdown = {
  kategoriId: string
  kategoriNama: string
  jumlahTransaksi: number
  qtyTerjual: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalModal: number
  totalBiayaAdmin: number
  labaKotor: number
  labaBersih: number
  satuanIds?: string[]
  satuanNamaList?: string[]
}

type LaporanBulanan = {
  id: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  totalLabaKotor: number
  totalKeuntunganBersih: number
  omzet: number
  jumlahTransaksi: number
  kategoriBreakdown: KategoriBreakdown[]
}

type Pengeluaran = {
  id: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  nominal: number
}

type RekapKeuntunganBersih = {
  bulanKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  satuanId: string
  satuanNama: string
  penghasilanKotor: number
  pengeluaran: number
  keuntunganBersih: number
  omzet: number
  jumlahTransaksi: number
  jumlahQtyTerjual: number
  jumlahDataPengeluaran: number
}

type RankingKategoriBarang = {
  kategoriId: string
  kategoriNama: string
  penghasilanKotor: number
  pengeluaran: number
  keuntunganBersih: number
  omzet: number
  qtyTerjual: number
  jumlahTransaksi: number
}

type RankingSatuanBarang = {
  satuanId: string
  satuanNama: string
  penghasilanKotor: number
  keuntunganBersih: number
  omzet: number
  qtyTerjual: number
  jumlahTransaksi: number
  namaBarangList: string[]
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatBulanKey(value?: string) {
  if (!value) return "-"
  const [year, month] = String(value).split("-")
  const y = Number(year || 0)
  const m = Number(month || 0)
  if (!y || !m) return value

  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1))
}

function toMonthInputValue(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

function getStartOfYearMonthInput() {
  const now = new Date()
  return `${now.getFullYear()}-01`
}

function normalizeKategoriKey(value?: string) {
  return String(value || "").trim().toLowerCase()
}

function normalizeSatuanKey(value?: string) {
  return String(value || "").trim().toLowerCase()
}

function uniqueStringList(values: any[]): string[] {
  const map = new Map<string, string>()

  for (const value of values || []) {
    const text = String(value || "").trim()
    const key = text.toLowerCase()
    if (!text || map.has(key)) continue
    map.set(key, text)
  }

  return Array.from(map.values())
}


const EXCEL_BORDER = {
  top: { style: "thin", color: { rgb: "CBD5E1" } },
  right: { style: "thin", color: { rgb: "CBD5E1" } },
  bottom: { style: "thin", color: { rgb: "CBD5E1" } },
  left: { style: "thin", color: { rgb: "CBD5E1" } },
}

const excelTitleStyle = {
  font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "047857" } },
}

const excelSubTitleStyle = {
  font: { bold: true, sz: 11, color: { rgb: "064E3B" } },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "D1FAE5" } },
}

const excelHeaderStyle = {
  font: { bold: true, color: { rgb: "0F172A" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "E2F0D9" } },
}

const excelHeaderDarkStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "059669" } },
}

const excelDataLeftStyle = {
  alignment: { horizontal: "left", vertical: "center", wrapText: false },
}

const excelDataCenterStyle = {
  alignment: { horizontal: "center", vertical: "center", wrapText: false },
}

const excelDataRightStyle = {
  alignment: { horizontal: "right", vertical: "center", wrapText: false },
}

const excelMoneyStyle = {
  alignment: { horizontal: "right", vertical: "center", wrapText: false },
  numFmt: '"Rp" #,##0',
}

const excelNumberStyle = {
  alignment: { horizontal: "center", vertical: "center", wrapText: false },
  numFmt: "#,##0",
}

function safeSheetName(value: string, fallback = "Sheet") {
  const clean = String(value || fallback)
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return (clean || fallback).slice(0, 31)
}

function ensureExcelCell(ws: any, addr: string) {
  if (!ws[addr]) ws[addr] = { t: "s", v: "" }
  return ws[addr]
}

function applyExcelCellStyle(ws: any, addr: string, style: any) {
  const cell = ensureExcelCell(ws, addr)
  cell.s = {
    ...(cell.s || {}),
    ...style,
    border: EXCEL_BORDER,
  }
}

function applyExcelBorderRange(params: {
  ws: any
  XLSX: any
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  baseStyle?: any
}) {
  const { ws, XLSX, startRow, endRow, startCol, endCol, baseStyle } = params

  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      applyExcelCellStyle(ws, XLSX.utils.encode_cell({ r, c }), baseStyle || excelDataLeftStyle)
    }
  }
}


function finalizeWorkbookExcelBorders(XLSX: any, workbook: any) {
  if (!workbook?.SheetNames?.length) return

  workbook.SheetNames.forEach((sheetName: string) => {
    const ws = workbook.Sheets?.[sheetName]
    if (!ws || !ws["!ref"]) return

    const range = XLSX.utils.decode_range(ws["!ref"])

    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c })

        if (!ws[addr]) {
          ws[addr] = { t: "s", v: "" }
        }

        ws[addr].s = {
          ...(ws[addr].s || {}),
          border: EXCEL_BORDER,
          alignment: {
            vertical: "center",
            wrapText: true,
            ...(ws[addr].s?.alignment || {}),
          },
        }
      }
    }
  })
}

async function downloadWorkbookXlsx(workbook: any, filename: string) {
  const XLSX = await import("xlsx-js-style")
  finalizeWorkbookExcelBorders(XLSX, workbook)
  const ab = XLSX.write(workbook, { type: "array", bookType: "xlsx" })
  const blob = new Blob([ab], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type ExcelTableColumn<T> = {
  key: keyof T | string
  label: string
  width: number
  align?: "left" | "center" | "right"
  money?: boolean
  number?: boolean
}

function makeExcelTableSheet<T extends Record<string, any>>(params: {
  XLSX: any
  title: string
  subtitle?: string
  columns: ExcelTableColumn<T>[]
  rows: T[]
}) {
  const { XLSX, title, subtitle, columns, rows } = params
  const aoa: any[][] = []

  aoa.push([title])
  aoa.push([subtitle || `Total data: ${rows.length}`])
  aoa.push([])
  aoa.push(["No", ...columns.map((col) => col.label)])

  rows.forEach((row, index) => {
    aoa.push([
      index + 1,
      ...columns.map((col) => {
        const value = row[String(col.key)]
        if (col.money || col.number) return Number(value || 0)
        return String(value ?? "")
      }),
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const lastCol = columns.length
  const lastRow = Math.max(3 + rows.length, 3)

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ]
  ws["!cols"] = [{ wch: 6 }, ...columns.map((col) => ({ wch: col.width }))]
  ws["!freeze"] = { xSplit: 1, ySplit: 4 }

  applyExcelCellStyle(ws, "A1", excelTitleStyle)
  applyExcelCellStyle(ws, "A2", excelSubTitleStyle)

  applyExcelBorderRange({
    ws,
    XLSX,
    startRow: 3,
    endRow: lastRow,
    startCol: 0,
    endCol: lastCol,
    baseStyle: excelDataLeftStyle,
  })

  for (let c = 0; c <= lastCol; c += 1) {
    applyExcelCellStyle(ws, XLSX.utils.encode_cell({ r: 3, c }), c === 0 ? excelHeaderDarkStyle : excelHeaderStyle)
  }

  for (let r = 4; r <= lastRow; r += 1) {
    applyExcelCellStyle(ws, XLSX.utils.encode_cell({ r, c: 0 }), excelDataCenterStyle)

    columns.forEach((col, index) => {
      const addr = XLSX.utils.encode_cell({ r, c: index + 1 })
      if (col.money) applyExcelCellStyle(ws, addr, excelMoneyStyle)
      else if (col.number) applyExcelCellStyle(ws, addr, excelNumberStyle)
      else if (col.align === "center") applyExcelCellStyle(ws, addr, excelDataCenterStyle)
      else if (col.align === "right") applyExcelCellStyle(ws, addr, excelDataRightStyle)
      else applyExcelCellStyle(ws, addr, excelDataLeftStyle)
    })
  }

  return ws
}

function makeExcelSummarySheet(params: {
  XLSX: any
  title: string
  subtitle: string
  rows: Array<[string, string | number]>
}) {
  const { XLSX, title, subtitle, rows } = params
  const aoa = [[title], [subtitle], [], ["Keterangan", "Nilai"], ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const lastRow = aoa.length - 1

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ]
  ws["!cols"] = [{ wch: 34 }, { wch: 36 }]

  applyExcelCellStyle(ws, "A1", excelTitleStyle)
  applyExcelCellStyle(ws, "A2", excelSubTitleStyle)
  applyExcelCellStyle(ws, "A4", excelHeaderDarkStyle)
  applyExcelCellStyle(ws, "B4", excelHeaderStyle)

  applyExcelBorderRange({
    ws,
    XLSX,
    startRow: 4,
    endRow: lastRow,
    startCol: 0,
    endCol: 1,
    baseStyle: excelDataLeftStyle,
  })

  for (let r = 4; r <= lastRow; r += 1) {
    const bAddr = XLSX.utils.encode_cell({ r, c: 1 })
    const value = rows[r - 4]?.[1]
    if (typeof value === "number") applyExcelCellStyle(ws, bAddr, excelMoneyStyle)
  }

  return ws
}


function InfoCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: any
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-sm">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-black text-slate-800">{value}</p>
          {subValue ? (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{subValue}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>

      <div className="relative">
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        ) : null}

        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
        >
          {children}
        </select>

        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

export default function LaporanKeuntunganBersihPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanBulananList, setLaporanBulananList] = useState<LaporanBulanan[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterSatuan, setFilterSatuan] = useState("")
  const [bulanMulai, setBulanMulai] = useState(getStartOfYearMonthInput())
  const [bulanSelesai, setBulanSelesai] = useState(toMonthInputValue(new Date()))

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, laporanSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "laporan_bulanan"), orderBy("bulanKey", "desc"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("bulanKey", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: String(x?.nama || ""),
          aktif: Boolean(x?.aktif),
        }
      })

      const laporanData: LaporanBulanan[] = laporanSnap.docs.map((d) => {
        const x = d.data() as any

        const kategoriBreakdown: KategoriBreakdown[] = Array.isArray(x?.kategoriBreakdown)
          ? x.kategoriBreakdown.map((item: any) => {
              const namaKategori = String(
                item?.nama || item?.kategoriNama || "Tanpa Kategori"
              ).trim()

              const kategoriKey = String(item?.kategoriId || namaKategori)
                .trim()
                .toLowerCase()

              const satuanIds = uniqueStringList(
                Array.isArray(item?.satuanIds) ? item.satuanIds : []
              )

              const satuanNamaList = uniqueStringList(
                Array.isArray(item?.satuanNamaList) ? item.satuanNamaList : []
              )

              return {
                kategoriId: kategoriKey,
                kategoriNama: namaKategori || "Tanpa Kategori",
                jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
                qtyTerjual: Number(item?.qtyTerjual || 0),
                omzet: Number(item?.omzet || 0),
                subtotal: Number(item?.subtotal || 0),
                totalDiskon: Number(item?.totalDiskon || 0),
                totalSetelahDiskon: Number(item?.totalSetelahDiskon || 0),
                totalModal: Number(item?.totalModal || 0),
                totalBiayaAdmin: Number(item?.totalBiayaAdmin || 0),
                labaKotor: Number(
                  item?.labaKotor ??
                    Number(item?.totalSetelahDiskon || 0) - Number(item?.totalModal || 0)
                ),
                labaBersih: Number(
                  item?.labaBersih ??
                    item?.labaKotor ??
                    Number(item?.totalSetelahDiskon || 0) -
                      Number(item?.totalModal || 0) -
                      Number(item?.totalBiayaAdmin || 0)
                ),
                satuanIds,
                satuanNamaList,
              }
            })
          : []

        return {
          id: d.id,
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          totalLabaKotor: Number(x?.totalLabaKotor || 0),
          totalKeuntunganBersih: Number(x?.totalKeuntunganBersih ?? x?.totalLabaKotor ?? 0),
          omzet: Number(x?.omzet || 0),
          jumlahTransaksi: Number(x?.jumlahTransaksi || 0),
          kategoriBreakdown,
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          kategoriId: String(x?.kategoriId || ""),
          kategoriNama: String(x?.kategoriNama || ""),
          nominal: Number(x?.nominal || 0),
        }
      })

      setTokoList(tokoData.filter((item) => item.nama))
      setLaporanBulananList(laporanData.filter((item) => item.bulanKey))
      setPengeluaranList(pengeluaranData.filter((item) => item.bulanKey))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan keuntungan bersih")
      setTokoList([])
      setLaporanBulananList([])
      setPengeluaranList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await fetchAll()
      }
    })
    return () => unsub()
  }, [])

  const laporanBulananVisible = useMemo(() => {
    return laporanBulananList.filter((laporan) => {
      const matchToko = !filterToko || laporan.tokoId === filterToko
      const matchStart = !bulanMulai || laporan.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || laporan.bulanKey <= bulanSelesai
      return matchToko && matchStart && matchEnd
    })
  }, [laporanBulananList, filterToko, bulanMulai, bulanSelesai])

  const kategoriBarangList = useMemo(() => {
    const map = new Map<string, { id: string; nama: string }>()

    for (const laporan of laporanBulananVisible) {
      for (const item of laporan.kategoriBreakdown || []) {
        const key = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (!key) continue

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            nama: item.kategoriNama || "Tanpa Kategori",
          })
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  }, [laporanBulananVisible])

  const satuanBarangList = useMemo(() => {
    const map = new Map<string, { id: string; nama: string }>()

    for (const laporan of laporanBulananVisible) {
      for (const item of laporan.kategoriBreakdown || []) {
        const ids = item.satuanIds || []
        const names = item.satuanNamaList || []
        const maxLen = Math.max(ids.length, names.length)

        for (let i = 0; i < maxLen; i++) {
          const rawId = String(ids[i] || "").trim()
          const rawNama = String(names[i] || "").trim()
          const key = normalizeSatuanKey(rawId || rawNama)
          const nama = rawNama || rawId || "Tanpa Satuan"

          if (!key) continue
          if (!map.has(key)) {
            map.set(key, {
              id: key,
              nama,
            })
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  }, [laporanBulananVisible])

  useEffect(() => {
    if (filterKategori && !kategoriBarangList.some((item) => item.id === filterKategori)) {
      setFilterKategori("")
    }
  }, [filterKategori, kategoriBarangList])

  useEffect(() => {
    if (filterSatuan && !satuanBarangList.some((item) => item.id === filterSatuan)) {
      setFilterSatuan("")
    }
  }, [filterSatuan, satuanBarangList])

  const rekapList = useMemo(() => {
    const map = new Map<string, RekapKeuntunganBersih>()
    const aktifKategoriNama =
      kategoriBarangList.find((x) => x.id === filterKategori)?.nama || "Semua Kategori"
    const aktifSatuanNama =
      satuanBarangList.find((x) => x.id === filterSatuan)?.nama || "Semua Satuan"

    for (const laporan of laporanBulananList) {
      const matchedBreakdowns = (laporan.kategoriBreakdown || []).filter((row) => {
        const rowKategoriKey = row.kategoriId || normalizeKategoriKey(row.kategoriNama)
        const matchKategori = !filterKategori || rowKategoriKey === filterKategori

        const rowSatuanKeys = [
          ...(row.satuanIds || []).map((item) => normalizeSatuanKey(item)),
          ...(row.satuanNamaList || []).map((item) => normalizeSatuanKey(item)),
        ].filter(Boolean)

        const matchSatuan =
          !filterSatuan || rowSatuanKeys.includes(normalizeSatuanKey(filterSatuan))

        return matchKategori && matchSatuan
      })

      if (filterKategori || filterSatuan) {
        if (matchedBreakdowns.length === 0) continue

        const key = `${laporan.bulanKey}__${laporan.tokoId || laporan.tokoNama || "tanpa-toko"}__${
          filterKategori || "all"
        }__${filterSatuan || "all"}`

        const current = map.get(key) || {
          bulanKey: laporan.bulanKey,
          tokoId: laporan.tokoId,
          tokoNama: laporan.tokoNama || "Tanpa Toko",
          kategoriId: filterKategori || "",
          kategoriNama: filterKategori ? aktifKategoriNama : "Semua Kategori",
          satuanId: filterSatuan || "",
          satuanNama: filterSatuan ? aktifSatuanNama : "Semua Satuan",
          penghasilanKotor: 0,
          pengeluaran: 0,
          keuntunganBersih: 0,
          omzet: 0,
          jumlahTransaksi: 0,
          jumlahQtyTerjual: 0,
          jumlahDataPengeluaran: 0,
        }

        current.penghasilanKotor += matchedBreakdowns.reduce(
          (sum, row) => sum + Number(row.labaBersih || row.labaKotor || 0),
          0
        )
        current.omzet += matchedBreakdowns.reduce(
          (sum, row) => sum + Number(row.omzet || row.totalSetelahDiskon || 0),
          0
        )
        current.jumlahTransaksi += matchedBreakdowns.reduce(
          (sum, row) => sum + Number(row.jumlahTransaksi || 0),
          0
        )
        current.jumlahQtyTerjual += matchedBreakdowns.reduce(
          (sum, row) => sum + Number(row.qtyTerjual || 0),
          0
        )

        map.set(key, current)
      } else {
        const key = `${laporan.bulanKey}__${laporan.tokoId || laporan.tokoNama || "tanpa-toko"}__all__all`
        const current = map.get(key) || {
          bulanKey: laporan.bulanKey,
          tokoId: laporan.tokoId,
          tokoNama: laporan.tokoNama || "Tanpa Toko",
          kategoriId: "",
          kategoriNama: "Semua Kategori",
          satuanId: "",
          satuanNama: "Semua Satuan",
          penghasilanKotor: 0,
          pengeluaran: 0,
          keuntunganBersih: 0,
          omzet: 0,
          jumlahTransaksi: 0,
          jumlahQtyTerjual: 0,
          jumlahDataPengeluaran: 0,
        }

        current.penghasilanKotor += Number(
          laporan.totalKeuntunganBersih || laporan.totalLabaKotor || 0
        )
        current.omzet += Number(laporan.omzet || 0)
        current.jumlahTransaksi += Number(laporan.jumlahTransaksi || 0)
        current.jumlahQtyTerjual += Number(
          (laporan.kategoriBreakdown || []).reduce(
            (sum, row) => sum + Number(row?.qtyTerjual || 0),
            0
          )
        )

        map.set(key, current)
      }
    }

    for (const item of pengeluaranList) {
      const key = `${item.bulanKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}__${
        filterKategori || "all"
      }__${filterSatuan || "all"}`

      const current = map.get(key) || {
        bulanKey: item.bulanKey,
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        kategoriId: filterKategori || "",
        kategoriNama: filterKategori
          ? kategoriBarangList.find((x) => x.id === filterKategori)?.nama || "Tanpa Kategori"
          : "Semua Kategori",
        satuanId: filterSatuan || "",
        satuanNama: filterSatuan
          ? satuanBarangList.find((x) => x.id === filterSatuan)?.nama || "Tanpa Satuan"
          : "Semua Satuan",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        omzet: 0,
        jumlahTransaksi: 0,
        jumlahQtyTerjual: 0,
        jumlahDataPengeluaran: 0,
      }

      current.pengeluaran += Number(item.nominal || 0)
      current.jumlahDataPengeluaran += 1

      map.set(key, current)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        keuntunganBersih: item.penghasilanKotor - item.pengeluaran,
      }))
      .sort((a, b) => {
        const bulanCompare = b.bulanKey.localeCompare(a.bulanKey)
        if (bulanCompare !== 0) return bulanCompare
        return b.keuntunganBersih - a.keuntunganBersih
      })
  }, [
    laporanBulananList,
    pengeluaranList,
    filterKategori,
    filterSatuan,
    kategoriBarangList,
    satuanBarangList,
  ])

  const filteredRekap = useMemo(() => {
    const q = search.toLowerCase().trim()

    return rekapList.filter((item) => {
      const matchSearch =
        !q ||
        item.bulanKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.satuanNama.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchStart = !bulanMulai || item.bulanKey >= bulanMulai
      const matchEnd = !bulanSelesai || item.bulanKey <= bulanSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [rekapList, search, filterToko, bulanMulai, bulanSelesai])

  const totalPenghasilanKotor = filteredRekap.reduce(
    (acc, item) => acc + item.penghasilanKotor,
    0
  )
  const totalPengeluaran = filteredRekap.reduce((acc, item) => acc + item.pengeluaran, 0)
  const totalKeuntunganBersih = filteredRekap.reduce(
    (acc, item) => acc + item.keuntunganBersih,
    0
  )
  const totalOmzet = filteredRekap.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredRekap.reduce((acc, item) => acc + item.jumlahTransaksi, 0)
  const totalQtyTerjual = filteredRekap.reduce((acc, item) => acc + item.jumlahQtyTerjual, 0)

  const keuntunganBulanIni = filteredRekap
    .filter((item) => item.bulanKey === toMonthInputValue(new Date()))
    .reduce((acc, item) => acc + item.keuntunganBersih, 0)

  const rankingToko = useMemo(() => {
    const map = new Map<
      string,
      {
        tokoId: string
        tokoNama: string
        penghasilanKotor: number
        pengeluaran: number
        keuntunganBersih: number
        bulanAktif: number
      }
    >()

    for (const item of filteredRekap) {
      const key = item.tokoId || item.tokoNama || item.bulanKey
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        bulanAktif: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih
      current.bulanAktif += 1

      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [filteredRekap])

  const chartData = useMemo(() => {
    const map = new Map<
      string,
      {
        bulanKey: string
        penghasilanKotor: number
        pengeluaran: number
        keuntunganBersih: number
      }
    >()

    for (const item of filteredRekap) {
      const current = map.get(item.bulanKey) || {
        bulanKey: item.bulanKey,
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih

      map.set(item.bulanKey, current)
    }

    return Array.from(map.values()).sort((a, b) => a.bulanKey.localeCompare(b.bulanKey))
  }, [filteredRekap])

  const rankingKategoriBarang = useMemo(() => {
    const map = new Map<string, RankingKategoriBarang>()
    const q = search.toLowerCase().trim()

    for (const laporan of laporanBulananList) {
      if (filterToko && laporan.tokoId !== filterToko) continue
      if (bulanMulai && laporan.bulanKey < bulanMulai) continue
      if (bulanSelesai && laporan.bulanKey > bulanSelesai) continue

      for (const item of laporan.kategoriBreakdown || []) {
        const kategoriKey = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (!kategoriKey) continue
        if (filterKategori && kategoriKey !== filterKategori) continue

        const satuanKeys = [
          ...(item.satuanIds || []).map((value) => normalizeSatuanKey(value)),
          ...(item.satuanNamaList || []).map((value) => normalizeSatuanKey(value)),
        ].filter(Boolean)

        if (filterSatuan && !satuanKeys.includes(normalizeSatuanKey(filterSatuan))) continue

        const current = map.get(kategoriKey) || {
          kategoriId: kategoriKey,
          kategoriNama: item.kategoriNama || "Tanpa Kategori",
          penghasilanKotor: 0,
          pengeluaran: 0,
          keuntunganBersih: 0,
          omzet: 0,
          qtyTerjual: 0,
          jumlahTransaksi: 0,
        }

        current.penghasilanKotor += Number(item.labaBersih || item.labaKotor || 0)
        current.omzet += Number(item.omzet || item.totalSetelahDiskon || 0)
        current.qtyTerjual += Number(item.qtyTerjual || 0)
        current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)

        map.set(kategoriKey, current)
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        keuntunganBersih: item.penghasilanKotor - item.pengeluaran,
      }))
      .filter((item) => {
        if (!q) return true
        return item.kategoriNama.toLowerCase().includes(q)
      })
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanBulananList, filterToko, filterKategori, filterSatuan, bulanMulai, bulanSelesai, search])

  const rankingSatuanBarang = useMemo(() => {
    const map = new Map<string, RankingSatuanBarang>()
    const q = search.toLowerCase().trim()

    for (const laporan of laporanBulananList) {
      if (filterToko && laporan.tokoId !== filterToko) continue
      if (bulanMulai && laporan.bulanKey < bulanMulai) continue
      if (bulanSelesai && laporan.bulanKey > bulanSelesai) continue

      for (const item of laporan.kategoriBreakdown || []) {
        const kategoriKey = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (filterKategori && kategoriKey !== filterKategori) continue

        const ids = item.satuanIds || []
        const names = item.satuanNamaList || []
        const maxLen = Math.max(ids.length, names.length)
        const namaBarangRef = item.kategoriNama || "Tanpa Kategori"

        if (maxLen === 0) {
          const satuanKey = "tanpa-satuan"
          if (filterSatuan && satuanKey !== normalizeSatuanKey(filterSatuan)) continue

          const current = map.get(satuanKey) || {
            satuanId: satuanKey,
            satuanNama: "Tanpa Satuan",
            penghasilanKotor: 0,
            keuntunganBersih: 0,
            omzet: 0,
            qtyTerjual: 0,
            jumlahTransaksi: 0,
            namaBarangList: [],
          }

          current.penghasilanKotor += Number(item.labaBersih || item.labaKotor || 0)
          current.keuntunganBersih += Number(item.labaBersih || item.labaKotor || 0)
          current.omzet += Number(item.omzet || item.totalSetelahDiskon || 0)
          current.qtyTerjual += Number(item.qtyTerjual || 0)
          current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)

          if (namaBarangRef && !current.namaBarangList.includes(namaBarangRef)) {
            current.namaBarangList.push(namaBarangRef)
          }

          map.set(satuanKey, current)
          continue
        }

        for (let i = 0; i < maxLen; i++) {
          const rawId = String(ids[i] || "").trim()
          const rawNama = String(names[i] || "").trim()
          const satuanKey = normalizeSatuanKey(rawId || rawNama)
          const satuanNama = rawNama || rawId || "Tanpa Satuan"

          if (!satuanKey) continue
          if (filterSatuan && satuanKey !== normalizeSatuanKey(filterSatuan)) continue

          const current = map.get(satuanKey) || {
            satuanId: satuanKey,
            satuanNama,
            penghasilanKotor: 0,
            keuntunganBersih: 0,
            omzet: 0,
            qtyTerjual: 0,
            jumlahTransaksi: 0,
            namaBarangList: [],
          }

          current.penghasilanKotor += Number(item.labaBersih || item.labaKotor || 0)
          current.keuntunganBersih += Number(item.labaBersih || item.labaKotor || 0)
          current.omzet += Number(item.omzet || item.totalSetelahDiskon || 0)
          current.qtyTerjual += Number(item.qtyTerjual || 0)
          current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)

          if (namaBarangRef && !current.namaBarangList.includes(namaBarangRef)) {
            current.namaBarangList.push(namaBarangRef)
          }

          map.set(satuanKey, current)
        }
      }
    }

    return Array.from(map.values())
      .filter((item) => {
        if (!q) return true
        return (
          item.satuanNama.toLowerCase().includes(q) ||
          item.namaBarangList.some((nama) => nama.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanBulananList, filterToko, filterKategori, filterSatuan, bulanMulai, bulanSelesai, search])

  const maxChartValue = Math.max(
    ...chartData.map((item) => Math.abs(item.keuntunganBersih)),
    0
  )

  const kategoriAktifLabel =
    kategoriBarangList.find((item) => item.id === filterKategori)?.nama || "Semua Kategori"

  const satuanAktifLabel =
    satuanBarangList.find((item) => item.id === filterSatuan)?.nama || "Semua Satuan"


  const tokoAktifLabel = tokoList.find((item) => item.id === filterToko)?.nama || "Semua Toko"

  const handleExportExcel = async () => {
    if (filteredRekap.length === 0) {
      setError("Tidak ada data laporan untuk diexport")
      return
    }

    setError(null)

    try {
      const XLSX = await import("xlsx-js-style")
      const wb = XLSX.utils.book_new()
      const periodeText = `${formatBulanKey(bulanMulai)} - ${formatBulanKey(bulanSelesai)}`
      const subtitle = `Periode: ${periodeText} • Toko: ${tokoAktifLabel} • Kategori: ${kategoriAktifLabel} • Satuan: ${satuanAktifLabel}`

      XLSX.utils.book_append_sheet(
        wb,
        makeExcelSummarySheet({
          XLSX,
          title: "LAPORAN KEUNTUNGAN BERSIH",
          subtitle,
          rows: [
            ["Periode", periodeText],
            ["Toko", tokoAktifLabel],
            ["Kategori Barang", kategoriAktifLabel],
            ["Satuan", satuanAktifLabel],
            ["Total Penghasilan Kotor", totalPenghasilanKotor],
            ["Total Pengeluaran", totalPengeluaran],
            ["Total Keuntungan Bersih", totalKeuntunganBersih],
            ["Total Omzet", totalOmzet],
            ["Total Transaksi", totalTransaksi],
            ["Total Qty Terjual", totalQtyTerjual],
            ["Keuntungan Bulan Ini", keuntunganBulanIni],
            ["Jumlah Rekap", filteredRekap.length],
          ],
        }),
        "Ringkasan"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeExcelTableSheet<RekapKeuntunganBersih>({
          XLSX,
          title: "REKAP KEUNTUNGAN BERSIH",
          subtitle,
          columns: [
            { key: "bulanKey", label: "Bulan", width: 16, align: "center" },
            { key: "tokoNama", label: "Toko", width: 28 },
            { key: "kategoriNama", label: "Kategori", width: 24 },
            { key: "satuanNama", label: "Satuan", width: 18, align: "center" },
            { key: "penghasilanKotor", label: "Penghasilan Kotor", width: 20, money: true },
            { key: "pengeluaran", label: "Pengeluaran", width: 18, money: true },
            { key: "keuntunganBersih", label: "Keuntungan Bersih", width: 20, money: true },
            { key: "omzet", label: "Omzet", width: 18, money: true },
            { key: "jumlahTransaksi", label: "Transaksi", width: 12, number: true },
            { key: "jumlahQtyTerjual", label: "Qty Terjual", width: 12, number: true },
            { key: "jumlahDataPengeluaran", label: "Data Pengeluaran", width: 16, number: true },
          ],
          rows: filteredRekap.map((item) => ({
            ...item,
            bulanKey: formatBulanKey(item.bulanKey),
          })),
        }),
        "Rekap Bersih"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeExcelTableSheet<any>({
          XLSX,
          title: "CHART DATA BULANAN",
          subtitle,
          columns: [
            { key: "bulanKey", label: "Bulan", width: 18, align: "center" },
            { key: "penghasilanKotor", label: "Penghasilan Kotor", width: 20, money: true },
            { key: "pengeluaran", label: "Pengeluaran", width: 18, money: true },
            { key: "keuntunganBersih", label: "Keuntungan Bersih", width: 20, money: true },
          ],
          rows: chartData.map((item) => ({
            ...item,
            bulanKey: formatBulanKey(item.bulanKey),
          })),
        }),
        "Data Bulanan"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeExcelTableSheet<any>({
          XLSX,
          title: "RANKING TOKO",
          subtitle,
          columns: [
            { key: "tokoNama", label: "Toko", width: 30 },
            { key: "penghasilanKotor", label: "Penghasilan Kotor", width: 20, money: true },
            { key: "pengeluaran", label: "Pengeluaran", width: 18, money: true },
            { key: "keuntunganBersih", label: "Keuntungan Bersih", width: 20, money: true },
            { key: "bulanAktif", label: "Bulan Aktif", width: 14, number: true },
          ],
          rows: rankingToko,
        }),
        "Ranking Toko"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeExcelTableSheet<any>({
          XLSX,
          title: "RANKING KATEGORI BARANG",
          subtitle,
          columns: [
            { key: "kategoriNama", label: "Kategori", width: 30 },
            { key: "penghasilanKotor", label: "Penghasilan Kotor", width: 20, money: true },
            { key: "pengeluaran", label: "Pengeluaran", width: 18, money: true },
            { key: "keuntunganBersih", label: "Keuntungan Bersih", width: 20, money: true },
            { key: "omzet", label: "Omzet", width: 18, money: true },
            { key: "qtyTerjual", label: "Qty Terjual", width: 14, number: true },
            { key: "jumlahTransaksi", label: "Transaksi", width: 14, number: true },
          ],
          rows: rankingKategoriBarang,
        }),
        "Ranking Kategori"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeExcelTableSheet<any>({
          XLSX,
          title: "RANKING SATUAN",
          subtitle,
          columns: [
            { key: "satuanNama", label: "Satuan", width: 20, align: "center" },
            { key: "namaBarangText", label: "Referensi Barang", width: 42 },
            { key: "penghasilanKotor", label: "Penghasilan Kotor", width: 20, money: true },
            { key: "keuntunganBersih", label: "Keuntungan Bersih", width: 20, money: true },
            { key: "omzet", label: "Omzet", width: 18, money: true },
            { key: "qtyTerjual", label: "Qty Terjual", width: 14, number: true },
            { key: "jumlahTransaksi", label: "Transaksi", width: 14, number: true },
          ],
          rows: rankingSatuanBarang.map((item) => ({
            ...item,
            namaBarangText: item.namaBarangList.join(", "),
          })),
        }),
        "Ranking Satuan"
      )

      await downloadWorkbookXlsx(
        wb,
        `laporan_keuntungan_bersih_${bulanMulai}_${bulanSelesai}_${safeSheetName(tokoAktifLabel, "semua_toko").replace(/\s+/g, "_").toLowerCase()}.xlsx`
      )
    } catch (err) {
      console.error(err)
      setError("Gagal membuat file Excel laporan")
    }
  }

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/70 blur-[110px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-slate-100/70 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-50/80 blur-[110px]" />
      </div>

      <main className="relative z-10 w-full space-y-4 p-3 pb-28 sm:space-y-5 sm:p-4 lg:p-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
              <BarChart3 size={24} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Laporan Keuntungan Bersih
              </h1>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-50/85 sm:text-sm">
                Keuntungan kategori barang jualan · bersih setelah pengeluaran · filter satuan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={handleExportExcel}
              disabled={loading || filteredRekap.length === 0}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={13} strokeWidth={2.8} />
              <span>Excel</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={fetchAll}
              disabled={loading}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <motion.span
                animate={loading ? { rotate: 360 } : {}}
                transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
              >
                <RefreshCw size={14} className="text-white" strokeWidth={2.8} />
              </motion.span>
              <span>Refresh</span>
            </motion.button>
          </div>
        </div>

        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
      </motion.div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <AlertCircle size={14} className="text-red-500" strokeWidth={2.5} />
          <p className="text-[11px] font-bold text-red-600">{error}</p>
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bulan, toko, kategori, atau satuan..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
            <option value="">Semua Toko</option>
            {tokoList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Kategori Barang"
            value={filterKategori}
            onChange={setFilterKategori}
            icon={Layers3}
          >
            <option value="">Semua Kategori Barang</option>
            {kategoriBarangList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Satuan"
            value={filterSatuan}
            onChange={setFilterSatuan}
            icon={Ruler}
          >
            <option value="">Semua Satuan</option>
            {satuanBarangList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Mulai
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="month"
                value={bulanMulai}
                onChange={(e) => setBulanMulai(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Selesai
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="month"
                value={bulanSelesai}
                onChange={(e) => setBulanSelesai(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={CircleDollarSign}
          label="Penghasilan Kotor"
          value={formatRupiah(totalPenghasilanKotor)}
          subValue={`${totalTransaksi} transaksi • ${kategoriAktifLabel}`}
        />
        <InfoCard
          icon={Wallet}
          label="Pengeluaran"
          value={formatRupiah(totalPengeluaran)}
          subValue={`${filteredRekap.length} rekap • ${satuanAktifLabel}`}
        />
        <InfoCard
          icon={TrendingUp}
          label="Keuntungan Bersih"
          value={formatRupiah(totalKeuntunganBersih)}
          subValue={`Omzet ${formatRupiah(totalOmzet)}`}
        />
        <InfoCard
          icon={ReceiptText}
          label="Qty Terjual"
          value={new Intl.NumberFormat("id-ID").format(totalQtyTerjual)}
          subValue={`Bulan ini ${formatRupiah(keuntunganBulanIni)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Chart Keuntungan Bersih Bulanan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Grafik batang keuntungan bersih per bulan
              </p>
            </div>

            {chartData.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-4">
                {chartData.map((item) => {
                  const percent =
                    maxChartValue > 0
                      ? (Math.abs(item.keuntunganBersih) / maxChartValue) * 100
                      : 0

                  const isNegative = item.keuntunganBersih < 0

                  return (
                    <div key={item.bulanKey}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                          {formatBulanKey(item.bulanKey)}
                        </p>
                        <p
                          className={`text-sm font-black ${
                            isNegative ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {formatRupiah(item.keuntunganBersih)}
                        </p>
                      </div>

                      <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${
                            isNegative
                              ? "bg-gradient-to-r from-red-400 to-orange-500"
                              : "bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800"
                          }`}
                          style={{ width: `${Math.max(percent, 2)}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          Kotor: {formatRupiah(item.penghasilanKotor)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                          Pengeluaran: {formatRupiah(item.pengeluaran)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Rekap Keuntungan Bersih
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Detail per bulan, toko, kategori barang, dan satuan
              </p>
            </div>

            {filteredRekap.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRekap.map((item, index) => {
                  const isNegative = item.keuntunganBersih < 0

                  return (
                    <div
                      key={`${item.bulanKey}-${item.tokoId}-${item.kategoriId}-${item.satuanId}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800">
                            {formatBulanKey(item.bulanKey)}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {item.tokoNama || "Tanpa Toko"} • {item.kategoriNama || "Semua Kategori"} •{" "}
                            {item.satuanNama || "Semua Satuan"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Kotor
                            </p>
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(item.penghasilanKotor)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Pengeluaran
                            </p>
                            <p className="text-sm font-black text-red-600">
                              {formatRupiah(item.pengeluaran)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Bersih
                            </p>
                            <p
                              className={`text-sm font-black ${
                                isNegative ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {formatRupiah(item.keuntunganBersih)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Omzet
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {formatRupiah(item.omzet)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Transaksi
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahTransaksi}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Qty Terjual
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahQtyTerjual}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Data Pengeluaran
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {item.jumlahDataPengeluaran}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Toko Teratas
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Ranking toko berdasarkan keuntungan bersih
              </p>
            </div>

            {rankingToko.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {rankingToko.slice(0, 8).map((item, idx) => {
                  const isNegative = item.keuntunganBersih < 0

                  return (
                    <div
                      key={`${item.tokoId}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-800">
                                {item.tokoNama}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {item.bulanAktif} bulan aktif
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p
                            className={`text-sm font-black ${
                              isNegative ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatRupiah(item.keuntunganBersih)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Kotor {formatRupiah(item.penghasilanKotor)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Ranking Kategori Barang
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Kategori barang yang paling menguntungkan
              </p>
            </div>

            {rankingKategoriBarang.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {rankingKategoriBarang.slice(0, 8).map((item, idx) => {
                  const isNegative = item.keuntunganBersih < 0

                  return (
                    <div
                      key={`${item.kategoriId}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-800">
                                {item.kategoriNama}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {item.qtyTerjual} item • {item.jumlahTransaksi} transaksi
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p
                            className={`text-sm font-black ${
                              isNegative ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatRupiah(item.keuntunganBersih)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Omzet {formatRupiah(item.omzet)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Ranking Satuan
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Satuan yang paling menguntungkan
              </p>
            </div>

            {rankingSatuanBarang.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data satuan
              </div>
            ) : (
              <div className="space-y-3">
                {rankingSatuanBarang.slice(0, 8).map((item, idx) => {
                  const isNegative = item.keuntunganBersih < 0

                  return (
                    <div
                      key={`${item.satuanId}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-black text-white">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-800">
                                {item.satuanNama}
                              </p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {item.qtyTerjual} item • {item.jumlahTransaksi} transaksi
                              </p>
                              <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-500">
                                {item.namaBarangList.length > 0
                                  ? item.namaBarangList.join(", ")
                                  : "Belum ada nama barang"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p
                            className={`text-sm font-black ${
                              isNegative ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatRupiah(item.keuntunganBersih)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Omzet {formatRupiah(item.omzet)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          
        </div>
      </div>
      </main>
    </div>
  )
}