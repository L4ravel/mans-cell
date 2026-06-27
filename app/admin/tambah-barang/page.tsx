/*
  app/admin/tambah-barang/page.tsx
  Halaman admin barang untuk CRUD data barang per toko di Firestore.
  Layout direvisi konsisten 100% dengan master data terbaru: tema biru muda, filter mobile collapse, stat card sesuai filter aktif, card mobile modern, dan tombol aksi seragam.
  Revisi:
  - pilih jenis barang pakai tab fisik / digital
  - provider digital ambil dari database koleksi provider
  - sumber saldo digital ambil dari database koleksi master_saldo_digital
  - supplier fisik tetap dari koleksi supplier
  - print barcode hanya untuk barang fisik
  - download template Excel, download data Excel, dan import Excel dengan style border konsisten
  - nominal produk digital dibuat fleksibel: bisa angka atau huruf, misalnya Pulsa 10K / Data 5GB
  - input harga modal dan harga jual otomatis memakai titik ribuan agar mudah dibaca
  - card Total Barang, Barang Fisik, dan Barang Digital bisa diklik untuk toggle jumlah/modal
  - kode barang dibuat otomatis dari kode toko + nama barang, contoh TOKO-CP-D-LVS-25
  - import Excel tidak menerima kodeBarang manual; sistem membuat kode saat import
  - label barcode menampilkan kode barang di atas barcode dan kode barcode pendek di bawahnya
  - saat tambah barang dibuka, mode IMEI otomatis aktif dan cursor langsung fokus ke kolom scan
  - kodeBarcode dibuat otomatis saat tombol Barcode dibuka; kode lama tidak diubah dan kode yang sudah ada tidak digenerate ulang
  - layout barcode dirapikan: kode pendek, harga, dan nama toko rata mengikuti lebar barcode
  - teks bawah barcode digeser tipis ke kanan agar kode, harga, dan nama toko lebih pas sejajar
  - kode barang di atas barcode dibatasi mengikuti lebar barcode dan digeser ke kanan agar rata
  - barang IMEI/statusUnit terjual disembunyikan dari tampilan utama, tanpa delete dokumen
*/

"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore"
import {
  AlertCircle,
  BadgeDollarSign,
  Barcode,
  Boxes,
  Building2,
  Check,
  CopyPlus,
  Download,
  FileSpreadsheet,
  ListFilter,
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  Tag,
  Trash2,
  Truck,
  Wallet,
  Wifi,
  X,
  Zap,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import JsBarcode from "jsbarcode"

type KategoriBarang = {
  id: string
  nama: string
}

type SatuanBarang = {
  id: string
  nama: string
}

type Supplier = {
  id: string
  nama: string
  telepon?: string
  alamat?: string
  keterangan?: string
}

type ProviderItem = {
  id: string
  nama: string
}

type SaldoItem = {
  id: string
  namaSaldo: string
  jumlahSaldo: number
  aktif: boolean
}

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type JenisKodeUnik = "imei" | "serial" | "custom"
type JenisBarang = "fisik" | "digital"
type StatusUnitBarang = "tersedia" | "terjual" | "retur" | "rusak" | string

type Barang = {
  id: string
  kodeBarang: string
  kodeBarcode?: string
  nama: string
  kategoriId: string
  kategoriNama: string
  tokoId: string
  tokoNama: string
  merk: string
  supplier: string
  satuan: string
  satuanId?: string
  satuanNama?: string
  hargaModal: number
  hargaJual: number
  stok: number
  stokMinimum: number
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: JenisKodeUnik
  kodeUnik?: string
  statusUnit?: StatusUnitBarang
  soldAt?: any
  soldAtMs?: number
  soldBy?: string
  soldByNama?: string
  soldByEmail?: string
  transactionId?: string
  transactionNumber?: string
  returAt?: any
  returAtMs?: number

  jenisBarang?: JenisBarang
  providerId?: string
  provider?: string
  saldoSourceId?: string
  saldoSourceNama?: string
  nominalProduk?: string
  aktif?: boolean

  createdAt: number
  updatedAt?: number
}

type FlattenPrintItem = {
  key: string
  barangId: string
  nama: string
  kodeBarang: string
  kodeBarcode?: string
  kodeUnik?: string
  pakaiKodeUnik?: boolean
  tokoNama: string
  merk: string
  hargaJual: number
}

type PreparedBarangImport = {
  rowNumber: number
  action: "create" | "update"
  payload: Barang
  editingExisting: Barang | null
}

type BarangImportPreview = {
  fileName: string
  rows: Record<string, any>[]
  prepared: PreparedBarangImport[]
  nextData: Barang[]
  errors: string[]
  totalRows: number
  totalCreate: number
  totalUpdate: number
  totalFisik: number
  totalDigital: number
}

type BarangImportProgress = {
  status: "idle" | "reading" | "ready" | "processing" | "done" | "error"
  current: number
  total: number
  message: string
}

type StatValueMode = "jumlah" | "modal"

type StatValueKey = "totalBarang" | "totalFisik" | "totalDigital"

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const EMPTY_FORM = {
  kodeBarang: "",
  nama: "",
  kategoriId: "",
  tokoId: "",
  merk: "",
  supplier: "",
  satuan: "",
  satuanId: "",
  satuanNama: "",
  hargaModal: "",
  hargaJual: "",
  stok: "",
  stokMinimum: "",
  pakaiKodeUnik: false,
  jenisKodeUnik: "imei" as JenisKodeUnik,
  kodeUnik: "",

  jenisBarang: "fisik" as JenisBarang,
  providerId: "",
  provider: "",
  saldoSourceId: "",
  nominalProduk: "",
  aktif: true,
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "")
}

function formatNumberDots(value: unknown) {
  const digits = onlyDigits(value)
  if (!digits) return ""
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Number(digits))
}

function parseRupiahNumber(value: unknown) {
  const digits = onlyDigits(value)
  if (!digits) return 0
  return Number(digits)
}

function normalizeBarcode(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
}

function normalizeKodeUnik(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
}

function getBarangKodeBarcode(item: { kodeBarcode?: string; barcodeValue?: string }) {
  return normalizeBarcode(item.kodeBarcode || item.barcodeValue || "")
}

function getBarcodePrintValue(item: {
  kodeBarcode?: string
  barcodeValue?: string
  kodeBarang?: string
  kodeUnik?: string
  pakaiKodeUnik?: boolean
}) {
  const kodeBarcode = getBarangKodeBarcode(item)
  if (kodeBarcode) return kodeBarcode

  const kodeUnik = normalizeKodeUnik(item.kodeUnik || "")
  if (item.pakaiKodeUnik && kodeUnik) return kodeUnik
  return normalizeBarcode(item.kodeBarang || "")
}

function formatJenisBarangLabel(value?: JenisBarang) {
  return value === "digital" ? "Digital" : "Fisik"
}

function normalizeStatusUnit(value: unknown): StatusUnitBarang {
  const clean = String(value || "tersedia").trim().toLowerCase()
  if (!clean) return "tersedia"
  return clean as StatusUnitBarang
}

function isBarangTerjual(item: Partial<Barang>) {
  return normalizeStatusUnit(item.statusUnit) === "terjual"
}

function isBarangTampilUtama(item: Partial<Barang>) {
  // Barang tidak dihapus dari Firestore. Yang terjual hanya disembunyikan
  // dari halaman Tambah Barang agar kalau retur status bisa dibalik dan muncul lagi.
  return !isBarangTerjual(item)
}

function FormInput({
  label,
  required,
  icon: Icon,
  rightSlot,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  rightSlot?: ReactNode
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>

      <div className="relative">
        <input
          {...props}
          className={`w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 ${
            rightSlot ? "pr-24" : ""
          }`}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  )
}

function FormSelect({
  label,
  required,
  icon: Icon,
  children,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  children: ReactNode
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>

      <div className="relative">
        <select
          {...props}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
}: {
  value: string | number
  onChange: (v: string) => void
  children: ReactNode
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
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
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


type BarangExcelColumn = {
  key: string
  label: string
  width: number
  required?: boolean
  center?: boolean
  money?: boolean
  number?: boolean
  group?: "main" | "stock" | "price" | "digital" | "unique" | "system"
}

const BARANG_IMPORT_COLUMNS: BarangExcelColumn[] = [
  { key: "id", label: "id", width: 28, group: "system" },
  { key: "jenisBarang", label: "jenisBarang", width: 14, required: true, center: true, group: "main" },
  { key: "kodeBarang", label: "kodeBarang", width: 20, center: true, group: "main" },
  { key: "nama", label: "nama", width: 30, required: true, group: "main" },
  { key: "kategoriNama", label: "kategoriNama", width: 24, required: true, group: "main" },
  { key: "tokoNama", label: "tokoNama", width: 26, required: true, group: "main" },
  { key: "merk", label: "merk", width: 18, group: "main" },
  { key: "supplier", label: "supplier", width: 22, group: "stock" },
  { key: "satuanNama", label: "satuanNama", width: 16, group: "stock" },
  { key: "hargaModal", label: "hargaModal", width: 16, required: true, money: true, group: "price" },
  { key: "hargaJual", label: "hargaJual", width: 16, required: true, money: true, group: "price" },
  { key: "stok", label: "stok", width: 10, number: true, center: true, group: "stock" },
  { key: "stokMinimum", label: "stokMinimum", width: 14, number: true, center: true, group: "stock" },
  { key: "pakaiKodeUnik", label: "pakaiKodeUnik", width: 16, center: true, group: "unique" },
  { key: "jenisKodeUnik", label: "jenisKodeUnik", width: 16, center: true, group: "unique" },
  { key: "kodeUnik", label: "kodeUnik", width: 24, center: true, group: "unique" },
  { key: "provider", label: "provider", width: 20, group: "digital" },
  { key: "saldoSourceNama", label: "saldoSourceNama", width: 24, group: "digital" },
  { key: "nominalProduk", label: "nominalProduk", width: 18, group: "digital" },
  { key: "aktif", label: "aktif", width: 10, center: true, group: "digital" },
]

const BARANG_EXCEL_BORDER = {
  top: { style: "thin", color: { rgb: "64748B" } },
  right: { style: "thin", color: { rgb: "64748B" } },
  bottom: { style: "thin", color: { rgb: "64748B" } },
  left: { style: "thin", color: { rgb: "64748B" } },
}

const BARANG_EXCEL_TITLE_STYLE = {
  font: { bold: true, sz: 15, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "047857" } },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_NOTE_STYLE = {
  font: { bold: true, sz: 10, color: { rgb: "064E3B" } },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "ECFDF5" } },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "059669" } },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_REQUIRED_HEADER_STYLE = {
  font: { bold: true, color: { rgb: "111827" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "F8CBAD" } },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_SYSTEM_HEADER_STYLE = {
  font: { bold: true, color: { rgb: "111827" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { fgColor: { rgb: "D9EAF7" } },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_DATA_LEFT_STYLE = {
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_DATA_CENTER_STYLE = {
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_MONEY_STYLE = {
  alignment: { horizontal: "right", vertical: "center", wrapText: false },
  numFmt: '"Rp" #,##0;[Red]-"Rp" #,##0',
  border: BARANG_EXCEL_BORDER,
}

const BARANG_EXCEL_NUMBER_STYLE = {
  alignment: { horizontal: "right", vertical: "center", wrapText: false },
  numFmt: "#,##0",
  border: BARANG_EXCEL_BORDER,
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeExcelKey(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ")
}

function normalizeExcelCompact(value: unknown) {
  return normalizeExcelKey(value).replace(/[^a-z0-9]+/g, "")
}

function parseExcelNumber(value: unknown) {
  if (typeof value === "number") return value
  const raw = normalizeText(value)
  if (!raw) return 0
  const cleaned = raw.replace(/[^0-9,-]/g, "").replace(/,/g, ".")
  return Number(cleaned || 0)
}

function parseExcelBoolean(value: unknown, fallback = false) {
  const v = normalizeExcelKey(value)
  if (!v) return fallback
  if (["ya", "y", "true", "1", "aktif", "v", "✓", "iya"].includes(v)) return true
  if (["tidak", "t", "false", "0", "nonaktif", "no", "n"].includes(v)) return false
  return fallback
}

function safeBarangSheetName(value: string, fallback: string) {
  const clean = normalizeText(value || fallback)
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return (clean || fallback).slice(0, 31)
}

function ensureBarangExcelCell(ws: any, addr: string) {
  if (!ws[addr]) ws[addr] = { t: "s", v: "" }
  return ws[addr]
}

function applyBarangExcelCellStyle(ws: any, addr: string, style: any) {
  const cell = ensureBarangExcelCell(ws, addr)
  cell.s = {
    ...(cell.s || {}),
    ...style,
    border: BARANG_EXCEL_BORDER,
  }
}

function applyBarangExcelBorderRange(params: {
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
      applyBarangExcelCellStyle(
        ws,
        XLSX.utils.encode_cell({ r, c }),
        baseStyle || BARANG_EXCEL_DATA_LEFT_STYLE
      )
    }
  }
}


function getBarangExcelColLetter(XLSX: any, columnLabel: string) {
  const index = BARANG_IMPORT_COLUMNS.findIndex((item) => item.label === columnLabel)
  if (index < 0) return ""
  return XLSX.utils.encode_col(index + 1)
}

function quoteExcelSheetName(name: string) {
  return `'${String(name || "").replace(/'/g, "''")}'`
}

function buildExcelListFormula(values: string[]) {
  const cleanValues = values
    .map((item) => normalizeText(item).replace(/"/g, '""'))
    .filter(Boolean)

  if (cleanValues.length === 0) return '""'

  const inline = cleanValues.join(",")
  if (inline.length <= 240) return `"${inline}"`
  return '""'
}

function addBarangExcelDropdown(params: {
  XLSX: any
  ws: any
  columnLabel: string
  startRow?: number
  endRow?: number
  formula: string
  allowBlank?: boolean
  promptTitle?: string
  prompt?: string
  errorTitle?: string
  error?: string
}) {
  const {
    XLSX,
    ws,
    columnLabel,
    startRow = 6,
    endRow = 105,
    formula,
    allowBlank = true,
    promptTitle = "Pilih data",
    prompt = "Pilih salah satu data dari dropdown.",
    errorTitle = "Data tidak valid",
    error = "Pilih data dari dropdown agar import tidak bermasalah.",
  } = params

  const col = getBarangExcelColLetter(XLSX, columnLabel)
  if (!col || !formula) return

  const sqref = `${col}${startRow}:${col}${endRow}`

  const validation = {
    type: "list",
    allowBlank,
    showErrorMessage: true,
    showInputMessage: true,
    sqref,
    formula1: formula,
    promptTitle,
    prompt,
    errorTitle,
    error,
  }

  // Beberapa versi SheetJS fork membaca nama properti berbeda,
  // jadi kita isi keduanya agar peluang dropdown tertulis lebih besar.
  ws["!dataValidation"] = [...(ws["!dataValidation"] || []), validation]
  ws["!dataValidations"] = [...(ws["!dataValidations"] || []), validation]
}

function addBarangTemplateDropdowns(params: {
  XLSX: any
  ws: any
  kategoriCount: number
  tokoCount: number
  satuanCount: number
  supplierCount: number
  providerCount: number
  saldoCount: number
}) {
  const { XLSX, ws, kategoriCount, tokoCount, satuanCount, supplierCount, providerCount, saldoCount } = params

  const endRow = 105
  const refRange = (sheet: string, col: string, count: number) => {
    if (count <= 0) return '""'
    return `${quoteExcelSheetName(sheet)}!$${col}$3:$${col}$${count + 2}`
  }

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "jenisBarang",
    endRow,
    formula: buildExcelListFormula(["fisik", "digital"]),
    allowBlank: false,
    prompt: "Pilih fisik untuk barang stok, atau digital untuk produk pulsa/data/saldo.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "kategoriNama",
    endRow,
    formula: refRange("ref_kategori", "B", kategoriCount),
    allowBlank: false,
    prompt: "Pilih kategori dari data master kategori_barang.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "tokoNama",
    endRow,
    formula: refRange("ref_toko", "B", tokoCount),
    allowBlank: false,
    prompt: "Pilih toko dari data master toko.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "supplier",
    endRow,
    formula: refRange("ref_supplier", "B", supplierCount),
    prompt: "Pilih supplier untuk barang fisik.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "satuanNama",
    endRow,
    formula: refRange("ref_satuan", "B", satuanCount),
    prompt: "Pilih satuan untuk barang fisik.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "pakaiKodeUnik",
    endRow,
    formula: buildExcelListFormula(["ya", "tidak"]),
    prompt: "Pilih ya jika barang memakai IMEI/serial/kode unik.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "jenisKodeUnik",
    endRow,
    formula: buildExcelListFormula(["imei", "serial", "custom"]),
    prompt: "Pilih jenis kode unik.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "provider",
    endRow,
    formula: refRange("ref_provider", "B", providerCount),
    prompt: "Pilih provider untuk barang digital.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "saldoSourceNama",
    endRow,
    formula: refRange("ref_saldo", "B", saldoCount),
    prompt: "Pilih sumber saldo untuk barang digital.",
  })

  addBarangExcelDropdown({
    XLSX,
    ws,
    columnLabel: "aktif",
    endRow,
    formula: buildExcelListFormula(["ya", "tidak"]),
    prompt: "Khusus digital. Pilih ya jika produk aktif.",
  })
}


function finalizeBarangExcelSheet(XLSX: any, ws: any) {
  if (!ws || !ws["!ref"]) return
  const range = XLSX.utils.decode_range(ws["!ref"])

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) ws[addr] = { t: "s", v: "" }
      ws[addr].s = {
        ...(ws[addr].s || {}),
        border: BARANG_EXCEL_BORDER,
        alignment: {
          vertical: "center",
          wrapText: true,
          ...(ws[addr].s?.alignment || {}),
        },
      }
    }
  }
}

async function downloadBarangWorkbook(workbook: any, filename: string) {
  const XLSX = await import("xlsx-js-style")

  workbook.SheetNames.forEach((sheetName: string) => {
    finalizeBarangExcelSheet(XLSX, workbook.Sheets[sheetName])
  })

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

function getBarangHeaderStyle(column?: BarangExcelColumn) {
  if (!column) return BARANG_EXCEL_SYSTEM_HEADER_STYLE
  if (column.key === "id") return BARANG_EXCEL_SYSTEM_HEADER_STYLE
  if (column.required) return BARANG_EXCEL_REQUIRED_HEADER_STYLE
  return BARANG_EXCEL_HEADER_STYLE
}

function makeBarangDataSheet(XLSX: any, rows: Partial<Barang>[], title: string, templateMode = false) {
  const visibleImportColumns = getVisibleBarangImportColumns()
  const aoa: any[][] = []
  aoa.push([title])
  aoa.push([
    templateMode
      ? "Isi data mulai baris ke-5. Oranye wajib. Kode barang dibuat otomatis oleh sistem."
      : `Total data: ${rows.length}`,
  ])
  aoa.push(["Kolom master memakai dropdown. Pilih nama data, sistem akan membaca ID otomatis saat import."])
  aoa.push([])
  aoa.push(["No", ...visibleImportColumns.map((c) => c.label)])

  const finalRows = templateMode
    ? Array.from({ length: 100 }).map(() => ({} as Partial<Barang>))
    : rows

  finalRows.forEach((row, index) => {
    aoa.push([
      index + 1,
      ...visibleImportColumns.map((col) => {
        const value = (row as any)[col.key]
        if (col.key === "jenisBarang") return normalizeText(value || "fisik")
        if (col.key === "aktif") return value === false ? "tidak" : value === undefined ? "" : "ya"
        if (col.key === "pakaiKodeUnik") return value ? "ya" : value === undefined ? "" : "tidak"
        if (typeof value === "boolean") return value ? "ya" : "tidak"
        return value ?? ""
      }),
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const lastCol = visibleImportColumns.length
  const lastRow = aoa.length - 1

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
  ]
  ws["!cols"] = [{ wch: 6 }, ...visibleImportColumns.map((c) => ({ wch: c.width }))]
  ws["!freeze"] = { xSplit: 1, ySplit: 5 }

  applyBarangExcelCellStyle(ws, "A1", BARANG_EXCEL_TITLE_STYLE)
  applyBarangExcelCellStyle(ws, "A2", BARANG_EXCEL_NOTE_STYLE)
  applyBarangExcelCellStyle(ws, "A3", BARANG_EXCEL_NOTE_STYLE)

  applyBarangExcelBorderRange({
    ws,
    XLSX,
    startRow: 4,
    endRow: lastRow,
    startCol: 0,
    endCol: lastCol,
    baseStyle: BARANG_EXCEL_DATA_LEFT_STYLE,
  })

  for (let c = 0; c <= lastCol; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 4, c })
    const column = c === 0 ? undefined : visibleImportColumns[c - 1]
    applyBarangExcelCellStyle(ws, addr, getBarangHeaderStyle(column))
  }

  for (let r = 5; r <= lastRow; r += 1) {
    applyBarangExcelCellStyle(ws, XLSX.utils.encode_cell({ r, c: 0 }), BARANG_EXCEL_DATA_CENTER_STYLE)
    visibleImportColumns.forEach((col, index) => {
      const addr = XLSX.utils.encode_cell({ r, c: index + 1 })
      if (col.money) applyBarangExcelCellStyle(ws, addr, BARANG_EXCEL_MONEY_STYLE)
      else if (col.number) applyBarangExcelCellStyle(ws, addr, BARANG_EXCEL_NUMBER_STYLE)
      else if (col.center) applyBarangExcelCellStyle(ws, addr, BARANG_EXCEL_DATA_CENTER_STYLE)
    })
  }

  return ws
}
function makeBarangReferenceSheet(XLSX: any, title: string, headers: string[], rows: any[][]) {
  const aoa = [[title], headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const lastCol = Math.max(headers.length - 1, 0)
  const lastRow = Math.max(aoa.length - 1, 1)

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }]
  ws["!cols"] = headers.map(() => ({ wch: 28 }))

  applyBarangExcelCellStyle(ws, "A1", BARANG_EXCEL_TITLE_STYLE)
  applyBarangExcelBorderRange({
    ws,
    XLSX,
    startRow: 1,
    endRow: lastRow,
    startCol: 0,
    endCol: lastCol,
    baseStyle: BARANG_EXCEL_DATA_LEFT_STYLE,
  })

  for (let c = 0; c <= lastCol; c += 1) {
    applyBarangExcelCellStyle(ws, XLSX.utils.encode_cell({ r: 1, c }), BARANG_EXCEL_HEADER_STYLE)
  }

  return ws
}

function makeBarangPetunjukSheet(XLSX: any) {
  const rows = [
    ["Aturan", "Keterangan"],
    ["jenisBarang", "Isi fisik atau digital."],
    ["id", "Boleh kosong untuk tambah data baru. Jika diisi dan cocok dengan database, data akan diperbarui."],
    ["kodeBarang", "Tidak diisi dari Excel. Sistem membuat otomatis dari kode toko + nama barang saat import."],
    ["kategoriNama/tokoNama", "Pilih dari dropdown. Sistem otomatis membaca ID dari sheet referensi saat import."],
    ["satuanNama", "Pilih dari dropdown untuk barang fisik. Digital otomatis transaksi."],
    ["supplier", "Pilih dari dropdown untuk barang fisik."],
    ["provider/saldoSourceNama/nominalProduk", "Provider dan saldo pilih dari dropdown untuk barang digital."],
    ["pakaiKodeUnik", "Pilih ya/tidak dari dropdown. Jika ya, isi jenisKodeUnik dan kodeUnik."],
    ["aktif", "Khusus digital. Pilih ya/tidak dari dropdown."],
  ]

  const ws = XLSX.utils.aoa_to_sheet([["PETUNJUK IMPORT BARANG"], ...rows])
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  ws["!cols"] = [{ wch: 26 }, { wch: 80 }]
  applyBarangExcelCellStyle(ws, "A1", BARANG_EXCEL_TITLE_STYLE)
  applyBarangExcelBorderRange({
    ws,
    XLSX,
    startRow: 1,
    endRow: rows.length,
    startCol: 0,
    endCol: 1,
    baseStyle: BARANG_EXCEL_DATA_LEFT_STYLE,
  })
  applyBarangExcelCellStyle(ws, "A2", BARANG_EXCEL_HEADER_STYLE)
  applyBarangExcelCellStyle(ws, "B2", BARANG_EXCEL_HEADER_STYLE)
  return ws
}

function ImportStatCard({
  label,
  value,
  danger,
}: {
  label: string
  value: number
  danger?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        danger ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-[9px] font-black uppercase tracking-[0.14em] ${
          danger ? "text-red-500" : "text-slate-400"
        }`}
      >
        {label}
      </p>
      <p className={`mt-1 text-xl font-black ${danger ? "text-red-700" : "text-slate-800"}`}>
        {value}
      </p>
    </div>
  )
}

function BarangStatCard({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
  active,
  hint,
}: {
  label: string
  value: string
  icon: any
  tone: "slate" | "sky" | "blue" | "rose"
  onClick?: () => void
  active?: boolean
  hint?: string
}) {
  const toneClass =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
          : "bg-slate-100 text-slate-500"

  const content = (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${toneClass}`}>
        <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          {active && (
            <span className="hidden rounded-full bg-sky-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-600 sm:inline-flex">
              Modal
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-lg font-black leading-tight text-slate-800 sm:text-2xl">
          {value}
        </p>
        {hint && (
          <p className="mt-1 truncate text-[8px] font-bold text-slate-400 sm:text-[10px]">
            {hint}
          </p>
        )}
      </div>
    </div>
  )

  if (onClick) {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.28 }}
        onClick={onClick}
        className={`rounded-2xl border bg-white p-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-400/20 sm:p-4 ${
          active ? "border-sky-300 ring-2 ring-sky-400/10" : "border-slate-200"
        }`}
        title={active ? "Klik untuk kembali ke jumlah barang" : "Klik untuk melihat total modal"}
      >
        {content}
      </motion.button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
    >
      {content}
    </motion.div>
  )
}


function BarcodeSvg({ value, className }: { value: string; className?: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return

    const cleanValue = normalizeBarcode(value)
    if (!cleanValue) return

    try {
      JsBarcode(svgRef.current, cleanValue, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        width: 1.2,
        height: 26,
      })
    } catch (error) {
      console.error("Gagal generate barcode:", error)
    }
  }, [value])

  return <svg ref={svgRef} className={className} />
}

function InlineHargaInput({
  label,
  value,
  onChange,
  dirty,
  invalid,
  className = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  dirty?: boolean
  invalid?: boolean
  className?: string
}) {
  const labelClass = invalid
    ? "text-red-500"
    : dirty
      ? "text-emerald-600"
      : "text-slate-400"

  const inputClass = invalid
    ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-400/20 focus-visible:border-red-400 focus-visible:ring-red-400/20"
    : dirty
      ? "border-emerald-300 bg-emerald-50/40 focus:border-sky-500 focus:ring-sky-400/25 focus-visible:border-sky-500 focus-visible:ring-sky-400/25"
      : "border-slate-200 focus:border-sky-500 focus:ring-sky-400/25 focus-visible:border-sky-500 focus-visible:ring-sky-400/25"

  return (
    <div className={className}>
      <p className={`mb-1 text-[8px] font-black uppercase tracking-widest ${labelClass}`}>
        {label}
      </p>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
          Rp
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          className={`h-9 w-full rounded-xl border-2 bg-white pl-7 pr-2 text-right text-xs font-black text-slate-800 outline-none transition-all focus:outline-none focus-visible:outline-none focus:ring-2 focus-visible:ring-2 focus:ring-offset-0 focus-visible:ring-offset-0 ${inputClass}`}
        />
      </div>
    </div>
  )
}


function getVisibleBarangImportColumns() {
  return BARANG_IMPORT_COLUMNS.filter(
    (item) => item.label !== "id" && item.key !== "id" && item.label !== "kodeBarang" && item.key !== "kodeBarang"
  )
}


function makeBarangRefSearchLabel(prefix: string, nama: string) {
  const cleanPrefix = String(prefix || "").trim().toUpperCase()
  const cleanNama = String(nama || "").trim()

  if (!cleanPrefix) return cleanNama
  if (!cleanNama) return cleanPrefix

  return `${cleanPrefix} - ${cleanNama}`
}

function makeBarangShortCode(value: string, fallback = "DATA") {
  const cleaned = String(value || fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()

  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return fallback

  if (words.length === 1) return words[0].slice(0, 14)

  return words
    .map((word) => word.slice(0, Math.min(4, Math.max(2, word.length))))
    .join("-")
    .slice(0, 20)
}

function sortBarangRefRows<T extends { nama?: string; namaSaldo?: string }>(rows: T[]) {
  return [...rows].sort((a, b) =>
    String(a.nama || a.namaSaldo || "").localeCompare(
      String(b.nama || b.namaSaldo || ""),
      "id-ID",
      { numeric: true, sensitivity: "base" }
    )
  )
}

const BARANG_NAME_PHRASE_CODES: Array<{ words: string[]; code: string }> = [
  { words: ["celana", "pendek"], code: "CP" },
  { words: ["celana", "panjang"], code: "CL" },
  { words: ["paket", "data"], code: "DATA" },
  { words: ["token", "listrik"], code: "PLN" },
  { words: ["top", "up"], code: "TPU" },
  { words: ["pulsa"], code: "PLS" },
  { words: ["voucher"], code: "VCR" },
  { words: ["kuota"], code: "DATA" },
  { words: ["baju"], code: "BJ" },
  { words: ["kaos"], code: "KS" },
  { words: ["kemeja"], code: "KMJ" },
  { words: ["jaket"], code: "JKT" },
  { words: ["sandal"], code: "SDL" },
  { words: ["sepatu"], code: "SPT" },
  { words: ["charger"], code: "CHG" },
  { words: ["cas"], code: "CHG" },
  { words: ["kabel"], code: "KBL" },
  { words: ["headset"], code: "HDS" },
  { words: ["earphone"], code: "ERP" },
  { words: ["speaker"], code: "SPK" },
  { words: ["powerbank"], code: "PWB" },
  { words: ["hp"], code: "HP" },
  { words: ["handphone"], code: "HP" },
]

const BARANG_WORD_CODES: Record<string, string> = {
  dewasa: "D",
  anak: "A",
  pria: "P",
  laki: "L",
  cowok: "CWK",
  wanita: "W",
  perempuan: "PR",
  cewek: "CWK",
  levis: "LVS",
  levi: "LVS",
  jeans: "JNS",
  denim: "DNM",
  katun: "KTN",
  cotton: "KTN",
  polo: "PLO",
  original: "ORI",
  ori: "ORI",
  premium: "PRM",
  android: "AND",
  iphone: "IPH",
  samsung: "SMS",
  vivo: "VIV",
  oppo: "OPP",
  xiaomi: "XIA",
  redmi: "RDM",
  realme: "RLM",
  infinix: "IFX",
  telkomsel: "TSEL",
  simpati: "TSEL",
  byu: "BYU",
  xl: "XL",
  axis: "AXIS",
  indosat: "ISAT",
  im3: "ISAT",
  tri: "TRI",
  three: "TRI",
  smartfren: "SMF",
  pln: "PLN",
  dana: "DANA",
  ovo: "OVO",
  gopay: "GPY",
  shopeepay: "SPY",
  linkaja: "LJA",
  bluetooth: "BT",
  type: "TC",
  typec: "TC",
  usb: "USB",
  micro: "MC",
}

const BARANG_CODE_STOP_WORDS = new Set([
  "ukuran",
  "size",
  "nomor",
  "no",
  "untuk",
  "dan",
  "atau",
  "warna",
  "model",
  "tipe",
  "jenis",
  "barang",
  "produk",
  "isi",
])

function normalizeBarangCodePrefix(value: string, fallback = "TOKO") {
  const clean = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")

  return clean || fallback
}

function tokenizeBarangNameForCode(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/([0-9]+)\s*(rb|ribu|k)\b/g, "$1K")
    .replace(/([0-9]+)\s*(gb|mb|w|mah|m)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function makeBarangTokenCode(word: string) {
  const lower = String(word || "").toLowerCase().trim()
  if (!lower || BARANG_CODE_STOP_WORDS.has(lower)) return ""

  const mapped = BARANG_WORD_CODES[lower]
  if (mapped) return mapped

  const upper = lower.toUpperCase()
  if (/^[0-9]+K$/.test(upper)) return upper
  if (/^[0-9]+(GB|MB|W|MAH|M)$/.test(upper)) return upper
  if (/^[0-9]+$/.test(upper)) return upper
  if (/^[A-Z]+[0-9]+[A-Z0-9]*$/.test(upper)) return upper.slice(0, 8)
  if (upper.length <= 4) return upper

  const consonants = upper.replace(/[AIUEO]/g, "")
  return (consonants.length >= 3 ? consonants.slice(0, 3) : upper.slice(0, 3)).toUpperCase()
}

function buildBarangNameCodeSegment(nama: string) {
  const words = tokenizeBarangNameForCode(nama)
  const used = new Set<number>()
  const segments: string[] = []

  BARANG_NAME_PHRASE_CODES.forEach((phrase) => {
    for (let index = 0; index <= words.length - phrase.words.length; index += 1) {
      const matched = phrase.words.every((word, offset) => words[index + offset] === word)
      if (!matched) continue

      if (!segments.includes(phrase.code)) segments.push(phrase.code)
      phrase.words.forEach((_, offset) => used.add(index + offset))
      break
    }
  })

  words.forEach((word, index) => {
    if (used.has(index)) return

    const code = makeBarangTokenCode(word)
    if (!code) return
    if (segments.includes(code)) return

    segments.push(code)
  })

  return (segments.length > 0 ? segments : ["BRG"]).join("-").slice(0, 48)
}

function buildKodeBarangFromName(params: {
  nama: string
  toko?: Toko | null
  tokoId?: string
  existingItems?: Barang[]
  currentId?: string | null
}) {
  const tokoId = params.toko?.id || params.tokoId || ""
  const tokoKode = normalizeBarangCodePrefix(params.toko?.kode || params.tokoId || "TOKO")
  const nameCode = buildBarangNameCodeSegment(params.nama)
  const baseCode = normalizeBarcode(`${tokoKode}-${nameCode}`)
  const existingItems = params.existingItems || []
  const usedCodes = new Set(
    existingItems
      .filter((item) => item.tokoId === tokoId && item.id !== params.currentId)
      .map((item) => normalizeBarcode(item.kodeBarang))
      .filter(Boolean)
  )

  if (!usedCodes.has(baseCode)) return baseCode

  let counter = 2
  while (usedCodes.has(`${baseCode}-${String(counter).padStart(2, "0")}`)) {
    counter += 1
  }

  return `${baseCode}-${String(counter).padStart(2, "0")}`
}

function makeNextKodeBarcode(usedCodes: Set<string>) {
  const prefixes = [
    "K",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      .split("")
      .filter((item) => item !== "K"),
  ]

  for (const prefix of prefixes) {
    for (let number = 1; number <= 999; number += 1) {
      const candidate = `${prefix}${String(number).padStart(3, "0")}`
      if (!usedCodes.has(candidate)) return candidate
    }
  }

  return ""
}


async function downloadBarangTemplateWithExcelJS(params: {
  kategoriList: KategoriBarang[]
  tokoList: Toko[]
  satuanList: SatuanBarang[]
  supplierList: Supplier[]
  providerList: ProviderItem[]
  saldoList: SaldoItem[]
}) {
  const { kategoriList, tokoList, satuanList, supplierList, providerList, saldoList } = params
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()

  workbook.creator = "SIDIP"
  workbook.created = new Date()

  const headerFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF059669" } }
  const requiredFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF8CBAD" } }
  const optionalFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9EAF7" } }
  const titleFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF047857" } }
  const noteFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFECFDF5" } }
  const border = {
    top: { style: "thin" as const, color: { argb: "FF94A3B8" } },
    left: { style: "thin" as const, color: { argb: "FF94A3B8" } },
    bottom: { style: "thin" as const, color: { argb: "FF94A3B8" } },
    right: { style: "thin" as const, color: { argb: "FF94A3B8" } },
  }

  const visibleImportColumns = getVisibleBarangImportColumns()
  const columns = ["No", ...visibleImportColumns.map((item) => item.label)]
  const requiredLabels = new Set(
    visibleImportColumns.filter((item) => item.required).map((item) => item.label)
  )

  const dataSheet = workbook.addWorksheet("Data Barang")
  dataSheet.mergeCells(1, 1, 1, columns.length)
  dataSheet.getCell(1, 1).value = "TEMPLATE IMPORT DATA BARANG"
  dataSheet.getCell(1, 1).font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } }
  dataSheet.getCell(1, 1).alignment = { horizontal: "center", vertical: "middle" }
  dataSheet.getCell(1, 1).fill = titleFill
  dataSheet.getCell(1, 1).border = border

  dataSheet.mergeCells(2, 1, 2, columns.length)
  dataSheet.getCell(2, 1).value =
    "Pilih dropdown untuk data master. Jika daftar panjang, buka sheet referensi lalu gunakan filter/search pada kolom Kata Kunci."
  dataSheet.getCell(2, 1).font = { bold: true, size: 10, color: { argb: "FF334155" } }
  dataSheet.getCell(2, 1).alignment = { horizontal: "left", vertical: "middle" }
  dataSheet.getCell(2, 1).fill = noteFill
  dataSheet.getCell(2, 1).border = border

  dataSheet.addRow([])
  const headerRow = dataSheet.addRow(columns)

  headerRow.eachCell((cell, colNumber) => {
    const label = String(cell.value || "")
    cell.font = { bold: true, color: { argb: "FF000000" } }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.fill =
      colNumber === 1
        ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } }
        : requiredLabels.has(label)
          ? requiredFill
          : optionalFill
    cell.border = border
  })

  dataSheet.columns = [
    { width: 6 },
    ...visibleImportColumns.map((item) => ({ width: item.width || 18 })),
  ]

  for (let rowIndex = 5; rowIndex <= 104; rowIndex += 1) {
    const row = dataSheet.getRow(rowIndex)
    row.getCell(1).value = rowIndex - 4

    visibleImportColumns.forEach((col, index) => {
      const cell = row.getCell(index + 2)
      if (col.label === "jenisBarang") cell.value = "fisik"
      if (col.label === "pakaiKodeUnik") cell.value = "tidak"
      if (col.label === "jenisKodeUnik") cell.value = "imei"
      if (col.label === "aktif") cell.value = "ya"
      if (col.label === "stok") cell.value = 0
      if (col.label === "stokMinimum") cell.value = 0
    })

    for (let colIndex = 1; colIndex <= columns.length; colIndex += 1) {
      const cell = row.getCell(colIndex)
      cell.border = border
      cell.alignment = {
        horizontal: colIndex === 1 ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      }
    }
  }

  dataSheet.views = [{ state: "frozen", ySplit: 4 }]
  dataSheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length },
  }

  const makeRefSheet = (
    sheetName: string,
    title: string,
    rows: Array<{
      id?: string
      nama: string
      kodePendek?: string
      kataKunci?: string
      keterangan?: string
    }>
  ) => {
    const headers = ["nama", "kodePendek", "kataKunci", "keterangan"]
    const ws = workbook.addWorksheet(sheetName)

    ws.mergeCells(1, 1, 1, headers.length)
    ws.getCell(1, 1).value = title
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } }
    ws.getCell(1, 1).alignment = { horizontal: "center", vertical: "middle" }
    ws.getCell(1, 1).fill = titleFill
    ws.getCell(1, 1).border = border

    const noteRow = ws.addRow([
      "Gunakan filter/search di kolom nama, kodePendek, atau kataKunci jika pilihan dropdown terlalu panjang.",
      "",
      "",
      "",
      "",
    ])
    ws.mergeCells(2, 1, 2, headers.length)
    noteRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF334155" } }
      cell.fill = noteFill
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true }
      cell.border = border
    })

    const header = ws.addRow(headers)
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF000000" } }
      cell.fill = headerFill
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
      cell.border = border
    })

    rows.forEach((item) => {
      const row = ws.addRow([
        item.nama,
        item.kodePendek || makeBarangShortCode(item.nama),
        item.kataKunci || item.nama,
        item.keterangan || "",
      ])

      row.eachCell((cell, colNumber) => {
        cell.border = border
        cell.alignment = {
          vertical: "middle",
          horizontal: colNumber === 1 ? "left" : "left",
          wrapText: true,
        }
      })
    })

    ws.columns = [
      { width: 32 },
      { width: 20 },
      { width: 48 },
      { width: 34 },
    ]

    ws.views = [{ state: "frozen", ySplit: 3 }]
    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: headers.length },
    }

    return ws
  }

  makeRefSheet(
    "ref_kategori",
    "REFERENSI KATEGORI",
    sortBarangRefRows(kategoriList).map((item) => ({
      id: item.id,
      nama: item.nama,
      kodePendek: makeBarangShortCode(item.nama, "KATEGORI"),
      kataKunci: makeBarangRefSearchLabel("KATEGORI", item.nama),
      keterangan: "Dipilih pada kolom kategoriNama",
    }))
  )

  makeRefSheet(
    "ref_toko",
    "REFERENSI TOKO",
    sortBarangRefRows(tokoList).map((item) => ({
      id: item.id,
      nama: item.nama,
      kodePendek: item.kode || makeBarangShortCode(item.nama, "TOKO"),
      kataKunci: makeBarangRefSearchLabel(item.kode || "TOKO", item.nama),
      keterangan: item.aktif === false ? "Nonaktif" : "Aktif",
    }))
  )

  makeRefSheet(
    "ref_satuan",
    "REFERENSI SATUAN",
    sortBarangRefRows(satuanList).map((item) => ({
      id: item.id,
      nama: item.nama,
      kodePendek: makeBarangShortCode(item.nama, "SATUAN"),
      kataKunci: makeBarangRefSearchLabel("SATUAN", item.nama),
      keterangan: "Dipilih pada kolom satuanNama",
    }))
  )

  makeRefSheet(
    "ref_supplier",
    "REFERENSI SUPPLIER",
    sortBarangRefRows(supplierList).map((item) => ({
      id: item.id,
      nama: item.nama,
      kodePendek: makeBarangShortCode(item.nama, "SUPPLIER"),
      kataKunci: makeBarangRefSearchLabel("SUPPLIER", item.nama),
      keterangan: item.telepon || item.alamat || "",
    }))
  )

  makeRefSheet(
    "ref_provider",
    "REFERENSI PROVIDER",
    sortBarangRefRows(providerList).map((item) => ({
      id: item.id,
      nama: item.nama,
      kodePendek: makeBarangShortCode(item.nama, "PROVIDER"),
      kataKunci: makeBarangRefSearchLabel("PROVIDER", item.nama),
      keterangan: "Dipilih pada kolom provider",
    }))
  )

  makeRefSheet(
    "ref_saldo",
    "REFERENSI SALDO DIGITAL",
    sortBarangRefRows(saldoList).map((item) => ({
      id: item.id,
      nama: item.namaSaldo,
      kodePendek: makeBarangShortCode(item.namaSaldo, "SALDO"),
      kataKunci: makeBarangRefSearchLabel("SALDO", item.namaSaldo),
      keterangan: item.aktif === false ? "Nonaktif" : `Saldo ${formatRupiah(item.jumlahSaldo || 0)}`,
    }))
  )

  const petunjuk = workbook.addWorksheet("petunjuk")
  petunjuk.addRow(["Field", "Keterangan"])
  petunjuk.addRow(["jenisBarang", "Pilih fisik atau digital dari dropdown."])
  petunjuk.addRow(["kodeBarang", "Tidak perlu dan tidak boleh diisi di Excel. Sistem otomatis membuat dari kode toko + nama barang."])
  petunjuk.addRow(["kategoriNama/tokoNama", "Pilih dari dropdown. Jika daftar panjang, buka sheet ref lalu pakai filter/search pada kolom Kata Kunci."])
  petunjuk.addRow(["satuanNama/supplier", "Pilih dari dropdown untuk barang fisik."])
  petunjuk.addRow(["provider/saldoSourceNama", "Pilih dari dropdown untuk barang digital."])
  petunjuk.addRow(["pakaiKodeUnik/aktif", "Pilih ya atau tidak dari dropdown."])
  petunjuk.addRow(["kodeUnik", "Bisa isi banyak IMEI/serial per baris. Sistem membuat barang terpisah."])
  petunjuk.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF000000" } }
    cell.fill = headerFill
    cell.border = border
    cell.alignment = { horizontal: "center", vertical: "middle" }
  })
  petunjuk.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = border
      cell.alignment = { vertical: "middle", wrapText: true }
    })
  })
  petunjuk.columns = [{ width: 28 }, { width: 80 }]

  const colMap = new Map<string, number>()
  visibleImportColumns.forEach((item, index) => {
    colMap.set(item.label, index + 2)
  })

  const addDropdown = (label: string, formulae: string[]) => {
    const colNumber = colMap.get(label)
    if (!colNumber) return

    for (let rowIndex = 5; rowIndex <= 104; rowIndex += 1) {
      const cell = dataSheet.getRow(rowIndex).getCell(colNumber)
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        showInputMessage: true,
        formulae,
        promptTitle: "Pilih data",
        prompt: "Pilih data dari dropdown agar import aman.",
        errorTitle: "Data tidak valid",
        error: "Pilih data dari dropdown yang tersedia.",
      }
    }
  }

  const listFormula = (sheet: string, count: number) => {
    if (count <= 0) return '""'
    return `'${sheet}'!$A$4:$A$${count + 3}`
  }

  addDropdown("jenisBarang", ['"fisik,digital"'])
  addDropdown("kategoriNama", [listFormula("ref_kategori", kategoriList.length)])
  addDropdown("tokoNama", [listFormula("ref_toko", tokoList.length)])
  addDropdown("satuanNama", [listFormula("ref_satuan", satuanList.length)])
  addDropdown("supplier", [listFormula("ref_supplier", supplierList.length)])
  addDropdown("provider", [listFormula("ref_provider", providerList.length)])
  addDropdown("saldoSourceNama", [listFormula("ref_saldo", saldoList.length)])
  addDropdown("pakaiKodeUnik", ['"ya,tidak"'])
  addDropdown("jenisKodeUnik", ['"imei,serial,custom"'])
  addDropdown("aktif", ['"ya,tidak"'])

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "template_import_barang_dropdown.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}


export default function TambahBarangPage() {
  const [data, setData] = useState<Barang[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriBarang[]>([])
  const [kategoriDigitalList, setKategoriDigitalList] = useState<KategoriBarang[]>([])
  const [satuanList, setSatuanList] = useState<SatuanBarang[]>([])
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [providerList, setProviderList] = useState<ProviderItem[]>([])
  const [saldoList, setSaldoList] = useState<SaldoItem[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])

  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [inlinePriceDrafts, setInlinePriceDrafts] = useState<
    Record<string, { hargaModal: string; hargaJual: string }>
  >({})
  const [inlinePriceSaving, setInlinePriceSaving] = useState<Record<string, boolean>>({})
  const [newDigitalKategoriNama, setNewDigitalKategoriNama] = useState("")
  const [creatingDigitalKategori, setCreatingDigitalKategori] = useState(false)
  const [showDigitalKategoriModal, setShowDigitalKategoriModal] = useState(false)
  const [digitalKategoriFormNama, setDigitalKategoriFormNama] = useState("")
  const [editingDigitalKategoriId, setEditingDigitalKategoriId] = useState<string | null>(null)
  const [digitalKategoriLoading, setDigitalKategoriLoading] = useState(false)
  const [deleteDigitalKategoriTarget, setDeleteDigitalKategoriTarget] = useState<KategoriBarang | null>(null)

  const [search, setSearch] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [activeBarangTab, setActiveBarangTab] = useState<JenisBarang>("fisik")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [showPrintPicker, setShowPrintPicker] = useState(false)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [printSearch, setPrintSearch] = useState("")
  const [printSelections, setPrintSelections] = useState<Record<string, number>>({})
  const [barcodeGenerateLoading, setBarcodeGenerateLoading] = useState<Record<string, boolean>>({})

  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copySourceTokoId, setCopySourceTokoId] = useState("")
  const [copyTargetTokoIds, setCopyTargetTokoIds] = useState<Record<string, boolean>>({})
  const [copyLoading, setCopyLoading] = useState(false)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const kodeUnikInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<BarangImportPreview | null>(null)
  const [importProgress, setImportProgress] = useState<BarangImportProgress>({
    status: "idle",
    current: 0,
    total: 0,
    message: "",
  })

  const isEdit = !!editId
  const isDigitalForm = form.jenisBarang === "digital"
  const isFisikForm = form.jenisBarang === "fisik"

  const kategoriAktifList = activeBarangTab === "digital" ? kategoriDigitalList : kategoriList
  const kategoriFormList = isDigitalForm ? kategoriDigitalList : kategoriList
  const semuaKategoriList = useMemo(
    () => {
      const map = new Map<string, KategoriBarang>()
      ;[...kategoriList, ...kategoriDigitalList].forEach((item) => {
        if (item.id && !map.has(item.id)) map.set(item.id, item)
      })
      return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama, "id-ID", { numeric: true, sensitivity: "base" }))
    },
    [kategoriList, kategoriDigitalList],
  )
  const digitalKategoriUsageMap = useMemo(() => {
    const map = new Map<string, number>()

    data.forEach((item) => {
      if ((item.jenisBarang || "fisik") !== "digital") return

      const kategoriId = normalizeText(item.kategoriId)
      if (!kategoriId) return

      map.set(kategoriId, (map.get(kategoriId) || 0) + 1)
    })

    return map
  }, [data])

  const [statValueMode, setStatValueMode] = useState<Record<StatValueKey, StatValueMode>>({
    totalBarang: "jumlah",
    totalFisik: "jumlah",
    totalDigital: "jumlah",
  })

  const toggleStatValueMode = (key: StatValueKey) => {
    setStatValueMode((prev) => ({
      ...prev,
      [key]: prev[key] === "jumlah" ? "modal" : "jumlah",
    }))
  }

  const formatStatValue = (value: number, mode: StatValueMode) => {
    if (mode === "modal") return formatRupiah(value)
    return String(value)
  }

  const fetchKategori = async () => {
    try {
      const qRef = query(collection(db, "kategori_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setKategoriList(
        snap.docs.map((d) => {
          const x = d.data() as any
          return { id: d.id, nama: x?.nama || "" }
        })
      )
    } catch (e) {
      console.error(e)
      setKategoriList([])
    }
  }

  const fetchKategoriDigital = async () => {
    try {
      const qRef = query(collection(db, "kategori_barang_digital"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setKategoriDigitalList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return { id: d.id, nama: x?.nama || "" }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setKategoriDigitalList([])
    }
  }

  const fetchSatuan = async () => {
    try {
      const qRef = query(collection(db, "satuan_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setSatuanList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return { id: d.id, nama: x?.nama || "" }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setSatuanList([])
    }
  }

  const fetchSupplier = async () => {
    try {
      const qRef = query(collection(db, "supplier"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setSupplierList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return {
              id: d.id,
              nama: x?.nama || "",
              telepon: x?.telepon || "",
              alamat: x?.alamat || "",
              keterangan: x?.keterangan || "",
            }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setSupplierList([])
    }
  }

  const fetchProvider = async () => {
    try {
      const qRef = query(collection(db, "provider"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setProviderList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return {
              id: d.id,
              nama: x?.nama || "",
            }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setProviderList([])
    }
  }

  const fetchSaldo = async () => {
    try {
      const qRef = query(collection(db, "master_saldo_digital"), orderBy("namaSaldo"))
      const snap = await getDocs(qRef)
      setSaldoList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return {
              id: d.id,
              namaSaldo: x?.namaSaldo || "",
              jumlahSaldo: Number(x?.jumlahSaldo || 0),
              aktif: x?.aktif !== false,
            }
          })
          .filter((item) => item.namaSaldo)
      )
    } catch (e) {
      console.error(e)
      setSaldoList([])
    }
  }

  const fetchToko = async () => {
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"))
      const snap = await getDocs(qRef)
      setTokoList(
        snap.docs
          .map((d) => {
            const x = d.data() as any
            return {
              id: d.id,
              nama: x?.nama || "",
              kode: x?.kode || "",
              pemilik: x?.pemilik || "",
              aktif: Boolean(x?.aktif),
            }
          })
          .filter((item) => item.nama)
      )
    } catch (e) {
      console.error(e)
      setTokoList([])
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Barang[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          kodeBarang: x?.kodeBarang || "",
          kodeBarcode: x?.kodeBarcode || x?.barcodeValue || "",
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || x?.satuanNama || "",
          satuanId: x?.satuanId || "",
          satuanNama: x?.satuanNama || x?.satuan || "",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
          pakaiKodeUnik: Boolean(x?.pakaiKodeUnik),
          jenisKodeUnik: (x?.jenisKodeUnik || "imei") as JenisKodeUnik,
          kodeUnik: x?.kodeUnik || "",
          statusUnit: normalizeStatusUnit(x?.statusUnit),
          soldAt: x?.soldAt || null,
          soldAtMs: Number(x?.soldAtMs || 0),
          soldBy: x?.soldBy || "",
          soldByNama: x?.soldByNama || "",
          soldByEmail: x?.soldByEmail || "",
          transactionId: x?.transactionId || "",
          transactionNumber: x?.transactionNumber || "",
          returAt: x?.returAt || null,
          returAtMs: Number(x?.returAtMs || 0),

          jenisBarang: (x?.jenisBarang || "fisik") as JenisBarang,
          providerId: x?.providerId || "",
          provider: x?.provider || "",
          saldoSourceId: x?.saldoSourceId || "",
          saldoSourceNama: x?.saldoSourceNama || "",
          nominalProduk: String(x?.nominalProduk || ""),
          aktif: x?.aktif !== false,

          createdAt: Number(x?.createdAt || Date.now()),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
        }
      })

      setData(list)
    } catch (e) {
      console.error(e)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) return
      await Promise.all([
        fetchKategori(),
        fetchKategoriDigital(),
        fetchSatuan(),
        fetchSupplier(),
        fetchProvider(),
        fetchSaldo(),
        fetchToko(),
        fetchData(),
      ])
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    return data.filter((d) => {
      if (!isBarangTampilUtama(d)) return false

      const q = search.toLowerCase().trim()
      const matchSearch =
        !q ||
        d.nama.toLowerCase().includes(q) ||
        d.kodeBarang.toLowerCase().includes(q) ||
        d.merk.toLowerCase().includes(q) ||
        d.supplier.toLowerCase().includes(q) ||
        d.kategoriNama.toLowerCase().includes(q) ||
        d.tokoNama.toLowerCase().includes(q) ||
        d.satuan.toLowerCase().includes(q) ||
        (d.kodeUnik || "").toLowerCase().includes(q) ||
        (d.jenisKodeUnik || "").toLowerCase().includes(q) ||
        (d.provider || "").toLowerCase().includes(q) ||
        (d.saldoSourceNama || "").toLowerCase().includes(q)

      const matchKategori = !filterKategori || d.kategoriId === filterKategori
      const matchToko = !filterToko || d.tokoId === filterToko
      const matchJenis = (d.jenisBarang || "fisik") === activeBarangTab

      return matchSearch && matchKategori && matchToko && matchJenis
    })
  }, [data, search, filterKategori, filterToko, activeBarangTab])

  const barangStats = useMemo(() => {
    const fisikItems = filtered.filter((item) => (item.jenisBarang || "fisik") === "fisik")
    const digitalItems = filtered.filter((item) => item.jenisBarang === "digital")

    const getModalBarang = (item: Barang) => {
      const hargaModal = Number(item.hargaModal || 0)

      if ((item.jenisBarang || "fisik") === "fisik") {
        return hargaModal * Math.max(0, Number(item.stok || 0))
      }

      return hargaModal
    }

    const totalBarang = filtered.length
    const totalFisik = fisikItems.length
    const totalDigital = digitalItems.length
    const totalModal = filtered.reduce((sum, item) => sum + getModalBarang(item), 0)
    const totalModalFisik = fisikItems.reduce((sum, item) => sum + getModalBarang(item), 0)
    const totalModalDigital = digitalItems.reduce((sum, item) => sum + getModalBarang(item), 0)
    const stokRendah = fisikItems.filter(
      (item) => Number(item.stok || 0) <= Number(item.stokMinimum || 0)
    ).length

    return {
      totalBarang,
      totalFisik,
      totalDigital,
      totalModal,
      totalModalFisik,
      totalModalDigital,
      stokRendah,
    }
  }, [filtered])

  const selectedCopyTokoIds = useMemo(
    () => Object.entries(copyTargetTokoIds).filter(([, checked]) => checked).map(([id]) => id),
    [copyTargetTokoIds]
  )

  const copySourceToko = useMemo(
    () => tokoList.find((item) => item.id === copySourceTokoId) || null,
    [copySourceTokoId, tokoList]
  )

  const copySourceItems = useMemo(() => {
    if (!copySourceTokoId) return []

    return data
      .filter((item) => item.tokoId === copySourceTokoId)
      .filter((item) => isBarangTampilUtama(item))
      .filter((item) => (item.jenisBarang || "fisik") === activeBarangTab)
      .filter((item) => !filterKategori || item.kategoriId === filterKategori)
      .filter((item) => {
        const q = search.toLowerCase().trim()
        if (!q) return true

        return (
          item.nama.toLowerCase().includes(q) ||
          item.kodeBarang.toLowerCase().includes(q) ||
          item.merk.toLowerCase().includes(q) ||
          item.supplier.toLowerCase().includes(q) ||
          item.kategoriNama.toLowerCase().includes(q) ||
          item.tokoNama.toLowerCase().includes(q) ||
          item.satuan.toLowerCase().includes(q) ||
          (item.kodeUnik || "").toLowerCase().includes(q) ||
          (item.provider || "").toLowerCase().includes(q) ||
          (item.saldoSourceNama || "").toLowerCase().includes(q)
        )
      })
  }, [copySourceTokoId, data, activeBarangTab, filterKategori, search])

  const copyableTokoList = useMemo(
    () => tokoList.filter((item) => item.aktif !== false && item.id !== copySourceTokoId),
    [copySourceTokoId, tokoList]
  )

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  useEffect(() => {
    setFilterKategori("")
    setPage(1)
  }, [activeBarangTab])

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))
  const setField =
    (key: keyof typeof EMPTY_FORM) =>
    (val: any) =>
      setForm((f) => ({ ...f, [key]: val }))

  const getInlinePriceDraft = (item: Barang) => {
    return (
      inlinePriceDrafts[item.id] || {
        hargaModal: formatNumberDots(item.hargaModal),
        hargaJual: formatNumberDots(item.hargaJual),
      }
    )
  }

  const updateInlinePriceDraft = (
    item: Barang,
    field: "hargaModal" | "hargaJual",
    value: string,
  ) => {
    setInlinePriceDrafts((prev) => {
      const current =
        prev[item.id] || {
          hargaModal: formatNumberDots(item.hargaModal),
          hargaJual: formatNumberDots(item.hargaJual),
        }

      return {
        ...prev,
        [item.id]: {
          ...current,
          [field]: formatNumberDots(value),
        },
      }
    })
  }

  const hasInlinePriceChange = (item: Barang) => {
    const draft = inlinePriceDrafts[item.id]
    if (!draft) return false

    return (
      parseRupiahNumber(draft.hargaModal) !== Number(item.hargaModal || 0) ||
      parseRupiahNumber(draft.hargaJual) !== Number(item.hargaJual || 0)
    )
  }


  const isInlinePriceInvalid = (item: Barang) => {
    const draft = getInlinePriceDraft(item)
    const hargaModal = parseRupiahNumber(draft.hargaModal)
    const hargaJual = parseRupiahNumber(draft.hargaJual)

    if (hargaModal <= 0 && hargaJual <= 0) return false
    return hargaModal > hargaJual
  }

  const handleSaveInlinePrice = async (item: Barang) => {
    const user = auth.currentUser
    if (!user || inlinePriceSaving[item.id]) return

    const draft = getInlinePriceDraft(item)
    const hargaModal = parseRupiahNumber(draft.hargaModal)
    const hargaJual = parseRupiahNumber(draft.hargaJual)

    if (hargaModal < 0 || hargaJual < 0) {
      alert("Harga tidak valid")
      return
    }

    if (hargaJual < hargaModal) {
      alert("Harga jual tidak boleh lebih kecil dari harga modal")
      return
    }

    if (!hasInlinePriceChange(item)) {
      openEdit(item)
      return
    }

    setInlinePriceSaving((prev) => ({ ...prev, [item.id]: true }))

    try {
      const now = Date.now()
      await updateDoc(doc(db, "barang", item.id), {
        hargaModal,
        hargaJual,
        updatedAt: now,
        updatedBy: user.uid,
      })

      setData((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                hargaModal,
                hargaJual,
                updatedAt: now,
              }
            : row,
        ),
      )

      setInlinePriceDrafts((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })

      setSuccessMsg("Harga modal dan harga jual berhasil diperbarui")
      setTimeout(() => setSuccessMsg(null), 2500)
    } catch (e) {
      console.error(e)
      alert("Gagal menyimpan perubahan harga")
    } finally {
      setInlinePriceSaving((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const focusKodeUnikScanner = () => {
    window.setTimeout(() => {
      kodeUnikInputRef.current?.focus()
      kodeUnikInputRef.current?.setSelectionRange(
        kodeUnikInputRef.current.value.length,
        kodeUnikInputRef.current.value.length
      )
    }, 80)
  }

  useEffect(() => {
    if (!showModal || isEdit || form.jenisBarang !== "fisik" || !form.pakaiKodeUnik) return
    focusKodeUnikScanner()
  }, [showModal, isEdit, form.jenisBarang, form.pakaiKodeUnik])

  const getTokoById = (tokoId: string) => tokoList.find((item) => item.id === tokoId) || null

  const generateKodeBarang = (tokoId: string, nama = form.nama, currentId = editId) => {
    const toko = getTokoById(tokoId)
    return buildKodeBarangFromName({
      nama,
      toko,
      tokoId,
      existingItems: data,
      currentId,
    })
  }

  const generateKodeBarangForCopy = (tokoId: string, nama: string, currentItems: Barang[] = data) => {
    const toko = getTokoById(tokoId)
    return buildKodeBarangFromName({
      nama,
      toko,
      tokoId,
      existingItems: currentItems,
      currentId: null,
    })
  }

  const generateKodeBarangForMultiImei = (tokoId: string, nama: string, index: number) => {
    const toko = getTokoById(tokoId)
    const baseCode = buildKodeBarangFromName({
      nama,
      toko,
      tokoId,
      existingItems: data,
      currentId: editId,
    })

    return `${baseCode}-${String(index + 1).padStart(3, "0")}`
  }

  const syncKodeBarangFromName = (next: Partial<typeof EMPTY_FORM>) => {
    const nextNama = typeof next.nama === "string" ? next.nama : form.nama
    const nextTokoId = typeof next.tokoId === "string" ? next.tokoId : form.tokoId

    if (!nextNama.trim() || !nextTokoId) {
      setForm((prev) => ({ ...prev, ...next }))
      return
    }

    setForm((prev) => ({
      ...prev,
      ...next,
      kodeBarang: generateKodeBarang(nextTokoId, nextNama, editId),
    }))
  }

  const getKodeUnikList = () => {
    if (!isFisikForm || !form.pakaiKodeUnik) return []

    return String(form.kodeUnik || "")
      .split(/[\n,;]+/)
      .map((item) => normalizeKodeUnik(item))
      .filter(Boolean)
  }

    const handleChangeJenisBarang = (nextJenis: JenisBarang) => {
    setActiveBarangTab(nextJenis)
    setForm((prev) => {
      const nextForm = {
        ...prev,
        jenisBarang: nextJenis,
        kategoriId: "",
        merk: nextJenis === "digital" ? "" : prev.merk,
        satuan: nextJenis === "digital" ? "transaksi" : prev.satuan || prev.satuanNama || "",
        satuanId: nextJenis === "digital" ? "" : prev.satuanId || "",
        satuanNama: nextJenis === "digital" ? "transaksi" : prev.satuanNama || prev.satuan || "",
        stok: nextJenis === "digital" ? "0" : prev.stok,
        stokMinimum: nextJenis === "digital" ? "0" : prev.stokMinimum,
        pakaiKodeUnik: nextJenis === "fisik" ? prev.pakaiKodeUnik : false,
        jenisKodeUnik: nextJenis === "fisik" ? prev.jenisKodeUnik : "imei",
        kodeUnik: nextJenis === "fisik" ? prev.kodeUnik : "",
        providerId: nextJenis === "digital" ? prev.providerId : "",
        provider: nextJenis === "digital" ? prev.provider : "",
        saldoSourceId: nextJenis === "digital" ? prev.saldoSourceId : "",
        supplier: prev.supplier,
        nominalProduk: nextJenis === "digital" ? prev.nominalProduk : "",
        aktif: nextJenis === "digital" ? prev.aktif : true,
      }

      return {
        ...nextForm,
        kodeBarang:
          nextForm.nama.trim() && nextForm.tokoId
            ? generateKodeBarang(nextForm.tokoId, nextForm.nama, editId)
            : prev.kodeBarang,
      }
    })
  }

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const openAdd = () => {
    const defaultSatuan = satuanList[0]
    const isDigitalTab = activeBarangTab === "digital"
    const defaultProvider = providerList[0]
    const defaultSaldo = saldoList.find((item) => item.aktif) || saldoList[0]

    setForm({
      ...EMPTY_FORM,
      jenisBarang: activeBarangTab,
      kategoriId: "",
      supplier: isDigitalTab ? defaultSaldo?.namaSaldo || "" : supplierList[0]?.nama || "",
      satuan: isDigitalTab ? "transaksi" : defaultSatuan?.nama || "pcs",
      satuanId: isDigitalTab ? "" : defaultSatuan?.id || "",
      satuanNama: isDigitalTab ? "transaksi" : defaultSatuan?.nama || "pcs",
      stok: isDigitalTab ? "0" : "1",
      stokMinimum: isDigitalTab ? "0" : "1",
      pakaiKodeUnik: isDigitalTab ? false : true,
      jenisKodeUnik: "imei" as JenisKodeUnik,
      kodeUnik: "",
      providerId: isDigitalTab ? defaultProvider?.id || "" : "",
      provider: isDigitalTab ? defaultProvider?.nama || "" : "",
      saldoSourceId: isDigitalTab ? defaultSaldo?.id || "" : "",
      nominalProduk: "",
      aktif: true,
    })
    setEditId(null)
    setError(null)
    setShowModal(true)
    if (!isDigitalTab) focusKodeUnikScanner()
  }

    const openEdit = (d: Barang) => {
    setForm({
      kodeBarang: d.kodeBarang || "",
      nama: d.nama,
      kategoriId: d.kategoriId,
      tokoId: d.tokoId || "",
      merk: d.merk,
      supplier: d.jenisBarang === "digital" ? d.saldoSourceNama || d.supplier || "" : d.supplier || "",
      satuan: d.satuanNama || d.satuan || "",
      satuanId: d.satuanId || "",
      satuanNama: d.satuanNama || d.satuan || "",
      hargaModal: formatNumberDots(d.hargaModal),
      hargaJual: formatNumberDots(d.hargaJual),
      stok: String(d.stok || ""),
      stokMinimum: String(d.stokMinimum || ""),
      pakaiKodeUnik: Boolean(d.pakaiKodeUnik),
      jenisKodeUnik: (d.jenisKodeUnik || "imei") as JenisKodeUnik,
      kodeUnik: d.kodeUnik || "",

      jenisBarang: (d.jenisBarang || "fisik") as JenisBarang,
      providerId: d.providerId || "",
      provider: d.provider || "",
      saldoSourceId: d.saldoSourceId || "",
      nominalProduk: String(d.nominalProduk || ""),
      aktif: d.aktif !== false,
    })
    setEditId(d.id)
    setActiveBarangTab((d.jenisBarang || "fisik") as JenisBarang)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    if (isDigitalForm && !form.kategoriId) return "Pilih kategori digital terlebih dahulu"
    if (!form.nama.trim()) return "Nama barang wajib diisi"
    if (!form.kategoriId) return "Kategori wajib dipilih"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (isFisikForm && !form.merk.trim()) return "Merk wajib diisi"
    if (!form.hargaModal.trim()) return "Harga modal wajib diisi"
    if (!form.hargaJual.trim()) return "Harga jual wajib diisi"

    const kodeBarangFinalUmum = normalizeBarcode(generateKodeBarang(form.tokoId, form.nama, editId))
    if (!kodeBarangFinalUmum) return "Kode barang wajib dibuat otomatis dari nama barang dan toko"

    if (isFisikForm) {
      if (!form.supplier.trim()) return "Supplier wajib dipilih"
      if (!form.satuanId.trim()) return "Satuan wajib dipilih"
      if (!form.stok.trim()) return "Stok wajib diisi"
      if (!form.stokMinimum.trim()) return "Stok minimum wajib diisi"
    }

    if (isDigitalForm) {
      if (!form.providerId.trim()) return "Provider wajib dipilih"
      if (!form.nominalProduk.trim()) return "Nominal produk wajib diisi"
      if (!form.saldoSourceId.trim()) return "Sumber saldo wajib dipilih"
    }

    const kodeUnikList = getKodeUnikList()

    if (isFisikForm && form.pakaiKodeUnik && kodeUnikList.length === 0) {
      return form.jenisKodeUnik === "imei"
        ? "Minimal 1 IMEI wajib diisi"
        : form.jenisKodeUnik === "serial"
        ? "Minimal 1 serial number wajib diisi"
        : "Minimal 1 kode unik wajib diisi"
    }

    if (isFisikForm && form.pakaiKodeUnik) {
      const duplicateInput = kodeUnikList.find((kode, index) => kodeUnikList.indexOf(kode) !== index)
      if (duplicateInput) return `${duplicateInput} dobel di input`
    }

    const hargaModal = parseRupiahNumber(form.hargaModal)
    const hargaJual = parseRupiahNumber(form.hargaJual)
    const stok = Number(form.stok || 0)
    const stokMinimum = Number(form.stokMinimum || 0)

    if (Number.isNaN(hargaModal) || hargaModal < 0) return "Harga modal tidak valid"
    if (Number.isNaN(hargaJual) || hargaJual < 0) return "Harga jual tidak valid"
    if (hargaJual < hargaModal) return "Harga jual tidak boleh lebih kecil dari harga modal"

    if (isFisikForm) {
      if (Number.isNaN(stok) || stok < 0) return "Stok tidak valid"
      if (Number.isNaN(stokMinimum) || stokMinimum < 0) return "Stok minimum tidak valid"
    }

    if (isDigitalForm) {
      const saldoDipilih = saldoList.find((item) => item.id === form.saldoSourceId)
      if (!saldoDipilih) return "Sumber saldo tidak ditemukan"
      if (!saldoDipilih.aktif) return "Sumber saldo sedang nonaktif"
    }

    {
      const multiKodeUnik = isFisikForm && form.pakaiKodeUnik && kodeUnikList.length > 1
      const kodeBarangFinal = normalizeBarcode(generateKodeBarang(form.tokoId, form.nama, editId))

      if (!multiKodeUnik) {
        const duplicateBarcode = data.find((item) => {
          const sameCode = normalizeBarcode(item.kodeBarang) === kodeBarangFinal
          const sameStore = item.tokoId === form.tokoId
          const notSelf = !editId || item.id !== editId
          return sameCode && sameStore && notSelf
        })

        if (duplicateBarcode) return "Kode barang sudah dipakai di toko ini"
      }
    }

    if (isFisikForm && form.pakaiKodeUnik) {
      if (isEdit && kodeUnikList.length > 1) {
        return "Edit barang hanya boleh memakai 1 kode unik. Untuk banyak IMEI, gunakan Tambah Barang baru."
      }

      const duplicateKodeUnik = kodeUnikList.find((kodeUnikFinal) => {
        return data.some((item) => {
          const sameCode = normalizeKodeUnik(item.kodeUnik || "") === kodeUnikFinal
          const notSelf = !editId || item.id !== editId
          return sameCode && notSelf
        })
      })

      if (duplicateKodeUnik) return `${duplicateKodeUnik} sudah dipakai`
    }

    return null
  }

  const handleCreateDigitalKategori = async () => {
    const user = auth.currentUser
    const nama = normalizeText(newDigitalKategoriNama)

    if (!user) return
    if (!nama) {
      setError("Nama kategori digital wajib diisi")
      return
    }

    const duplicate = kategoriDigitalList.find(
      (item) => item.nama.trim().toLowerCase() === nama.toLowerCase(),
    )

    if (duplicate) {
      setForm((prev) => ({ ...prev, kategoriId: duplicate.id }))
      setNewDigitalKategoriNama("")
      return
    }

    setCreatingDigitalKategori(true)
    setError(null)

    try {
      const now = Date.now()
      const newRef = doc(collection(db, "kategori_barang_digital"))
      const payload = {
        nama,
        aktif: true,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
      }

      await setDoc(newRef, payload)

      const newItem = { id: newRef.id, nama }
      setKategoriDigitalList((prev) =>
        [...prev, newItem].sort((a, b) =>
          a.nama.localeCompare(b.nama, "id-ID", {
            numeric: true,
            sensitivity: "base",
          }),
        ),
      )
      setForm((prev) => ({ ...prev, kategoriId: newRef.id }))
      setNewDigitalKategoriNama("")
      setSuccessMsg("Kategori digital berhasil ditambahkan")
      setTimeout(() => setSuccessMsg(null), 2500)
    } catch (e) {
      console.error(e)
      setError("Gagal menambahkan kategori digital")
    } finally {
      setCreatingDigitalKategori(false)
    }
  }

  const resetDigitalKategoriManagerForm = () => {
    setDigitalKategoriFormNama("")
    setEditingDigitalKategoriId(null)
    setDeleteDigitalKategoriTarget(null)
  }

  const openDigitalKategoriManager = () => {
    resetDigitalKategoriManagerForm()
    setError(null)
    setShowDigitalKategoriModal(true)
  }

  const closeDigitalKategoriManager = () => {
    if (digitalKategoriLoading) return
    setShowDigitalKategoriModal(false)
    resetDigitalKategoriManagerForm()
  }

  const startEditDigitalKategori = (item: KategoriBarang) => {
    setEditingDigitalKategoriId(item.id)
    setDigitalKategoriFormNama(item.nama)
    setDeleteDigitalKategoriTarget(null)
  }

  const handleSaveDigitalKategoriManager = async () => {
    const user = auth.currentUser
    const nama = normalizeText(digitalKategoriFormNama)

    if (!user || digitalKategoriLoading) return
    if (!nama) {
      setError("Nama kategori digital wajib diisi")
      return
    }

    const duplicate = kategoriDigitalList.find((item) => {
      const sameName = item.nama.trim().toLowerCase() === nama.toLowerCase()
      const notSelf = !editingDigitalKategoriId || item.id !== editingDigitalKategoriId
      return sameName && notSelf
    })

    if (duplicate) {
      setError("Nama kategori digital sudah ada")
      return
    }

    setDigitalKategoriLoading(true)
    setError(null)

    try {
      const now = Date.now()

      if (editingDigitalKategoriId) {
        await updateDoc(doc(db, "kategori_barang_digital", editingDigitalKategoriId), {
          nama,
          updatedAt: now,
          updatedBy: user.uid,
        })

        const barangSnap = await getDocs(
          query(collection(db, "barang"), where("kategoriId", "==", editingDigitalKategoriId)),
        )

        await Promise.all(
          barangSnap.docs.map((item) => {
            const x = item.data() as any
            if ((x?.jenisBarang || "fisik") !== "digital") return Promise.resolve()
            return updateDoc(item.ref, {
              kategoriNama: nama,
              updatedAt: now,
              updatedBy: user.uid,
            })
          }),
        )

        setKategoriDigitalList((prev) =>
          prev
            .map((item) =>
              item.id === editingDigitalKategoriId
                ? {
                    ...item,
                    nama,
                  }
                : item,
            )
            .sort((a, b) =>
              a.nama.localeCompare(b.nama, "id-ID", {
                numeric: true,
                sensitivity: "base",
              }),
            ),
        )

        setData((prev) =>
          prev.map((item) =>
            item.jenisBarang === "digital" && item.kategoriId === editingDigitalKategoriId
              ? {
                  ...item,
                  kategoriNama: nama,
                  updatedAt: now,
                }
              : item,
          ),
        )

        setSuccessMsg("Kategori digital berhasil diperbarui")
      } else {
        const newRef = doc(collection(db, "kategori_barang_digital"))
        const payload = {
          nama,
          aktif: true,
          createdAt: now,
          updatedAt: now,
          createdBy: user.uid,
          updatedBy: user.uid,
        }

        await setDoc(newRef, payload)

        setKategoriDigitalList((prev) =>
          [...prev, { id: newRef.id, nama }].sort((a, b) =>
            a.nama.localeCompare(b.nama, "id-ID", {
              numeric: true,
              sensitivity: "base",
            }),
          ),
        )

        setSuccessMsg("Kategori digital berhasil ditambahkan")
      }

      resetDigitalKategoriManagerForm()
      setTimeout(() => setSuccessMsg(null), 2500)
    } catch (e) {
      console.error(e)
      setError(editingDigitalKategoriId ? "Gagal memperbarui kategori digital" : "Gagal menambahkan kategori digital")
    } finally {
      setDigitalKategoriLoading(false)
    }
  }

  const handleDeleteDigitalKategoriManager = async () => {
    const user = auth.currentUser
    const target = deleteDigitalKategoriTarget

    if (!user || !target || digitalKategoriLoading) return

    setDigitalKategoriLoading(true)
    setError(null)

    try {
      const now = Date.now()
      const barangSnap = await getDocs(
        query(collection(db, "barang"), where("kategoriId", "==", target.id)),
      )

      await Promise.all(
        barangSnap.docs.map((item) => {
          const x = item.data() as any
          if ((x?.jenisBarang || "fisik") !== "digital") return Promise.resolve()
          return updateDoc(item.ref, {
            kategoriId: "",
            kategoriNama: "",
            updatedAt: now,
            updatedBy: user.uid,
          })
        }),
      )

      await deleteDoc(doc(db, "kategori_barang_digital", target.id))

      setKategoriDigitalList((prev) => prev.filter((item) => item.id !== target.id))
      setData((prev) =>
        prev.map((item) =>
          item.jenisBarang === "digital" && item.kategoriId === target.id
            ? {
                ...item,
                kategoriId: "",
                kategoriNama: "",
                updatedAt: now,
              }
            : item,
        ),
      )

      if (filterKategori === target.id) setFilterKategori("")
      setForm((prev) =>
        prev.kategoriId === target.id
          ? {
              ...prev,
              kategoriId: "",
              nama: prev.jenisBarang === "digital" ? "" : prev.nama,
            }
          : prev,
      )

      setDeleteDigitalKategoriTarget(null)
      if (editingDigitalKategoriId === target.id) resetDigitalKategoriManagerForm()
      setSuccessMsg("Kategori digital berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 2500)
    } catch (e) {
      console.error(e)
      setError("Gagal menghapus kategori digital")
    } finally {
      setDigitalKategoriLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = auth.currentUser
    if (!user) return

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const kategoriSource = isDigitalForm ? kategoriDigitalList : kategoriList
      const kategori = kategoriSource.find((k) => k.id === form.kategoriId)
      if (!kategori) {
        setError("Kategori tidak ditemukan")
        return
      }

      const toko = tokoList.find((t) => t.id === form.tokoId)
      if (!toko) {
        setError("Toko tidak ditemukan")
        return
      }

      const providerDipilih = isDigitalForm
        ? providerList.find((item) => item.id === form.providerId)
        : null

      if (isDigitalForm && !providerDipilih) {
        setError("Provider tidak ditemukan")
        return
      }

      const saldoDipilih = isDigitalForm
        ? saldoList.find((item) => item.id === form.saldoSourceId)
        : null

      if (isDigitalForm && !saldoDipilih) {
        setError("Sumber saldo tidak ditemukan")
        return
      }

      let satuanDipilih: SatuanBarang | null = null

      if (isFisikForm) {
        const supplier = supplierList.find((s) => s.nama === form.supplier)
        if (!supplier) {
          setError("Supplier tidak ditemukan")
          return
        }

        satuanDipilih = satuanList.find((s) => s.id === form.satuanId) || null
        if (!satuanDipilih) {
          setError("Satuan tidak ditemukan")
          return
        }
      }

      const kodeUnikList = getKodeUnikList()
      const isMultiKodeUnik = isFisikForm && form.pakaiKodeUnik && kodeUnikList.length > 1

      const kodeBarang = normalizeBarcode(
        isMultiKodeUnik ? generateKodeBarangForMultiImei(form.tokoId, form.nama, 0) : generateKodeBarang(form.tokoId, form.nama, editId)
      )

      const pakaiKodeUnik = isFisikForm ? Boolean(form.pakaiKodeUnik) : false
      const jenisKodeUnik = form.jenisKodeUnik
      const kodeUnik = pakaiKodeUnik ? normalizeKodeUnik(form.kodeUnik) : ""

      const basePayload = {
        kodeBarang,
        nama: form.nama.trim(),
        kategoriId: kategori.id,
        kategoriNama: kategori.nama,
        tokoId: toko.id,
        tokoNama: toko.nama,
        merk: isDigitalForm ? "" : form.merk.trim(),
        supplier: isDigitalForm ? saldoDipilih?.namaSaldo || "" : form.supplier.trim(),
        satuan: isDigitalForm ? "transaksi" : satuanDipilih?.nama || form.satuanNama || form.satuan || "",
        satuanId: isDigitalForm ? "" : satuanDipilih?.id || "",
        satuanNama: isDigitalForm ? "transaksi" : satuanDipilih?.nama || form.satuanNama || form.satuan || "",
        hargaModal: parseRupiahNumber(form.hargaModal),
        hargaJual: parseRupiahNumber(form.hargaJual),
        stok: isDigitalForm ? 0 : isMultiKodeUnik ? 1 : Number(form.stok),
        stokMinimum: isDigitalForm ? 0 : Number(form.stokMinimum),
        pakaiKodeUnik,
        ...(pakaiKodeUnik
          ? {
              jenisKodeUnik,
              kodeUnik,
            }
          : {
              kodeUnik: "",
            }),

        statusUnit: "tersedia" as StatusUnitBarang,
        soldAt: null,
        soldAtMs: 0,
        soldBy: "",
        soldByNama: "",
        soldByEmail: "",
        transactionId: "",
        transactionNumber: "",
        returAt: null,
        returAtMs: 0,

        jenisBarang: form.jenisBarang,
        providerId: isDigitalForm ? providerDipilih?.id || "" : "",
        provider: isDigitalForm ? providerDipilih?.nama || "" : "",
        saldoSourceId: isDigitalForm ? saldoDipilih?.id || "" : "",
        saldoSourceNama: isDigitalForm ? saldoDipilih?.namaSaldo || "" : "",
        nominalProduk: isDigitalForm ? form.nominalProduk.trim() : "",
        aktif: isDigitalForm ? Boolean(form.aktif) : true,
      }

      const now = Date.now()

      if (isEdit && editId) {
        await updateDoc(doc(db, "barang", editId), {
          ...basePayload,
          kodeUnik: pakaiKodeUnik ? kodeUnikList[0] || kodeUnik : "",
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    ...basePayload,
                    jenisKodeUnik: pakaiKodeUnik ? jenisKodeUnik : undefined,
                    kodeUnik: pakaiKodeUnik ? kodeUnikList[0] || kodeUnik : "",
                    updatedAt: now,
                  }
                : item
            )
            .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
        )

        setSuccessMsg("Data barang berhasil diperbarui")
      } else if (isMultiKodeUnik) {
        const newItems: Barang[] = []

        for (let index = 0; index < kodeUnikList.length; index += 1) {
          const kodeItem = kodeUnikList[index]
          const newRef = doc(collection(db, "barang"))
          const createdAt = now + index
          const itemKodeBarang = normalizeBarcode(generateKodeBarangForMultiImei(form.tokoId, form.nama, index))
          const newItem: Barang = {
            id: newRef.id,
            ...basePayload,
            kodeBarang: itemKodeBarang,
            stok: 1,
            jenisKodeUnik,
            kodeUnik: kodeItem,
            createdAt,
          }

          await setDoc(newRef, {
            ...newItem,
            createdBy: user.uid,
            multiKodeUnikBatch: `${user.uid}_${now}`,
            multiKodeUnikIndex: index + 1,
            multiKodeUnikTotal: kodeUnikList.length,
          })

          newItems.push(newItem)
        }

        setData((prev) => [...prev, ...newItems].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
        setSuccessMsg(`${newItems.length} barang berhasil ditambahkan dari ${kodeUnikList.length} ${form.jenisKodeUnik.toUpperCase()}`)
      } else {
        const newRef = doc(collection(db, "barang"))
        const newItem: Barang = {
          id: newRef.id,
          ...basePayload,
          kodeUnik: pakaiKodeUnik ? kodeUnikList[0] || kodeUnik : "",
          createdAt: now,
        }

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        })

        setData((prev) => [...prev, newItem].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
        setSuccessMsg("Barang berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3500)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan data barang")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "barang", deleteId))
      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Data barang berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setDeleteLoading(false)
    }
  }

  const openCopyAllModal = () => {
    const defaultSourceId = filterToko || data.find((item) => item.tokoId)?.tokoId || tokoList[0]?.id || ""

    if (!defaultSourceId) {
      setSuccessMsg("Belum ada toko asal yang bisa disalin")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }

    setCopySourceTokoId(defaultSourceId)
    setCopyTargetTokoIds({})
    setShowCopyModal(true)
  }

  const toggleCopyTargetToko = (tokoId: string) => {
    setCopyTargetTokoIds((prev) => ({ ...prev, [tokoId]: !prev[tokoId] }))
  }

  const selectAllCopyTargetToko = () => {
    const next: Record<string, boolean> = {}
    copyableTokoList.forEach((toko) => {
      next[toko.id] = true
    })
    setCopyTargetTokoIds(next)
  }

  const clearCopyTargetToko = () => {
    setCopyTargetTokoIds({})
  }

  const buildDuplicateCopyKey = (item: Barang, tokoId: string) => {
    const uniqueCode = item.pakaiKodeUnik && item.kodeUnik ? normalizeKodeUnik(item.kodeUnik) : ""

    return [
      tokoId,
      item.jenisBarang || "fisik",
      String(item.nama || "").trim().toLowerCase(),
      String(item.kategoriId || ""),
      String(item.providerId || ""),
      String(item.saldoSourceId || ""),
      String(item.nominalProduk || ""),
      uniqueCode,
    ].join("__")
  }

  const handleCopyAllBarang = async () => {
    const user = auth.currentUser
    if (!user || copyLoading) return

    const sourceToko = tokoList.find((toko) => toko.id === copySourceTokoId)
    const targets = selectedCopyTokoIds
      .map((id) => tokoList.find((toko) => toko.id === id))
      .filter(Boolean) as Toko[]

    if (!sourceToko) {
      setSuccessMsg("Pilih toko asal dulu")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }

    if (targets.length <= 0) {
      setSuccessMsg("Pilih minimal satu toko tujuan")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }

    if (copySourceItems.length <= 0) {
      setSuccessMsg("Tidak ada barang di toko asal yang bisa disalin")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }

    setCopyLoading(true)

    try {
      const now = Date.now()
      const existingKeys = new Set(data.map((item) => buildDuplicateCopyKey(item, item.tokoId)))
      const newItems: Barang[] = []
      let skipped = 0
      let copyIndex = 0

      for (const targetToko of targets) {
        if (targetToko.id === sourceToko.id) {
          skipped += copySourceItems.length
          continue
        }

        for (const item of copySourceItems) {
          const duplicateKey = buildDuplicateCopyKey(item, targetToko.id)
          if (existingKeys.has(duplicateKey)) {
            skipped += 1
            continue
          }

          const jenisBarang = (item.jenisBarang || "fisik") as JenisBarang
          const isDigital = jenisBarang === "digital"
          const newRef = doc(collection(db, "barang"))
          const createdAt = now + copyIndex
          const kodeBarang = normalizeBarcode(generateKodeBarangForCopy(targetToko.id, item.nama, [...data, ...newItems]))
          const pakaiKodeUnik = !isDigital && Boolean(item.pakaiKodeUnik && item.kodeUnik)

          const copiedItem: Barang = {
            id: newRef.id,
            kodeBarang,
            nama: item.nama,
            kategoriId: item.kategoriId,
            kategoriNama: item.kategoriNama,
            tokoId: targetToko.id,
            tokoNama: targetToko.nama,
            merk: isDigital ? "" : item.merk,
            supplier: item.supplier,
            satuan: isDigital ? "transaksi" : item.satuan,
            satuanId: isDigital ? "" : item.satuanId || "",
            satuanNama: isDigital ? "transaksi" : item.satuanNama || item.satuan || "",
            hargaModal: item.hargaModal,
            hargaJual: item.hargaJual,
            stok: isDigital ? 0 : item.pakaiKodeUnik ? 1 : item.stok,
            stokMinimum: isDigital ? 0 : item.stokMinimum,
            pakaiKodeUnik,
            jenisKodeUnik: pakaiKodeUnik ? item.jenisKodeUnik || "imei" : "imei",
            kodeUnik: pakaiKodeUnik ? normalizeKodeUnik(item.kodeUnik || "") : "",
            statusUnit: "tersedia",
            soldAt: null,
            soldAtMs: 0,
            soldBy: "",
            soldByNama: "",
            soldByEmail: "",
            transactionId: "",
            transactionNumber: "",
            returAt: null,
            returAtMs: 0,
            jenisBarang,
            providerId: isDigital ? item.providerId || "" : "",
            provider: isDigital ? item.provider || "" : "",
            saldoSourceId: isDigital ? item.saldoSourceId || "" : "",
            saldoSourceNama: isDigital ? item.saldoSourceNama || "" : "",
            nominalProduk: isDigital ? String(item.nominalProduk || "") : "",
            aktif: isDigital ? item.aktif !== false : true,
            createdAt,
          }

          await setDoc(newRef, {
            ...copiedItem,
            createdBy: user.uid,
            copiedFromId: item.id,
            copiedFromTokoId: item.tokoId,
            copiedFromTokoNama: item.tokoNama,
            copiedToTokoId: targetToko.id,
            copiedToTokoNama: targetToko.nama,
            copiedAt: createdAt,
            copiedBy: user.uid,
          })

          existingKeys.add(duplicateKey)
          newItems.push(copiedItem)
          copyIndex += 1
        }
      }

      if (newItems.length > 0) {
        setData((prev) => [...prev, ...newItems].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
      }

      setShowCopyModal(false)
      setCopyTargetTokoIds({})
      setSuccessMsg(
        `${newItems.length} barang berhasil disalin dari ${sourceToko.nama}${skipped > 0 ? ` · ${skipped} dilewati` : ""}`
      )
      setTimeout(() => setSuccessMsg(null), 3500)
    } catch (error) {
      console.error("Gagal menyalin barang:", error)
      setSuccessMsg("Gagal menyalin barang ke toko tujuan")
      setTimeout(() => setSuccessMsg(null), 3000)
    } finally {
      setCopyLoading(false)
    }
  }


  const makeBarangWorkbook = async (mode: "template" | "data") => {
    const XLSX = await import("xlsx-js-style")
    const wb = XLSX.utils.book_new()
    const exportRows = mode === "template" ? [] : filtered

    const dataBarangSheet = makeBarangDataSheet(
      XLSX,
      exportRows,
      mode === "template" ? "TEMPLATE IMPORT DATA BARANG" : "DATA BARANG TEREXPORT",
      mode === "template"
    )

    if (mode === "template") {
      addBarangTemplateDropdowns({
        XLSX,
        ws: dataBarangSheet,
        kategoriCount: semuaKategoriList.length,
        tokoCount: tokoList.length,
        satuanCount: satuanList.length,
        supplierCount: supplierList.length,
        providerCount: providerList.length,
        saldoCount: saldoList.length,
      })
    }

    XLSX.utils.book_append_sheet(wb, dataBarangSheet, "Data Barang")

    XLSX.utils.book_append_sheet(wb, makeBarangPetunjukSheet(XLSX), "petunjuk")
    XLSX.utils.book_append_sheet(
      wb,
      makeBarangReferenceSheet(
        XLSX,
        "REFERENSI KATEGORI BARANG",
        ["id", "kategoriNama"],
        semuaKategoriList.map((item) => [item.id, item.nama])
      ),
      "ref_kategori"
    )
    XLSX.utils.book_append_sheet(
      wb,
      makeBarangReferenceSheet(
        XLSX,
        "REFERENSI TOKO",
        ["id", "tokoNama", "kode", "aktif"],
        tokoList.map((item) => [item.id, item.nama, item.kode || "", item.aktif === false ? "tidak" : "ya"])
      ),
      "ref_toko"
    )
    XLSX.utils.book_append_sheet(
      wb,
      makeBarangReferenceSheet(
        XLSX,
        "REFERENSI SATUAN",
        ["id", "satuanNama"],
        satuanList.map((item) => [item.id, item.nama])
      ),
      "ref_satuan"
    )
    XLSX.utils.book_append_sheet(
      wb,
      makeBarangReferenceSheet(
        XLSX,
        "REFERENSI SUPPLIER",
        ["id", "supplier", "telepon", "alamat"],
        supplierList.map((item) => [item.id, item.nama, item.telepon || "", item.alamat || ""])
      ),
      "ref_supplier"
    )
    XLSX.utils.book_append_sheet(
      wb,
      makeBarangReferenceSheet(
        XLSX,
        "REFERENSI PROVIDER DIGITAL",
        ["id", "provider"],
        providerList.map((item) => [item.id, item.nama])
      ),
      "ref_provider"
    )
    XLSX.utils.book_append_sheet(
      wb,
      makeBarangReferenceSheet(
        XLSX,
        "REFERENSI SALDO DIGITAL",
        ["id", "saldoSourceNama", "jumlahSaldo", "aktif"],
        saldoList.map((item) => [item.id, item.namaSaldo, item.jumlahSaldo, item.aktif ? "ya" : "tidak"])
      ),
      "ref_saldo"
    )

    return wb
  }

  const handleDownloadTemplate = async () => {
    setError(null)
    try {
      if (semuaKategoriList.length === 0 || tokoList.length === 0) {
        setError("Kategori dan toko wajib tersedia sebelum download template")
        return
      }

      await downloadBarangTemplateWithExcelJS({
        kategoriList: semuaKategoriList,
        tokoList,
        satuanList,
        supplierList,
        providerList,
        saldoList,
      })
    } catch (err) {
      console.error(err)
      setError("Gagal membuat template Excel dropdown. Pastikan package exceljs sudah terpasang.")
    }
  }

  const handleDownloadData = async () => {
    if (filtered.length === 0) {
      setError("Tidak ada data barang untuk didownload")
      return
    }

    try {
      setError(null)
      const wb = await makeBarangWorkbook("data")
      await downloadBarangWorkbook(wb, "data_barang.xlsx")
      setSuccessMsg("Data barang berhasil didownload")
      setTimeout(() => setSuccessMsg(null), 2500)
    } catch (error) {
      console.error("Gagal download data barang:", error)
      setError("Gagal membuat file data barang")
    }
  }

  const resolveKategoriByName = (value: unknown) => {
    const key = normalizeExcelCompact(value)
    return semuaKategoriList.find((item) => normalizeExcelCompact(item.nama) === key) || null
  }

  const resolveTokoByName = (value: unknown) => {
    const key = normalizeExcelCompact(value)
    return tokoList.find((item) => normalizeExcelCompact(item.nama) === key) || null
  }

  const resolveSatuanByName = (value: unknown) => {
    const key = normalizeExcelCompact(value)
    return satuanList.find((item) => normalizeExcelCompact(item.nama) === key) || null
  }

  const resolveProviderByName = (value: unknown) => {
    const key = normalizeExcelCompact(value)
    return providerList.find((item) => normalizeExcelCompact(item.nama) === key) || null
  }

  const resolveSaldoByName = (value: unknown) => {
    const key = normalizeExcelCompact(value)
    return saldoList.find((item) => normalizeExcelCompact(item.namaSaldo) === key) || null
  }

  const readBarangImportRows = async (file: File) => {
    const XLSX = await import("xlsx-js-style")
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: "array" })
    const ignored = new Set(["petunjuk", "ref_kategori", "ref_toko", "ref_satuan", "ref_supplier", "ref_provider", "ref_saldo"])
    const sheetName = wb.SheetNames.find((name: string) => !ignored.has(normalizeExcelKey(name)))

    if (!sheetName) throw new Error("Sheet data barang tidak ditemukan")

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][]
    const headerRowIndex = rows.findIndex((row) => {
      const normalized = row.map((cell) => normalizeText(cell))
      return normalized.includes("nama") && normalized.includes("kategoriNama") && normalized.includes("tokoNama")
    })

    if (headerRowIndex < 0) throw new Error("Header Excel tidak ditemukan. Download ulang template terbaru.")

    const headerMap = new Map<string, number>()
    ;(rows[headerRowIndex] || []).forEach((header, index) => {
      const key = normalizeText(header)
      if (key) headerMap.set(key, index)
    })

    const getCell = (row: any[], field: string) => {
      const idx = headerMap.get(field)
      return idx === undefined ? "" : row[idx]
    }

    const parsed: Array<Record<string, any> & { _rowNumber: number }> = []

    rows.slice(headerRowIndex + 1).forEach((row, index) => {
      const hasValue = BARANG_IMPORT_COLUMNS.some((column) => {
        if (column.key === "id") return false
        return normalizeText(getCell(row, column.label)) !== ""
      })

      if (!hasValue) return

      const item: Record<string, any> & { _rowNumber: number } = {
        _rowNumber: headerRowIndex + index + 2,
      }

      BARANG_IMPORT_COLUMNS.forEach((column) => {
        item[column.key] = getCell(row, column.label)
      })

      parsed.push(item)
    })

    if (parsed.length === 0) throw new Error("File import tidak berisi data barang")
    return parsed
  }

  const prepareImportBarangRows = (rows: Record<string, any>[]) => {
    const nextData = [...data]
    const existingById = new Map(nextData.map((item) => [item.id, item]))
    const prepared: PreparedBarangImport[] = []
    const errors: string[] = []

    for (const row of rows) {
      try {
        const rowNumber = Number(row._rowNumber || 0)
        const rawId = normalizeText(row.id)
        const jenisBarang = normalizeExcelKey(row.jenisBarang || "fisik") === "digital" ? "digital" : "fisik"
        const nama = normalizeText(row.nama)
        if (normalizeText(row.kodeBarang)) {
          throw new Error("kodeBarang tidak boleh diisi dari Excel. Hapus isi kolom kodeBarang atau download template terbaru.")
        }

        const kategori = resolveKategoriByName(row.kategoriNama)
        const toko = resolveTokoByName(row.tokoNama)
        const hargaModal = parseExcelNumber(row.hargaModal)
        const hargaJual = parseExcelNumber(row.hargaJual)
        const pakaiKodeUnik = jenisBarang === "fisik" ? parseExcelBoolean(row.pakaiKodeUnik, false) : false
        const jenisKodeUnik = (["imei", "serial", "custom"].includes(normalizeExcelKey(row.jenisKodeUnik))
          ? normalizeExcelKey(row.jenisKodeUnik)
          : "imei") as JenisKodeUnik
        const kodeUnik = pakaiKodeUnik ? normalizeKodeUnik(row.kodeUnik) : ""

        if (!nama) throw new Error("nama wajib diisi")
        if (!kategori) throw new Error(`kategoriNama "${normalizeText(row.kategoriNama)}" tidak ditemukan`)
        if (!toko) throw new Error(`tokoNama "${normalizeText(row.tokoNama)}" tidak ditemukan`)
        if (Number.isNaN(hargaModal) || hargaModal < 0) throw new Error("hargaModal tidak valid")
        if (Number.isNaN(hargaJual) || hargaJual < 0) throw new Error("hargaJual tidak valid")
        if (hargaJual < hargaModal) throw new Error("hargaJual tidak boleh lebih kecil dari hargaModal")

        let satuanDipilih: SatuanBarang | null = null
        let providerDipilih: ProviderItem | null = null
        let saldoDipilih: SaldoItem | null = null

        if (jenisBarang === "fisik") {
          satuanDipilih = resolveSatuanByName(row.satuanNama)
          if (!normalizeText(row.supplier)) throw new Error("supplier wajib diisi untuk barang fisik")
          if (!satuanDipilih) throw new Error(`satuanNama "${normalizeText(row.satuanNama)}" tidak ditemukan`)
          if (pakaiKodeUnik && !kodeUnik) throw new Error("kodeUnik wajib diisi jika pakaiKodeUnik ya")
        } else {
          providerDipilih = resolveProviderByName(row.provider)
          saldoDipilih = resolveSaldoByName(row.saldoSourceNama)
          if (!providerDipilih) throw new Error(`provider "${normalizeText(row.provider)}" tidak ditemukan`)
          if (!saldoDipilih) throw new Error(`saldoSourceNama "${normalizeText(row.saldoSourceNama)}" tidak ditemukan`)
          if (!saldoDipilih.aktif) throw new Error(`saldoSourceNama "${saldoDipilih.namaSaldo}" sedang nonaktif`)
          if (!normalizeText(row.nominalProduk)) throw new Error("nominalProduk wajib diisi")
        }

        const editingExisting = rawId ? existingById.get(rawId) || null : null
        const finalId = editingExisting?.id || rawId || doc(collection(db, "barang")).id
        const stok = jenisBarang === "digital" ? 0 : Math.max(0, parseExcelNumber(row.stok))
        const stokMinimum = jenisBarang === "digital" ? 0 : Math.max(0, parseExcelNumber(row.stokMinimum))
        const kodeBarang = normalizeBarcode(
          buildKodeBarangFromName({
            nama,
            toko,
            tokoId: toko.id,
            existingItems: nextData,
            currentId: finalId,
          })
        )

        if (jenisBarang === "fisik") {
          const duplicateBarcode = nextData.find((item) => {
            const sameCode = normalizeBarcode(item.kodeBarang) === kodeBarang
            const sameStore = item.tokoId === toko.id
            const notSelf = item.id !== finalId
            return sameCode && sameStore && notSelf
          })
          if (duplicateBarcode) throw new Error(`kodeBarang ${kodeBarang} sudah dipakai di toko ini`)
        }

        if (jenisBarang === "fisik" && pakaiKodeUnik && kodeUnik) {
          const duplicateKodeUnik = nextData.find((item) => {
            const sameCode = normalizeKodeUnik(item.kodeUnik || "") === kodeUnik
            const notSelf = item.id !== finalId
            return sameCode && notSelf
          })
          if (duplicateKodeUnik) throw new Error(`kodeUnik ${kodeUnik} sudah dipakai`)
        }

        const now = Date.now()
        const payload: Barang = {
          id: finalId,
          kodeBarang,
          nama,
          kategoriId: kategori.id,
          kategoriNama: kategori.nama,
          tokoId: toko.id,
          tokoNama: toko.nama,
          merk: jenisBarang === "digital" ? "" : normalizeText(row.merk),
          supplier: jenisBarang === "digital" ? saldoDipilih?.namaSaldo || "" : normalizeText(row.supplier),
          satuan: jenisBarang === "digital" ? "transaksi" : satuanDipilih?.nama || "",
          satuanId: jenisBarang === "digital" ? "" : satuanDipilih?.id || "",
          satuanNama: jenisBarang === "digital" ? "transaksi" : satuanDipilih?.nama || "",
          hargaModal,
          hargaJual,
          stok,
          stokMinimum,
          pakaiKodeUnik,
          jenisKodeUnik: pakaiKodeUnik ? jenisKodeUnik : "imei",
          kodeUnik: pakaiKodeUnik ? kodeUnik : "",
          statusUnit: normalizeStatusUnit(editingExisting?.statusUnit || "tersedia"),
          soldAt: editingExisting?.soldAt || null,
          soldAtMs: Number(editingExisting?.soldAtMs || 0),
          soldBy: editingExisting?.soldBy || "",
          soldByNama: editingExisting?.soldByNama || "",
          soldByEmail: editingExisting?.soldByEmail || "",
          transactionId: editingExisting?.transactionId || "",
          transactionNumber: editingExisting?.transactionNumber || "",
          returAt: editingExisting?.returAt || null,
          returAtMs: Number(editingExisting?.returAtMs || 0),
          jenisBarang,
          providerId: jenisBarang === "digital" ? providerDipilih?.id || "" : "",
          provider: jenisBarang === "digital" ? providerDipilih?.nama || "" : "",
          saldoSourceId: jenisBarang === "digital" ? saldoDipilih?.id || "" : "",
          saldoSourceNama: jenisBarang === "digital" ? saldoDipilih?.namaSaldo || "" : "",
          nominalProduk: jenisBarang === "digital" ? normalizeText(row.nominalProduk) : "",
          aktif: jenisBarang === "digital" ? parseExcelBoolean(row.aktif, true) : true,
          createdAt: editingExisting?.createdAt || now,
          updatedAt: now,
        }

        const existingIndex = nextData.findIndex((item) => item.id === finalId)
        if (existingIndex >= 0) nextData[existingIndex] = payload
        else nextData.push(payload)

        existingById.set(finalId, payload)
        prepared.push({
          rowNumber,
          action: editingExisting ? "update" : "create",
          payload,
          editingExisting,
        })
      } catch (err: any) {
        errors.push(`Baris ${row._rowNumber}: ${err?.message || "data tidak valid"}`)
      }
    }

    return { prepared, nextData, errors }
  }

  const resetImportPreview = () => {
    if (importLoading) return

    setImportPreview(null)
    setImportProgress({
      status: "idle",
      current: 0,
      total: 0,
      message: "",
    })

    if (importInputRef.current) importInputRef.current.value = ""
  }

  const handleImportBarang = async (file?: File | null) => {
    const user = auth.currentUser
    if (!user || !file || importLoading) return

    setImportLoading(true)
    setError(null)
    setSuccessMsg(null)
    setImportProgress({
      status: "reading",
      current: 0,
      total: 0,
      message: "Membaca file Excel...",
    })

    try {
      const rows = await readBarangImportRows(file)
      const { prepared, nextData, errors } = prepareImportBarangRows(rows)
      const totalFisik = prepared.filter((item) => item.payload.jenisBarang !== "digital").length
      const totalDigital = prepared.filter((item) => item.payload.jenisBarang === "digital").length
      const totalCreate = prepared.filter((item) => item.action === "create").length
      const totalUpdate = prepared.filter((item) => item.action === "update").length

      setImportPreview({
        fileName: file.name,
        rows,
        prepared,
        nextData,
        errors,
        totalRows: rows.length,
        totalCreate,
        totalUpdate,
        totalFisik,
        totalDigital,
      })

      setImportProgress({
        status: errors.length > 0 ? "error" : "ready",
        current: 0,
        total: prepared.length,
        message:
          errors.length > 0
            ? "Ada data yang perlu diperbaiki sebelum import."
            : "Data siap diimport. Klik Oke untuk menyimpan ke database.",
      })
    } catch (error: any) {
      console.error("Gagal membaca file import barang:", error)
      setError(error?.message || "Gagal membaca file import data barang")
      setImportProgress({
        status: "error",
        current: 0,
        total: 0,
        message: error?.message || "Gagal membaca file import data barang",
      })
      if (importInputRef.current) importInputRef.current.value = ""
    } finally {
      setImportLoading(false)
    }
  }

  const confirmImportBarang = async () => {
    const user = auth.currentUser
    if (!user || !importPreview || importLoading) return

    if (importPreview.errors.length > 0) {
      setError("Perbaiki error import terlebih dahulu")
      return
    }

    if (importPreview.prepared.length === 0) {
      setError("Tidak ada data valid untuk diimport")
      return
    }

    setImportLoading(true)
    setError(null)
    setSuccessMsg(null)
    setImportProgress({
      status: "processing",
      current: 0,
      total: importPreview.prepared.length,
      message: "Menyiapkan proses import...",
    })

    try {
      for (let index = 0; index < importPreview.prepared.length; index += 1) {
        const item = importPreview.prepared[index]
        const payload = item.payload

        setImportProgress({
          status: "processing",
          current: index + 1,
          total: importPreview.prepared.length,
          message: `${item.action === "update" ? "Memperbarui" : "Menambahkan"} ${payload.nama}`,
        })

        await setDoc(
          doc(db, "barang", payload.id),
          {
            ...payload,
            ...(item.editingExisting ? {} : { createdBy: user.uid }),
            updatedBy: user.uid,
          },
          { merge: true }
        )

        if (index % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 15))
        }
      }

      setData(importPreview.nextData.sort((a, b) => a.nama.localeCompare(b.nama, "id")))
      setImportProgress({
        status: "done",
        current: importPreview.prepared.length,
        total: importPreview.prepared.length,
        message: "Import selesai.",
      })
      setSuccessMsg(`${importPreview.prepared.length} data barang berhasil diimport`)
      setTimeout(() => setSuccessMsg(null), 3500)
      setTimeout(() => {
        setImportPreview(null)
        setImportProgress({
          status: "idle",
          current: 0,
          total: 0,
          message: "",
        })
      }, 550)
    } catch (error: any) {
      console.error("Gagal import barang:", error)
      setError(error?.message || "Gagal import data barang")
      setImportProgress({
        status: "error",
        current: importProgress.current,
        total: importPreview.prepared.length,
        message: error?.message || "Gagal import data barang",
      })
    } finally {
      setImportLoading(false)
      if (importInputRef.current) importInputRef.current.value = ""
    }
  }

  const selectedBarcodeToko = useMemo(
    () => tokoList.find((item) => item.id === filterToko) || null,
    [tokoList, filterToko]
  )

  const printCandidates = useMemo(() => {
    const q = printSearch.toLowerCase().trim()

    if (!filterToko) return []

    return data.filter((item) => {
      if (item.jenisBarang === "digital") return false
      if (!isBarangTampilUtama(item)) return false
      if (item.aktif === false) return false
      if (item.tokoId !== filterToko) return false
      if (!item.kodeBarang) return false

      if (!q) return true
      return (
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        getBarangKodeBarcode(item).toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        (item.kodeUnik || "").toLowerCase().includes(q)
      )
    })
  }, [data, filterToko, printSearch])

  const selectedLabelCount = useMemo(
    () => (Object.values(printSelections) as number[]).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0),
    [printSelections]
  )

  const flatPrintItems = useMemo<FlattenPrintItem[]>(() => {
    const result: FlattenPrintItem[] = []
    for (const item of data) {
      if (item.jenisBarang === "digital") continue
      if (!isBarangTampilUtama(item)) continue
      if (item.aktif === false) continue
      if (filterToko && item.tokoId !== filterToko) continue
      const qty = Number(printSelections[item.id] || 0)
      if (qty <= 0) continue

      for (let i = 0; i < qty; i++) {
        result.push({
          key: `${item.id}-${i + 1}`,
          barangId: item.id,
          nama: item.nama,
          kodeBarang: item.kodeBarang,
          kodeBarcode: item.kodeBarcode,
          kodeUnik: item.kodeUnik,
          pakaiKodeUnik: item.pakaiKodeUnik,
          tokoNama: item.tokoNama,
          merk: item.merk,
          hargaJual: item.hargaJual,
        })
      }
    }
    return result
  }, [data, filterToko, printSelections])

  const generateKodeBarcodeForItem = async (item: Barang) => {
    if (!item?.id || item.jenisBarang === "digital") return

    const existingCode = getBarangKodeBarcode(item)
    if (existingCode) return

    setBarcodeGenerateLoading((prev) => ({ ...prev, [item.id]: true }))
    setError(null)
    setSuccessMsg(null)

    try {
      const usedCodes = new Set(
        data
          .filter((row) => row.id !== item.id)
          .map((row) => getBarangKodeBarcode(row))
          .filter(Boolean)
      )

      const nextCode = makeNextKodeBarcode(usedCodes)
      if (!nextCode) {
        setError("Kode barcode sudah penuh")
        return
      }

      await updateDoc(doc(db, "barang", item.id), {
        kodeBarcode: nextCode,
        barcodeValue: nextCode,
        updatedAt: Date.now(),
      })

      setData((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                kodeBarcode: nextCode,
                updatedAt: Date.now(),
              }
            : row
        )
      )

      setSuccessMsg(`Kode barcode ${nextCode} berhasil dibuat`)
      setTimeout(() => setSuccessMsg(null), 1800)
    } catch (error) {
      console.error("Gagal generate kode barcode:", error)
      setError("Gagal membuat kode barcode")
    } finally {
      setBarcodeGenerateLoading((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const openPrintModal = () => {
    if (!filterToko) {
      setError("Pilih filter toko terlebih dahulu sebelum membuka barcode")
      setTimeout(() => setError(null), 2400)
      return
    }

    setShowPrintPicker(true)
    setPrintSearch("")
    setPrintSelections((prev) => {
      const allowedIds = new Set(
        data
          .filter((item) => item.jenisBarang !== "digital" && item.aktif !== false && item.tokoId === filterToko)
          .map((item) => item.id)
      )

      return Object.fromEntries(
        Object.entries(prev).filter(([id, qty]) => allowedIds.has(id) && Number(qty || 0) > 0)
      )
    })
  }

  const updatePrintQty = (barangId: string, qty: number) => {
    const safeQty = Math.max(0, Math.min(999, Number.isNaN(qty) ? 0 : qty))
    setPrintSelections((prev) => ({ ...prev, [barangId]: safeQty }))
  }

  const togglePrintItem = (item: Barang) => {
    const current = Number(printSelections[item.id] || 0)
    updatePrintQty(item.id, current > 0 ? 0 : 1)
  }

  const quickFillVisible = (qty: number) => {
    const updates: Record<string, number> = {}
    for (const item of printCandidates) updates[item.id] = qty
    setPrintSelections((prev) => ({ ...prev, ...updates }))
  }

  const clearVisible = () => {
    const next = { ...printSelections }
    for (const item of printCandidates) next[item.id] = 0
    setPrintSelections(next)
  }

  const openPrintPreview = () => {
    if (selectedLabelCount <= 0) {
      setSuccessMsg("Pilih minimal 1 barang fisik untuk dicetak")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }
    setShowPrintPicker(false)
    setShowPrintPreview(true)
  }

  const escapePrintText = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")

  const makePrintBarcodeSvg = (value: string) => {
    const cleanValue = normalizeBarcode(value)
    if (!cleanValue) return ""

    try {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      JsBarcode(svg, cleanValue, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        width: 1.2,
        height: 26,
      })
      return svg.outerHTML
    } catch (error) {
      console.error("Gagal generate barcode print:", error)
      return `<div class="barcode-fallback">${escapePrintText(cleanValue)}</div>`
    }
  }

  const handlePrint = () => {
    if (flatPrintItems.length === 0) {
      setSuccessMsg("Pilih minimal 1 barang fisik untuk dicetak")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }

    const itemsHtml = flatPrintItems
      .map((item) => {
        const barcodeValue = getBarcodePrintValue(item)
        const labelCode = getBarangKodeBarcode(item) || normalizeBarcode(item.kodeBarang)
        const barcodeSvg = makePrintBarcodeSvg(barcodeValue)

        return `
          <div class="barcode-card">
            <div class="barcode-inner">
              <div class="barcode-pack">
                <div class="barcode-top">${escapePrintText(item.kodeBarang || "Tanpa Kode")}</div>
                <div class="barcode-svg">${barcodeSvg}</div>

                <div class="barcode-bottom">
                  <div class="barcode-meta-row">
                    <div class="barcode-code">${escapePrintText(labelCode)}</div>
                    <div class="barcode-store">${escapePrintText(item.tokoNama || "")}</div>
                  </div>
                  <div class="barcode-price">${escapePrintText(formatRupiah(item.hargaJual || 0))}</div>
                </div>
              </div>
            </div>
          </div>
        `
      })
      .join("")

    const iframe = document.createElement("iframe")
    iframe.setAttribute("title", "Print Barcode Barang")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.style.opacity = "0"
    iframe.style.pointerEvents = "none"
    document.body.appendChild(iframe)

    const printDocument = iframe.contentWindow?.document
    if (!printDocument) {
      iframe.remove()
      setError("Gagal membuka area print barcode")
      return
    }

    printDocument.open()
    printDocument.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print Barcode Barang</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 4mm;
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #0f172a;
              font-family: Arial, Helvetica, sans-serif;
            }

            .barcode-grid {
              display: grid;
              grid-template-columns: repeat(5, minmax(0, 1fr));
              gap: 0.35mm;
              width: 100%;
              align-items: start;
            }

            .barcode-card {
              width: 100%;
              aspect-ratio: 2.05 / 1;
              break-inside: avoid;
              page-break-inside: avoid;
              overflow: hidden;
              background: #ffffff;
              padding: 0.35mm;
            }

            .barcode-inner {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              overflow: hidden;
            }

            .barcode-pack {
              width: 86%;
              max-width: 34mm;
              min-width: 0;
              margin: 0 auto;
              overflow: hidden;
            }

            .barcode-top {
              width: 100%;
              min-width: 0;
              padding-left: 0;
              padding-right: 0;
              font-size: 4.8px;
              line-height: 1;
              font-weight: 900;
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 0.25mm;
            }

            .barcode-svg {
              width: 100%;
              height: 8.2mm;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .barcode-svg svg {
              width: 100%;
              max-width: 100%;
              height: 8.2mm;
              display: block;
              margin: 0;
            }

            .barcode-bottom {
              width: 100%;
              min-width: 0;
              margin-top: 0.2mm;
              padding-left: 1.7mm;
              overflow: hidden;
            }

            .barcode-meta-row {
              width: 100%;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 0.8mm;
              min-width: 0;
            }

            .barcode-code,
            .barcode-fallback {
              min-width: 0;
              flex: 0 0 auto;
              max-width: 38%;
              font-size: 5.4px;
              line-height: 1;
              font-weight: 900;
              letter-spacing: 0;
              text-align: left;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .barcode-store {
              min-width: 0;
              flex: 1 1 auto;
              max-width: 54%;
              font-size: 6px;
              line-height: 1;
              font-weight: 900;
              text-align: right;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              transform: translateX(1.0mm);
            }

            .barcode-price {
              margin-top: 0.15mm;
              font-size: 7px;
              line-height: 1;
              font-weight: 900;
              text-align: left;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          </style>
        </head>
        <body>
          <main class="barcode-grid">${itemsHtml}</main>
        </body>
      </html>`)
    printDocument.close()

    const cleanUpPrintFrame = () => {
      setTimeout(() => iframe.remove(), 300)
    }

    iframe.contentWindow?.addEventListener("afterprint", cleanUpPrintFrame, { once: true })

    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        if (document.body.contains(iframe)) iframe.remove()
      }, 2500)
    }, 250)
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 4mm;
        }

        @media print {
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          body * {
            visibility: hidden !important;
          }

          #barcode-print-area,
          #barcode-print-area * {
            visibility: visible !important;
          }

          #barcode-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }

          .print-hide {
            display: none !important;
          }

          .barcode-grid {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 0.35mm !important;
            width: 100% !important;
            align-items: start !important;
          }

          .barcode-card {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            aspect-ratio: 2.05 / 1 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            padding: 0.35mm !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            overflow: hidden !important;
          }

          .barcode-svg-wrap {
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            overflow: hidden !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }

          .barcode-pack {
            width: 86% !important;
            max-width: 34mm !important;
            min-width: 0 !important;
            margin-left: auto !important;
            margin-right: auto !important;
            overflow: hidden !important;
          }

          .barcode-top {
            width: 100% !important;
            min-width: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            font-size: 4.8px !important;
            line-height: 1 !important;
            font-weight: 900 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            text-align: center !important;
            margin-bottom: 0.3mm !important;
          }

          .barcode-svg-print {
            width: 100% !important;
            max-width: 100% !important;
            height: 8.2mm !important;
            min-height: 8.2mm !important;
            display: block !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          .barcode-bottom {
            width: 100% !important;
            min-width: 0 !important;
            margin-top: 0.2mm !important;
            padding-left: 1.7mm !important;
            overflow: hidden !important;
          }

          .barcode-meta-row {
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 0.8mm !important;
            min-width: 0 !important;
          }

          .barcode-code {
            min-width: 0 !important;
            flex: 0 0 auto !important;
            max-width: 38% !important;
            font-size: 5.4px !important;
            line-height: 1 !important;
            letter-spacing: 0 !important;
            font-weight: 900 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            text-align: left !important;
          }

          .barcode-store {
            min-width: 0 !important;
            flex: 1 1 auto !important;
            max-width: 54% !important;
            font-size: 6px !important;
            line-height: 1 !important;
            font-weight: 900 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            text-align: right !important;
            transform: translateX(1.0mm) !important;
          }

          .barcode-price {
            font-size: 7px !important;
            line-height: 1 !important;
            margin-top: 0.15mm !important;
            font-weight: 900 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            text-align: left !important;
          }
        }
      `}</style>

      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => void handleImportBarang(e.target.files?.[0])}
      />

      <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
        <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <Package size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
              </div>

              <div className="min-w-0 self-center sm:self-auto">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Data Barang
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  {activeBarangTab === "digital"
                    ? "Kelola produk digital, provider, kategori digital, modal, dan sumber saldo."
                    : "Kelola barang fisik lengkap dengan stok, barcode, supplier, dan IMEI."}
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
              

             <div className="flex flex-wrap items-center justify-end gap-2">
  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={handleDownloadTemplate}
    className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15"
    title="Download Template Excel"
  >
    <FileSpreadsheet size={13} strokeWidth={3} />
    <span className="hidden sm:inline">Template</span>
  </motion.button>

  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={handleDownloadData}
    disabled={filtered.length === 0}
    className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    title="Download Data Barang"
  >
    <Download size={13} strokeWidth={3} />
    <span className="hidden sm:inline">Data</span>
  </motion.button>

  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={() => importInputRef.current?.click()}
    disabled={importLoading}
    className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    title="Import Data Barang"
  >
    <motion.span
      animate={importLoading ? { rotate: 360 } : {}}
      transition={
        importLoading
          ? { duration: 0.8, repeat: Infinity, ease: "linear" }
          : {}
      }
      className="inline-flex"
    >
      {importLoading ? (
        <RefreshCw size={13} strokeWidth={3} />
      ) : (
        <Upload size={13} strokeWidth={3} />
      )}
    </motion.span>
    <span className="hidden sm:inline">Import</span>
  </motion.button>

  <div className="mx-0.5 hidden h-5 w-px bg-white/20 sm:block" />

  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={openCopyAllModal}
    disabled={filtered.length === 0}
    className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    title="Copy barang dari satu toko ke toko lain"
  >
    <CopyPlus size={13} strokeWidth={3} />
    <span className="hidden sm:inline">Copy Toko</span>
  </motion.button>

  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={openPrintModal}
    disabled={!filterToko || activeBarangTab !== "fisik"}
    className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    title={activeBarangTab !== "fisik" ? "Barcode hanya untuk barang fisik" : filterToko ? "Print Barcode" : "Pilih filter toko terlebih dahulu"}
  >
    <Printer size={13} strokeWidth={3} />
    <span className="hidden sm:inline">Barcode</span>
  </motion.button>

  {activeBarangTab === "digital" && (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={openDigitalKategoriManager}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15"
      title="Kelola kategori barang digital"
    >
      <Tag size={13} strokeWidth={3} />
      <span className="hidden sm:inline">Kategori</span>
    </motion.button>
  )}

  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={openAdd}
    className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-white px-3 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition-colors hover:bg-sky-50"
    title={activeBarangTab === "digital" ? "Tambah Barang Digital" : "Tambah Barang Fisik"}
  >
    <Plus size={13} strokeWidth={3} />
    <span className="hidden sm:inline">{activeBarangTab === "digital" ? "Tambah Digital" : "Tambah Fisik"}</span>
  </motion.button>

  <motion.button
    whileTap={{ scale: 0.97 }}
    transition={{ duration: 0.12, ease: "easeOut" }}
    onClick={fetchData}
    disabled={loading}
    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    title="Refresh"
  >
    <motion.span
      animate={loading ? { rotate: 360 } : {}}
      transition={
        loading
          ? { duration: 0.8, repeat: Infinity, ease: "linear" }
          : {}
      }
      className="inline-flex"
    >
      <RefreshCw size={14} className="text-white" strokeWidth={2.5} />
    </motion.span>
  </motion.button>
</div>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
            <Cpu size={140} strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-lg"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500">
                <Check size={11} className="text-white" strokeWidth={3} />
              </div>
              <p className="text-[11px] font-bold text-sky-700">{successMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <BarangStatCard
            label="Total Barang"
            value={formatStatValue(
              statValueMode.totalBarang === "modal" ? barangStats.totalModal : barangStats.totalBarang,
              statValueMode.totalBarang
            )}
            icon={Package}
            tone="sky"
            active={statValueMode.totalBarang === "modal"}           
            onClick={() => toggleStatValueMode("totalBarang")}
          />
          <BarangStatCard
            label="Barang Fisik"
            value={formatStatValue(
              statValueMode.totalFisik === "modal" ? barangStats.totalModalFisik : barangStats.totalFisik,
              statValueMode.totalFisik
            )}
            icon={Boxes}
            tone="blue"
            active={statValueMode.totalFisik === "modal"}            
            onClick={() => toggleStatValueMode("totalFisik")}
          />
          <BarangStatCard
            label="Barang Digital"
            value={formatStatValue(
              statValueMode.totalDigital === "modal" ? barangStats.totalModalDigital : barangStats.totalDigital,
              statValueMode.totalDigital
            )}
            icon={Smartphone}
            tone="slate"
            active={statValueMode.totalDigital === "modal"}           
            onClick={() => toggleStatValueMode("totalDigital")}
          />
          <BarangStatCard
            label="Stok Rendah"
            value={String(barangStats.stokRendah)}
            icon={AlertCircle}
            tone="rose"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveBarangTab("fisik")}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black uppercase tracking-[0.08em] transition-all sm:text-sm ${
                activeBarangTab === "fisik"
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <Package size={16} strokeWidth={2.5} />
              Barang Fisik
            </button>
            <button
              type="button"
              onClick={() => setActiveBarangTab("digital")}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black uppercase tracking-[0.08em] transition-all sm:text-sm ${
                activeBarangTab === "digital"
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <Smartphone size={16} strokeWidth={2.5} />
              Barang Digital
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                {activeBarangTab === "digital" ? "Cari Barang Digital" : "Cari Barang / Barcode"}
              </label>
              <div className="relative mt-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  strokeWidth={2.5}
                />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder={activeBarangTab === "digital" ? "Nama, kategori, provider, saldo, nominal..." : "Barcode, nama, supplier, IMEI..."}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <div className="hidden sm:contents">
              <FilterSelect
                label="Kategori"
                value={filterKategori}
                onChange={(v) => {
                  setFilterKategori(v)
                  setPage(1)
                }}
                icon={Tag}
              >
                <option value="">Semua Kategori</option>
                {kategoriAktifList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Toko"
                value={filterToko}
                onChange={(v) => {
                  setFilterToko(v)
                  setPage(1)
                }}
                icon={Store}
              >
                <option value="">Semua Toko</option>
                {tokoList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                  </option>
                ))}
              </FilterSelect>

              {activeBarangTab === "digital" && (
                <div>
                  <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Kategori Digital
                  </label>
                  <button
                    type="button"
                    onClick={openDigitalKategoriManager}
                    className="inline-flex h-[43px] w-full items-center justify-center gap-2 rounded-xl border-2 border-sky-100 bg-sky-50 px-3 text-sm font-black text-sky-700 transition-all hover:border-sky-200 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  >
                    <Tag size={15} strokeWidth={2.8} />
                    Kategori
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
              type="button"
            >
              <Plus size={14} strokeWidth={2.5} />
              {activeBarangTab === "digital" ? "Digital" : "Fisik"}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => importInputRef.current?.click()}
              disabled={importLoading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 disabled:opacity-60"
              type="button"
            >
              <Upload size={14} strokeWidth={2.5} />
              Import
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-600"
              }`}
              type="button"
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </motion.button>
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
                  <FilterSelect label="Kategori" value={filterKategori} onChange={(v) => { setFilterKategori(v); setPage(1) }} icon={Tag}>
                    <option value="">Semua Kategori</option>
                    {kategoriAktifList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                  </FilterSelect>
                  <FilterSelect label="Toko" value={filterToko} onChange={(v) => { setFilterToko(v); setPage(1) }} icon={Store}>
                    <option value="">Semua Toko</option>
                    {tokoList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
                  </FilterSelect>
                  {activeBarangTab === "digital" && (
                    <button
                      type="button"
                      onClick={openDigitalKategoriManager}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-sky-100 bg-sky-50 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-sky-700 transition hover:bg-sky-100"
                    >
                      <Tag size={14} strokeWidth={2.8} />
                      Kategori Digital
                    </button>
                  )}
                  <FilterSelect label="Tampilkan" value={itemsPerPage} onChange={(v) => { setItemsPerPage(Number(v)); setPage(1) }}>
                    {ITEMS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3 hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Tampilkan"
              value={itemsPerPage}
              onChange={(v) => {
                setItemsPerPage(Number(v))
                setPage(1)
              }}
            >
              {ITEMS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FilterSelect>
          </div>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Memuat data...
              </p>
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Boxes size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Belum ada data barang
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openAdd}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm"
            >
              <Plus size={13} strokeWidth={3} />
              {activeBarangTab === "digital" ? "Tambah Digital Pertama" : "Tambah Fisik Pertama"}
            </motion.button>
          </motion.div>
        )}

        {!loading && paged.length > 0 && (
          <>
            <div className="space-y-2 sm:hidden">
              {paged.map((d, idx) => {
                const isLowStock = d.jenisBarang === "fisik" && d.stok <= d.stokMinimum
                const priceDraft = getInlinePriceDraft(d)
                const priceDirty = hasInlinePriceChange(d)
                const priceInvalid = isInlinePriceInvalid(d)
                const priceSaving = Boolean(inlinePriceSaving[d.id])

                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-slate-800">{d.nama}</p>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {d.kategoriNama} · {d.tokoNama}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 gap-1.5">
                        <button
                          onClick={() => (priceDirty ? handleSaveInlinePrice(d) : openEdit(d))}
                          disabled={priceSaving}
                          className={`relative flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                            priceDirty
                              ? priceInvalid
                                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                          }`}
                          title={priceDirty ? (priceInvalid ? "Harga modal lebih besar dari harga jual" : "Simpan perubahan harga") : "Edit barang"}
                        >
                          {priceSaving ? (
                            <RefreshCw size={12} className="animate-spin" strokeWidth={2.5} />
                          ) : (
                            <Pencil size={12} strokeWidth={2.5} />
                          )}
                          {priceDirty && !priceSaving ? (
                            <span
                              className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                                priceInvalid ? "bg-red-500" : "bg-emerald-500"
                              }`}
                            />
                          ) : null}
                        </button>
                        <button
                          onClick={() => setDeleteId(d.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition-colors hover:bg-rose-700"
                        >
                          <Trash2 size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black ${
                          d.jenisBarang === "digital"
                            ? "bg-sky-500 text-white"
                            : "bg-slate-900 text-white"
                        }`}
                      >
                        {d.jenisBarang === "digital" ? (
                          <Smartphone size={11} strokeWidth={2.5} />
                        ) : (
                          <Barcode size={11} strokeWidth={2.5} />
                        )}
                        {formatJenisBarangLabel(d.jenisBarang)}
                      </span>

                      {d.jenisBarang === "fisik" && d.kodeBarang ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                          <Barcode size={11} strokeWidth={2.5} />
                          {d.kodeBarang}
                        </span>
                      ) : null}

                      {d.jenisBarang === "digital" && d.provider ? (
                        <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          {d.provider}
                        </span>
                      ) : null}

                      {d.jenisBarang === "digital" && d.saldoSourceNama ? (
                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          {d.saldoSourceNama}
                        </span>
                      ) : null}

                      {d.pakaiKodeUnik && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                          <ShieldCheck size={11} strokeWidth={2.5} />
                          {d.jenisKodeUnik}: {d.kodeUnik || "-"}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.jenisBarang === "fisik" ? (
                        <>
                          <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                            {d.merk || "-"}
                          </span>
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {d.satuanNama || d.satuan || "-"}
                          </span>
                          <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                            {d.supplier || "-"}
                          </span>
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                              isLowStock ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            Stok: {d.stok}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                            Nominal: {d.nominalProduk || "-"}
                          </span>
                          <div className="grid w-full grid-cols-2 gap-2">
                            <InlineHargaInput
                              label="Harga Modal"
                              value={priceDraft.hargaModal}
                              dirty={priceDirty}
                              invalid={priceInvalid}
                              onChange={(value) => updateInlinePriceDraft(d, "hargaModal", value)}
                            />
                            <InlineHargaInput
                              label="Harga Jual"
                              value={priceDraft.hargaJual}
                              dirty={priceDirty}
                              invalid={priceInvalid}
                              onChange={(value) => updateInlinePriceDraft(d, "hargaJual", value)}
                            />
                          </div>
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                              d.aktif === false
                                ? "bg-red-100 text-red-700"
                                : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            {d.aktif === false ? "Nonaktif" : "Aktif"}
                          </span>
                        </>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Barang</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Barcode / Kode</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Toko</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Harga Modal</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Harga Jual</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Stok / Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((d) => {
                      const isLowStock = d.jenisBarang === "fisik" && d.stok <= d.stokMinimum
                      const priceDraft = getInlinePriceDraft(d)
                      const priceDirty = hasInlinePriceChange(d)
                      const priceInvalid = isInlinePriceInvalid(d)
                      const priceSaving = Boolean(inlinePriceSaving[d.id])

                      return (
                        <tr key={d.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3">
                            <p className="text-sm font-black text-slate-800">{d.nama}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {d.kategoriNama} · {d.jenisBarang === "digital" ? d.provider || "-" : d.merk || "-"} ·{" "}
                              {d.jenisBarang === "digital" ? d.saldoSourceNama || "-" : d.supplier || "-"}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black ${
                                d.jenisBarang === "digital"
                                  ? "bg-sky-500 text-white"
                                  : "bg-slate-900 text-white"
                              }`}
                            >
                              {d.jenisBarang === "digital" ? (
                                <Smartphone size={11} strokeWidth={2.5} />
                              ) : (
                                <Package size={11} strokeWidth={2.5} />
                              )}
                              {formatJenisBarangLabel(d.jenisBarang)}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {d.jenisBarang === "fisik" ? (
                              <div className="flex max-w-full flex-wrap items-center gap-1.5">
                                <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                                  <Tag size={11} strokeWidth={2.5} className="shrink-0" />
                                  <span className="truncate">{d.kodeBarang || "-"}</span>
                                </span>

                                <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1 text-[10px] font-black text-white">
                                  <Barcode size={11} strokeWidth={2.5} className="shrink-0" />
                                  <span className="truncate">{getBarangKodeBarcode(d) || "Belum dibuat"}</span>
                                </span>

                                {d.pakaiKodeUnik ? (
                                  <>
                                    <span className="text-xs font-black text-slate-400">/</span>
                                    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1 text-[10px] font-black text-white">
                                      <ShieldCheck size={11} strokeWidth={2.5} className="shrink-0" />
                                      <span className="truncate">
                                        {String(d.jenisKodeUnik || "").toUpperCase()}: {d.kodeUnik || "-"}
                                      </span>
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-700">
                                  <Wifi size={11} strokeWidth={2.5} />
                                  {d.provider || "-"}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">
                                  <Wallet size={11} strokeWidth={2.5} />
                                  {d.saldoSourceNama || "-"}
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-slate-700">{d.tokoNama || "-"}</p>
                            <p className="mt-1 text-xs text-slate-500">{d.satuanNama || d.satuan || "-"}</p>
                          </td>

                          <td className="min-w-[150px] px-4 py-3">
                            <InlineHargaInput
                              label="Modal"
                              value={priceDraft.hargaModal}
                              dirty={priceDirty}
                              invalid={priceInvalid}
                              onChange={(value) => updateInlinePriceDraft(d, "hargaModal", value)}
                            />
                          </td>

                          <td className="min-w-[150px] px-4 py-3">
                            <InlineHargaInput
                              label="Jual"
                              value={priceDraft.hargaJual}
                              dirty={priceDirty}
                              invalid={priceInvalid}
                              onChange={(value) => updateInlinePriceDraft(d, "hargaJual", value)}
                            />
                          </td>

                          <td className="px-4 py-3">
                            {d.jenisBarang === "fisik" ? (
                              <>
                                <span
                                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                                    isLowStock ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"
                                  }`}
                                >
                                  {d.stok}
                                </span>
                                <p className="mt-1 text-xs text-slate-500">Min: {d.stokMinimum}</p>
                              </>
                            ) : (
                              <>
                                <span
                                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                                    d.aktif === false
                                      ? "bg-red-100 text-red-700"
                                      : "bg-sky-100 text-sky-700"
                                  }`}
                                >
                                  {d.aktif === false ? "Nonaktif" : "Aktif"}
                                </span>
                                <p className="mt-1 text-xs text-slate-500">
                                  Nominal: {d.nominalProduk || "-"}
                                </p>
                              </>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => (priceDirty ? handleSaveInlinePrice(d) : openEdit(d))}
                                disabled={priceSaving}
                                className={`relative flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                                  priceDirty
                                    ? priceInvalid
                                      ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                                      : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                }`}
                                title={priceDirty ? (priceInvalid ? "Harga modal lebih besar dari harga jual" : "Simpan perubahan harga") : "Edit barang"}
                              >
                                {priceSaving ? (
                                  <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                ) : (
                                  <Pencil size={13} strokeWidth={2.5} />
                                )}
                                {priceDirty && !priceSaving ? (
                                  <span
                                    className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                                      priceInvalid ? "bg-red-500" : "bg-emerald-500"
                                    }`}
                                  />
                                ) : null}
                              </button>
                              <button
                                onClick={() => setDeleteId(d.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition-colors hover:bg-rose-700"
                              >
                                <Trash2 size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={14} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </>
        )}

        <AnimatePresence>
          {showModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeModal()
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      {isEdit ? (
                        <Pencil size={18} className="text-white" strokeWidth={2.5} />
                      ) : (
                        <Plus size={18} className="text-white" strokeWidth={3} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-black leading-none text-white">
                        {isEdit ? `Edit Barang ${isDigitalForm ? "Digital" : "Fisik"}` : `Tambah Barang ${isDigitalForm ? "Digital" : "Fisik"}`}
                      </h2>
                      <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                        {isDigitalForm ? "Produk digital memakai kategori digital terpisah" : "Barang fisik memakai kategori fisik dan stok"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={closeModal}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                  <div className="space-y-5 p-6">
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
                        >
                          <AlertCircle size={14} className="flex-shrink-0 text-red-500" strokeWidth={2.5} />
                          <p className="text-[11px] font-bold text-red-600">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Jenis Barang
                      </label>
                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                        <button
                          type="button"
                          onClick={() => handleChangeJenisBarang("fisik")}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-all ${
                            isFisikForm
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <Package size={16} strokeWidth={2.5} />
                          Barang Fisik
                        </button>

                        <button
                          type="button"
                          onClick={() => handleChangeJenisBarang("digital")}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-all ${
                            isDigitalForm
                              ? "bg-white text-sky-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <Smartphone size={16} strokeWidth={2.5} />
                          Barang Digital
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormInput
                        label="Kode Barang"
                        required
                        icon={Barcode}
                        value={form.kodeBarang}
                        readOnly
                        placeholder="Otomatis dari toko + nama barang"
                      />

                      {isDigitalForm ? (
                        <>
                          <FormSelect
                            label="Kategori Digital"
                            required
                            icon={Tag}
                            value={form.kategoriId}
                            onChange={(e: any) => {
                              const nextKategoriId = e.target.value
                              setForm((prev) => ({
                                ...prev,
                                kategoriId: nextKategoriId,
                                nama: nextKategoriId ? prev.nama : "",
                                kodeBarang: nextKategoriId && prev.nama.trim() && prev.tokoId
                                  ? generateKodeBarang(prev.tokoId, prev.nama, editId)
                                  : "",
                              }))
                            }}
                          >
                            <option value="">Pilih kategori digital dulu</option>
                            {kategoriFormList.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.nama}
                              </option>
                            ))}
                          </FormSelect>

                          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 sm:col-span-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-sky-600">
                              Kategori Digital Baru
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-sky-700/80">
                              Buat atau pilih kategori dulu. Setelah kategori dipilih, kolom nama barang akan aktif.
                            </p>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                              <input
                                value={newDigitalKategoriNama}
                                onChange={(e) => setNewDigitalKategoriNama(e.target.value)}
                                placeholder="Contoh: XL, Telkomsel, DANA, Listrik"
                                className="w-full rounded-xl border-2 border-sky-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                              />
                              <button
                                type="button"
                                onClick={handleCreateDigitalKategori}
                                disabled={creatingDigitalKategori || !newDigitalKategoriNama.trim()}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {creatingDigitalKategori ? (
                                  <RefreshCw size={14} className="animate-spin" strokeWidth={2.5} />
                                ) : (
                                  <Plus size={14} strokeWidth={2.5} />
                                )}
                                Tambah Kategori
                              </button>
                            </div>
                          </div>

                          <div>
                            <FormInput
                              label="Nama Barang"
                              required
                              icon={Package}
                              value={form.nama}
                              disabled={!form.kategoriId}
                              onChange={(e: any) => {
                                if (!form.kategoriId) return
                                syncKodeBarangFromName({ nama: e.target.value })
                              }}
                              placeholder={form.kategoriId ? "Contoh: Pulsa XL 5K" : "Pilih kategori digital dulu"}
                            />
                            {!form.kategoriId && (
                              <p className="mt-1 text-[10px] font-bold text-amber-600">
                                Pilih atau buat kategori digital terlebih dahulu sebelum mengisi nama barang.
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <FormInput
                            label="Nama Barang"
                            required
                            icon={Package}
                            value={form.nama}
                            onChange={(e: any) => syncKodeBarangFromName({ nama: e.target.value })}
                            placeholder="Contoh: Oppo A58"
                          />

                          <FormSelect
                            label="Kategori"
                            required
                            icon={Tag}
                            value={form.kategoriId}
                            onChange={(e: any) => setField("kategoriId")(e.target.value)}
                          >
                            <option value="">Pilih kategori</option>
                            {kategoriFormList.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.nama}
                              </option>
                            ))}
                          </FormSelect>
                        </>
                      )}

                      <FormSelect
                        label="Toko"
                        required
                        icon={Store}
                        value={form.tokoId}
                        onChange={(e: any) => syncKodeBarangFromName({ tokoId: e.target.value })}
                      >
                        <option value="">Pilih toko</option>
                        {tokoList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nama}
                          </option>
                        ))}
                      </FormSelect>

                      {isFisikForm ? (
                        <>
                          <FormInput
                            label="Merk"
                            required
                            icon={BadgeDollarSign}
                            value={form.merk}
                            onChange={(e: any) => setField("merk")(e.target.value)}
                            placeholder="Contoh: Samsung"
                          />

                          <FormSelect
                            label="Supplier"
                            required
                            icon={Truck}
                            value={form.supplier}
                            onChange={(e: any) => setField("supplier")(e.target.value)}
                          >
                            <option value="">Pilih supplier</option>
                            {supplierList.map((s) => (
                              <option key={s.id} value={s.nama}>
                                {s.nama}
                              </option>
                            ))}
                          </FormSelect>
                        </>
                      ) : (
                        <>
                          <FormSelect
                            label="Provider"
                            required
                            icon={Wifi}
                            value={form.providerId}
                            onChange={(e: any) => {
                              const nextId = e.target.value
                              const provider = providerList.find((item) => item.id === nextId)
                              setForm((prev) => ({
                                ...prev,
                                providerId: nextId,
                                provider: provider?.nama || "",
                              }))
                            }}
                          >
                            <option value="">Pilih provider</option>
                            {providerList.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nama}
                              </option>
                            ))}
                          </FormSelect>

                          <FormSelect
                            label="Sumber Saldo"
                            required
                            icon={Wallet}
                            value={form.saldoSourceId}
                            onChange={(e: any) => setField("saldoSourceId")(e.target.value)}
                          >
                            <option value="">Pilih sumber saldo</option>
                            {saldoList.map((item) => (
                              <option key={item.id} value={item.id} disabled={!item.aktif}>
                                {item.namaSaldo} · {formatRupiah(item.jumlahSaldo)} {item.aktif ? "" : "(Nonaktif)"}
                              </option>
                            ))}
                          </FormSelect>
                        </>
                      )}
                    </div>

                    {isDigitalForm ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormInput
                          label="Nominal Produk"
                          required
                          icon={Zap}
                          value={form.nominalProduk}
                          onChange={(e: any) => setField("nominalProduk")(e.target.value)}
                          placeholder="Contoh: Pulsa 10K / Data 5GB / Token 20rb"
                        />

                        <FormSelect
                          label="Status Produk"
                          required
                          icon={Check}
                          value={String(form.aktif)}
                          onChange={(e: any) => setField("aktif")(e.target.value === "true")}
                        >
                          <option value="true">Aktif</option>
                          <option value="false">Nonaktif</option>
                        </FormSelect>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormInput
                        label="Harga Modal"
                        required
                        icon={BadgeDollarSign}
                        inputMode="numeric"
                        value={form.hargaModal}
                        onChange={(e: any) => setField("hargaModal")(formatNumberDots(e.target.value))}
                        placeholder="Contoh: 4.500"
                      />

                      <FormInput
                        label="Harga Jual"
                        required
                        icon={BadgeDollarSign}
                        inputMode="numeric"
                        value={form.hargaJual}
                        onChange={(e: any) => setField("hargaJual")(formatNumberDots(e.target.value))}
                        placeholder="Contoh: 6.000"
                      />
                    </div>

                    {isFisikForm ? (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <FormSelect
  label="Satuan"
  required
  icon={Ruler}
  value={form.satuanId}
  onChange={(e: any) => {
    const nextId = e.target.value
    const satuan = satuanList.find((item) => item.id === nextId)

    setForm((prev) => ({
      ...prev,
      satuanId: nextId,
      satuanNama: satuan?.nama || "",
      satuan: satuan?.nama || "",
    }))
  }}
>
  <option value="">Pilih satuan</option>
  {satuanList.map((s) => (
    <option key={s.id} value={s.id}>
      {s.nama}
    </option>
  ))}
</FormSelect>

                          <div className="rounded-xl border-2 border-slate-200 bg-white px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                  Pakai Kode Unik / IMEI
                                </p>
                                <p className="mt-1 text-xs font-semibold text-slate-400">
                                  Aktifkan kalau barang ini punya nomor unik seperti IMEI atau serial.
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const nextValue = !form.pakaiKodeUnik
                                  setField("pakaiKodeUnik")(nextValue)
                                  if (nextValue) focusKodeUnikScanner()
                                }}
                                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-all ${
                                  form.pakaiKodeUnik ? "bg-sky-500" : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-all ${
                                    form.pakaiKodeUnik ? "translate-x-9" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {form.pakaiKodeUnik ? (
                            <>
                              <FormSelect
                                label="Jenis Kode Unik"
                                required
                                icon={ShieldCheck}
                                value={form.jenisKodeUnik}
                                onChange={(e: any) =>
                                  setField("jenisKodeUnik")(e.target.value as JenisKodeUnik)
                                }
                              >
                                <option value="imei">IMEI</option>
                                <option value="serial">Serial Number</option>
                                <option value="custom">Kode Unik Custom</option>
                              </FormSelect>

                              <div className="sm:col-span-2">
                                <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                  <ShieldCheck size={11} strokeWidth={2.5} />
                                  {form.jenisKodeUnik === "imei"
                                    ? "Daftar IMEI"
                                    : form.jenisKodeUnik === "serial"
                                    ? "Daftar Serial Number"
                                    : "Daftar Kode Unik"}
                                  <span className="ml-0.5 text-red-400">*</span>
                                </label>

                                <textarea
                                  ref={kodeUnikInputRef}
                                  rows={4}
                                  value={form.kodeUnik}
                                  onChange={(e: any) => {
                                    const value = e.target.value
                                      .split("\n")
                                      .map((line: string) => normalizeKodeUnik(line))
                                      .join("\n")
                                    setField("kodeUnik")(value)
                                  }}
                                  placeholder={
                                    form.jenisKodeUnik === "imei"
                                      ? "Satu IMEI per baris\n867530912345678\n867530912345679"
                                      : form.jenisKodeUnik === "serial"
                                      ? "Satu serial per baris\nSN-123456\nSN-123457"
                                      : "Satu kode unik per baris\nKODE-UNIK-001\nKODE-UNIK-002"
                                  }
                                  className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                                />

                                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                                  Kalau diisi lebih dari 1 baris, sistem otomatis membuat 1 barang per IMEI/kode unik.
                                </p>
                              </div>
                            </>
                          ) : null}

                          <FormInput
                            label="Stok"
                            required
                            icon={Boxes}
                            inputMode="numeric"
                            value={form.stok}
                            onChange={(e: any) => setField("stok")(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="0"
                          />

                          <FormInput
                            label="Stok Minimum"
                            required
                            icon={Boxes}
                            inputMode="numeric"
                            value={form.stokMinimum}
                            onChange={(e: any) => setField("stokMinimum")(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="0"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      Batal
                    </button>

                    <button
                      type="submit"
                      disabled={submitLoading}
                      className="rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-sm font-black text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                    >
                      {submitLoading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Barang"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {importPreview && (
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !importLoading) resetImportPreview()
              }}
            >
              <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-2xl"
              >
                <div className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-5 py-4 text-white">
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                        <FileSpreadsheet size={23} className="text-white" strokeWidth={2.6} />
                      </div>

                      <div className="min-w-0">
                        <h2 className="text-lg font-black tracking-tight text-white">
                          Konfirmasi Import Barang
                        </h2>
                        <p className="mt-1 truncate text-xs font-semibold leading-relaxed text-sky-50/85">
                          {importPreview.fileName}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={resetImportPreview}
                      disabled={importLoading}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-50"
                      aria-label="Tutup import"
                    >
                      <X size={16} strokeWidth={2.8} />
                    </button>
                  </div>

                  <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
                  <div className="pointer-events-none absolute right-0 top-0 opacity-[0.06]">
                    <Cpu size={150} className="text-white" strokeWidth={1} />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <ImportStatCard label="Baris Dibaca" value={importPreview.totalRows} />
                    <ImportStatCard label="Data Valid" value={importPreview.prepared.length} />
                    <ImportStatCard label="Tambah Baru" value={importPreview.totalCreate} />
                    <ImportStatCard label="Update" value={importPreview.totalUpdate} />
                    <ImportStatCard label="Error" value={importPreview.errors.length} danger={importPreview.errors.length > 0} />
                  </div>

                  <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                          Status Import
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-700">
                          {importProgress.message || "Data siap diperiksa."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                        {importLoading ? (
                          <RefreshCw size={13} className="animate-spin text-sky-600" strokeWidth={3} />
                        ) : importPreview.errors.length > 0 ? (
                          <AlertCircle size={13} className="text-red-500" strokeWidth={3} />
                        ) : (
                          <Check size={13} className="text-sky-600" strokeWidth={3} />
                        )}
                        {importProgress.status === "processing"
                          ? `${importProgress.current}/${importProgress.total}`
                          : importPreview.errors.length > 0
                          ? "Perlu Revisi"
                          : "Siap Import"}
                      </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                      <motion.div
                        className={`h-full rounded-full ${importPreview.errors.length > 0 ? "bg-red-500" : "bg-sky-500"}`}
                        initial={{ width: 0 }}
                        animate={{
                          width:
                            importProgress.total > 0
                              ? `${Math.max(8, Math.min(100, (importProgress.current / importProgress.total) * 100))}%`
                              : importPreview.errors.length > 0
                              ? "100%"
                              : "8%",
                        }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  </div>

                  {importPreview.errors.length > 0 ? (
                    <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" strokeWidth={2.6} />
                        <div className="min-w-0">
                          <p className="text-sm font-black text-red-700">
                            Ada {importPreview.errors.length} error import
                          </p>
                          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                            {importPreview.errors.slice(0, 12).map((item) => (
                              <p key={item} className="text-xs font-semibold leading-relaxed text-red-600">
                                {item}
                              </p>
                            ))}
                            {importPreview.errors.length > 12 ? (
                              <p className="text-xs font-black text-red-700">
                                + {importPreview.errors.length - 12} error lain
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl border border-sky-100 bg-sky-50/70 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">
                          Ringkasan Jenis
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-2xl bg-white p-3 ring-1 ring-sky-100">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fisik</p>
                            <p className="mt-1 text-xl font-black text-slate-800">{importPreview.totalFisik}</p>
                          </div>
                          <div className="rounded-2xl bg-white p-3 ring-1 ring-sky-100">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Digital</p>
                            <p className="mt-1 text-xl font-black text-slate-800">{importPreview.totalDigital}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                          Catatan
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
                          Data belum masuk ke database. Klik <span className="font-black text-sky-700">Oke, Import</span> untuk mulai menyimpan. Proses akan tampil sampai selesai.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                        Preview Data Masuk
                      </p>
                    </div>

                    <div className="max-h-72 overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Aksi</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Barang</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Toko</th>
                            <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Kategori</th>
                            <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">Harga Jual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.prepared.slice(0, 60).map((item) => (
                            <tr key={`${item.rowNumber}-${item.payload.id}`} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-2">
                                <span
                                  className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                                    item.action === "update"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-sky-100 text-sky-700"
                                  }`}
                                >
                                  {item.action === "update" ? "Update" : "Baru"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <p className="font-black text-slate-800">{item.payload.nama}</p>
                                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  {formatJenisBarangLabel(item.payload.jenisBarang)} · {item.payload.kodeBarang || item.payload.provider || "-"}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">{item.payload.tokoNama}</td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">{item.payload.kategoriNama}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-black text-slate-800">{formatRupiah(item.payload.hargaJual)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {importPreview.prepared.length > 60 ? (
                      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
                        Menampilkan 60 dari {importPreview.prepared.length} data valid.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
                  <button
                    type="button"
                    onClick={resetImportPreview}
                    disabled={importLoading}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>

                  <button
                    type="button"
                    onClick={confirmImportBarang}
                    disabled={importLoading || importPreview.errors.length > 0 || importPreview.prepared.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 text-xs font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" strokeWidth={2.8} />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <Check size={15} strokeWidth={2.8} />
                        Oke, Import
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCopyModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !copyLoading) setShowCopyModal(false)
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      <CopyPlus size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h2 className="text-base font-black leading-none text-white">
                        Copy Barang Antar Toko
                      </h2>
                      <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                        Pilih toko asal, lalu pilih toko tujuan.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => !copyLoading && setShowCopyModal(false)}
                    disabled={copyLoading}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30 disabled:opacity-60"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">
                      Toko Asal
                    </p>
                    <div className="relative mt-2">
                      <select
                        value={copySourceTokoId}
                        onChange={(e) => {
                          setCopySourceTokoId(e.target.value)
                          setCopyTargetTokoIds({})
                        }}
                        disabled={copyLoading}
                        className="w-full appearance-none rounded-xl border-2 border-sky-100 bg-white px-3 py-2.5 pr-8 text-sm font-black text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60"
                      >
                        <option value="">Pilih toko asal</option>
                        {tokoList.map((toko) => (
                          <option key={toko.id} value={toko.id}>
                            {toko.nama}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        strokeWidth={2.5}
                      />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-sky-700">
                      {copySourceToko
                        ? `${copySourceItems.length} barang dari ${copySourceToko.nama} siap disalin${filterKategori || search ? " sesuai filter aktif" : ""}.`
                        : "Pilih toko asal untuk melihat jumlah barang yang bisa disalin."}
                    </p>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={selectAllCopyTargetToko}
                      disabled={copyLoading || copyableTokoList.length === 0}
                      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-black text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Pilih Semua Toko
                    </button>
                    <button
                      type="button"
                      onClick={clearCopyTargetToko}
                      disabled={copyLoading}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Kosongkan Pilihan
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200">
                    {copyableTokoList.length === 0 ? (
                      <div className="p-6 text-center text-xs font-bold text-slate-400">
                        Belum ada toko tujuan.
                      </div>
                    ) : (
                      <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                        {copyableTokoList.map((toko) => {
                          const checked = Boolean(copyTargetTokoIds[toko.id])
                          const sourceCount = copySourceItems.length

                          return (
                            <button
                              key={toko.id}
                              type="button"
                              onClick={() => toggleCopyTargetToko(toko.id)}
                              disabled={copyLoading}
                              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                checked ? "bg-sky-50" : "bg-white hover:bg-slate-50"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-800">{toko.nama}</p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  {sourceCount > 0
                                    ? `Tujuan untuk ${sourceCount} barang dari toko asal`
                                    : "Tidak ada barang dari toko asal"}
                                </p>
                              </div>

                              <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                  checked
                                    ? "border-sky-500 bg-sky-500 text-white"
                                    : "border-slate-300 bg-white text-transparent"
                                }`}
                              >
                                <Check size={13} strokeWidth={3} />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCopyModal(false)}
                    disabled={copyLoading}
                    className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAllBarang}
                    disabled={copyLoading || selectedCopyTokoIds.length === 0 || copySourceItems.length === 0 || !copySourceTokoId}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-sky-500/15 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {copyLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" strokeWidth={2.5} />
                        Menyalin...
                      </>
                    ) : (
                      <>
                        <CopyPlus size={14} strokeWidth={2.5} />
                        Salin {copySourceItems.length} Barang
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDigitalKategoriModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !digitalKategoriLoading) closeDigitalKategoriManager()
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      <Tag size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h2 className="text-base font-black leading-none text-white">Kategori Barang Digital</h2>
                      <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                        Tambah, edit, dan hapus kategori digital.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeDigitalKategoriManager}
                    disabled={digitalKategoriLoading}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30 disabled:opacity-60"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">
                      {editingDigitalKategoriId ? "Edit Kategori" : "Tambah Kategori Baru"}
                    </p>

                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={digitalKategoriFormNama}
                        onChange={(e) => setDigitalKategoriFormNama(e.target.value)}
                        disabled={digitalKategoriLoading}
                        placeholder="Contoh: XL, Telkomsel, DANA, Listrik"
                        className="min-w-0 flex-1 rounded-xl border-2 border-sky-100 bg-white px-3 py-2.5 text-sm font-black text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60"
                      />

                      <button
                        type="button"
                        onClick={handleSaveDigitalKategoriManager}
                        disabled={digitalKategoriLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {digitalKategoriLoading ? (
                          <RefreshCw size={14} className="animate-spin" strokeWidth={2.8} />
                        ) : editingDigitalKategoriId ? (
                          <Pencil size={14} strokeWidth={2.8} />
                        ) : (
                          <Plus size={14} strokeWidth={2.8} />
                        )}
                        {editingDigitalKategoriId ? "Update" : "Tambah"}
                      </button>

                      {editingDigitalKategoriId && (
                        <button
                          type="button"
                          onClick={resetDigitalKategoriManagerForm}
                          disabled={digitalKategoriLoading}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </div>

                  {deleteDigitalKategoriTarget && (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <p className="text-xs font-black text-rose-700">
                        Hapus kategori {deleteDigitalKategoriTarget.nama}?
                      </p>
                      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-rose-600">
                        Barang digital yang memakai kategori ini akan dipindahkan menjadi tanpa kategori.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setDeleteDigitalKategoriTarget(null)}
                          disabled={digitalKategoriLoading}
                          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteDigitalKategoriManager}
                          disabled={digitalKategoriLoading}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                        >
                          {digitalKategoriLoading && <RefreshCw size={13} className="animate-spin" strokeWidth={2.8} />}
                          Ya, Hapus
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Daftar Kategori
                      </p>
                      <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                        {kategoriDigitalList.length} kategori
                      </span>
                    </div>

                    {kategoriDigitalList.length === 0 ? (
                      <div className="p-8 text-center text-xs font-bold text-slate-400">
                        Belum ada kategori digital.
                      </div>
                    ) : (
                      <div className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto">
                        {kategoriDigitalList.map((item) => {
                          const usedCount = digitalKategoriUsageMap.get(item.id) || 0
                          const isEditing = editingDigitalKategoriId === item.id

                          return (
                            <div
                              key={item.id}
                              className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                                isEditing ? "bg-sky-50" : "bg-white"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-800">{item.nama}</p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  Dipakai {usedCount} barang digital
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                                <button
                                  type="button"
                                  onClick={() => startEditDigitalKategori(item)}
                                  disabled={digitalKategoriLoading}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                                >
                                  <Pencil size={13} strokeWidth={2.6} />
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDeleteDigitalKategoriTarget(item)}
                                  disabled={digitalKategoriLoading}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-rose-700 disabled:opacity-60"
                                >
                                  <Trash2 size={13} strokeWidth={2.6} />
                                  Hapus
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {deleteId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="bg-gradient-to-r from-rose-500 to-red-600 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      <Trash2 size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <h2 className="text-base font-black text-white">Hapus Barang</h2>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <p className="text-sm font-semibold text-slate-600">
                    Yakin ingin menghapus barang ini? Tindakan ini{" "}
                    <span className="font-black text-red-600">tidak dapat dibatalkan</span>.
                  </p>
                </div>

                <div className="flex justify-end gap-3 px-6 pb-5">
                  <button
                    onClick={() => setDeleteId(null)}
                    className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </button>

                  <button
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                  >
                    {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrintPicker && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowPrintPicker(false)
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-6 py-4">
                  <div>
                    <h2 className="text-base font-black text-white">Pilih Barang Fisik</h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      Barang digital tidak ikut print barcode
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPrintPicker(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto p-6">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Cari Barang
                      </label>
                      <div className="relative">
                        <Search
                          size={13}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          strokeWidth={2}
                        />
                        <input
                          value={printSearch}
                          onChange={(e) => setPrintSearch(e.target.value)}
                          placeholder="Nama, barcode, merk..."
                          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                        />
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => quickFillVisible(1)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={clearVisible}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Bersihkan
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {printCandidates.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                        Tidak ada barang fisik aktif di toko ini
                      </div>
                    )}

                    {printCandidates.map((item) => {
                      const qty = Number(printSelections[item.id] || 0)
                      const kodeBarcode = getBarangKodeBarcode(item)
                      const isGeneratingBarcode = Boolean(barcodeGenerateLoading[item.id])

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800">{item.nama}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {kodeBarcode || "Belum ada barcode value"} · {item.kodeBarang} · {item.tokoNama}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                            <button
                              type="button"
                              onClick={() => generateKodeBarcodeForItem(item)}
                              disabled={Boolean(kodeBarcode) || isGeneratingBarcode}
                              className={`rounded-xl px-3 py-2 text-xs font-black transition-all ${
                                kodeBarcode
                                  ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                              title={kodeBarcode ? "Kode barcode sudah ada dan tidak boleh diubah" : "Generate kode barcode"}
                            >
                              {isGeneratingBarcode ? "Generate..." : kodeBarcode ? "Ada Kode" : "Generate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => togglePrintItem(item)}
                              className={`rounded-xl px-3 py-2 text-xs font-black ${
                                qty > 0
                                  ? "bg-sky-500 text-white"
                                  : "border border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              {qty > 0 ? "Dipilih" : "Pilih"}
                            </button>

                            <input
                              type="number"
                              min={0}
                              max={999}
                              value={qty}
                              onChange={(e) => updatePrintQty(item.id, Number(e.target.value))}
                              className="w-24 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <p className="text-xs font-bold text-slate-500">
                    Total label: {selectedLabelCount}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPrintPicker(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={openPrintPreview}
                      className="rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-sm font-black text-white"
                    >
                      Lanjut Print
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrintPreview && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowPrintPreview(false)
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative z-10 flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-6 py-4 print-hide">
                  <div>
                    <h2 className="text-base font-black text-white">Preview Barcode</h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      Total label: {selectedLabelCount}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPrintPreview(false)}
                      className="rounded-xl border border-white/30 bg-white/20 px-4 py-2 text-sm font-black text-white hover:bg-white/30"
                    >
                      Tutup
                    </button>
                    <button
                      onClick={handlePrint}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-black text-sky-700"
                    >
                      Print
                    </button>
                  </div>
                </div>

                <div className="overflow-auto p-4">
                  <div
  id="barcode-print-area"
  className="bg-white p-0"
>
                    <div className="barcode-grid grid grid-cols-2 gap-[2px] sm:grid-cols-3 md:grid-cols-5">
                      {flatPrintItems.map((item) => (
                        <div
                          key={item.key}
                          className="barcode-card aspect-[2.05/1] bg-white p-[2px]"
                        >
                          <div className="barcode-svg-wrap flex h-full flex-col items-center overflow-hidden">
                            <div className="barcode-pack mx-auto w-[86%] max-w-[170px] min-w-0 overflow-hidden">
                              <p className="barcode-top w-full min-w-0 truncate text-center text-[6px] font-black leading-none text-slate-900">
                                {item.kodeBarang || "Tanpa Kode"}
                              </p>

                              <div className="flex w-full justify-center overflow-hidden">
                                <BarcodeSvg
                                  value={getBarcodePrintValue(item)}
                                  className="barcode-svg-print h-[30px] w-full max-w-full"
                                />
                              </div>

                              <div className="barcode-bottom mt-[2px] w-full min-w-0 overflow-hidden pl-[12px]">
                                <div className="barcode-meta-row flex w-full min-w-0 items-center justify-between gap-1">
                                  <p className="barcode-code max-w-[38%] truncate text-left text-[6px] font-black leading-none text-slate-900">
                                    {getBarangKodeBarcode(item) || item.kodeBarang}
                                  </p>

                                  <p className="barcode-store min-w-0 max-w-[54%] flex-1 translate-x-[6px] truncate text-right text-[7px] font-black leading-none text-slate-900">
                                    {item.tokoNama}
                                  </p>
                                </div>

                                <p className="barcode-price mt-[1px] truncate text-left text-[6px] font-black leading-none text-slate-900">
                                  {formatRupiah(item.hargaJual || 0)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        </main>
      </div>
    </>
  )
} 