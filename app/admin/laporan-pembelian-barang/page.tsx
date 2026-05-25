"use client"

/*
  Halaman laporan pembelian barang.
  Revisi layout konsisten dengan halaman laporan/pengeluaran terbaru:
  header biru, card putih rounded, filter collapse mobile, popup rekap mobile,
  pagination 10/25/50/100/ALL, detail card mobile, tabel desktop, dan export PDF.
*/

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore"
import {
  AlertCircle,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  Download,
  Eye,
  Filter,
  Package,
  RefreshCw,
  Search,
  Store,
  Tag,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type ModeLaporan = "harian" | "bulanan"
type JenisFilter = "" | "barang" | "saldo"
type RankingModalType = "toko" | "kategori" | null

type MasterItem = { id: string; nama: string }

type RekapItem = {
  id?: string
  nama?: string
  totalTransaksi?: number
  totalQty?: number
  totalNominal?: number
}

type LaporanAgregat = {
  id: string
  tanggal?: string
  bulanKey?: string
  tahun?: number
  bulan?: number
  totalTransaksi: number
  totalPembelianBarang: number
  totalKuantitasBarang: number
  totalTopupSaldo: number
  totalNominalSaldo: number
  totalNominalSemua: number
  rekapPerToko: Record<string, RekapItem>
  rekapPerKategori: Record<string, RekapItem>
  updatedAt?: any
}

type DetailRow = {
  id: string
  jenis: "barang" | "saldo"
  nama: string
  refId: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  supplier: string
  stokSebelum: number
  jumlahTambah: number
  stokSesudah: number
  saldoSebelum: number
  saldoSesudah: number
  nominal: number
  catatan: string
  tanggal: string
  bulanKey: string
  createdAt?: any
  createdBy?: string
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const BULAN_LIST = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

function getTodayLocal() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getMonthKey(tahun: number, bulan: number) {
  return `${tahun}-${String(bulan).padStart(2, "0")}`
}

function toMillis(value: any) {
  if (!value) return 0
  if (typeof value?.toMillis === "function") return value.toMillis()
  if (typeof value === "number") return value
  if (value?.seconds) return value.seconds * 1000
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function formatDateTime(value?: any) {
  const ms = toMillis(value)
  if (!ms) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms))
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value || 0)
}

function getTanggalFromCreatedAt(createdAt: any) {
  const ms = toMillis(createdAt)
  if (!ms) return ""
  const date = new Date(ms)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function normalizeAgregat(id: string, data: any): LaporanAgregat {
  return {
    id,
    tanggal: data?.tanggal || "",
    bulanKey: data?.bulanKey || "",
    tahun: Number(data?.tahun || 0),
    bulan: Number(data?.bulan || 0),
    totalTransaksi: Number(data?.totalTransaksi || 0),
    totalPembelianBarang: Number(data?.totalPembelianBarang || 0),
    totalKuantitasBarang: Number(data?.totalKuantitasBarang || 0),
    totalTopupSaldo: Number(data?.totalTopupSaldo || 0),
    totalNominalSaldo: Number(data?.totalNominalSaldo || 0),
    totalNominalSemua: Number(
      data?.totalNominalSemua ||
        Number(data?.totalPembelianBarang || 0) + Number(data?.totalNominalSaldo || 0)
    ),
    rekapPerToko:
      data?.rekapPerToko && typeof data.rekapPerToko === "object" ? data.rekapPerToko : {},
    rekapPerKategori:
      data?.rekapPerKategori && typeof data.rekapPerKategori === "object"
        ? data.rekapPerKategori
        : {},
    updatedAt: data?.updatedAt,
  }
}

function normalizeBarangRow(id: string, data: any): DetailRow {
  const createdTanggal = getTanggalFromCreatedAt(data?.createdAt)
  const tanggal = data?.tanggal || data?.tanggalKey || createdTanggal
  const bulanKey = data?.bulanKey || (tanggal ? tanggal.slice(0, 7) : "")

  return {
    id,
    jenis: "barang",
    nama: data?.namaBarang || data?.nama || "-",
    refId: data?.barangId || "",
    tokoId: data?.tokoId || "",
    tokoNama: data?.tokoNama || "-",
    kategoriId: data?.kategoriId || "",
    kategoriNama: data?.kategoriNama || "-",
    supplier: data?.supplier || "-",
    stokSebelum: Number(data?.stokSebelum || 0),
    jumlahTambah: Number(data?.jumlahTambah || 0),
    stokSesudah: Number(data?.stokSesudah || 0),
    saldoSebelum: 0,
    saldoSesudah: 0,
    nominal: Number(data?.nominalPembelian || data?.totalNominal || 0),
    catatan: data?.catatan || "",
    tanggal,
    bulanKey,
    createdAt: data?.createdAt,
    createdBy: data?.createdBy,
  }
}

function normalizeSaldoRow(id: string, data: any): DetailRow {
  const createdTanggal = getTanggalFromCreatedAt(data?.createdAt)
  const tanggal = data?.tanggal || data?.tanggalKey || createdTanggal
  const bulanKey = data?.bulanKey || (tanggal ? tanggal.slice(0, 7) : "")

  return {
    id,
    jenis: "saldo",
    nama: data?.namaSaldo || data?.nama || "-",
    refId: data?.saldoId || "",
    tokoId: "",
    tokoNama: "-",
    kategoriId: "saldo-digital",
    kategoriNama: "Saldo Digital",
    supplier: "Saldo Digital",
    stokSebelum: 0,
    jumlahTambah: Number(data?.jumlahTambah || 0),
    stokSesudah: 0,
    saldoSebelum: Number(data?.saldoSebelum || 0),
    saldoSesudah: Number(data?.saldoSesudah || 0),
    nominal: Number(data?.jumlahTambah || 0),
    catatan: data?.catatan || "",
    tanggal,
    bulanKey,
    createdAt: data?.createdAt,
    createdBy: data?.createdBy,
  }
}

function buildFallbackAgregat(params: {
  id: string
  mode: ModeLaporan
  tanggal: string
  bulanKey: string
  rows: DetailRow[]
}): LaporanAgregat {
  const rekapPerToko: Record<string, RekapItem> = {}
  const rekapPerKategori: Record<string, RekapItem> = {}

  let totalPembelianBarang = 0
  let totalKuantitasBarang = 0
  let totalTopupSaldo = 0
  let totalNominalSaldo = 0

  params.rows.forEach((row) => {
    if (row.jenis === "barang") {
      totalPembelianBarang += 1
      totalKuantitasBarang += row.jumlahTambah

      const tokoKey = row.tokoId || row.tokoNama || "tanpa-toko"
      rekapPerToko[tokoKey] = {
        id: row.tokoId || tokoKey,
        nama: row.tokoNama || "Tanpa Toko",
        totalTransaksi: Number(rekapPerToko[tokoKey]?.totalTransaksi || 0) + 1,
        totalQty: Number(rekapPerToko[tokoKey]?.totalQty || 0) + row.jumlahTambah,
        totalNominal: Number(rekapPerToko[tokoKey]?.totalNominal || 0) + row.nominal,
      }

      const kategoriKey = row.kategoriId || row.kategoriNama || "tanpa-kategori"
      rekapPerKategori[kategoriKey] = {
        id: row.kategoriId || kategoriKey,
        nama: row.kategoriNama || "Tanpa Kategori",
        totalTransaksi: Number(rekapPerKategori[kategoriKey]?.totalTransaksi || 0) + 1,
        totalQty: Number(rekapPerKategori[kategoriKey]?.totalQty || 0) + row.jumlahTambah,
        totalNominal: Number(rekapPerKategori[kategoriKey]?.totalNominal || 0) + row.nominal,
      }
    } else {
      totalTopupSaldo += 1
      totalNominalSaldo += row.nominal
    }
  })

  return {
    id: params.id,
    tanggal: params.mode === "harian" ? params.tanggal : "",
    bulanKey: params.mode === "bulanan" ? params.bulanKey : "",
    tahun: Number((params.bulanKey || params.tanggal).slice(0, 4)),
    bulan: Number((params.bulanKey || params.tanggal).slice(5, 7)),
    totalTransaksi: params.rows.length,
    totalPembelianBarang,
    totalKuantitasBarang,
    totalTopupSaldo,
    totalNominalSaldo,
    totalNominalSemua: totalNominalSaldo,
    rekapPerToko,
    rekapPerKategori,
  }
}

async function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }

    const script = document.createElement("script")
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Gagal memuat ${src}`))
    document.head.appendChild(script)
  })
}

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      {children}
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
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2.5}
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
    </FieldBox>
  )
}

export default function LaporanPembelianBarangPage() {
  const [mode, setMode] = useState<ModeLaporan>("harian")
  const [tanggal, setTanggal] = useState(getTodayLocal())
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [bulan, setBulan] = useState(new Date().getMonth() + 1)

  const [jenisFilter, setJenisFilter] = useState<JenisFilter>("")
  const [tokoFilter, setTokoFilter] = useState("")
  const [kategoriFilter, setKategoriFilter] = useState("")
  const [search, setSearch] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [agregat, setAgregat] = useState<LaporanAgregat | null>(null)
  const [rows, setRows] = useState<DetailRow[]>([])
  const [tokoList, setTokoList] = useState<MasterItem[]>([])
  const [kategoriList, setKategoriList] = useState<MasterItem[]>([])

  const [loading, setLoading] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [rankingModal, setRankingModal] = useState<RankingModalType>(null)
  const [selectedDetail, setSelectedDetail] = useState<DetailRow | null>(null)

  const bulanKey = getMonthKey(tahun, bulan)
  const laporanId = mode === "harian" ? tanggal : bulanKey
  const periodeLabel = mode === "harian" ? tanggal : `${BULAN_LIST[bulan - 1]} ${tahun}`

  const tokoLabel = useMemo(() => {
    if (!tokoFilter) return "Semua Toko"
    const found = tokoList.find((item) => item.id === tokoFilter)
    return found?.nama || tokoFilter
  }, [tokoFilter, tokoList])

  const jenisLabel = useMemo(() => {
    if (jenisFilter === "barang") return "Barang Fisik"
    if (jenisFilter === "saldo") return "Barang Digital / Saldo Digital"
    return "Semua Jenis"
  }, [jenisFilter])

  const fetchMaster = async () => {
    try {
      const [tokoSnap, kategoriSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "kategori_barang"), orderBy("nama"))),
      ])

      setTokoList(
        tokoSnap.docs
          .map((d) => ({ id: d.id, nama: String((d.data() as any)?.nama || "") }))
          .filter((item) => item.nama)
      )
      setKategoriList(
        kategoriSnap.docs
          .map((d) => ({ id: d.id, nama: String((d.data() as any)?.nama || "") }))
          .filter((item) => item.nama)
      )
    } catch (err) {
      console.error(err)
      setTokoList([])
      setKategoriList([])
    }
  }

  const fetchAgregat = async () => {
    const colName =
      mode === "harian" ? "laporan_pembelian_barang_harian" : "laporan_pembelian_barang_bulanan"
    const snap = await getDoc(doc(db, colName, laporanId))
    if (!snap.exists()) return null
    return normalizeAgregat(snap.id, snap.data())
  }

  const fetchDetailRows = async () => {
    const constraints = mode === "harian" ? [where("tanggal", "==", tanggal)] : [where("bulanKey", "==", bulanKey)]

    const [snapBarang, snapSaldo] = await Promise.all([
      getDocs(query(collection(db, "riwayat_pembelian_barang"), ...constraints)),
      getDocs(query(collection(db, "riwayat_pembelian_saldo_digital"), ...constraints)),
    ])

    return [
      ...snapBarang.docs.map((d) => normalizeBarangRow(d.id, d.data())),
      ...snapSaldo.docs.map((d) => normalizeSaldoRow(d.id, d.data())),
    ].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  }

  const fetchReport = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      const [nextAgregat, detailRows] = await Promise.all([fetchAgregat(), fetchDetailRows()])

      setRows(detailRows)
      setAgregat(
        nextAgregat ||
          buildFallbackAgregat({
            id: laporanId,
            mode,
            tanggal,
            bulanKey,
            rows: detailRows,
          })
      )
    } catch (err) {
      console.error(err)
      setRows([])
      setAgregat(null)
      setError("Gagal memuat laporan pembelian barang")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) return
      fetchMaster()
      fetchReport()
    })

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPage(1)
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tanggal, tahun, bulan])

  useEffect(() => {
    setPage(1)
  }, [jenisFilter, tokoFilter, kategoriFilter, search, itemsPerPage])

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()

    return rows.filter((row) => {
      if (jenisFilter && row.jenis !== jenisFilter) return false
      if (tokoFilter && row.tokoId !== tokoFilter) return false
      if (kategoriFilter && row.kategoriId !== kategoriFilter) return false
      if (
        q &&
        ![row.nama, row.tokoNama, row.kategoriNama, row.supplier, row.catatan, row.jenis]
          .join(" ")
          .toLowerCase()
          .includes(q)
      ) {
        return false
      }
      return true
    })
  }, [kategoriFilter, jenisFilter, rows, search, tokoFilter])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredRows.length / itemsPerPage))
  const pagedRows =
    itemsPerPage === 0
      ? filteredRows
      : filteredRows.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const rekapTokoList = useMemo(() => {
    const map = new Map<string, RekapItem & { key: string }>()

    filteredRows
      .filter((row) => row.jenis === "barang")
      .forEach((row) => {
        const key = row.tokoId || row.tokoNama || "tanpa-toko"
        const prev = map.get(key) || {
          key,
          id: row.tokoId || key,
          nama: row.tokoNama || "Tanpa Toko",
          totalTransaksi: 0,
          totalQty: 0,
          totalNominal: 0,
        }

        map.set(key, {
          ...prev,
          totalTransaksi: Number(prev.totalTransaksi || 0) + 1,
          totalQty: Number(prev.totalQty || 0) + Number(row.jumlahTambah || 0),
          totalNominal: Number(prev.totalNominal || 0) + Number(row.nominal || 0),
        })
      })

    return Array.from(map.values()).sort(
      (a, b) => Number(b.totalTransaksi || 0) - Number(a.totalTransaksi || 0)
    )
  }, [filteredRows])

  const rekapKategoriList = useMemo(() => {
    const map = new Map<string, RekapItem & { key: string }>()

    filteredRows.forEach((row) => {
      const key = row.kategoriId || row.kategoriNama || row.jenis || "tanpa-kategori"
      const prev = map.get(key) || {
        key,
        id: row.kategoriId || key,
        nama: row.kategoriNama || (row.jenis === "saldo" ? "Saldo Digital" : "Tanpa Kategori"),
        totalTransaksi: 0,
        totalQty: 0,
        totalNominal: 0,
      }

      map.set(key, {
        ...prev,
        totalTransaksi: Number(prev.totalTransaksi || 0) + 1,
        totalQty: Number(prev.totalQty || 0) + Number(row.jumlahTambah || 0),
        totalNominal: Number(prev.totalNominal || 0) + Number(row.nominal || 0),
      })
    })

    return Array.from(map.values()).sort(
      (a, b) => Number(b.totalTransaksi || 0) - Number(a.totalTransaksi || 0)
    )
  }, [filteredRows])

  const goPage = (target: number) => {
    setPage(Math.max(1, Math.min(totalPages, target)))
  }

  const buildPdfRekapTokoList = () => {
    const map = new Map<
      string,
      { key: string; nama: string; totalTransaksi: number; totalQty: number }
    >()

    filteredRows
      .filter((row) => row.jenis === "barang")
      .forEach((row) => {
        const key = row.tokoId || row.tokoNama || "tanpa-toko"
        const prev = map.get(key) || {
          key,
          nama: row.tokoNama || "Tanpa Toko",
          totalTransaksi: 0,
          totalQty: 0,
        }

        map.set(key, {
          ...prev,
          totalTransaksi: prev.totalTransaksi + 1,
          totalQty: prev.totalQty + Number(row.jumlahTambah || 0),
        })
      })

    return Array.from(map.values()).sort((a, b) => b.totalTransaksi - a.totalTransaksi)
  }

  const downloadPdf = async () => {
    setDownloadingPdf(true)

    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js")

      const { jsPDF } = (window as any).jspdf
      const docPdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const pageWidth = docPdf.internal.pageSize.getWidth()
      const pageHeight = docPdf.internal.pageSize.getHeight()
      const marginX = 12
      const sky: [number, number, number] = [2, 132, 199]
      const skyDark: [number, number, number] = [3, 105, 161]
      const slate: [number, number, number] = [51, 65, 85]
      const softBorder: [number, number, number] = [226, 232, 240]

      docPdf.setFillColor(...skyDark)
      docPdf.rect(0, 0, pageWidth, 30, "F")
      docPdf.setFillColor(14, 165, 233)
      docPdf.circle(pageWidth - 14, 8, 16, "F")
      docPdf.setTextColor(255, 255, 255)
      docPdf.setFont("helvetica", "bold")
      docPdf.setFontSize(14)
      docPdf.text("LAPORAN PEMBELIAN BARANG", marginX, 13)
      docPdf.setFont("helvetica", "normal")
      docPdf.setFontSize(8)

      const headerLabelX = marginX
      const headerColonX = marginX + 18
      const headerValueX = marginX + 22
      const headerStartY = 19
      const headerGapY = 5
      const printedDate = new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })

      const drawHeaderInfo = (label: string, value: string, row: number) => {
        const y = headerStartY + row * headerGapY
        docPdf.text(label, headerLabelX, y)
        docPdf.text(":", headerColonX, y)
        docPdf.text(value, headerValueX, y)
      }

      drawHeaderInfo("Periode", periodeLabel, 0)
      drawHeaderInfo("Toko", tokoLabel, 1)
      drawHeaderInfo("Jenis", jenisLabel, 2)
      drawHeaderInfo("Dicetak", printedDate, 3)

      const summaryCards = [
        ["Transaksi", formatNumber(agregat?.totalTransaksi || 0)],
        ["Pembelian", formatNumber(agregat?.totalPembelianBarang || 0)],
        ["Qty Barang", formatNumber(agregat?.totalKuantitasBarang || 0)],
        ["Topup Saldo", formatNumber(agregat?.totalTopupSaldo || 0)],
      ]

      const cardY = 37
      const cardGap = 3
      const cardW = (pageWidth - marginX * 2 - cardGap * 3) / 4
      summaryCards.forEach(([label, value], index) => {
        const x = marginX + index * (cardW + cardGap)
        docPdf.setDrawColor(...softBorder)
        docPdf.setFillColor(248, 250, 252)
        docPdf.roundedRect(x, cardY, cardW, 18, 2, 2, "FD")
        docPdf.setFont("helvetica", "bold")
        docPdf.setFontSize(6.5)
        docPdf.setTextColor(100, 116, 139)
        docPdf.text(String(label).toUpperCase(), x + 3, cardY + 6)
        docPdf.setFontSize(10)
        docPdf.setTextColor(...skyDark)
        docPdf.text(String(value), x + 3, cardY + 13)
      })

      docPdf.setDrawColor(...softBorder)
      docPdf.setFillColor(240, 249, 255)
      docPdf.roundedRect(marginX, 59, pageWidth - marginX * 2, 14, 2, 2, "FD")
      docPdf.setFont("helvetica", "bold")
      docPdf.setFontSize(8)
      docPdf.setTextColor(...skyDark)
      docPdf.text("Nominal Saldo Digital", marginX + 3, 64)
      docPdf.setFontSize(10)
      docPdf.text(formatRupiah(agregat?.totalNominalSaldo || 0), marginX + 3, 70)

      const pdfRekapTokoList = buildPdfRekapTokoList()
      const rekapTokoBody = pdfRekapTokoList.slice(0, 8).map((item, index) => [
        String(index + 1),
        item.nama || item.key,
        formatNumber(Number(item.totalTransaksi || 0)),
        formatNumber(Number(item.totalQty || 0)),
      ])

      ;(docPdf as any).autoTable({
        startY: 80,
        margin: { left: marginX, right: marginX },
        tableWidth: pageWidth - marginX * 2,
        head: [["No", "Toko", "Trx", "Qty"]],
        body: rekapTokoBody.length
          ? rekapTokoBody
          : [["-", "Tidak ada pembelian barang pada periode/filter ini", "-", "-"]],
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          lineColor: softBorder,
          lineWidth: 0.1,
          textColor: slate,
        },
        headStyles: {
          fillColor: sky,
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 11, halign: "center" },
          1: { cellWidth: pageWidth - marginX * 2 - 47 },
          2: { cellWidth: 18, halign: "center" },
          3: { cellWidth: 18, halign: "center" },
        },
      })

      const detailBody = filteredRows.map((row, index) => [
        String(index + 1),
        row.jenis === "barang" ? "Barang" : "Saldo",
        row.nama,
        row.jenis === "saldo" ? "Saldo Digital" : row.tokoNama || "-",
        row.jenis === "saldo" ? formatRupiah(row.jumlahTambah) : formatNumber(row.jumlahTambah),
        row.jenis === "saldo"
          ? `${formatRupiah(row.saldoSebelum)} -> ${formatRupiah(row.saldoSesudah)}`
          : `${formatNumber(row.stokSebelum)} -> ${formatNumber(row.stokSesudah)}`,
        formatDateTime(row.createdAt),
      ])

      ;(docPdf as any).autoTable({
        startY: (docPdf as any).lastAutoTable.finalY + 8,
        margin: { left: marginX, right: marginX },
        tableWidth: pageWidth - marginX * 2,
        head: [["No", "Jenis", "Nama", "Toko/Sumber", "Jumlah", "Perubahan", "Waktu"]],
        body: detailBody.length ? detailBody : [["-", "-", "Tidak ada data", "-", "-", "-", "-"]],
        theme: "grid",
        styles: {
          fontSize: 6.6,
          cellPadding: 1.35,
          overflow: "linebreak",
          lineColor: softBorder,
          lineWidth: 0.1,
          textColor: slate,
          valign: "middle",
        },
        headStyles: {
          fillColor: sky,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 9, halign: "center" },
          1: { cellWidth: 15 },
          2: { cellWidth: 45 },
          3: { cellWidth: 32 },
          4: { cellWidth: 24, halign: "center" },
          5: { cellWidth: 26 },
          6: { cellWidth: 35 },
        },
        didDrawPage: () => {
          const pageNumber = docPdf.getCurrentPageInfo().pageNumber
          docPdf.setFont("helvetica", "normal")
          docPdf.setFontSize(7)
          docPdf.setTextColor(148, 163, 184)
          docPdf.text(`Halaman ${pageNumber}`, pageWidth - marginX, pageHeight - 8, {
            align: "right",
          })
        },
      })

      docPdf.save(
        `laporan-pembelian-barang-${laporanId}-${tokoLabel
          .toLowerCase()
          .replace(/\s+/g, "-")}-${jenisLabel.toLowerCase().replace(/\s+|\//g, "-")}.pdf`
      )
    } catch (err) {
      console.error(err)
      setError("Gagal membuat PDF laporan")
    } finally {
      setDownloadingPdf(false)
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
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BarChart3 size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Laporan Pembelian Barang
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Rekap pembelian barang, topup saldo digital, dan stok masuk.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton
                onClick={downloadPdf}
                disabled={downloadingPdf || loading}
                icon={Download}
                label={downloadingPdf ? "Membuat" : "PDF"}
              />
              <HeaderButton
                onClick={fetchReport}
                disabled={loading}
                icon={RefreshCw}
                label="Refresh"
                spinning={loading}
              />
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
              <button type="button" onClick={() => setError(null)} className="ml-1 text-red-500">
                <X size={14} strokeWidth={3} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={downloadPdf}
            disabled={downloadingPdf || loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={14} strokeWidth={2.5} />
            {downloadingPdf ? "Membuat" : "PDF"}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
            Refresh
          </motion.button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
          <SummaryCard icon={ClipboardList} label="Transaksi" value={formatNumber(agregat?.totalTransaksi || 0)} />
          <SummaryCard
            icon={Package}
            label="Pembelian"
            value={formatNumber(agregat?.totalPembelianBarang || 0)}
          />
          <SummaryCard
            icon={BarChart3}
            label="Qty Barang"
            value={formatNumber(agregat?.totalKuantitasBarang || 0)}
          />
          <SummaryCard icon={Wallet} label="Topup Saldo" value={formatNumber(agregat?.totalTopupSaldo || 0)} />
          <SummaryCard
            icon={Wallet}
            label="Nominal Saldo"
            value={formatRupiah(agregat?.totalNominalSaldo || 0)}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={() => setRankingModal("toko")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700"
          >
            <Store size={14} strokeWidth={2.5} />
            Rekap Toko
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            type="button"
            onClick={() => setRankingModal("kategori")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700"
          >
            <Tag size={14} strokeWidth={2.5} />
            Kategori
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Laporan</h2>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:block">
                Atur mode, periode, toko, kategori, dan jumlah data.
              </p>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] transition sm:hidden ${
                filterMobileOpen
                  ? "border-sky-200 bg-sky-100 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <Filter size={14} strokeWidth={2.5} />
              Filter
            </motion.button>
          </div>

          <div className="hidden sm:block">
            <FilterContent
              mode={mode}
              setMode={(value) => setMode(value as ModeLaporan)}
              tanggal={tanggal}
              setTanggal={setTanggal}
              tahun={tahun}
              setTahun={(value) => setTahun(Number(value))}
              bulan={bulan}
              setBulan={(value) => setBulan(Number(value))}
              jenisFilter={jenisFilter}
              setJenisFilter={(value) => setJenisFilter(value as JenisFilter)}
              tokoFilter={tokoFilter}
              setTokoFilter={setTokoFilter}
              kategoriFilter={kategoriFilter}
              setKategoriFilter={setKategoriFilter}
              search={search}
              setSearch={setSearch}
              itemsPerPage={itemsPerPage}
              setItemsPerPage={(value) => setItemsPerPage(Number(value))}
              tokoList={tokoList}
              kategoriList={kategoriList}
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
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <FilterContent
                    mode={mode}
                    setMode={(value) => setMode(value as ModeLaporan)}
                    tanggal={tanggal}
                    setTanggal={setTanggal}
                    tahun={tahun}
                    setTahun={(value) => setTahun(Number(value))}
                    bulan={bulan}
                    setBulan={(value) => setBulan(Number(value))}
                    jenisFilter={jenisFilter}
                    setJenisFilter={(value) => setJenisFilter(value as JenisFilter)}
                    tokoFilter={tokoFilter}
                    setTokoFilter={setTokoFilter}
                    kategoriFilter={kategoriFilter}
                    setKategoriFilter={setKategoriFilter}
                    search={search}
                    setSearch={setSearch}
                    itemsPerPage={itemsPerPage}
                    setItemsPerPage={(value) => setItemsPerPage(Number(value))}
                    tokoList={tokoList}
                    kategoriList={kategoriList}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="hidden grid-cols-1 gap-4 lg:grid lg:grid-cols-2">
          <RekapBox title="Rekap Per Toko" rows={rekapTokoList} />
          <RekapBox title="Rekap Per Kategori" rows={rekapKategoriList} />
        </div>

        <DetailSection
          loading={loading}
          filteredRows={filteredRows}
          pagedRows={pagedRows}
          itemsPerPage={itemsPerPage}
          page={page}
          totalPages={totalPages}
          goPage={goPage}
          setSelectedDetail={setSelectedDetail}
        />

        <RankingModal
          type={rankingModal}
          rows={rankingModal === "toko" ? rekapTokoList : rekapKategoriList}
          onClose={() => setRankingModal(null)}
        />

        <DetailModal selectedDetail={selectedDetail} onClose={() => setSelectedDetail(null)} />
      </main>
    </div>
  )
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
}: {
  icon: any
  label: string
  onClick: () => void
  disabled?: boolean
  spinning?: boolean
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
      title={label}
      type="button"
    >
      <Icon size={12} strokeWidth={2.8} className={spinning ? "animate-spin" : ""} />
      <span>{label}</span>
    </motion.button>
  )
}

function FilterContent({
  mode,
  setMode,
  tanggal,
  setTanggal,
  tahun,
  setTahun,
  bulan,
  setBulan,
  jenisFilter,
  setJenisFilter,
  tokoFilter,
  setTokoFilter,
  kategoriFilter,
  setKategoriFilter,
  search,
  setSearch,
  itemsPerPage,
  setItemsPerPage,
  tokoList,
  kategoriList,
}: {
  mode: ModeLaporan
  setMode: (value: string) => void
  tanggal: string
  setTanggal: (value: string) => void
  tahun: number
  setTahun: (value: string) => void
  bulan: number
  setBulan: (value: string) => void
  jenisFilter: JenisFilter
  setJenisFilter: (value: string) => void
  tokoFilter: string
  setTokoFilter: (value: string) => void
  kategoriFilter: string
  setKategoriFilter: (value: string) => void
  search: string
  setSearch: (value: string) => void
  itemsPerPage: number
  setItemsPerPage: (value: string) => void
  tokoList: MasterItem[]
  kategoriList: MasterItem[]
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <FilterSelect label="Mode" value={mode} onChange={setMode} icon={Calendar}>
        <option value="harian">Harian</option>
        <option value="bulanan">Bulanan</option>
      </FilterSelect>

      {mode === "harian" ? (
        <FieldBox label="Tanggal">
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
          />
        </FieldBox>
      ) : (
        <>
          <FilterSelect label="Tahun" value={tahun} onChange={setTahun}>
            {[2024, 2025, 2026, 2027].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Bulan" value={bulan} onChange={setBulan}>
            {BULAN_LIST.map((item, index) => (
              <option key={item} value={index + 1}>
                {item}
              </option>
            ))}
          </FilterSelect>
        </>
      )}

      <FilterSelect label="Jenis" value={jenisFilter} onChange={setJenisFilter} icon={Package}>
        <option value="">Semua Jenis</option>
        <option value="barang">Barang</option>
        <option value="saldo">Saldo Digital</option>
      </FilterSelect>

      <FilterSelect label="Toko" value={tokoFilter} onChange={setTokoFilter} icon={Store}>
        <option value="">Semua Toko</option>
        {tokoList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nama}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect label="Kategori" value={kategoriFilter} onChange={setKategoriFilter} icon={Tag}>
        <option value="">Semua Kategori</option>
        {kategoriList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nama}
          </option>
        ))}
      </FilterSelect>

      <div className="sm:col-span-2 lg:col-span-3">
        <FieldBox label="Cari">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={2.5}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nama barang, toko, kategori, supplier..."
              className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>
        </FieldBox>
      </div>

      <FilterSelect label="Tampilkan" value={itemsPerPage} onChange={setItemsPerPage}>
        {ITEMS_OPTIONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </FilterSelect>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  className = "",
}: {
  icon: any
  label: string
  value: string
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4 ${className}`}
    >
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div className="hidden h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex sm:h-11 sm:w-11">
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="truncate text-[13px] font-black leading-tight text-slate-800 sm:text-sm sm:text-xl">
            {value}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function DetailSection({
  loading,
  filteredRows,
  pagedRows,
  itemsPerPage,
  page,
  totalPages,
  goPage,
  setSelectedDetail,
}: {
  loading: boolean
  filteredRows: DetailRow[]
  pagedRows: DetailRow[]
  itemsPerPage: number
  page: number
  totalPages: number
  goPage: (page: number) => void
  setSelectedDetail: (row: DetailRow) => void
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Memuat laporan...
          </p>
        </div>
      </div>
    )
  }

  if (filteredRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <ClipboardList size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Tidak ada data laporan
        </p>
      </div>
    )
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-800 sm:text-base">Detail Pembelian</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Daftar transaksi pembelian dan topup saldo sesuai filter.
          </p>
        </div>

        <div className="space-y-2 sm:hidden">
          {pagedRows.map((row, index) => (
            <motion.div
              key={`${row.jenis}-${row.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                  <Package size={20} strokeWidth={2.5} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black leading-tight text-slate-800 sm:text-sm">
                        {row.nama}
                      </p>
                      <p className="mt-1 truncate text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 sm:text-[10px] sm:tracking-[0.12em]">
                        {row.jenis === "barang" ? row.kategoriNama : "Saldo Digital"} · {row.tokoNama}
                      </p>
                    </div>
                    <JenisBadge jenis={row.jenis} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                    <MiniBox
                      label="Jumlah"
                      value={row.jenis === "saldo" ? formatRupiah(row.jumlahTambah) : formatNumber(row.jumlahTambah)}
                    />
                    <MiniBox
                      label="Sebelum"
                      value={row.jenis === "saldo" ? formatRupiah(row.saldoSebelum) : formatNumber(row.stokSebelum)}
                    />
                    <MiniBox
                      label="Sesudah"
                      value={row.jenis === "saldo" ? formatRupiah(row.saldoSesudah) : formatNumber(row.stokSesudah)}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDetail(row)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100"
                    >
                      <Eye size={13} strokeWidth={2.6} />
                      Detail
                    </button>
                    <div className="flex items-center justify-center rounded-xl bg-slate-50 px-2 py-2 text-[8px] font-black uppercase tracking-wide text-slate-400 sm:text-[9px]">
                      {formatDateTime(row.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  {["No", "Jenis", "Nama", "Toko", "Kategori", "Supplier", "Jumlah", "Sebelum", "Sesudah", "Waktu", "Aksi"].map((item, index) => (
                    <th
                      key={item}
                      className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                        index === 0 || index >= 6 ? "text-center" : "text-left"
                      }`}
                    >
                      {item}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, index) => (
                  <tr
                    key={`${row.jenis}-${row.id}`}
                    className="border-t border-slate-100 transition-colors hover:bg-sky-50/40"
                  >
                    <td className="px-3 py-3 text-center font-bold text-slate-400">
                      {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                    </td>
                    <td className="px-3 py-3">
                      <JenisBadge jenis={row.jenis} />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-black text-slate-800">{row.nama}</p>
                      {row.catatan ? (
                        <p className="mt-1 max-w-[220px] truncate text-[10px] font-semibold text-slate-400">
                          {row.catatan}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{row.tokoNama}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{row.kategoriNama}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{row.supplier}</td>
                    <td className="px-3 py-3 text-center font-black text-slate-700">
                      {row.jenis === "saldo" ? formatRupiah(row.jumlahTambah) : formatNumber(row.jumlahTambah)}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-500">
                      {row.jenis === "saldo" ? formatRupiah(row.saldoSebelum) : formatNumber(row.stokSebelum)}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-sky-700">
                      {row.jenis === "saldo" ? formatRupiah(row.saldoSesudah) : formatNumber(row.stokSesudah)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-center font-semibold text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedDetail(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                      >
                        <Eye size={13} strokeWidth={2.6} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {itemsPerPage !== 0 && totalPages > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => goPage(page - 1)}
            disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | "...")[]>((acc, p, idx, arr) => {
              if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("...")
              acc.push(p)
              return acc
            }, [])
            .map((p, idx) =>
              p === "..." ? (
                <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">
                  ···
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goPage(p)}
                  className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${
                    page === p
                      ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p}
                </button>
              )
            )}

          <button
            type="button"
            onClick={() => goPage(page + 1)}
            disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </>
  )
}

function RekapBox({
  title,
  rows,
}: {
  title: string
  rows: Array<{
    key: string
    id?: string
    nama?: string
    totalTransaksi?: number
    totalQty?: number
    totalNominal?: number
  }>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black text-slate-800">{title}</h2>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-400">Belum ada rekap.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.slice(0, 8).map((item, idx) => (
            <RekapItemCard key={item.key} item={item} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

function RekapItemCard({
  item,
  index,
}: {
  item: {
    key: string
    id?: string
    nama?: string
    totalTransaksi?: number
    totalQty?: number
    totalNominal?: number
  }
  index: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-black text-white">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-slate-800">{item.nama || item.key}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {formatNumber(Number(item.totalQty || 0))} qty
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs font-black text-sky-700">
          {formatNumber(Number(item.totalTransaksi || 0))}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">transaksi</p>
      </div>
    </div>
  )
}

function RankingModal({
  type,
  rows,
  onClose,
}: {
  type: RankingModalType
  rows: Array<{
    key: string
    id?: string
    nama?: string
    totalTransaksi?: number
    totalQty?: number
    totalNominal?: number
  }>
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {type && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[84vh] w-full max-w-lg overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {type === "toko" ? "Rekap Per Toko" : "Rekap Per Kategori"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {type === "toko" ? "Ranking Toko" : "Ranking Kategori"}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[calc(84vh-65px)] overflow-y-auto p-4">
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Belum ada data
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.slice(0, 20).map((item, idx) => (
                    <RekapItemCard key={item.key} item={item} index={idx} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DetailModal({ selectedDetail, onClose }: { selectedDetail: DetailRow | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {selectedDetail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[84vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  Detail Pembelian
                </p>
                <h2 className="truncate text-base font-black text-slate-800">{selectedDetail.nama}</h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[calc(84vh-65px)] overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailInfo label="Jenis" value={selectedDetail.jenis === "barang" ? "Barang" : "Saldo Digital"} />
                <DetailInfo label="Waktu" value={formatDateTime(selectedDetail.createdAt)} />
                <DetailInfo label="Toko" value={selectedDetail.tokoNama} />
                <DetailInfo label="Kategori" value={selectedDetail.kategoriNama} />
                <DetailInfo label="Supplier" value={selectedDetail.supplier} />
                <DetailInfo
                  label="Jumlah"
                  value={
                    selectedDetail.jenis === "saldo"
                      ? formatRupiah(selectedDetail.jumlahTambah)
                      : formatNumber(selectedDetail.jumlahTambah)
                  }
                />
                <DetailInfo
                  label="Sebelum"
                  value={
                    selectedDetail.jenis === "saldo"
                      ? formatRupiah(selectedDetail.saldoSebelum)
                      : formatNumber(selectedDetail.stokSebelum)
                  }
                />
                <DetailInfo
                  label="Sesudah"
                  value={
                    selectedDetail.jenis === "saldo"
                      ? formatRupiah(selectedDetail.saldoSesudah)
                      : formatNumber(selectedDetail.stokSesudah)
                  }
                />
                <div className="md:col-span-2">
                  <DetailInfo label="Catatan" value={selectedDetail.catatan || "-"} />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DetailInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-black text-slate-800">{value}</p>
    </div>
  )
}

function JenisBadge({ jenis }: { jenis: "barang" | "saldo" }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide sm:px-2.5 sm:text-[10px] ${
        jenis === "barang" ? "bg-sky-100 text-sky-700" : "bg-blue-100 text-blue-700"
      }`}
    >
      {jenis === "barang" ? "Barang" : "Saldo"}
    </span>
  )
}

function MiniBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 p-2">
      <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[9px] sm:tracking-widest">
        {label}
      </p>
      <p className="mt-1 truncate whitespace-nowrap text-[9px] font-black leading-tight text-slate-800 sm:text-xs">
        {value}
      </p>
    </div>
  )
}
