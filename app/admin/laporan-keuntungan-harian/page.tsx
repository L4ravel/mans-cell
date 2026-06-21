/*
  Halaman admin laporan keuntungan harian.
  Revisi: tab kategori dibuat menjadi Grup Kategori dan Kategori, default Grup Kategori, termasuk pada popup mobile dan panel desktop.
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
  Cpu,
  Download,
  Layers3,
  ListFilter,
  ReceiptText,
  RefreshCw,
  Ruler,
  Search,
  Store,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

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
  namaBarangList?: string[]
}

type KelompokKategoriBreakdown = {
  kelompokId: string
  namaKelompok: string
  urutan: number
  tokoId: string
  tokoNama: string
  kategoriIds: string[]
  kategoriNama: string[]
  jumlahTransaksi: number
  totalQty: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalModal: number
  totalBiayaAdmin: number
  totalLabaKotor: number
}

type LaporanHarian = {
  id: string
  tanggalKey: string
  tokoId: string
  tokoNama: string
  totalLabaKotor: number
  totalKeuntunganBersih: number
  omzet: number
  jumlahTransaksi: number
  kategoriBreakdown: KategoriBreakdown[]
  kelompokKategoriBreakdown: KelompokKategoriBreakdown[]
}

type Pengeluaran = {
  id: string
  tanggalKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  nominal: number
}

type RekapKeuntunganHarian = {
  tanggalKey: string
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

type RankingGrupKategori = {
  kelompokId: string
  namaKelompok: string
  penghasilanKotor: number
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

type RankingModalType = "toko" | "kategori" | "satuan" | null
type KategoriRankingTab = "grup" | "kategori"
type RankingItemType = "toko" | "kategori" | "grupKategori" | "satuan"
type MobileReportTab = "chart" | "rekap"

type RankingToko = {
  tokoId: string
  tokoNama: string
  penghasilanKotor: number
  pengeluaran: number
  keuntunganBersih: number
  hariAktif: number
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0))
}

function formatCompactNumber(value: number) {
  const rounded = Math.round(Number(value || 0) * 100) / 100
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(rounded)
}

function formatTanggalKey(value?: string) {
  if (!value) return "-"
  const parts = String(value).split("-")
  if (parts.length !== 3) return value
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!year || !month || !day) return value

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  const d = `${date.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getStartOfMonthDateInput() {
  const now = new Date()
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-01`
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

function getTanggalKeyFromUnknown(value: any) {
  const direct = String(value?.tanggalKey || "").trim()
  if (direct) return direct

  const createdAtMs = Number(value?.createdAtMs || 0)
  if (createdAtMs > 0) {
    return toDateInputValue(new Date(createdAtMs))
  }

  const tanggal = value?.tanggal
  if (tanggal?.toDate) return toDateInputValue(tanggal.toDate())
  if (typeof tanggal === "string" && tanggal.length >= 10) return tanggal.slice(0, 10)

  return ""
}

function getSatuanEntries(item: KategoriBreakdown) {
  const ids = Array.isArray(item.satuanIds) ? item.satuanIds : []
  const names = Array.isArray(item.satuanNamaList) ? item.satuanNamaList : []
  const maxLen = Math.max(ids.length, names.length)
  const result: { id: string; nama: string; key: string }[] = []

  for (let i = 0; i < maxLen; i += 1) {
    const rawId = String(ids[i] || "").trim()
    const rawNama = String(names[i] || "").trim()
    const normalizedKey = normalizeSatuanKey(rawId || rawNama)
    const visibleNama = rawNama || rawId || "Tanpa Satuan"

    if (!normalizedKey) continue
    if (result.some((entry) => entry.key === normalizedKey)) continue

    result.push({ id: normalizedKey, nama: visibleNama, key: normalizedKey })
  }

  return result
}

function getNamaBarangRefs(item: KategoriBreakdown) {
  return uniqueStringList([
    ...(Array.isArray(item.namaBarangList) ? item.namaBarangList : []),
  ])
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function getFirstFilledNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue
    const numberValue = normalizeNumber(value)
    if (numberValue !== 0) return numberValue
  }

  return 0
}

function getKelompokLabaKotor(item: any) {
  const directValue = getFirstFilledNumber(
    item?.totalLabaKotor,
    item?.labaBersih,
    item?.estimasiLabaKotor,
    item?.keuntungan,
    item?.untung,
    item?.laba,
  )

  if (directValue !== 0) return directValue

  const totalSetelahDiskon = normalizeNumber(item?.totalSetelahDiskon ?? item?.omzet)
  const totalModal = normalizeNumber(item?.totalModal ?? item?.modal)

  if (totalSetelahDiskon !== 0 && totalModal !== 0) {
    return totalSetelahDiskon - totalModal
  }

  return 0
}

function normalizeKelompokBreakdown(value: unknown): KelompokKategoriBreakdown[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => ({
      kelompokId: String(item?.kelompokId || item?.id || item?.groupId || "tanpa-kelompok").trim() || "tanpa-kelompok",
      namaKelompok: String(item?.namaKelompok || item?.kelompokNama || item?.nama || "Tanpa Kelompok").trim() || "Tanpa Kelompok",
      urutan: normalizeNumber(item?.urutan || 9999),
      tokoId: String(item?.tokoId || "").trim(),
      tokoNama: String(item?.tokoNama || "").trim(),
      kategoriIds: uniqueStringList(Array.isArray(item?.kategoriIds) ? item.kategoriIds : []),
      kategoriNama: uniqueStringList(Array.isArray(item?.kategoriNama) ? item.kategoriNama : []),
      jumlahTransaksi: normalizeNumber(item?.jumlahTransaksi ?? item?.transaksi),
      totalQty: normalizeNumber(item?.totalQty ?? item?.qtyTerjual ?? item?.qty ?? item?.totalItemTerjual),
      omzet: normalizeNumber(item?.omzet ?? item?.totalSetelahDiskon),
      subtotal: normalizeNumber(item?.subtotal),
      totalDiskon: normalizeNumber(item?.totalDiskon),
      totalSetelahDiskon: normalizeNumber(item?.totalSetelahDiskon ?? item?.omzet),
      totalModal: normalizeNumber(item?.totalModal ?? item?.modal),
      totalBiayaAdmin: normalizeNumber(item?.totalBiayaAdmin ?? item?.biayaAdmin),
      totalLabaKotor: getKelompokLabaKotor(item),
    }))
    .filter((item) => item.namaKelompok)
}

async function downloadWorkbookXlsx(workbook: any, filename: string) {
  const XLSX = await import("xlsx-js-style")
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

function safeSheetName(value: string, fallback = "Sheet") {
  const clean = String(value || fallback)
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return (clean || fallback).slice(0, 31)
}

function makeSheet(XLSX: any, title: string, headers: string[], rows: any[][]) {
  const ws = XLSX.utils.aoa_to_sheet([[title], [], headers, ...rows])
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, headers.length - 1) } }]
  ws["!cols"] = headers.map(() => ({ wch: 22 }))
  return ws
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
          } py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
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

export default function LaporanKeuntunganHarianPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanHarianList, setLaporanHarianList] = useState<LaporanHarian[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterSatuan, setFilterSatuan] = useState("")
  const [tanggalMulai, setTanggalMulai] = useState(getStartOfMonthDateInput())
  const [tanggalSelesai, setTanggalSelesai] = useState(toDateInputValue(new Date()))
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [rankingModal, setRankingModal] = useState<RankingModalType>(null)
  const [desktopKategoriTab, setDesktopKategoriTab] = useState<KategoriRankingTab>("grup")
  const [mobileKategoriTab, setMobileKategoriTab] = useState<KategoriRankingTab>("grup")
  const [mobileReportTab, setMobileReportTab] = useState<MobileReportTab>("chart")

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, laporanSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "laporan_harian"), orderBy("tanggalKey", "desc"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("createdAtMs", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: String(x?.nama || ""),
          aktif: Boolean(x?.aktif),
        }
      })

      const laporanData: LaporanHarian[] = laporanSnap.docs.map((d) => {
        const x = d.data() as any
        const kategoriBreakdown: KategoriBreakdown[] = Array.isArray(x?.kategoriBreakdown)
          ? x.kategoriBreakdown.map((item: any) => {
              const namaKategori = String(item?.nama || item?.kategoriNama || "Tanpa Kategori").trim()
              const kategoriKey = String(item?.kategoriId || namaKategori).trim().toLowerCase()
              const satuanIds = uniqueStringList(Array.isArray(item?.satuanIds) ? item.satuanIds : [])
              const satuanNamaList = uniqueStringList(Array.isArray(item?.satuanNamaList) ? item.satuanNamaList : [])
              const namaBarangList = uniqueStringList([
                ...(Array.isArray(item?.namaBarangList) ? item.namaBarangList : []),
                ...(Array.isArray(item?.barangNamaList) ? item.barangNamaList : []),
                ...(Array.isArray(item?.produkNamaList) ? item.produkNamaList : []),
              ])

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
                  item?.labaKotor ?? Number(item?.totalSetelahDiskon || 0) - Number(item?.totalModal || 0)
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
                namaBarangList,
              }
            })
          : []

        const kelompokKategoriBreakdown = normalizeKelompokBreakdown(x?.kelompokKategoriBreakdown)

        return {
          id: d.id,
          tanggalKey: String(x?.tanggalKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          totalLabaKotor: Number(x?.totalLabaKotor || 0),
          totalKeuntunganBersih: Number(x?.totalKeuntunganBersih ?? x?.totalLabaKotor ?? 0),
          omzet: Number(x?.omzet || 0),
          jumlahTransaksi: Number(x?.jumlahTransaksi || 0),
          kategoriBreakdown,
          kelompokKategoriBreakdown,
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          tanggalKey: getTanggalKeyFromUnknown(x),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          kategoriId: String(x?.kategoriId || ""),
          kategoriNama: String(x?.kategoriNama || ""),
          nominal: Number(x?.nominal || 0),
        }
      })

      setTokoList(tokoData.filter((item) => item.nama))
      setLaporanHarianList(laporanData.filter((item) => item.tanggalKey))
      setPengeluaranList(pengeluaranData.filter((item) => item.tanggalKey))
    } catch (err) {
      console.error(err)
      setError("Gagal memuat laporan keuntungan harian")
      setTokoList([])
      setLaporanHarianList([])
      setPengeluaranList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchAll()
    })

    return () => unsub()
  }, [])

  const laporanHarianVisible = useMemo(() => {
    return laporanHarianList.filter((laporan) => {
      const matchToko = !filterToko || laporan.tokoId === filterToko
      const matchStart = !tanggalMulai || laporan.tanggalKey >= tanggalMulai
      const matchEnd = !tanggalSelesai || laporan.tanggalKey <= tanggalSelesai
      return matchToko && matchStart && matchEnd
    })
  }, [laporanHarianList, filterToko, tanggalMulai, tanggalSelesai])

  const kategoriBarangList = useMemo(() => {
    const map = new Map<string, { id: string; nama: string }>()

    for (const laporan of laporanHarianVisible) {
      for (const item of laporan.kategoriBreakdown || []) {
        const key = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (!key) continue
        if (!map.has(key)) map.set(key, { id: key, nama: item.kategoriNama || "Tanpa Kategori" })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  }, [laporanHarianVisible])

  const satuanBarangList = useMemo(() => {
    const map = new Map<string, { id: string; nama: string }>()

    for (const laporan of laporanHarianVisible) {
      for (const item of laporan.kategoriBreakdown || []) {
        for (const entry of getSatuanEntries(item)) {
          if (!map.has(entry.key)) map.set(entry.key, { id: entry.key, nama: entry.nama })
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  }, [laporanHarianVisible])

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
    const map = new Map<string, RekapKeuntunganHarian>()
    const aktifKategoriNama =
      kategoriBarangList.find((x) => x.id === filterKategori)?.nama || "Semua Kategori"
    const aktifSatuanNama =
      satuanBarangList.find((x) => x.id === filterSatuan)?.nama || "Semua Satuan"

    for (const item of laporanHarianList) {
      const matchedBreakdowns = (item.kategoriBreakdown || []).filter((row) => {
        const rowKategoriKey = row.kategoriId || normalizeKategoriKey(row.kategoriNama)
        const matchKategori = !filterKategori || rowKategoriKey === filterKategori
        const rowSatuanKeys = getSatuanEntries(row).map((entry) => entry.key)
        const matchSatuan = !filterSatuan || rowSatuanKeys.includes(normalizeSatuanKey(filterSatuan))
        return matchKategori && matchSatuan
      })

      if (filterKategori || filterSatuan) {
        if (matchedBreakdowns.length === 0) continue

        const key = `${item.tanggalKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}__${
          filterKategori || "all"
        }__${filterSatuan || "all"}`

        const current = map.get(key) || {
          tanggalKey: item.tanggalKey,
          tokoId: item.tokoId,
          tokoNama: item.tokoNama || "Tanpa Toko",
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
        const key = `${item.tanggalKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}__all__all`
        const current = map.get(key) || {
          tanggalKey: item.tanggalKey,
          tokoId: item.tokoId,
          tokoNama: item.tokoNama || "Tanpa Toko",
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

        current.penghasilanKotor += Number(item.totalKeuntunganBersih || item.totalLabaKotor || 0)
        current.omzet += Number(item.omzet || 0)
        current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)
        current.jumlahQtyTerjual += Number(
          (item.kategoriBreakdown || []).reduce((sum, row) => sum + Number(row?.qtyTerjual || 0), 0)
        )

        map.set(key, current)
      }
    }

    for (const item of pengeluaranList) {
      const key = `${item.tanggalKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}__${
        filterKategori || "all"
      }__${filterSatuan || "all"}`

      const current = map.get(key) || {
        tanggalKey: item.tanggalKey,
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
      .map((item) => ({ ...item, keuntunganBersih: item.penghasilanKotor - item.pengeluaran }))
      .sort((a, b) => {
        const tanggalCompare = b.tanggalKey.localeCompare(a.tanggalKey)
        if (tanggalCompare !== 0) return tanggalCompare
        return b.keuntunganBersih - a.keuntunganBersih
      })
  }, [
    laporanHarianList,
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
        item.tanggalKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.satuanNama.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchStart = !tanggalMulai || item.tanggalKey >= tanggalMulai
      const matchEnd = !tanggalSelesai || item.tanggalKey <= tanggalSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [rekapList, search, filterToko, tanggalMulai, tanggalSelesai])

  const totalPenghasilanKotor = filteredRekap.reduce((acc, item) => acc + item.penghasilanKotor, 0)
  const totalPengeluaran = filteredRekap.reduce((acc, item) => acc + item.pengeluaran, 0)
  const totalKeuntunganBersih = filteredRekap.reduce((acc, item) => acc + item.keuntunganBersih, 0)
  const totalOmzet = filteredRekap.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredRekap.reduce((acc, item) => acc + item.jumlahTransaksi, 0)
  const totalQtyTerjual = filteredRekap.reduce((acc, item) => acc + item.jumlahQtyTerjual, 0)

  const keuntunganHariIni = filteredRekap
    .filter((item) => item.tanggalKey === toDateInputValue(new Date()))
    .reduce((acc, item) => acc + item.keuntunganBersih, 0)

  const rankingToko = useMemo(() => {
    const map = new Map<string, RankingToko>()

    for (const item of filteredRekap) {
      const key = item.tokoId || item.tokoNama || item.tanggalKey
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        hariAktif: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih
      current.hariAktif += 1
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [filteredRekap])

  const chartData = useMemo(() => {
    const map = new Map<
      string,
      { tanggalKey: string; penghasilanKotor: number; pengeluaran: number; keuntunganBersih: number }
    >()

    for (const item of filteredRekap) {
      const current = map.get(item.tanggalKey) || {
        tanggalKey: item.tanggalKey,
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih
      map.set(item.tanggalKey, current)
    }

    return Array.from(map.values()).sort((a, b) => b.tanggalKey.localeCompare(a.tanggalKey))
  }, [filteredRekap])

  const rankingKategoriBarang = useMemo(() => {
    const map = new Map<string, RankingKategoriBarang>()
    const q = search.toLowerCase().trim()

    for (const laporan of laporanHarianList) {
      if (filterToko && laporan.tokoId !== filterToko) continue
      if (tanggalMulai && laporan.tanggalKey < tanggalMulai) continue
      if (tanggalSelesai && laporan.tanggalKey > tanggalSelesai) continue

      for (const item of laporan.kategoriBreakdown || []) {
        const kategoriKey = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (!kategoriKey) continue
        if (filterKategori && kategoriKey !== filterKategori) continue
        const satuanKeys = getSatuanEntries(item).map((entry) => entry.key)
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
      .map((item) => ({ ...item, keuntunganBersih: item.penghasilanKotor - item.pengeluaran }))
      .filter((item) => !q || item.kategoriNama.toLowerCase().includes(q))
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, filterToko, filterKategori, filterSatuan, tanggalMulai, tanggalSelesai, search])

  const rankingGrupKategori = useMemo(() => {
    const map = new Map<string, RankingGrupKategori>()
    const q = search.toLowerCase().trim()

    for (const laporan of laporanHarianList) {
      if (filterToko && laporan.tokoId !== filterToko) continue
      if (tanggalMulai && laporan.tanggalKey < tanggalMulai) continue
      if (tanggalSelesai && laporan.tanggalKey > tanggalSelesai) continue

      for (const item of laporan.kelompokKategoriBreakdown || []) {
        const kelompokKey = item.kelompokId || normalizeKategoriKey(item.namaKelompok)
        if (!kelompokKey) continue

        const current = map.get(kelompokKey) || {
          kelompokId: kelompokKey,
          namaKelompok: item.namaKelompok || "Tanpa Kelompok",
          penghasilanKotor: 0,
          keuntunganBersih: 0,
          omzet: 0,
          qtyTerjual: 0,
          jumlahTransaksi: 0,
        }

        const laba = getKelompokLabaKotor(item)
        current.penghasilanKotor += laba
        current.keuntunganBersih += laba
        current.omzet += normalizeNumber(item.omzet || item.totalSetelahDiskon)
        current.qtyTerjual += normalizeNumber(item.totalQty)
        current.jumlahTransaksi += normalizeNumber(item.jumlahTransaksi)
        map.set(kelompokKey, current)
      }
    }

    return Array.from(map.values())
      .filter((item) => !q || item.namaKelompok.toLowerCase().includes(q))
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, filterToko, tanggalMulai, tanggalSelesai, search])

  const rankingSatuanBarang = useMemo(() => {
    const map = new Map<string, RankingSatuanBarang>()
    const q = search.toLowerCase().trim()

    for (const laporan of laporanHarianList) {
      if (filterToko && laporan.tokoId !== filterToko) continue
      if (tanggalMulai && laporan.tanggalKey < tanggalMulai) continue
      if (tanggalSelesai && laporan.tanggalKey > tanggalSelesai) continue

      for (const item of laporan.kategoriBreakdown || []) {
        const kategoriKey = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (filterKategori && kategoriKey !== filterKategori) continue

        const namaBarangRefs = getNamaBarangRefs(item)
        const satuanEntries = getSatuanEntries(item)
        const effectiveEntries =
          satuanEntries.length > 0
            ? satuanEntries
            : [{ id: "tanpa-satuan", nama: "Tanpa Satuan", key: "tanpa-satuan" }]

        if (filterSatuan) {
          const hasMatchSatuan = effectiveEntries.some((entry) => entry.key === normalizeSatuanKey(filterSatuan))
          if (!hasMatchSatuan) continue
        }

        const divisor = effectiveEntries.length || 1
        const partialPenghasilan = Number(item.labaBersih || item.labaKotor || 0) / divisor
        const partialOmzet = Number(item.omzet || item.totalSetelahDiskon || 0) / divisor
        const partialQty = Number(item.qtyTerjual || 0) / divisor
        const partialTransaksi = Number(item.jumlahTransaksi || 0) / divisor

        for (const entry of effectiveEntries) {
          if (filterSatuan && entry.key !== normalizeSatuanKey(filterSatuan)) continue

          const current = map.get(entry.key) || {
            satuanId: entry.key,
            satuanNama: entry.nama,
            penghasilanKotor: 0,
            keuntunganBersih: 0,
            omzet: 0,
            qtyTerjual: 0,
            jumlahTransaksi: 0,
            namaBarangList: [],
          }

          current.penghasilanKotor += partialPenghasilan
          current.keuntunganBersih += partialPenghasilan
          current.omzet += partialOmzet
          current.qtyTerjual += partialQty
          current.jumlahTransaksi += partialTransaksi

          const refsToAdd = namaBarangRefs.length > 0 ? namaBarangRefs : [item.kategoriNama || "Tanpa Kategori"]
          for (const nama of refsToAdd) {
            if (!current.namaBarangList.some((saved) => saved.toLowerCase() === nama.toLowerCase())) {
              current.namaBarangList.push(nama)
            }
          }

          map.set(entry.key, current)
        }
      }
    }

    return Array.from(map.values())
      .map((item) => ({ ...item, namaBarangList: item.namaBarangList.sort((a, b) => a.localeCompare(b)) }))
      .filter((item) => {
        if (!q) return true
        return (
          item.satuanNama.toLowerCase().includes(q) ||
          item.namaBarangList.some((nama) => nama.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, filterToko, filterKategori, filterSatuan, tanggalMulai, tanggalSelesai, search])


  const todayKey = toDateInputValue(new Date())

  const todayRekapList = useMemo(() => {
    const map = new Map<string, RekapKeuntunganHarian>()

    for (const item of laporanHarianList) {
      if (item.tanggalKey !== todayKey) continue

      const key = `${item.tanggalKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}__all__all`
      const current = map.get(key) || {
        tanggalKey: item.tanggalKey,
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
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

      current.penghasilanKotor += Number(item.totalKeuntunganBersih || item.totalLabaKotor || 0)
      current.omzet += Number(item.omzet || 0)
      current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)
      current.jumlahQtyTerjual += Number(
        (item.kategoriBreakdown || []).reduce(
          (sum, row) => sum + Number(row?.qtyTerjual || 0),
          0
        )
      )

      map.set(key, current)
    }

    for (const item of pengeluaranList) {
      if (item.tanggalKey !== todayKey) continue

      const key = `${item.tanggalKey}__${item.tokoId || item.tokoNama || "tanpa-toko"}__all__all`
      const current = map.get(key) || {
        tanggalKey: item.tanggalKey,
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
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

      current.pengeluaran += Number(item.nominal || 0)
      current.jumlahDataPengeluaran += 1
      map.set(key, current)
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        keuntunganBersih: item.penghasilanKotor - item.pengeluaran,
      }))
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, pengeluaranList, todayKey])

  const todayRankingToko = useMemo(() => {
    const map = new Map<string, RankingToko>()

    for (const item of todayRekapList) {
      const key = item.tokoId || item.tokoNama || item.tanggalKey
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        penghasilanKotor: 0,
        pengeluaran: 0,
        keuntunganBersih: 0,
        hariAktif: 0,
      }

      current.penghasilanKotor += item.penghasilanKotor
      current.pengeluaran += item.pengeluaran
      current.keuntunganBersih += item.keuntunganBersih
      current.hariAktif = 1
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [todayRekapList])

  const todayRankingGrupKategori = useMemo(() => {
    const map = new Map<string, RankingGrupKategori>()

    for (const laporan of laporanHarianList) {
      if (laporan.tanggalKey !== todayKey) continue

      for (const item of laporan.kelompokKategoriBreakdown || []) {
        const kelompokKey = item.kelompokId || normalizeKategoriKey(item.namaKelompok)
        if (!kelompokKey) continue

        const current = map.get(kelompokKey) || {
          kelompokId: kelompokKey,
          namaKelompok: item.namaKelompok || "Tanpa Kelompok",
          penghasilanKotor: 0,
          keuntunganBersih: 0,
          omzet: 0,
          qtyTerjual: 0,
          jumlahTransaksi: 0,
        }

        const laba = getKelompokLabaKotor(item)
        current.penghasilanKotor += laba
        current.keuntunganBersih += laba
        current.omzet += normalizeNumber(item.omzet || item.totalSetelahDiskon)
        current.qtyTerjual += normalizeNumber(item.totalQty)
        current.jumlahTransaksi += normalizeNumber(item.jumlahTransaksi)
        map.set(kelompokKey, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, todayKey])

  const todayRankingKategoriBarang = useMemo(() => {
    const map = new Map<string, RankingKategoriBarang>()

    for (const laporan of laporanHarianList) {
      if (laporan.tanggalKey !== todayKey) continue

      for (const item of laporan.kategoriBreakdown || []) {
        const kategoriKey = item.kategoriId || normalizeKategoriKey(item.kategoriNama)
        if (!kategoriKey) continue

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
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, todayKey])

  const todayRankingSatuanBarang = useMemo(() => {
    const map = new Map<string, RankingSatuanBarang>()

    for (const laporan of laporanHarianList) {
      if (laporan.tanggalKey !== todayKey) continue

      for (const item of laporan.kategoriBreakdown || []) {
        const namaBarangRefs = getNamaBarangRefs(item)
        const satuanEntries = getSatuanEntries(item)
        const effectiveEntries =
          satuanEntries.length > 0
            ? satuanEntries
            : [{ id: "tanpa-satuan", nama: "Tanpa Satuan", key: "tanpa-satuan" }]

        const divisor = effectiveEntries.length || 1
        const partialPenghasilan = Number(item.labaBersih || item.labaKotor || 0) / divisor
        const partialOmzet = Number(item.omzet || item.totalSetelahDiskon || 0) / divisor
        const partialQty = Number(item.qtyTerjual || 0) / divisor
        const partialTransaksi = Number(item.jumlahTransaksi || 0) / divisor

        for (const entry of effectiveEntries) {
          const current = map.get(entry.key) || {
            satuanId: entry.key,
            satuanNama: entry.nama,
            penghasilanKotor: 0,
            keuntunganBersih: 0,
            omzet: 0,
            qtyTerjual: 0,
            jumlahTransaksi: 0,
            namaBarangList: [],
          }

          current.penghasilanKotor += partialPenghasilan
          current.keuntunganBersih += partialPenghasilan
          current.omzet += partialOmzet
          current.qtyTerjual += partialQty
          current.jumlahTransaksi += partialTransaksi

          const refsToAdd = namaBarangRefs.length > 0 ? namaBarangRefs : [item.kategoriNama || "Tanpa Kategori"]
          for (const nama of refsToAdd) {
            if (!current.namaBarangList.some((saved) => saved.toLowerCase() === nama.toLowerCase())) {
              current.namaBarangList.push(nama)
            }
          }

          map.set(entry.key, current)
        }
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        namaBarangList: item.namaBarangList.sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanHarianList, todayKey])

  const maxChartValue = Math.max(...chartData.map((item) => Math.abs(item.keuntunganBersih)), 0)

  const kategoriAktifLabel =
    kategoriBarangList.find((item) => item.id === filterKategori)?.nama || "Semua Kategori"
  const satuanAktifLabel =
    satuanBarangList.find((item) => item.id === filterSatuan)?.nama || "Semua Satuan"
  const tokoAktifLabel = tokoList.find((item) => item.id === filterToko)?.nama || "Semua Toko"

  const resetFilter = () => {
    setSearch("")
    setFilterToko("")
    setFilterKategori("")
    setFilterSatuan("")
    setTanggalMulai(getStartOfMonthDateInput())
    setTanggalSelesai(toDateInputValue(new Date()))
  }

  const handleExportExcel = async () => {
    if (filteredRekap.length === 0) {
      setError("Tidak ada data laporan untuk diexport")
      return
    }

    setError(null)

    try {
      const XLSX = await import("xlsx-js-style")
      const wb = XLSX.utils.book_new()
      const periodeText = `${formatTanggalKey(tanggalMulai)} - ${formatTanggalKey(tanggalSelesai)}`

      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(
          XLSX,
          "LAPORAN KEUNTUNGAN HARIAN",
          ["Keterangan", "Nilai"],
          [
            ["Periode", periodeText],
            ["Toko", tokoAktifLabel],
            ["Kategori", kategoriAktifLabel],
            ["Satuan", satuanAktifLabel],
            ["Penghasilan Kotor", totalPenghasilanKotor],
            ["Pengeluaran", totalPengeluaran],
            ["Keuntungan Bersih", totalKeuntunganBersih],
            ["Omzet", totalOmzet],
            ["Transaksi", totalTransaksi],
            ["Qty Terjual", totalQtyTerjual],
          ]
        ),
        "Ringkasan"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(
          XLSX,
          "REKAP KEUNTUNGAN HARIAN",
          [
            "Tanggal",
            "Toko",
            "Kategori",
            "Satuan",
            "Penghasilan Kotor",
            "Pengeluaran",
            "Keuntungan Bersih",
            "Omzet",
            "Transaksi",
            "Qty Terjual",
            "Data Pengeluaran",
          ],
          filteredRekap.map((item) => [
            formatTanggalKey(item.tanggalKey),
            item.tokoNama,
            item.kategoriNama,
            item.satuanNama,
            item.penghasilanKotor,
            item.pengeluaran,
            item.keuntunganBersih,
            item.omzet,
            item.jumlahTransaksi,
            item.jumlahQtyTerjual,
            item.jumlahDataPengeluaran,
          ])
        ),
        "Rekap Harian"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(
          XLSX,
          "RANKING TOKO",
          ["Toko", "Penghasilan Kotor", "Pengeluaran", "Keuntungan Bersih", "Hari Aktif"],
          rankingToko.map((item) => [
            item.tokoNama,
            item.penghasilanKotor,
            item.pengeluaran,
            item.keuntunganBersih,
            item.hariAktif,
          ])
        ),
        "Ranking Toko"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(
          XLSX,
          "RANKING KATEGORI",
          ["Kategori", "Penghasilan Kotor", "Keuntungan Bersih", "Omzet", "Qty", "Transaksi"],
          rankingKategoriBarang.map((item) => [
            item.kategoriNama,
            item.penghasilanKotor,
            item.keuntunganBersih,
            item.omzet,
            item.qtyTerjual,
            item.jumlahTransaksi,
          ])
        ),
        "Ranking Kategori"
      )

      XLSX.utils.book_append_sheet(
        wb,
        makeSheet(
          XLSX,
          "RANKING SATUAN",
          ["Satuan", "Referensi Barang", "Penghasilan Kotor", "Keuntungan Bersih", "Omzet", "Qty", "Transaksi"],
          rankingSatuanBarang.map((item) => [
            item.satuanNama,
            item.namaBarangList.join(", "),
            item.penghasilanKotor,
            item.keuntunganBersih,
            item.omzet,
            item.qtyTerjual,
            item.jumlahTransaksi,
          ])
        ),
        "Ranking Satuan"
      )

      await downloadWorkbookXlsx(
        wb,
        `laporan_keuntungan_harian_${tanggalMulai}_${tanggalSelesai}_${safeSheetName(tokoAktifLabel, "semua_toko")
          .replace(/\s+/g, "_")
          .toLowerCase()}.xlsx`
      )
    } catch (err) {
      console.error(err)
      setError("Gagal membuat file Excel laporan")
    }
  }

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BarChart3 size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Laporan Keuntungan Harian
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Rekap laba bersih harian setelah pengeluaran, kategori, toko, dan satuan.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={handleExportExcel}
                disabled={loading || filteredRekap.length === 0}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                <Download size={12} strokeWidth={2.8} />
                <span>Excel</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={fetchAll}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                type="button"
              >
                <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
                <span>Refresh</span>
              </motion.button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
            >
              <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-red-700">{error}</p>
              <button type="button" onClick={() => setError(null)} className="text-red-500">
                <X size={14} strokeWidth={3} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <StatCard icon={CircleDollarSign} label="Penghasilan Kotor" value={formatRupiah(totalPenghasilanKotor)} subValue={`${formatCompactNumber(totalTransaksi)} transaksi`} />
          <StatCard icon={Wallet} label="Pengeluaran" value={formatRupiah(totalPengeluaran)} subValue={`${filteredRekap.length} rekap`} />
          <StatCard icon={TrendingUp} label="Keuntungan Bersih" value={formatRupiah(totalKeuntunganBersih)} subValue={`Omzet ${formatRupiah(totalOmzet)}`} />
          <StatCard icon={ReceiptText} label="Qty Terjual" value={formatCompactNumber(totalQtyTerjual)} subValue={`Hari ini ${formatRupiah(keuntunganHariIni)}`} />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:hidden">
          <MobileActionButton icon={Store} label="Toko" onClick={() => setRankingModal("toko")} />
          <MobileActionButton icon={Layers3} label="Kategori" onClick={() => { setMobileKategoriTab("grup"); setRankingModal("kategori") }} />
          <MobileActionButton icon={Ruler} label="Satuan" onClick={() => setRankingModal("satuan")} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:hidden"
        >
          <div className="grid grid-cols-2 gap-2">
            <MobileReportTabButton
              active={mobileReportTab === "chart"}
              icon={BarChart3}
              label="Chart"
              onClick={() => setMobileReportTab("chart")}
            />
            <MobileReportTabButton
              active={mobileReportTab === "rekap"}
              icon={ReceiptText}
              label="Rekap Keuntungan"
              onClick={() => setMobileReportTab("rekap")}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Laporan</h2>
            </div>

            <button
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.08em] sm:hidden ${
                filterMobileOpen
                  ? "border-sky-200 bg-sky-100 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </button>
          </div>

          <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-7">
            <FilterFields
              search={search}
              setSearch={setSearch}
              filterToko={filterToko}
              setFilterToko={setFilterToko}
              tokoList={tokoList}
              filterKategori={filterKategori}
              setFilterKategori={setFilterKategori}
              kategoriBarangList={kategoriBarangList}
              filterSatuan={filterSatuan}
              setFilterSatuan={setFilterSatuan}
              satuanBarangList={satuanBarangList}
              tanggalMulai={tanggalMulai}
              setTanggalMulai={setTanggalMulai}
              tanggalSelesai={tanggalSelesai}
              setTanggalSelesai={setTanggalSelesai}
            />
          </div>

          <AnimatePresence initial={false}>
            {filterMobileOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden sm:hidden"
              >
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <FilterFields
                    search={search}
                    setSearch={setSearch}
                    filterToko={filterToko}
                    setFilterToko={setFilterToko}
                    tokoList={tokoList}
                    filterKategori={filterKategori}
                    setFilterKategori={setFilterKategori}
                    kategoriBarangList={kategoriBarangList}
                    filterSatuan={filterSatuan}
                    setFilterSatuan={setFilterSatuan}
                    satuanBarangList={satuanBarangList}
                    tanggalMulai={tanggalMulai}
                    setTanggalMulai={setTanggalMulai}
                    tanggalSelesai={tanggalSelesai}
                    setTanggalSelesai={setTanggalSelesai}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetFilter}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
            >
              Reset Filter
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={handleExportExcel}
              disabled={loading || filteredRekap.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:hidden"
              type="button"
            >
              <Download size={13} strokeWidth={2.7} />
              Excel
            </motion.button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <div className={mobileReportTab === "chart" ? "block" : "hidden sm:block"}>
              <ReportChart chartData={chartData} maxChartValue={maxChartValue} />
            </div>

            <div className={`${mobileReportTab === "rekap" ? "block" : "hidden sm:block"} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-800 sm:text-base">Rekap Keuntungan Harian</h2>
              </div>

              {loading ? (
                <LoadingState label="Memuat laporan..." />
              ) : filteredRekap.length === 0 ? (
                <EmptyState label="Belum ada data" />
              ) : (
                <div className="space-y-3">
                  {filteredRekap.map((item, index) => (
                    <RekapCard
                      key={`${item.tanggalKey}-${item.tokoId}-${item.kategoriId}-${item.satuanId}-${index}`}
                      item={item}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="hidden space-y-4 xl:col-span-5 xl:block">
            <RankingPanel title="Toko Teratas" description="Ranking toko berdasarkan keuntungan bersih" type="toko" rows={rankingToko} />
            <RankingKategoriTabbedPanel
              activeTab={desktopKategoriTab}
              setActiveTab={setDesktopKategoriTab}
              rankingGrupKategori={rankingGrupKategori}
              rankingKategoriBarang={rankingKategoriBarang}
            />
            <RankingPanel title="Ranking Satuan" description="Satuan yang paling menguntungkan" type="satuan" rows={rankingSatuanBarang} />
          </div>
        </div>

        <RankingModal
          type={rankingModal}
          onClose={() => setRankingModal(null)}
          rankingToko={todayRankingToko}
          rankingGrupKategori={todayRankingGrupKategori}
          rankingKategoriBarang={todayRankingKategoriBarang}
          rankingSatuanBarang={todayRankingSatuanBarang}
          kategoriTab={mobileKategoriTab}
          setKategoriTab={setMobileKategoriTab}
        />
      </main>
    </div>
  )
}

function StatCard({
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
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div className="hidden h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex sm:h-11 sm:w-11">
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="truncate text-sm font-black leading-tight text-slate-800 sm:text-xl">{value}</p>
          {subValue ? (
            <p className="mt-0.5 hidden truncate text-[10px] font-bold text-slate-400 sm:block">{subValue}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MobileActionButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      type="button"
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </motion.button>
  )
}

function MobileReportTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: any
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-[0.06em] transition ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/15"
          : "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={15} strokeWidth={2.5} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function FilterFields({
  search,
  setSearch,
  filterToko,
  setFilterToko,
  tokoList,
  filterKategori,
  setFilterKategori,
  kategoriBarangList,
  filterSatuan,
  setFilterSatuan,
  satuanBarangList,
  tanggalMulai,
  setTanggalMulai,
  tanggalSelesai,
  setTanggalSelesai,
}: {
  search: string
  setSearch: (value: string) => void
  filterToko: string
  setFilterToko: (value: string) => void
  tokoList: Toko[]
  filterKategori: string
  setFilterKategori: (value: string) => void
  kategoriBarangList: { id: string; nama: string }[]
  filterSatuan: string
  setFilterSatuan: (value: string) => void
  satuanBarangList: { id: string; nama: string }[]
  tanggalMulai: string
  setTanggalMulai: (value: string) => void
  tanggalSelesai: string
  setTanggalSelesai: (value: string) => void
}) {
  return (
    <>
      <div className="sm:col-span-2 lg:col-span-2">
        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">Cari</label>
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tanggal, toko, kategori, atau satuan..."
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
          />
        </div>
      </div>

      <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
        <option value="">Semua Toko</option>
        {tokoList.map((item) => (
          <option key={item.id} value={item.id}>{item.nama}</option>
        ))}
      </FilterSelect>

      <FilterSelect label="Kategori Barang" value={filterKategori} onChange={setFilterKategori} icon={Layers3}>
        <option value="">Semua Kategori</option>
        {kategoriBarangList.map((item) => (
          <option key={item.id} value={item.id}>{item.nama}</option>
        ))}
      </FilterSelect>

      <FilterSelect label="Satuan" value={filterSatuan} onChange={setFilterSatuan} icon={Ruler}>
        <option value="">Semua Satuan</option>
        {satuanBarangList.map((item) => (
          <option key={item.id} value={item.id}>{item.nama}</option>
        ))}
      </FilterSelect>

      <DateInput label="Mulai" value={tanggalMulai} onChange={setTanggalMulai} />
      <DateInput label="Selesai" value={tanggalSelesai} onChange={setTanggalSelesai} />
    </>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        <CalendarDays size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </div>
  )
}

function ReportChart({
  chartData,
  maxChartValue,
}: {
  chartData: Array<{ tanggalKey: string; penghasilanKotor: number; pengeluaran: number; keuntunganBersih: number }>
  maxChartValue: number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800 sm:text-base">Chart Keuntungan Bersih Harian</h2>
      </div>

      {chartData.length === 0 ? (
        <EmptyState label="Belum ada data" />
      ) : (
        <div className="space-y-4">
          {chartData.map((item) => {
            const percent = maxChartValue > 0 ? (Math.abs(item.keuntunganBersih) / maxChartValue) * 100 : 0
            const isNegative = item.keuntunganBersih < 0

            return (
              <div key={item.tanggalKey}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {formatTanggalKey(item.tanggalKey)}
                  </p>
                  <p className={`text-sm font-black ${isNegative ? "text-red-600" : "text-sky-700"}`}>
                    {formatRupiah(item.keuntunganBersih)}
                  </p>
                </div>

                <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      isNegative
                        ? "bg-gradient-to-r from-red-400 to-orange-500"
                        : "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500"
                    }`}
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
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
  )
}

function RekapCard({ item }: { item: RekapKeuntunganHarian }) {
  const isNegative = item.keuntunganBersih < 0

  return (
    <div className="overflow-hidden bg-transparent p-0 shadow-none ring-0 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-4 sm:shadow-sm sm:ring-1 sm:ring-slate-100/70">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-700">
          {formatTanggalKey(item.tanggalKey)}
        </span>
        <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
          {item.tokoNama || "Tanpa Toko"}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-base font-black text-slate-900 sm:text-sm">
          {item.kategoriNama || "Semua Kategori"} · {item.satuanNama || "Semua Satuan"}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Omzet {formatRupiah(item.omzet)} · {formatCompactNumber(item.jumlahTransaksi)} transaksi · Qty {formatCompactNumber(item.jumlahQtyTerjual)}
        </p>
      </div>

      <div className="mt-4 space-y-2 rounded-none border-0 bg-transparent p-0 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-slate-50/70 sm:p-2">
        <MetricRow label="Kotor" value={formatRupiah(item.penghasilanKotor)} />
        <MetricRow label="Pengeluaran" value={formatRupiah(item.pengeluaran)} tone="danger" />
        <MetricRow label="Bersih" value={formatRupiah(item.keuntunganBersih)} tone={isNegative ? "danger" : "primary"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricBox label="Omzet" value={formatRupiah(item.omzet)} className="col-span-2" />
        <MetricBox label="Transaksi" value={formatCompactNumber(item.jumlahTransaksi)} />
        <MetricBox label="Qty Terjual" value={formatCompactNumber(item.jumlahQtyTerjual)} />
        <MetricBox label="Data Keluar" value={formatCompactNumber(item.jumlahDataPengeluaran)} className="col-span-2" />
      </div>
    </div>
  )
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: "primary" | "danger" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-sm font-black ${tone === "danger" ? "text-red-600" : tone === "primary" ? "text-sky-700" : "text-slate-800"}`}>
        {value}
      </p>
    </div>
  )
}

function MetricBox({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 ${className}`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-800">{value}</p>
    </div>
  )
}

function RankingKategoriTabbedPanel({
  activeTab,
  setActiveTab,
  rankingGrupKategori,
  rankingKategoriBarang,
}: {
  activeTab: KategoriRankingTab
  setActiveTab: (value: KategoriRankingTab) => void
  rankingGrupKategori: RankingGrupKategori[]
  rankingKategoriBarang: RankingKategoriBarang[]
}) {
  const rows = activeTab === "grup" ? rankingGrupKategori : rankingKategoriBarang
  const type: RankingItemType = activeTab === "grup" ? "grupKategori" : "kategori"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800 sm:text-base">Ranking Kategori Barang</h2>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Keuntungan berdasarkan grup kategori atau kategori barang
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
        <RankingTabButton active={activeTab === "grup"} label="Grup Kategori" onClick={() => setActiveTab("grup")} />
        <RankingTabButton active={activeTab === "kategori"} label="Kategori" onClick={() => setActiveTab("kategori")} />
      </div>

      {rows.length === 0 ? (
        <EmptyState label="Belum ada data" />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 8).map((item: any, idx) => (
            <RankingItem key={`${type}-${idx}-${item.kelompokId || item.kategoriId || idx}`} type={type} item={item} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

function RankingTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] transition ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
          : "bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  )
}

function RankingPanel({
  title,
  description,
  type,
  rows,
}: {
  title: string
  description: string
  type: RankingItemType
  rows: any[]
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800 sm:text-base">{title}</h2>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{description}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="Belum ada data" />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 8).map((item, idx) => (
            <RankingItem key={`${type}-${idx}-${item.tokoId || item.kategoriId || item.satuanId || idx}`} type={type} item={item} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

function RankingItem({ type, item, index }: { type: RankingItemType; item: any; index: number }) {
  const isNegative = Number(item.keuntunganBersih || 0) < 0
  const title =
    type === "toko"
      ? item.tokoNama
      : type === "grupKategori"
        ? item.namaKelompok
        : type === "kategori"
          ? item.kategoriNama
          : item.satuanNama
  const subtitle =
    type === "toko"
      ? `${formatCompactNumber(item.hariAktif || 0)} hari aktif`
      : `${formatCompactNumber(item.qtyTerjual || 0)} item • ${formatCompactNumber(item.jumlahTransaksi || 0)} transaksi`
  const detail =
    type === "satuan" && Array.isArray(item.namaBarangList) && item.namaBarangList.length > 0
      ? item.namaBarangList.join(", ")
      : `Omzet ${formatRupiah(item.omzet || 0)}`

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-black text-white">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-800">{title || "-"}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{subtitle}</p>
              <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-500">{detail}</p>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-sm font-black ${isNegative ? "text-red-600" : "text-sky-700"}`}>
            {formatRupiah(item.keuntunganBersih || 0)}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Kotor {formatRupiah(item.penghasilanKotor || 0)}
          </p>
        </div>
      </div>
    </div>
  )
}

function RankingModal({
  type,
  onClose,
  rankingToko,
  rankingGrupKategori,
  rankingKategoriBarang,
  rankingSatuanBarang,
  kategoriTab,
  setKategoriTab,
}: {
  type: RankingModalType
  onClose: () => void
  rankingToko: RankingToko[]
  rankingGrupKategori: RankingGrupKategori[]
  rankingKategoriBarang: RankingKategoriBarang[]
  rankingSatuanBarang: RankingSatuanBarang[]
  kategoriTab: KategoriRankingTab
  setKategoriTab: (value: KategoriRankingTab) => void
}) {
  const isKategoriModal = type === "kategori"
  const rows =
    type === "toko"
      ? rankingToko
      : type === "kategori"
        ? kategoriTab === "grup"
          ? rankingGrupKategori
          : rankingKategoriBarang
        : rankingSatuanBarang
  const itemType: RankingItemType =
    type === "toko"
      ? "toko"
      : type === "kategori"
        ? kategoriTab === "grup"
          ? "grupKategori"
          : "kategori"
        : "satuan"
  const title =
    type === "toko"
      ? "Ranking Toko"
      : type === "kategori"
        ? "Ranking Kategori"
        : "Ranking Satuan"

  return (
    <AnimatePresence>
      {type ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="max-h-[82vh] w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900">{title}</h3>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Data hari ini
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"
              >
                <X size={16} strokeWidth={2.7} />
              </button>
            </div>

            <div className="max-h-[calc(82vh-78px)] overflow-y-auto p-4">
              {isKategoriModal ? (
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                  <RankingTabButton active={kategoriTab === "grup"} label="Grup Kategori" onClick={() => setKategoriTab("grup")} />
                  <RankingTabButton active={kategoriTab === "kategori"} label="Kategori" onClick={() => setKategoriTab("kategori")} />
                </div>
              ) : null}

              {rows.length === 0 ? (
                <EmptyState label="Belum ada data" />
              ) : (
                <div className="space-y-3">
                  {rows.slice(0, 20).map((item: any, idx: number) => (
                    <RankingItem key={`${itemType}-${idx}-${item.tokoId || item.kelompokId || item.kategoriId || item.satuanId || idx}`} type={itemType} item={item} index={idx} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-14">
      <div className="flex flex-col items-center gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
        />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {label}
    </div>
  )
}
