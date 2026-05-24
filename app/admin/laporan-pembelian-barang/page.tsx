"use client"

/*
  Page laporan pembelian barang.
  Lokasi disarankan: app/admin/laporan-pembelian-barang/page.tsx
  - Baca agregat dari laporan_pembelian_barang_harian / laporan_pembelian_barang_bulanan.
  - Baca detail dari riwayat_pembelian_barang dan riwayat_pembelian_saldo_digital.
  - Bisa download PDF.
  - Layout emerald konsisten.
  - Tanpa info banner.
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
  Filter,
  Package,
  RefreshCw,
  Search,
  Store,
  Tag,
  Wallet,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type ModeLaporan = "harian" | "bulanan"
type JenisFilter = "" | "barang" | "saldo"

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
  { value: 0, label: "Semua" },
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
  return 0
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
    rekapPerToko: data?.rekapPerToko && typeof data.rekapPerToko === "object" ? data.rekapPerToko : {},
    rekapPerKategori:
      data?.rekapPerKategori && typeof data.rekapPerKategori === "object" ? data.rekapPerKategori : {},
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
        totalNominal: Number(rekapPerToko[tokoKey]?.totalNominal || 0),
      }

      const kategoriKey = row.kategoriId || row.kategoriNama || "tanpa-kategori"
      rekapPerKategori[kategoriKey] = {
        id: row.kategoriId || kategoriKey,
        nama: row.kategoriNama || "Tanpa Kategori",
        totalTransaksi: Number(rekapPerKategori[kategoriKey]?.totalTransaksi || 0) + 1,
        totalQty: Number(rekapPerKategori[kategoriKey]?.totalQty || 0) + row.jumlahTambah,
        totalNominal: Number(rekapPerKategori[kategoriKey]?.totalNominal || 0),
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
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
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

      setTokoList(tokoSnap.docs.map((d) => ({ id: d.id, nama: (d.data() as any)?.nama || "" })))
      setKategoriList(kategoriSnap.docs.map((d) => ({ id: d.id, nama: (d.data() as any)?.nama || "" })))
    } catch (err) {
      console.error(err)
      setTokoList([])
      setKategoriList([])
    }
  }

  const fetchAgregat = async () => {
    const colName = mode === "harian" ? "laporan_pembelian_barang_harian" : "laporan_pembelian_barang_bulanan"
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

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredRows.length / itemsPerPage))
  const pagedRows = itemsPerPage === 0 ? filteredRows : filteredRows.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const rekapTokoList = useMemo(() => {
    return Object.entries(agregat?.rekapPerToko || {})
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => Number(b.totalTransaksi || 0) - Number(a.totalTransaksi || 0))
  }, [agregat])

  const rekapKategoriList = useMemo(() => {
    return Object.entries(agregat?.rekapPerKategori || {})
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => Number(b.totalTransaksi || 0) - Number(a.totalTransaksi || 0))
  }, [agregat])

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

    return Array.from(map.values()).sort(
      (a, b) => b.totalTransaksi - a.totalTransaksi
    )
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
      const emerald: [number, number, number] = [4, 120, 87]
      const emeraldDark: [number, number, number] = [6, 78, 59]
      const slate: [number, number, number] = [51, 65, 85]
      const softBorder: [number, number, number] = [226, 232, 240]

      docPdf.setFillColor(...emeraldDark)
      docPdf.rect(0, 0, pageWidth, 30, "F")
      docPdf.setFillColor(16, 185, 129)
      docPdf.circle(pageWidth - 14, 8, 16, "F")
      docPdf.setFillColor(255, 255, 255)
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
        docPdf.setTextColor(...emeraldDark)
        docPdf.text(String(value), x + 3, cardY + 13)
      })

      docPdf.setDrawColor(...softBorder)
      docPdf.setFillColor(236, 253, 245)
      docPdf.roundedRect(marginX, 59, pageWidth - marginX * 2, 14, 2, 2, "FD")
      docPdf.setFont("helvetica", "bold")
      docPdf.setFontSize(8)
      docPdf.setTextColor(...emeraldDark)
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
        body: rekapTokoBody.length ? rekapTokoBody : [["-", "Tidak ada pembelian barang pada periode/filter ini", "-", "-"]],
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          lineColor: softBorder,
          lineWidth: 0.1,
          textColor: slate,
        },
        headStyles: {
          fillColor: emerald,
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
        row.jenis === "saldo"
          ? formatRupiah(row.jumlahTambah)
          : formatNumber(row.jumlahTambah),
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
          fillColor: emerald,
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

      docPdf.save(`laporan-pembelian-barang-${laporanId}-${tokoLabel.toLowerCase().replace(/\s+/g, "-")}-${jenisLabel.toLowerCase().replace(/\s+|\//g, "-")}.pdf`)
    } catch (err) {
      console.error(err)
      setError("Gagal membuat PDF laporan")
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/70 blur-[110px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-slate-100/70 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-50/80 blur-[110px]" />
      </div>

      <main className="relative z-10 w-full space-y-4 p-3 pb-28 sm:p-4 lg:p-5">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
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
                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-50/85 sm:text-sm">
                  Laporan pembelian barang, topup saldo digital, dan rekap stok masuk.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={downloadPdf}
                disabled={downloadingPdf || loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={12} strokeWidth={2.8} />
                {downloadingPdf ? "Membuat..." : "PDF"}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={fetchReport}
                disabled={loading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                title="Refresh"
              >
                <motion.span
                  animate={loading ? { rotate: 360 } : {}}
                  transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
                >
                  <RefreshCw size={14} className="text-white" strokeWidth={2.8} />
                </motion.span>
              </motion.button>
            </div>
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={160} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5"
            >
              <AlertCircle size={14} className="shrink-0 text-red-500" strokeWidth={2.5} />
              <p className="text-[11px] font-bold text-red-600">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100/80"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Filter size={15} strokeWidth={2.5} />
            </div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-700">Filter Laporan</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <FilterSelect label="Mode" value={mode} onChange={(v) => setMode(v as ModeLaporan)} icon={Calendar}>
              <option value="harian">Harian</option>
              <option value="bulanan">Bulanan</option>
            </FilterSelect>

            {mode === "harian" ? (
              <div>
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            ) : (
              <>
                <FilterSelect label="Tahun" value={tahun} onChange={(v) => setTahun(Number(v))}>
                  {[2024, 2025, 2026, 2027].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </FilterSelect>

                <FilterSelect label="Bulan" value={bulan} onChange={(v) => setBulan(Number(v))}>
                  {BULAN_LIST.map((item, index) => (
                    <option key={item} value={index + 1}>{item}</option>
                  ))}
                </FilterSelect>
              </>
            )}

            <FilterSelect label="Jenis" value={jenisFilter} onChange={(v) => setJenisFilter(v as JenisFilter)} icon={Package}>
              <option value="">Semua Jenis</option>
              <option value="barang">Barang</option>
              <option value="saldo">Saldo Digital</option>
            </FilterSelect>

            <FilterSelect label="Toko" value={tokoFilter} onChange={setTokoFilter} icon={Store}>
              <option value="">Semua Toko</option>
              {tokoList.map((item) => (
                <option key={item.id} value={item.id}>{item.nama}</option>
              ))}
            </FilterSelect>

            <FilterSelect label="Kategori" value={kategoriFilter} onChange={setKategoriFilter} icon={Tag}>
              <option value="">Semua Kategori</option>
              {kategoriList.map((item) => (
                <option key={item.id} value={item.id}>{item.nama}</option>
              ))}
            </FilterSelect>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">Cari</label>
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nama barang, toko, kategori, supplier..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all placeholder:font-normal placeholder:text-slate-300 hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <FilterSelect label="Tampilkan" value={itemsPerPage} onChange={(v) => setItemsPerPage(Number(v))}>
              {ITEMS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label} data</option>
              ))}
            </FilterSelect>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard icon={ClipboardList} label="Transaksi" value={formatNumber(agregat?.totalTransaksi || 0)} />
          <SummaryCard icon={Package} label="Pembelian Barang" value={formatNumber(agregat?.totalPembelianBarang || 0)} />
          <SummaryCard icon={BarChart3} label="Qty Barang" value={formatNumber(agregat?.totalKuantitasBarang || 0)} />
          <SummaryCard icon={Wallet} label="Topup Saldo" value={formatNumber(agregat?.totalTopupSaldo || 0)} />
          <SummaryCard icon={Wallet} label="Nominal Saldo" value={formatRupiah(agregat?.totalNominalSaldo || 0)} wide />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RekapBox title="Rekap Per Toko" rows={rekapTokoList} />
          <RekapBox title="Rekap Per Kategori" rows={rekapKategoriList} />
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-emerald-500"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat laporan...</p>
            </div>
          </div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <ClipboardList size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tidak ada data laporan</p>
          </div>
        )}

        {!loading && pagedRows.length > 0 && (
          <>
            <div className="space-y-2 sm:hidden">
              {pagedRows.map((row, index) => (
                <motion.div
                  key={`${row.jenis}-${row.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-slate-800">{row.nama}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {row.jenis === "barang" ? row.kategoriNama : "Saldo Digital"} · {row.tokoNama}
                      </p>
                    </div>
                    <JenisBadge jenis={row.jenis} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MiniBox label="Jumlah" value={row.jenis === "saldo" ? formatRupiah(row.jumlahTambah) : formatNumber(row.jumlahTambah)} />
                    <MiniBox label="Sebelum" value={row.jenis === "saldo" ? formatRupiah(row.saldoSebelum) : formatNumber(row.stokSebelum)} />
                    <MiniBox label="Sesudah" value={row.jenis === "saldo" ? formatRupiah(row.saldoSesudah) : formatNumber(row.stokSesudah)} />
                  </div>

                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {formatDateTime(row.createdAt)}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      {["No", "Jenis", "Nama", "Toko", "Kategori", "Supplier", "Jumlah", "Sebelum", "Sesudah", "Waktu"].map((item, index) => (
                        <th
                          key={item}
                          className={`whitespace-nowrap px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${
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
                      <tr key={`${row.jenis}-${row.id}`} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3 text-center font-bold text-slate-400">
                          {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                        </td>
                        <td className="px-4 py-3"><JenisBadge jenis={row.jenis} /></td>
                        <td className="px-4 py-3">
                          <p className="font-black text-slate-800">{row.nama}</p>
                          {row.catatan ? <p className="mt-1 max-w-[220px] truncate text-[10px] font-semibold text-slate-400">{row.catatan}</p> : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{row.tokoNama}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{row.kategoriNama}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{row.supplier}</td>
                        <td className="px-4 py-3 text-center font-black text-slate-700">
                          {row.jenis === "saldo" ? formatRupiah(row.jumlahTambah) : formatNumber(row.jumlahTambah)}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-500">
                          {row.jenis === "saldo" ? formatRupiah(row.saldoSebelum) : formatNumber(row.stokSebelum)}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-700">
                          {row.jenis === "saldo" ? formatRupiah(row.saldoSesudah) : formatNumber(row.stokSesudah)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center font-semibold text-slate-500">
                          {formatDateTime(row.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {itemsPerPage !== 0 && totalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, wide }: { icon: any; label: string; value: string; wide?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${wide ? "col-span-2 lg:col-span-1" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Icon size={20} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-0.5 truncate text-base font-black text-slate-800 sm:text-lg">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

function RekapBox({
  title,
  rows,
}: {
  title: string
  rows: Array<{ key: string; id?: string; nama?: string; totalTransaksi?: number; totalQty?: number; totalNominal?: number }>
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
          {rows.slice(0, 8).map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-800">{item.nama || item.key}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {formatNumber(Number(item.totalQty || 0))} qty
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-emerald-700">{formatNumber(Number(item.totalTransaksi || 0))}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">transaksi</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function JenisBadge({ jenis }: { jenis: "barang" | "saldo" }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
        jenis === "barang" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
      }`}
    >
      {jenis === "barang" ? "Barang" : "Saldo"}
    </span>
  )
}

function MiniBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-black text-slate-800">{value}</p>
    </div>
  )
}
