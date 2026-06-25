/*
  Halaman admin laporan keuntungan bersih.
  File ini membaca koleksi transaksi, laporan_bulanan, dan pengeluaran dari Firestore untuk menampilkan
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
  ListFilter,
  ReceiptText,
  RefreshCw,
  Search,
  X,
  Filter,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  Ruler,
  Download,
  Cpu,
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
  qtyTerjual: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalModal: number
  totalBiayaAdmin: number
  labaKotor: number
  labaBersih: number
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
  kelompokKategoriBreakdown: KelompokKategoriBreakdown[]
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

type RankingGrupKategoriBarang = {
  kelompokId: string
  namaKelompok: string
  tokoId: string
  tokoNama: string
  kategoriIds: string[]
  kategoriNama: string[]
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

type RankingModalType = "toko" | "kategori" | "satuan" | null
type RankingKategoriTab = "grup" | "kategori"
type MobileReportTab = "chart" | "rekap"

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

function normalizeNumber(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function getFirstFilledNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue
    const n = normalizeNumber(value)
    if (n !== 0) return n
  }
  return 0
}

function hasNumberValue(value: unknown) {
  if (value === undefined || value === null || value === "") return false
  return Number.isFinite(Number(value))
}

function getBersihNumber({
  bersih,
  lama,
  retur,
  fallback = 0,
}: {
  bersih?: unknown[]
  lama?: unknown[]
  retur?: unknown[]
  fallback?: number
}) {
  for (const value of bersih || []) {
    if (hasNumberValue(value)) return Math.max(0, normalizeNumber(value))
  }

  const nilaiLama = getFirstFilledNumber(...(lama || []))
  const nilaiRetur = getFirstFilledNumber(...(retur || []))

  if (nilaiRetur > 0) return Math.max(0, nilaiLama - nilaiRetur)
  if (nilaiLama > 0) return Math.max(0, nilaiLama)

  return Math.max(0, fallback)
}

function getSafeRatio(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function getKelompokLabaBersih(item: any) {
  const direct = getFirstFilledNumber(
    item?.labaBersih,
    item?.totalLabaKotor,
    item?.labaKotor,
    item?.estimasiLabaKotor,
    item?.keuntungan,
    item?.untung,
    item?.laba,
  )

  if (direct !== 0) return direct

  const totalSetelahDiskon = normalizeNumber(item?.totalSetelahDiskon ?? item?.omzet)
  const totalModal = normalizeNumber(item?.totalModal ?? item?.modal)
  const totalBiayaAdmin = normalizeNumber(item?.totalBiayaAdmin ?? item?.biayaAdmin)

  if (totalSetelahDiskon !== 0 && totalModal !== 0) return totalSetelahDiskon - totalModal - totalBiayaAdmin

  return 0
}


function getFirestoreMillis(value: any) {
  if (!value) return 0
  if (typeof value?.toMillis === "function") return normalizeNumber(value.toMillis())
  if (typeof value?.seconds === "number") return normalizeNumber(value.seconds * 1000)
  return normalizeNumber(value)
}

function getBulanKeyFromMs(ms: number) {
  if (!ms) return ""
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ""
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

function getTransaksiCreatedAtMs(raw: any) {
  return getFirstFilledNumber(
    raw?.createdAtMs,
    getFirestoreMillis(raw?.createdAt),
    getFirestoreMillis(raw?.tanggal),
    raw?.updatedAtMs,
    getFirestoreMillis(raw?.updatedAt),
  )
}

function getPembayaranItemsTotal(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.reduce((acc, item: any) => {
    const nominal = getFirstFilledNumber(item?.nominal, item?.totalDenganAdmin, item?.jumlah, item?.amount)
    return acc + Math.max(0, nominal)
  }, 0)
}

function getTransaksiItems(raw: any) {
  return Array.isArray(raw?.items) ? raw.items : []
}

function getItemQty(item: any) {
  const qty = getFirstFilledNumber(item?.qty, item?.jumlah, item?.quantity, 1)
  return qty > 0 ? qty : 1
}

function getItemHargaJual(item: any) {
  return Math.max(0, getFirstFilledNumber(item?.hargaSetelahDiskon, item?.hargaJual, item?.hargaAsli, item?.price))
}

function getItemHargaAsli(item: any) {
  return Math.max(0, getFirstFilledNumber(item?.hargaAsli, item?.hargaJual, item?.hargaSetelahDiskon, item?.price))
}

function getItemHargaModal(item: any) {
  return Math.max(0, getFirstFilledNumber(item?.hargaModal, item?.modal, item?.hargaBeli))
}

function getItemsSubtotal(raw: any) {
  return getTransaksiItems(raw).reduce((acc: number, item: any) => acc + getItemHargaAsli(item) * getItemQty(item), 0)
}

function getItemsTotalSetelahDiskon(raw: any) {
  return getTransaksiItems(raw).reduce((acc: number, item: any) => acc + getItemHargaJual(item) * getItemQty(item), 0)
}

function getItemsTotalModal(raw: any) {
  return getTransaksiItems(raw).reduce((acc: number, item: any) => acc + getItemHargaModal(item) * getItemQty(item), 0)
}

function getTransaksiTotalSetelahDiskon(raw: any) {
  return getBersihNumber({
    bersih: [raw?.totalSetelahDiskonBersih, raw?.omzetBersih, raw?.totalBarangBersih],
    lama: [raw?.totalSetelahDiskon, raw?.subtotalSetelahDiskon, raw?.omzet, getItemsTotalSetelahDiskon(raw)],
    retur: [raw?.totalReturSetelahDiskon, raw?.totalReturBarang, raw?.returSetelahDiskon],
  })
}

function getTransaksiTotalAdmin(raw: any) {
  return getBersihNumber({
    bersih: [raw?.biayaAdminBersih, raw?.adminBersih],
    lama: [raw?.biayaAdminNominal, raw?.totalBiayaAdmin, raw?.admin],
    retur: [raw?.totalReturBiayaAdmin, raw?.returBiayaAdmin],
  })
}

function getTransaksiGrandTotal(raw: any) {
  return getBersihNumber({
    bersih: [raw?.grandTotalBersih, raw?.totalBayarBersih, raw?.totalBersih],
    lama: [raw?.grandTotal, raw?.totalBayar, raw?.total],
    retur: [
      raw?.totalReturNominal,
      raw?.totalReturGrandTotal,
      raw?.returNominal,
      getFirstFilledNumber(raw?.totalReturSetelahDiskon) + getFirstFilledNumber(raw?.totalReturBiayaAdmin),
    ],
    fallback: getTransaksiTotalSetelahDiskon(raw) + getTransaksiTotalAdmin(raw),
  })
}

function getTransaksiTotalDibayar(raw: any) {
  const grandTotal = getTransaksiGrandTotal(raw)
  if (grandTotal <= 0) return 0

  const isHutang = Boolean(raw?.isHutang) || normalizeNumber(raw?.sisaHutang) > 0 || normalizeNumber(raw?.totalHutang) > 0 || normalizeNumber(raw?.kurangBayar) > 0
  if (!isHutang) return grandTotal

  const explicitPaid = getFirstFilledNumber(raw?.totalDibayar, raw?.totalTerbayar, raw?.dibayar)
  if (explicitPaid > 0) return Math.max(0, Math.min(grandTotal, explicitPaid))

  const sisaHutang = getFirstFilledNumber(raw?.sisaHutang, raw?.totalHutang, raw?.kurangBayar)
  if (sisaHutang > 0) return Math.max(0, Math.min(grandTotal, grandTotal - sisaHutang))

  const splitPaid = getPembayaranItemsTotal(raw?.pembayaranItems)
  if (splitPaid > 0) return Math.max(0, Math.min(grandTotal, splitPaid))

  const uangBayar = normalizeNumber(raw?.uangBayar)
  const kembalian = normalizeNumber(raw?.kembalian)
  if (uangBayar > 0) return Math.max(0, Math.min(grandTotal, uangBayar - Math.max(0, kembalian)))

  return 0
}

function getTransaksiAdminDibayar(raw: any, totalDibayar: number) {
  const grandTotal = getTransaksiGrandTotal(raw)
  const totalAdmin = getTransaksiTotalAdmin(raw)
  if (grandTotal <= 0 || totalAdmin <= 0 || totalDibayar <= 0) return 0
  return Math.max(0, Math.min(totalAdmin, totalAdmin * (totalDibayar / grandTotal)))
}

function getTransaksiBarangDibayar(raw: any, totalDibayar: number, totalAdminDibayar: number) {
  return Math.max(0, totalDibayar - totalAdminDibayar)
}

function getTransaksiSisaHutang(raw: any, totalDibayar: number) {
  if (hasNumberValue(raw?.sisaHutang)) return Math.max(0, normalizeNumber(raw?.sisaHutang))
  if (getTransaksiGrandTotal(raw) <= 0) return 0

  const direct = getFirstFilledNumber(raw?.totalHutang, raw?.kurangBayar)
  if (direct > 0) return Math.max(0, Math.min(getTransaksiGrandTotal(raw), direct))
  if (!Boolean(raw?.isHutang)) return 0
  return Math.max(0, getTransaksiGrandTotal(raw) - totalDibayar)
}

function getTransaksiSubtotal(raw: any) {
  return getBersihNumber({
    bersih: [raw?.subtotalBersih],
    lama: [raw?.subtotal, getItemsSubtotal(raw), getTransaksiTotalSetelahDiskon(raw)],
    retur: [raw?.totalReturSubtotal, raw?.returSubtotal],
    fallback: getTransaksiTotalSetelahDiskon(raw),
  })
}

function getTransaksiTotalDiskon(raw: any) {
  const subtotal = getTransaksiSubtotal(raw)
  const totalSetelahDiskon = getTransaksiTotalSetelahDiskon(raw)
  return getBersihNumber({
    bersih: [raw?.totalDiskonBersih],
    lama: [raw?.totalDiskon, Math.max(0, subtotal - totalSetelahDiskon)],
    retur: [raw?.totalReturDiskon, raw?.returDiskon],
    fallback: Math.max(0, subtotal - totalSetelahDiskon),
  })
}

function getTransaksiTotalModal(raw: any) {
  return getBersihNumber({
    bersih: [raw?.totalModalBersih, raw?.modalBersih],
    lama: [raw?.totalModal, raw?.modal, getItemsTotalModal(raw)],
    retur: [raw?.totalReturModal, raw?.returModal],
  })
}

function getTransaksiTotalItem(raw: any) {
  return getBersihNumber({
    bersih: [raw?.totalItemBersih],
    lama: [
      raw?.totalItem,
      raw?.totalItemTerjual,
      getTransaksiItems(raw).reduce((acc: number, item: any) => acc + getItemQty(item), 0),
    ],
    retur: [raw?.totalReturQty, raw?.returQty],
  })
}

function getTransaksiModalRatio(raw: any) {
  const modalLama = Math.max(0, getFirstFilledNumber(raw?.totalModal, raw?.modal, getItemsTotalModal(raw)))
  const modalBersih = getTransaksiTotalModal(raw)
  if (modalLama <= 0) return modalBersih > 0 ? 1 : 0
  return getSafeRatio(modalBersih / modalLama)
}

function getTransaksiQtyRatio(raw: any) {
  const qtyLama = Math.max(
    0,
    getFirstFilledNumber(
      raw?.totalItem,
      raw?.totalItemTerjual,
      getTransaksiItems(raw).reduce((acc: number, item: any) => acc + getItemQty(item), 0),
    ),
  )
  const qtyBersih = getTransaksiTotalItem(raw)
  if (qtyLama <= 0) return qtyBersih > 0 ? 1 : 0
  return getSafeRatio(qtyBersih / qtyLama)
}

function makeKategoriFromItem(item: any, ratioBarangDibayar: number, modalRatio = 1, qtyRatio = 1): KategoriBreakdown {
  const qty = getItemQty(item)
  const hargaAsli = getItemHargaAsli(item)
  const hargaJual = getItemHargaJual(item)
  const hargaModal = getItemHargaModal(item)
  const subtotal = hargaAsli * qty
  const totalSetelahDiskon = hargaJual * qty
  const totalModal = hargaModal * qty * modalRatio
  const omzetDibayar = totalSetelahDiskon * ratioBarangDibayar
  const qtyBersih = qty * qtyRatio
  const kategoriNama = String(item?.kategoriNama || item?.kategori || item?.categoryName || "Tanpa Kategori").trim() || "Tanpa Kategori"
  const kategoriId = normalizeKategoriKey(item?.kategoriId || item?.kategoriID || kategoriNama) || "tanpa-kategori"
  const satuanId = String(item?.satuanId || item?.satuanID || item?.unitId || "").trim()
  const satuanNama = String(item?.satuanNama || item?.satuan || item?.unitName || "").trim()

  return {
    kategoriId,
    kategoriNama,
    jumlahTransaksi: omzetDibayar > 0 || totalModal > 0 ? 1 : 0,
    qtyTerjual: qtyBersih,
    omzet: omzetDibayar,
    subtotal,
    totalDiskon: Math.max(0, subtotal - totalSetelahDiskon),
    totalSetelahDiskon: omzetDibayar,
    totalModal,
    totalBiayaAdmin: 0,
    labaKotor: omzetDibayar - totalModal,
    labaBersih: omzetDibayar - totalModal,
    satuanIds: uniqueStringList([satuanId]),
    satuanNamaList: uniqueStringList([satuanNama]),
  }
}

function mergeKategoriBreakdown(target: KategoriBreakdown[], tambah: KategoriBreakdown[]) {
  const map = new Map<string, KategoriBreakdown>()

  for (const item of target) {
    const key = item.kategoriId || normalizeKategoriKey(item.kategoriNama) || "tanpa-kategori"
    map.set(key, { ...item, satuanIds: [...(item.satuanIds || [])], satuanNamaList: [...(item.satuanNamaList || [])] })
  }

  for (const item of tambah) {
    const key = item.kategoriId || normalizeKategoriKey(item.kategoriNama) || "tanpa-kategori"
    const current = map.get(key) || {
      kategoriId: key,
      kategoriNama: item.kategoriNama || "Tanpa Kategori",
      jumlahTransaksi: 0,
      qtyTerjual: 0,
      omzet: 0,
      subtotal: 0,
      totalDiskon: 0,
      totalSetelahDiskon: 0,
      totalModal: 0,
      totalBiayaAdmin: 0,
      labaKotor: 0,
      labaBersih: 0,
      satuanIds: [],
      satuanNamaList: [],
    }

    current.jumlahTransaksi += normalizeNumber(item.jumlahTransaksi)
    current.qtyTerjual += normalizeNumber(item.qtyTerjual)
    current.omzet += normalizeNumber(item.omzet)
    current.subtotal += normalizeNumber(item.subtotal)
    current.totalDiskon += normalizeNumber(item.totalDiskon)
    current.totalSetelahDiskon += normalizeNumber(item.totalSetelahDiskon)
    current.totalModal += normalizeNumber(item.totalModal)
    current.totalBiayaAdmin += normalizeNumber(item.totalBiayaAdmin)
    current.labaKotor += normalizeNumber(item.labaKotor)
    current.labaBersih += normalizeNumber(item.labaBersih)
    current.satuanIds = uniqueStringList([...(current.satuanIds || []), ...(item.satuanIds || [])])
    current.satuanNamaList = uniqueStringList([...(current.satuanNamaList || []), ...(item.satuanNamaList || [])])
    map.set(key, current)
  }

  return Array.from(map.values()).sort((a, b) => a.kategoriNama.localeCompare(b.kategoriNama))
}

function buildKategoriBreakdownFromTransaksi(raw: any, ratioBarangDibayar: number, modalRatio = 1, qtyRatio = 1) {
  const items = getTransaksiItems(raw)
  if (items.length > 0) {
    const kategoriItems: KategoriBreakdown[] = items.map((item: any) =>
      makeKategoriFromItem(item, ratioBarangDibayar, modalRatio, qtyRatio)
    )

    return mergeKategoriBreakdown([], kategoriItems)
  }

  if (!Array.isArray(raw?.kategoriBreakdown)) return []
  return raw.kategoriBreakdown.map((item: any) => {
    const totalSetelahDiskonAsli = Math.max(0, getFirstFilledNumber(item?.totalSetelahDiskon, item?.omzet, item?.subtotal))
    const omzetDibayar = totalSetelahDiskonAsli * ratioBarangDibayar
    const totalModal = Math.max(0, getFirstFilledNumber(item?.totalModal, item?.modal) * modalRatio)
    const qtyTerjual = normalizeNumber(item?.qtyTerjual || item?.totalQty || item?.qty) * qtyRatio
    const kategoriNama = String(item?.nama || item?.kategoriNama || "Tanpa Kategori").trim() || "Tanpa Kategori"
    const kategoriId = normalizeKategoriKey(item?.kategoriId || kategoriNama) || "tanpa-kategori"

    return {
      kategoriId,
      kategoriNama,
      jumlahTransaksi: omzetDibayar > 0 || totalModal > 0 ? normalizeNumber(item?.jumlahTransaksi || item?.transaksi || 1) : 0,
      qtyTerjual,
      omzet: omzetDibayar,
      subtotal: normalizeNumber(item?.subtotal),
      totalDiskon: normalizeNumber(item?.totalDiskon),
      totalSetelahDiskon: omzetDibayar,
      totalModal,
      totalBiayaAdmin: 0,
      labaKotor: omzetDibayar - totalModal,
      labaBersih: omzetDibayar - totalModal,
      satuanIds: uniqueStringList(Array.isArray(item?.satuanIds) ? item.satuanIds : []),
      satuanNamaList: uniqueStringList(Array.isArray(item?.satuanNamaList) ? item.satuanNamaList : []),
    }
  })
}

function buildKelompokBreakdownFromTransaksi(raw: any, ratioBarangDibayar: number, tokoId: string, tokoNama: string, modalRatio = 1, qtyRatio = 1) {
  if (!Array.isArray(raw?.kelompokKategoriBreakdown)) return []

  return raw.kelompokKategoriBreakdown
    .map((item: any) => {
      const namaKelompok = String(item?.namaKelompok || item?.kelompokNama || item?.nama || "Tanpa Kelompok").trim() || "Tanpa Kelompok"
      const kelompokId = normalizeKategoriKey(item?.kelompokId || item?.id || item?.groupId || namaKelompok) || "tanpa-kelompok"
      const totalSetelahDiskonAsli = Math.max(0, getFirstFilledNumber(item?.totalSetelahDiskon, item?.omzet, item?.subtotal))
      const omzetDibayar = totalSetelahDiskonAsli * ratioBarangDibayar
      const totalModal = Math.max(0, getFirstFilledNumber(item?.totalModal, item?.modal) * modalRatio)
      const qtyTerjual = normalizeNumber(item?.qtyTerjual ?? item?.totalQty ?? item?.qty ?? item?.totalItemTerjual) * qtyRatio
      const laba = omzetDibayar - totalModal

      return {
        kelompokId,
        namaKelompok,
        urutan: normalizeNumber(item?.urutan || 9999),
        tokoId: String(item?.tokoId || tokoId || ""),
        tokoNama: String(item?.tokoNama || tokoNama || ""),
        kategoriIds: uniqueStringList(Array.isArray(item?.kategoriIds) ? item.kategoriIds : []),
        kategoriNama: uniqueStringList(Array.isArray(item?.kategoriNama) ? item.kategoriNama : []),
        jumlahTransaksi: omzetDibayar > 0 || totalModal > 0 ? normalizeNumber(item?.jumlahTransaksi || item?.transaksi || 1) : 0,
        qtyTerjual,
        omzet: omzetDibayar,
        subtotal: normalizeNumber(item?.subtotal),
        totalDiskon: normalizeNumber(item?.totalDiskon),
        totalSetelahDiskon: omzetDibayar,
        totalModal,
        totalBiayaAdmin: 0,
        labaKotor: laba,
        labaBersih: laba,
      }
    })
    .filter((item: KelompokKategoriBreakdown) => item.namaKelompok)
}

function mergeKelompokBreakdown(target: KelompokKategoriBreakdown[], tambah: KelompokKategoriBreakdown[]) {
  const map = new Map<string, KelompokKategoriBreakdown>()

  for (const item of target) {
    const key = item.kelompokId || normalizeKategoriKey(item.namaKelompok) || "tanpa-kelompok"
    map.set(key, { ...item, kategoriIds: [...(item.kategoriIds || [])], kategoriNama: [...(item.kategoriNama || [])] })
  }

  for (const item of tambah) {
    const key = item.kelompokId || normalizeKategoriKey(item.namaKelompok) || "tanpa-kelompok"
    const current = map.get(key) || {
      kelompokId: key,
      namaKelompok: item.namaKelompok || "Tanpa Kelompok",
      urutan: normalizeNumber(item.urutan || 9999),
      tokoId: item.tokoId,
      tokoNama: item.tokoNama,
      kategoriIds: [],
      kategoriNama: [],
      jumlahTransaksi: 0,
      qtyTerjual: 0,
      omzet: 0,
      subtotal: 0,
      totalDiskon: 0,
      totalSetelahDiskon: 0,
      totalModal: 0,
      totalBiayaAdmin: 0,
      labaKotor: 0,
      labaBersih: 0,
    }

    current.kategoriIds = uniqueStringList([...(current.kategoriIds || []), ...(item.kategoriIds || [])])
    current.kategoriNama = uniqueStringList([...(current.kategoriNama || []), ...(item.kategoriNama || [])])
    current.jumlahTransaksi += normalizeNumber(item.jumlahTransaksi)
    current.qtyTerjual += normalizeNumber(item.qtyTerjual)
    current.omzet += normalizeNumber(item.omzet)
    current.subtotal += normalizeNumber(item.subtotal)
    current.totalDiskon += normalizeNumber(item.totalDiskon)
    current.totalSetelahDiskon += normalizeNumber(item.totalSetelahDiskon)
    current.totalModal += normalizeNumber(item.totalModal)
    current.totalBiayaAdmin += normalizeNumber(item.totalBiayaAdmin)
    current.labaKotor += normalizeNumber(item.labaKotor)
    current.labaBersih += normalizeNumber(item.labaBersih)
    map.set(key, current)
  }

  return Array.from(map.values()).sort((a, b) => Number(a.urutan || 9999) - Number(b.urutan || 9999))
}

function aggregateTransaksiToLaporanBulanan(docs: Array<{ id: string; data: any }>): LaporanBulanan[] {
  const map = new Map<string, LaporanBulanan>()

  for (const docItem of docs) {
    const raw = docItem.data || {}
    if (String(raw?.status || "").toLowerCase() !== "selesai") continue

    const createdAtMs = getTransaksiCreatedAtMs(raw)
    const bulanKey = String(raw?.bulanKey || getBulanKeyFromMs(createdAtMs)).trim()
    if (!bulanKey) continue

    const tokoId = String(raw?.tokoId || "tanpa-toko").trim() || "tanpa-toko"
    const tokoNama = String(raw?.tokoNama || "Tanpa Toko").trim() || "Tanpa Toko"
    const key = `${bulanKey}__${tokoId}`
    const totalDibayar = getTransaksiTotalDibayar(raw)
    const totalAdminDibayar = getTransaksiAdminDibayar(raw, totalDibayar)
    const totalBarangDibayar = getTransaksiBarangDibayar(raw, totalDibayar, totalAdminDibayar)
    const totalSetelahDiskon = getTransaksiTotalSetelahDiskon(raw)
    const totalModal = getTransaksiTotalModal(raw)
    const modalRatio = getTransaksiModalRatio(raw)
    const qtyRatio = getTransaksiQtyRatio(raw)
    const ratioBarangDibayar = totalSetelahDiskon > 0 ? Math.max(0, Math.min(1, totalBarangDibayar / totalSetelahDiskon)) : 1
    const kategoriBreakdown = buildKategoriBreakdownFromTransaksi(raw, ratioBarangDibayar, modalRatio, qtyRatio)
    const kelompokKategoriBreakdown = buildKelompokBreakdownFromTransaksi(raw, ratioBarangDibayar, tokoId, tokoNama, modalRatio, qtyRatio)

    if (
      totalDibayar <= 0 &&
      totalModal <= 0 &&
      totalSetelahDiskon <= 0 &&
      String(raw?.returStatus || "").toLowerCase() === "penuh"
    ) {
      continue
    }

    const current = map.get(key) || {
      id: key,
      bulanKey,
      tokoId,
      tokoNama,
      totalLabaKotor: 0,
      totalKeuntunganBersih: 0,
      omzet: 0,
      jumlahTransaksi: 0,
      kategoriBreakdown: [],
      kelompokKategoriBreakdown: [],
    }

    const keuntunganValid = totalBarangDibayar - totalModal

    current.jumlahTransaksi += 1
    current.omzet += totalBarangDibayar
    current.totalLabaKotor += keuntunganValid
    current.totalKeuntunganBersih += keuntunganValid
    current.kategoriBreakdown = mergeKategoriBreakdown(current.kategoriBreakdown, kategoriBreakdown)
    current.kelompokKategoriBreakdown = mergeKelompokBreakdown(current.kelompokKategoriBreakdown, kelompokKategoriBreakdown)
    map.set(key, current)
  }

  return Array.from(map.values()).sort((a, b) => b.bulanKey.localeCompare(a.bulanKey))
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
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm">
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
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [rankingModal, setRankingModal] = useState<RankingModalType>(null)
  const [kategoriRankingTab, setKategoriRankingTab] = useState<RankingKategoriTab>("grup")
  const [mobileReportTab, setMobileReportTab] = useState<MobileReportTab>("chart")

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [tokoSnap, transaksiSnap, laporanSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "transaksi"), orderBy("createdAtMs", "desc"))),
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

      const transaksiDocs = transaksiSnap.docs.map((d) => ({ id: d.id, data: d.data() }))
      const laporanDariTransaksi = aggregateTransaksiToLaporanBulanan(transaksiDocs)

      const laporanFallback: LaporanBulanan[] = laporanSnap.docs.map((d) => {
        const x = d.data() as any

        const kategoriBreakdown: KategoriBreakdown[] = Array.isArray(x?.kategoriBreakdown)
          ? x.kategoriBreakdown.map((item: any) => {
              const namaKategori = String(item?.nama || item?.kategoriNama || "Tanpa Kategori").trim()
              const kategoriKey = String(item?.kategoriId || namaKategori).trim().toLowerCase()
              const satuanIds = uniqueStringList(Array.isArray(item?.satuanIds) ? item.satuanIds : [])
              const satuanNamaList = uniqueStringList(Array.isArray(item?.satuanNamaList) ? item.satuanNamaList : [])
              const omzet = normalizeNumber(item?.totalDibayar ?? item?.uangMasuk ?? item?.omzet ?? item?.totalSetelahDiskon)
              const totalModal = normalizeNumber(item?.totalModal || item?.modal)
              const labaValid = getFirstFilledNumber(item?.labaDibayar, item?.labaCash, item?.labaBersih, item?.labaKotor, omzet - totalModal)

              return {
                kategoriId: kategoriKey || "tanpa-kategori",
                kategoriNama: namaKategori || "Tanpa Kategori",
                jumlahTransaksi: normalizeNumber(item?.jumlahTransaksi || 0),
                qtyTerjual: normalizeNumber(item?.qtyTerjual || 0),
                omzet,
                subtotal: normalizeNumber(item?.subtotal || 0),
                totalDiskon: normalizeNumber(item?.totalDiskon || 0),
                totalSetelahDiskon: omzet,
                totalModal,
                totalBiayaAdmin: normalizeNumber(item?.totalBiayaAdmin || 0),
                labaKotor: labaValid,
                labaBersih: labaValid,
                satuanIds,
                satuanNamaList,
              }
            })
          : []

        const kelompokKategoriBreakdown: KelompokKategoriBreakdown[] = Array.isArray(x?.kelompokKategoriBreakdown)
          ? x.kelompokKategoriBreakdown.map((item: any) => {
              const namaKelompok = String(item?.namaKelompok || item?.kelompokNama || item?.nama || "Tanpa Kelompok").trim()
              const kelompokId = String(item?.kelompokId || item?.id || namaKelompok || "tanpa-kelompok").trim().toLowerCase()
              const omzet = normalizeNumber(item?.totalDibayar ?? item?.uangMasuk ?? item?.omzet ?? item?.totalSetelahDiskon)
              const totalModal = normalizeNumber(item?.totalModal ?? item?.modal)
              const labaValid = getFirstFilledNumber(item?.labaDibayar, item?.labaCash, item?.labaBersih, item?.labaKotor, item?.totalLabaKotor, omzet - totalModal)

              return {
                kelompokId: kelompokId || "tanpa-kelompok",
                namaKelompok: namaKelompok || "Tanpa Kelompok",
                urutan: normalizeNumber(item?.urutan || 9999),
                tokoId: String(item?.tokoId || x?.tokoId || ""),
                tokoNama: String(item?.tokoNama || x?.tokoNama || ""),
                kategoriIds: uniqueStringList(Array.isArray(item?.kategoriIds) ? item.kategoriIds : []),
                kategoriNama: uniqueStringList(Array.isArray(item?.kategoriNama) ? item.kategoriNama : []),
                jumlahTransaksi: normalizeNumber(item?.jumlahTransaksi || item?.transaksi),
                qtyTerjual: normalizeNumber(item?.qtyTerjual ?? item?.totalQty ?? item?.qty ?? item?.totalItemTerjual),
                omzet,
                subtotal: normalizeNumber(item?.subtotal),
                totalDiskon: normalizeNumber(item?.totalDiskon),
                totalSetelahDiskon: omzet,
                totalModal,
                totalBiayaAdmin: normalizeNumber(item?.totalBiayaAdmin ?? item?.biayaAdmin),
                labaKotor: labaValid,
                labaBersih: labaValid,
              }
            })
          : []

        return {
          id: d.id,
          bulanKey: String(x?.bulanKey || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          totalLabaKotor: Number(x?.labaCash ?? x?.labaDibayar ?? x?.totalKeuntunganBersih ?? x?.totalLabaKotor ?? 0),
          totalKeuntunganBersih: Number(x?.labaCash ?? x?.labaDibayar ?? x?.totalKeuntunganBersih ?? x?.totalLabaKotor ?? 0),
          omzet: Number(x?.totalDibayar ?? x?.uangMasuk ?? x?.omzet ?? 0),
          jumlahTransaksi: Number(x?.jumlahTransaksi || 0),
          kategoriBreakdown,
          kelompokKategoriBreakdown,
        }
      })

      const laporanData = laporanDariTransaksi.length > 0 ? laporanDariTransaksi : laporanFallback

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

  const rankingGrupKategoriBarang = useMemo(() => {
    const map = new Map<string, RankingGrupKategoriBarang>()
    const q = search.toLowerCase().trim()

    for (const laporan of laporanBulananList) {
      if (filterToko && laporan.tokoId !== filterToko) continue
      if (bulanMulai && laporan.bulanKey < bulanMulai) continue
      if (bulanSelesai && laporan.bulanKey > bulanSelesai) continue

      for (const item of laporan.kelompokKategoriBreakdown || []) {
        const kelompokKey = String(item.kelompokId || item.namaKelompok || "tanpa-kelompok").trim().toLowerCase() || "tanpa-kelompok"
        if (!kelompokKey) continue

        if (filterKategori) {
          const kategoriIds = uniqueStringList(item.kategoriIds || []).map((value) => normalizeKategoriKey(value))
          const kategoriNames = uniqueStringList(item.kategoriNama || []).map((value) => normalizeKategoriKey(value))
          if (!kategoriIds.includes(normalizeKategoriKey(filterKategori)) && !kategoriNames.includes(normalizeKategoriKey(filterKategori))) continue
        }

        const current = map.get(kelompokKey) || {
          kelompokId: kelompokKey,
          namaKelompok: item.namaKelompok || "Tanpa Kelompok",
          tokoId: item.tokoId || laporan.tokoId,
          tokoNama: item.tokoNama || laporan.tokoNama,
          kategoriIds: [],
          kategoriNama: [],
          penghasilanKotor: 0,
          pengeluaran: 0,
          keuntunganBersih: 0,
          omzet: 0,
          qtyTerjual: 0,
          jumlahTransaksi: 0,
        }

        current.kategoriIds = uniqueStringList([...(current.kategoriIds || []), ...(item.kategoriIds || [])])
        current.kategoriNama = uniqueStringList([...(current.kategoriNama || []), ...(item.kategoriNama || [])])
        current.penghasilanKotor += Number(item.labaBersih || item.labaKotor || 0)
        current.omzet += Number(item.omzet || item.totalSetelahDiskon || 0)
        current.qtyTerjual += Number(item.qtyTerjual || 0)
        current.jumlahTransaksi += Number(item.jumlahTransaksi || 0)
        map.set(kelompokKey, current)
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        keuntunganBersih: item.penghasilanKotor - item.pengeluaran,
      }))
      .filter((item) => {
        if (!q) return true
        return (
          item.namaKelompok.toLowerCase().includes(q) ||
          item.kategoriNama.some((nama) => nama.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => b.keuntunganBersih - a.keuntunganBersih)
  }, [laporanBulananList, filterToko, filterKategori, bulanMulai, bulanSelesai, search])

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

  const resetFilter = () => {
    setSearch("")
    setFilterToko("")
    setFilterKategori("")
    setFilterSatuan("")
    setBulanMulai(getStartOfYearMonthInput())
    setBulanSelesai(toMonthInputValue(new Date()))
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
          title: "RANKING GRUP KATEGORI",
          subtitle,
          columns: [
            { key: "namaKelompok", label: "Grup Kategori", width: 30 },
            { key: "tokoNama", label: "Toko", width: 24 },
            { key: "kategoriText", label: "Kategori Terkait", width: 42 },
            { key: "penghasilanKotor", label: "Penghasilan Kotor", width: 20, money: true },
            { key: "keuntunganBersih", label: "Keuntungan Bersih", width: 20, money: true },
            { key: "omzet", label: "Omzet", width: 18, money: true },
            { key: "qtyTerjual", label: "Qty Terjual", width: 14, number: true },
            { key: "jumlahTransaksi", label: "Transaksi", width: 14, number: true },
          ],
          rows: rankingGrupKategoriBarang.map((item) => ({
            ...item,
            kategoriText: item.kategoriNama.join(", "),
          })),
        }),
        "Ranking Grup"
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
                  Laporan Keuntungan Bersih
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Rekap laba bersih bulanan setelah pengeluaran, kategori, toko, dan satuan.
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
          <StatCard icon={CircleDollarSign} label="Penghasilan Kotor" value={formatRupiah(totalPenghasilanKotor)} subValue={`${totalTransaksi} transaksi`} />
          <StatCard icon={Wallet} label="Pengeluaran" value={formatRupiah(totalPengeluaran)} subValue={`${filteredRekap.length} rekap`} />
          <StatCard icon={TrendingUp} label="Keuntungan Bersih" value={formatRupiah(totalKeuntunganBersih)} subValue={`Omzet ${formatRupiah(totalOmzet)}`} />
          <StatCard icon={ReceiptText} label="Qty Terjual" value={new Intl.NumberFormat("id-ID").format(totalQtyTerjual)} subValue={`Bulan ini ${formatRupiah(keuntunganBulanIni)}`} />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:hidden">
          <MobileActionButton icon={Store} label="Toko" onClick={() => setRankingModal("toko")} />
          <MobileActionButton icon={Layers3} label="Kategori" onClick={() => { setKategoriRankingTab("grup"); setRankingModal("kategori") }} />
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
              bulanMulai={bulanMulai}
              setBulanMulai={setBulanMulai}
              bulanSelesai={bulanSelesai}
              setBulanSelesai={setBulanSelesai}
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
                    bulanMulai={bulanMulai}
                    setBulanMulai={setBulanMulai}
                    bulanSelesai={bulanSelesai}
                    setBulanSelesai={setBulanSelesai}
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
                <h2 className="text-sm font-black text-slate-800 sm:text-base">Rekap Keuntungan Bersih</h2>
                              </div>

              {loading ? (
                <LoadingState label="Memuat laporan..." />
              ) : filteredRekap.length === 0 ? (
                <EmptyState label="Belum ada data" />
              ) : (
                <div className="space-y-3">
                  {filteredRekap.map((item, index) => (
                    <RekapCard key={`${item.bulanKey}-${item.tokoId}-${item.kategoriId}-${item.satuanId}-${index}`} item={item} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="hidden space-y-4 xl:col-span-5 xl:block">
            <RankingPanel title="Toko Teratas" description="Ranking toko berdasarkan keuntungan bersih" type="toko" rows={rankingToko} />
            <RankingPanel
              title="Ranking Kategori Barang"
              description="Ranking berdasarkan grup kategori dan kategori barang"
              type="kategori"
              rows={rankingKategoriBarang}
              grupRows={rankingGrupKategoriBarang}
              kategoriTab={kategoriRankingTab}
              setKategoriTab={setKategoriRankingTab}
            />
            <RankingPanel title="Ranking Satuan" description="Satuan yang paling menguntungkan" type="satuan" rows={rankingSatuanBarang} />
          </div>
        </div>

        <RankingModal
          type={rankingModal}
          onClose={() => setRankingModal(null)}
          rankingToko={rankingToko}
          rankingKategoriBarang={rankingKategoriBarang}
          rankingGrupKategoriBarang={rankingGrupKategoriBarang}
          rankingSatuanBarang={rankingSatuanBarang}
          kategoriTab={kategoriRankingTab}
          setKategoriTab={setKategoriRankingTab}
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
  bulanMulai,
  setBulanMulai,
  bulanSelesai,
  setBulanSelesai,
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
  bulanMulai: string
  setBulanMulai: (value: string) => void
  bulanSelesai: string
  setBulanSelesai: (value: string) => void
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
            placeholder="Bulan, toko, kategori, atau satuan..."
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

      <MonthInput label="Mulai" value={bulanMulai} onChange={setBulanMulai} />
      <MonthInput label="Selesai" value={bulanSelesai} onChange={setBulanSelesai} />
    </>
  )
}

function MonthInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        <CalendarDays size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
        <input
          type="month"
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
  chartData: Array<{ bulanKey: string; penghasilanKotor: number; pengeluaran: number; keuntunganBersih: number }>
  maxChartValue: number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800 sm:text-base">Chart Keuntungan Bersih Bulanan</h2>
             </div>

      {chartData.length === 0 ? (
        <EmptyState label="Belum ada data" />
      ) : (
        <div className="space-y-4">
          {chartData.map((item) => {
            const percent = maxChartValue > 0 ? (Math.abs(item.keuntunganBersih) / maxChartValue) * 100 : 0
            const isNegative = item.keuntunganBersih < 0

            return (
              <div key={item.bulanKey}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{formatBulanKey(item.bulanKey)}</p>
                  <p className={`text-sm font-black ${isNegative ? "text-red-600" : "text-sky-700"}`}>{formatRupiah(item.keuntunganBersih)}</p>
                </div>

                <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${isNegative ? "bg-gradient-to-r from-red-400 to-rose-600" : "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500"}`}
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

function RekapCard({ item }: { item: RekapKeuntunganBersih }) {
  const isNegative = item.keuntunganBersih < 0

  return (
   <div className="overflow-hidden bg-transparent p-0 shadow-none ring-0 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:p-4 sm:shadow-sm sm:ring-1 sm:ring-slate-100/70">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
            {formatBulanKey(item.bulanKey)}
          </span>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700 ring-1 ring-sky-100">
            {item.tokoNama || "Tanpa Toko"}
          </span>
        </div>

        <div>
          <p className="text-base font-black leading-snug text-slate-800 sm:text-sm">
            {item.kategoriNama || "Semua Kategori"}
            <span className="px-1 text-slate-300">•</span>
            {item.satuanNama || "Semua Satuan"}
          </p>
          <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-500 sm:text-[11px]">
            Omzet {formatRupiah(item.omzet)} • {item.jumlahTransaksi} transaksi • Qty {item.jumlahQtyTerjual}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <MoneyMetric label="Kotor" value={formatRupiah(item.penghasilanKotor)} />
            <MoneyMetric label="Pengeluaran" value={formatRupiah(item.pengeluaran)} tone="danger" />
            <MoneyMetric
              label="Bersih"
              value={formatRupiah(item.keuntunganBersih)}
              tone={isNegative ? "danger" : "blue"}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniMetric className="col-span-2 sm:col-span-1" label="Omzet" value={formatRupiah(item.omzet)} />
          <MiniMetric label="Transaksi" value={String(item.jumlahTransaksi)} />
          <MiniMetric label="Qty Terjual" value={String(item.jumlahQtyTerjual)} />
          <MiniMetric label="Data Keluar" value={String(item.jumlahDataPengeluaran)} />
        </div>
      </div>
    </div>
  )
}

function MoneyMetric({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "danger" | "blue"
}) {
  const valueClass =
    tone === "danger" ? "text-red-600" : tone === "blue" ? "text-sky-700" : "text-slate-800"

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 sm:block">
        <p className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400">
          {label}
        </p>
        <p className={`text-right text-sm font-black leading-snug sm:mt-1 sm:text-left ${valueClass}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

function MiniMetric({
  label,
  value,
  danger,
  blue,
  className = "",
}: {
  label: string
  value: string
  danger?: boolean
  blue?: boolean
  className?: string
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 ${className}`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm font-black leading-snug ${
          danger ? "text-red-600" : blue ? "text-sky-700" : "text-slate-800"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function RankingPanel({
  title,
  description,
  type,
  rows,
  grupRows = [],
  kategoriTab = "grup",
  setKategoriTab,
}: {
  title: string
  description: string
  type: "toko" | "kategori" | "satuan"
  rows: any[]
  grupRows?: any[]
  kategoriTab?: RankingKategoriTab
  setKategoriTab?: (value: RankingKategoriTab) => void
}) {
  const activeRows = type === "kategori" && kategoriTab === "grup" ? grupRows : rows
  const listType = type === "kategori" && kategoriTab === "grup" ? "grupKategori" : type

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-800 sm:text-base">{title}</h2>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{description}</p>
      </div>
      {type === "kategori" && setKategoriTab ? (
        <RankingKategoriTabs active={kategoriTab} onChange={setKategoriTab} />
      ) : null}
      <RankingList type={listType as "toko" | "kategori" | "satuan" | "grupKategori"} rows={activeRows} />
    </div>
  )
}

function RankingKategoriTabs({ active, onChange }: { active: RankingKategoriTab; onChange: (value: RankingKategoriTab) => void }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
      <button
        type="button"
        onClick={() => onChange("grup")}
        className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
          active === "grup"
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "bg-white text-slate-600 hover:bg-slate-100"
        }`}
      >
        Grup Kategori
      </button>
      <button
        type="button"
        onClick={() => onChange("kategori")}
        className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
          active === "kategori"
            ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
            : "bg-white text-slate-600 hover:bg-slate-100"
        }`}
      >
        Kategori
      </button>
    </div>
  )
}

function RankingList({ type, rows }: { type: "toko" | "kategori" | "satuan" | "grupKategori"; rows: any[] }) {
  if (rows.length === 0) {
    const label = type === "satuan" ? "Belum ada data satuan" : type === "grupKategori" ? "Belum ada data grup kategori" : "Belum ada data"
    return <EmptyState label={label} />
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((item, idx) => {
        const isNegative = Number(item.keuntunganBersih || 0) < 0
        const name = type === "toko" ? item.tokoNama : type === "kategori" ? item.kategoriNama : type === "grupKategori" ? item.namaKelompok : item.satuanNama
        const subtitle =
          type === "toko"
            ? `${item.bulanAktif || 0} bulan aktif`
            : type === "grupKategori"
              ? `${item.qtyTerjual || 0} item • ${item.jumlahTransaksi || 0} transaksi`
              : type === "kategori"
                ? `${item.qtyTerjual || 0} item • ${item.jumlahTransaksi || 0} transaksi`
                : `${item.qtyTerjual || 0} item • ${item.jumlahTransaksi || 0} transaksi`

        return (
          <div key={`${type}-${name}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">{name || "-"}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{subtitle}</p>
                    {type === "satuan" ? (
                      <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-500">
                        {item.namaBarangList?.length ? item.namaBarangList.join(", ") : "Belum ada nama barang"}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xs font-black sm:text-sm ${isNegative ? "text-red-600" : "text-sky-700"}`}>
                  {formatRupiah(Number(item.keuntunganBersih || 0))}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {type === "toko" ? `Kotor ${formatRupiah(Number(item.penghasilanKotor || 0))}` : `Omzet ${formatRupiah(Number(item.omzet || 0))}`}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RankingModal({
  type,
  onClose,
  rankingToko,
  rankingKategoriBarang,
  rankingGrupKategoriBarang,
  rankingSatuanBarang,
  kategoriTab,
  setKategoriTab,
}: {
  type: RankingModalType
  onClose: () => void
  rankingToko: any[]
  rankingKategoriBarang: any[]
  rankingGrupKategoriBarang: any[]
  rankingSatuanBarang: any[]
  kategoriTab: RankingKategoriTab
  setKategoriTab: (value: RankingKategoriTab) => void
}) {
  const title = type === "toko" ? "Toko Teratas" : type === "kategori" ? "Ranking Kategori" : "Ranking Satuan"
  const rows = type === "toko" ? rankingToko : type === "kategori" ? (kategoriTab === "grup" ? rankingGrupKategoriBarang : rankingKategoriBarang) : rankingSatuanBarang
  const listType = type === "kategori" && kategoriTab === "grup" ? "grupKategori" : type

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
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Ringkasan</p>
                <h2 className="truncate text-base font-black text-slate-800">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>
            <div className="max-h-[calc(84vh-58px)] overflow-y-auto p-4">
              {type === "kategori" ? <RankingKategoriTabs active={kategoriTab} onChange={setKategoriTab} /> : null}
              <RankingList type={listType as "toko" | "kategori" | "satuan" | "grupKategori"} rows={rows} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16">
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
