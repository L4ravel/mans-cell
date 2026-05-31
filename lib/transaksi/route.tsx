/* 
  Helper, tipe, dan komponen transaksi kasir.
  Berisi util transaksi, struk, riwayat transaksi, serta tampilan detail konfirmasi
  termasuk akun kasir dari koleksi users dan nomor tujuan barang digital.
*/

"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore"
import {
  Receipt,
  X,
  Clock,
  Printer,
  History,
  RefreshCw,
  Smartphone,
  Wifi,
  Zap,
  Ticket,
  Gamepad2,
  User2,
  Mail,
  Target,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

export type Barang = {
  id: string
  kodeBarang: string
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
  jenisKodeUnik?: "imei" | "serial" | "custom" | ""
  kodeUnik?: string
  jenisBarang?: "fisik" | "digital"
  subJenisDigital?: "pulsa" | "paket_data" | "token_listrik" | "voucher" | "saldo_game" | ""
  providerId?: string
  provider?: string
  saldoSourceId?: string
  saldoSourceNama?: string
  nominalProduk?: string
  aktif?: boolean
  createdAt: number
  updatedAt?: number
}

export type DiskonBarangRingkas = {
  id: string
  nama: string
  kodeBarang: string
  hargaJual: number
}

export type Diskon = {
  id: string
  namaPromo: string
  tokoId: string
  tokoNama: string
  tipeDiskon: "persen" | "nominal"
  nilaiDiskon: number
  barangIds: string[]
  barangRingkas: DiskonBarangRingkas[]
  isActive: boolean
  createdAt: number
  updatedAt?: number
}

export type MetodePembayaran = {
  id: string
  nama: string
  tipe: "Tunai" | "Non-Tunai"
  provider?: string
  biayaAdmin?: number
  nomorRekening?: string
  namaRekening?: string
  aktif: boolean
  createdAt: number
  createdBy: string
  updatedAt?: number
  updatedBy?: string
}

export type CartItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriId: string
  kategoriNama: string
  merk: string
  satuan: string
  satuanId?: string
  satuanNama?: string
  stok: number
  qty: number
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: "imei" | "serial" | "custom" | ""
  kodeUnik?: string
  jenisBarang: "fisik" | "digital"
  subJenisDigital?: "pulsa" | "paket_data" | "token_listrik" | "voucher" | "saldo_game" | ""
  providerId?: string
  provider?: string
  saldoSourceId?: string
  saldoSourceNama?: string
  nominalProduk?: string
  tujuan?: string
  diskonId?: string
  diskonNama?: string
  diskonTipe?: "persen" | "nominal"
  diskonNilai?: number
}

export type StrukItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriId: string
  kategoriNama: string
  merk: string
  satuan: string
  satuanId?: string
  satuanNama?: string
  qty: number
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  subtotalAsli: number
  subtotalFinal: number
  totalDiskon: number
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: "imei" | "serial" | "custom" | ""
  kodeUnik?: string
  jenisBarang: "fisik" | "digital"
  subJenisDigital?: "pulsa" | "paket_data" | "token_listrik" | "voucher" | "saldo_game" | ""
  providerId?: string
  provider?: string
  saldoSourceId?: string
  saldoSourceNama?: string
  nominalProduk?: string
  tujuan?: string
  diskonId: string
  diskonNama: string
  diskonTipe: string
  diskonNilai: number
}

export type StrukData = {
  id: string
  nomorTransaksi: string
  tokoId: string
  tokoNama: string
  metodePembayaranNama: string
  metodePembayaranTipe: string
  metodePembayaranProvider: string
  biayaAdminPersen: number
  biayaAdminNominal: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  grandTotal: number
  totalModal: number
  estimasiLabaKotor: number
  uangBayar: number
  kembalian: number
  totalItem: number
  totalJenisBarang: number
  status: string
  catatan: string
  jenisTransaksi: "fisik" | "digital"
  items: StrukItem[]
  createdAtMs: number
  kasirUid?: string
  kasirNama?: string
  kasirEmail?: string
}

export type LaporanMetodeBreakdown = {
  nama: string
  jumlahTransaksi: number
  omzet: number
  admin: number
}

export type LaporanKategoriBreakdown = {
  kategoriId: string
  nama: string
  jumlahTransaksi: number
  qtyTerjual: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalModal: number
  totalBiayaAdmin: number
  labaBersih: number
  satuanIds?: string[]
  satuanNamaList?: string[]
}

export type MasterSaldoDigital = {
  id: string
  namaSaldo: string
  jumlahSaldo: number
  aktif: boolean
  keterangan?: string
  createdAt?: number
  updatedAt?: number
}

export type DigitalSaldoUsage = {
  saldoSourceId: string
  saldoSourceNama: string
  totalPotong: number
  totalItem: number
  totalQty: number
  providers: string[]
  barangIds: string[]
}

export type AddToCartMode = "manual" | "scan"

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): {
        detect: (
          source: HTMLVideoElement | HTMLCanvasElement | ImageBitmapSource
        ) => Promise<Array<{ rawValue?: string; format?: string }>>
      }
      getSupportedFormats?: () => Promise<string[]>
    }
    webkitAudioContext?: typeof AudioContext
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatRibuanInput(value: string) {
  if (!value) return ""
  const angka = Number(value.replace(/\D/g, "") || 0)
  if (!angka) return ""
  return new Intl.NumberFormat("id-ID").format(angka)
}

export function formatPercent(value: number) {
  return `${Number(value || 0)}%`
}

export function formatTanggalStruk(ms: number) {
  const date = new Date(ms)
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function normalizeBarcode(value: string) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase()
}

export function hitungHargaSetelahDiskon(
  hargaJual: number,
  tipeDiskon?: "persen" | "nominal",
  nilaiDiskon?: number
) {
  const harga = Number(hargaJual || 0)
  const nilai = Number(nilaiDiskon || 0)

  if (!tipeDiskon || nilai <= 0) return harga

  if (tipeDiskon === "persen") {
    const hasil = harga - harga * (nilai / 100)
    return Math.max(0, Math.round(hasil))
  }

  return Math.max(0, harga - nilai)
}

export function getBestDiskonForBarang(barangId: string, diskonList: Diskon[]) {
  const cocok = diskonList.filter(
    (d) => d.isActive && Array.isArray(d.barangIds) && d.barangIds.includes(barangId)
  )

  if (!cocok.length) return null

  return cocok.sort(
    (a, b) => Number(b.nilaiDiskon || 0) - Number(a.nilaiDiskon || 0)
  )[0]
}

export function getTanggalParts(nowMs: number) {
  const date = new Date(nowMs)
  const tahun = date.getFullYear()
  const bulan = date.getMonth() + 1
  const hari = date.getDate()

  const mm = `${bulan}`.padStart(2, "0")
  const dd = `${hari}`.padStart(2, "0")

  return {
    tahun,
    bulan,
    hari,
    tanggalKey: `${tahun}-${mm}-${dd}`,
    bulanKey: `${tahun}-${mm}`,
  }
}

export function mergeMetodeBreakdown(
  existing: any,
  metodeNama: string,
  omzetTambah: number,
  adminTambah: number
): LaporanMetodeBreakdown[] {
  const list: LaporanMetodeBreakdown[] = Array.isArray(existing)
    ? existing.map((item: any) => ({
        nama: item?.nama || "Tanpa Nama",
        jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
        omzet: Number(item?.omzet || 0),
        admin: Number(item?.admin || 0),
      }))
    : []

  const index = list.findIndex((item) => item.nama === metodeNama)

  if (index >= 0) {
    list[index] = {
      ...list[index],
      jumlahTransaksi: Number(list[index].jumlahTransaksi || 0) + 1,
      omzet: Number(list[index].omzet || 0) + Number(omzetTambah || 0),
      admin: Number(list[index].admin || 0) + Number(adminTambah || 0),
    }
  } else {
    list.push({
      nama: metodeNama || "Tanpa Nama",
      jumlahTransaksi: 1,
      omzet: Number(omzetTambah || 0),
      admin: Number(adminTambah || 0),
    })
  }

  return list.sort((a, b) => b.omzet - a.omzet)
}

export function mergeKategoriBreakdown(
  existing: any,
  incoming: LaporanKategoriBreakdown[]
): LaporanKategoriBreakdown[] {
  const map = new Map<string, LaporanKategoriBreakdown>()

  if (Array.isArray(existing)) {
    for (const item of existing) {
      const kategoriId = String(item?.kategoriId || "").trim() || "tanpa-kategori"
      const nama = item?.nama || "Tanpa Kategori"
      map.set(kategoriId, {
        kategoriId,
        nama,
        jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
        qtyTerjual: Number(item?.qtyTerjual || 0),
        omzet: Number(item?.omzet || 0),
        subtotal: Number(item?.subtotal || 0),
        totalDiskon: Number(item?.totalDiskon || 0),
        totalSetelahDiskon: Number(item?.totalSetelahDiskon || 0),
        totalModal: Number(item?.totalModal || 0),
        totalBiayaAdmin: Number(item?.totalBiayaAdmin || 0),
        labaBersih: Number(item?.labaBersih || 0),
        satuanIds: Array.isArray(item?.satuanIds) ? item.satuanIds.filter(Boolean) : [],
        satuanNamaList: Array.isArray(item?.satuanNamaList) ? item.satuanNamaList.filter(Boolean) : [],
      })
    }
  }

  for (const item of incoming) {
    const kategoriId = String(item?.kategoriId || "").trim() || "tanpa-kategori"
    const nama = item?.nama || "Tanpa Kategori"
    const prev = map.get(kategoriId) || {
      kategoriId,
      nama,
      jumlahTransaksi: 0,
      qtyTerjual: 0,
      omzet: 0,
      subtotal: 0,
      totalDiskon: 0,
      totalSetelahDiskon: 0,
      totalModal: 0,
      totalBiayaAdmin: 0,
      labaBersih: 0,
      satuanIds: [] as string[],
      satuanNamaList: [] as string[],
    }

    map.set(kategoriId, {
      kategoriId,
      nama,
      jumlahTransaksi: Number(prev.jumlahTransaksi || 0) + Number(item?.jumlahTransaksi || 0),
      qtyTerjual: Number(prev.qtyTerjual || 0) + Number(item?.qtyTerjual || 0),
      omzet: Number(prev.omzet || 0) + Number(item?.omzet || 0),
      subtotal: Number(prev.subtotal || 0) + Number(item?.subtotal || 0),
      totalDiskon: Number(prev.totalDiskon || 0) + Number(item?.totalDiskon || 0),
      totalSetelahDiskon: Number(prev.totalSetelahDiskon || 0) + Number(item?.totalSetelahDiskon || 0),
      totalModal: Number(prev.totalModal || 0) + Number(item?.totalModal || 0),
      totalBiayaAdmin: Number(prev.totalBiayaAdmin || 0) + Number(item?.totalBiayaAdmin || 0),
      labaBersih: Number(prev.labaBersih || 0) + Number(item?.labaBersih || 0),
      satuanIds: Array.from(
        new Set([...(prev.satuanIds || []), ...((item?.satuanIds || []) as string[])])
      ),
      satuanNamaList: Array.from(
        new Set([...(prev.satuanNamaList || []), ...((item?.satuanNamaList || []) as string[])])
      ),
    })
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.qtyTerjual !== a.qtyTerjual) return b.qtyTerjual - a.qtyTerjual
    return b.omzet - a.omzet
  })
}

export function buildLaporanPayload({
  existingData,
  id,
  periodeKey,
  tahun,
  bulan,
  hari,
  tokoId,
  tokoNama,
  metodeNama,
  omzetTambah,
  subtotalTambah,
  totalDiskonTambah,
  totalSetelahDiskonTambah,
  totalBiayaAdminTambah,
  totalModalTambah,
  totalLabaKotorTambah,
  totalItemTambah,
  totalJenisBarangTambah,
  kategoriBreakdownTambah,
  nowMs,
}: {
  existingData: any
  id: string
  periodeKey: string
  tahun: number
  bulan: number
  hari?: number
  tokoId: string
  tokoNama: string
  metodeNama: string
  omzetTambah: number
  subtotalTambah: number
  totalDiskonTambah: number
  totalSetelahDiskonTambah: number
  totalBiayaAdminTambah: number
  totalModalTambah: number
  totalLabaKotorTambah: number
  totalItemTambah: number
  totalJenisBarangTambah: number
  kategoriBreakdownTambah: LaporanKategoriBreakdown[]
  nowMs: number
}) {
  const jumlahTransaksiBaru = Number(existingData?.jumlahTransaksi || 0) + 1
  const omzetBaru = Number(existingData?.omzet || 0) + Number(omzetTambah || 0)
  const subtotalBaru = Number(existingData?.subtotal || 0) + Number(subtotalTambah || 0)
  const totalDiskonBaru = Number(existingData?.totalDiskon || 0) + Number(totalDiskonTambah || 0)
  const totalSetelahDiskonBaru = Number(existingData?.totalSetelahDiskon || 0) + Number(totalSetelahDiskonTambah || 0)
  const totalBiayaAdminBaru = Number(existingData?.totalBiayaAdmin || 0) + Number(totalBiayaAdminTambah || 0)
  const totalModalBaru = Number(existingData?.totalModal || 0) + Number(totalModalTambah || 0)
  const totalLabaKotorBaru = Number(existingData?.totalLabaKotor || 0) + Number(totalLabaKotorTambah || 0)
  const totalItemTerjualBaru = Number(existingData?.totalItemTerjual || 0) + Number(totalItemTambah || 0)
  const totalJenisBarangTerjualBaru = Number(existingData?.totalJenisBarangTerjual || 0) + Number(totalJenisBarangTambah || 0)
  const totalKeuntunganBersihBaru = Number(existingData?.totalKeuntunganBersih || 0) + Number(totalLabaKotorTambah || 0)

  return {
    id,
    ...(hari
      ? { tanggalKey: periodeKey, tahun, bulan, hari }
      : { bulanKey: periodeKey, tahun, bulan }),
    tokoId,
    tokoNama,
    jumlahTransaksi: jumlahTransaksiBaru,
    omzet: omzetBaru,
    subtotal: subtotalBaru,
    totalDiskon: totalDiskonBaru,
    totalSetelahDiskon: totalSetelahDiskonBaru,
    totalBiayaAdmin: totalBiayaAdminBaru,
    totalModal: totalModalBaru,
    totalLabaKotor: totalLabaKotorBaru,
    totalKeuntunganBersih: totalKeuntunganBersihBaru,
    totalItemTerjual: totalItemTerjualBaru,
    totalJenisBarangTerjual: totalJenisBarangTerjualBaru,
    rataRataBelanja:
      jumlahTransaksiBaru > 0
        ? Math.round(omzetBaru / jumlahTransaksiBaru)
        : 0,
    metodePembayaranBreakdown: mergeMetodeBreakdown(
      existingData?.metodePembayaranBreakdown,
      metodeNama,
      omzetTambah,
      totalBiayaAdminTambah
    ),
    kategoriBreakdown: mergeKategoriBreakdown(
      existingData?.kategoriBreakdown,
      kategoriBreakdownTambah
    ),
    createdAt: existingData?.createdAt || serverTimestamp(),
    createdAtMs: Number(existingData?.createdAtMs || nowMs),
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
  }
}

export function formatJenisBarangLabel(value?: "fisik" | "digital") {
  return value === "digital" ? "Digital" : "Fisik"
}

export function formatSubJenisDigitalLabel(value?: string) {
  switch (value) {
    case "pulsa":
      return "Pulsa"
    case "paket_data":
      return "Paket Data"
    case "token_listrik":
      return "Token Listrik"
    case "voucher":
      return "Voucher"
    case "saldo_game":
      return "Saldo Game"
    default:
      return "-"
  }
}

export function getDigitalIcon(subJenis?: string) {
  switch (subJenis) {
    case "pulsa":
      return Smartphone
    case "paket_data":
      return Wifi
    case "token_listrik":
      return Zap
    case "voucher":
      return Ticket
    case "saldo_game":
      return Gamepad2
    default:
      return Smartphone
  }
}

export function digitalButuhTujuan(subJenis?: string) {
  return ["pulsa", "paket_data", "token_listrik", "saldo_game"].includes(String(subJenis || ""))
}

export function getTujuanLabel(subJenis?: string) {
  if (subJenis === "token_listrik") return "Nomor Meter"
  if (subJenis === "saldo_game") return "User ID / Nomor"
  return "Nomor Tujuan"
}

export function getDigitalNominalPotong(
  item: Pick<CartItem, "jenisBarang" | "hargaModal" | "qty">
) {
  if (item.jenisBarang !== "digital") return 0

  const hargaModal = Number(item.hargaModal || 0)
  const qty = Number(item.qty || 0)

  if (hargaModal <= 0 || qty <= 0) return 0

  return hargaModal * qty
}

export function buildDigitalSaldoUsage(cart: CartItem[]): DigitalSaldoUsage[] {
  const map = new Map<string, DigitalSaldoUsage>()

  for (const item of cart) {
    if (item.jenisBarang !== "digital") continue
    const saldoSourceId = String(item.saldoSourceId || "").trim()
    if (!saldoSourceId) continue

    const totalPotong = getDigitalNominalPotong(item)
    const prev = map.get(saldoSourceId) || {
      saldoSourceId,
      saldoSourceNama: String(item.saldoSourceNama || "").trim() || "Tanpa Sumber Saldo",
      totalPotong: 0,
      totalItem: 0,
      totalQty: 0,
      providers: [],
      barangIds: [],
    }

    const provider = String(item.provider || "").trim()
    const barangId = String(item.barangId || "").trim()

    if (provider && !prev.providers.includes(provider)) prev.providers.push(provider)
    if (barangId && !prev.barangIds.includes(barangId)) prev.barangIds.push(barangId)

    prev.totalPotong += totalPotong
    prev.totalItem += 1
    prev.totalQty += Number(item.qty || 0)

    if (!prev.saldoSourceNama && item.saldoSourceNama) {
      prev.saldoSourceNama = String(item.saldoSourceNama).trim()
    }

    map.set(saldoSourceId, prev)
  }

  return Array.from(map.values()).sort((a, b) => b.totalPotong - a.totalPotong)
}

export function validateDigitalSaldoUsage(cart: CartItem[]) {
  const digitalItems = cart.filter((item) => item.jenisBarang === "digital")

  for (const item of digitalItems) {
    if (!String(item.saldoSourceId || "").trim()) {
      return `Sumber saldo untuk ${item.nama} belum dipilih`
    }

    if (Number(item.hargaModal || 0) <= 0) {
      return `Harga modal produk digital untuk ${item.nama} tidak valid`
    }
  }

  return null
}

export function buildDigitalSaldoRingkasan(cart: CartItem[]) {
  return buildDigitalSaldoUsage(cart)
    .map((item) => {
      const providerLabel = item.providers.length > 0 ? ` · ${item.providers.join(", ")}` : ""
      return `${item.saldoSourceNama}${providerLabel}: ${formatRupiah(item.totalPotong)}`
    })
    .join("")
}

export function getKasirDisplayName(struk?: Partial<StrukData> | null) {
  return String(struk?.kasirNama || "").trim() || "Tanpa Nama"
}

export function getKasirDisplayEmail(struk?: Partial<StrukData> | null) {
  return String(struk?.kasirEmail || "").trim() || "-"
}

// ─────────────────────────────────────────────────────────────────────────────
// Print Helper
// ─────────────────────────────────────────────────────────────────────────────

export function cetakStruk(struk: StrukData) {
  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Struk ${struk.nomorTransaksi}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 80mm;
      max-width: 80mm;
      padding: 8px 6px;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid { border-top: 1px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .row .label { flex: 1; }
    .row .value { text-align: right; white-space: nowrap; margin-left: 8px; }
    .item-nama { font-weight: bold; margin-bottom: 2px; }
    .item-detail { color: #444; font-size: 11px; margin-top: 1px; }
    .diskon-badge { font-size: 10px; color: #444; }
    .grand-total { font-size: 15px; font-weight: bold; }
    .footer { text-align: center; margin-top: 6px; font-size: 10px; color: #555; }
    .logo { font-size: 18px; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px; }
    .nomor { font-size: 10px; color: #555; margin-top: 2px; }
    .kembalian-row { font-size: 13px; font-weight: bold; color: #000; }
    .section-title { font-size: 10px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="center">
    <div class="logo">${struk.tokoNama}</div>
    <div class="nomor">${struk.nomorTransaksi}</div>
    <div class="nomor">${formatTanggalStruk(struk.createdAtMs)}</div>
  </div>

  <div class="divider-solid"></div>

  <div style="margin-bottom: 6px;">
    <div class="section-title">Kasir</div>
    <div class="item-detail">${getKasirDisplayName(struk)}</div>   
  </div>

  <div class="divider"></div>

  ${struk.items
    .map(
      (item) => `
    <div style="margin-bottom: 6px;">
      <div class="item-nama">${item.nama}</div>
     
    
      ${
        item.provider
          ? `<div class="item-detail">Provider: ${item.provider}</div>`
          : ""
      }
      ${
        item.jenisBarang === "digital" && item.tujuan
          ? `<div class="item-detail">${getTujuanLabel(item.subJenisDigital)}: ${item.tujuan}</div>`
          : ""
      }
      ${
        item.pakaiKodeUnik && item.kodeUnik
          ? `<div class="item-detail">${
              item.jenisKodeUnik === "imei"
                ? "IMEI"
                : item.jenisKodeUnik === "serial"
                ? "Serial"
                : "Kode Unik"
            }: ${item.kodeUnik}</div>`
          : ""
      }
      ${
        item.diskonNama
          ? `<div class="diskon-badge">🏷 ${item.diskonNama}${
              item.diskonTipe === "persen"
                ? ` (${item.diskonNilai}%)`
                : ` (-${new Intl.NumberFormat("id-ID").format(item.diskonNilai)})`
            }</div>`
          : ""
      }
      <div class="row">
        <span class="label">${item.qty} × ${new Intl.NumberFormat("id-ID").format(item.hargaSetelahDiskon)}</span>
        <span class="value">${new Intl.NumberFormat("id-ID").format(item.subtotalFinal)}</span>
      </div>
      ${
        item.totalDiskon > 0
          ? `<div class="row diskon-badge"><span class="label">Hemat</span><span class="value">-${new Intl.NumberFormat("id-ID").format(item.totalDiskon)}</span></div>`
          : ""
      }
    </div>
  `
    )
    .join("")}

  <div class="divider"></div>

  <div class="row"><span class="label">Subtotal</span><span class="value">${new Intl.NumberFormat("id-ID").format(struk.subtotal)}</span></div>
  ${struk.totalDiskon > 0 ? `<div class="row"><span class="label">Total Diskon</span><span class="value">-${new Intl.NumberFormat("id-ID").format(struk.totalDiskon)}</span></div>` : ""}
  ${struk.totalDiskon > 0 ? `<div class="row"><span class="label">Setelah Diskon</span><span class="value">${new Intl.NumberFormat("id-ID").format(struk.totalSetelahDiskon)}</span></div>` : ""}
  ${struk.biayaAdminNominal > 0 ? `<div class="row"><span class="label">Biaya Admin (${struk.biayaAdminPersen}%)</span><span class="value">${new Intl.NumberFormat("id-ID").format(struk.biayaAdminNominal)}</span></div>` : ""}

  <div class="divider-solid"></div>

  <div class="row grand-total"><span class="label">TOTAL</span><span class="value">Rp ${new Intl.NumberFormat("id-ID").format(struk.grandTotal)}</span></div>

  <div class="divider"></div>

  <div class="row"><span class="label">Metode</span><span class="value">${struk.metodePembayaranNama}${struk.metodePembayaranProvider ? " · " + struk.metodePembayaranProvider : ""}</span></div>
  <div class="row"><span class="label">Uang Bayar</span><span class="value">${new Intl.NumberFormat("id-ID").format(struk.uangBayar)}</span></div>
  <div class="row kembalian-row"><span class="label">Kembalian</span><span class="value">Rp ${new Intl.NumberFormat("id-ID").format(struk.kembalian)}</span></div>

  ${
    struk.catatan
      ? `<div class="divider"></div><div style="font-size:11px;">Catatan: ${struk.catatan}</div>`
      : ""
  }

  <div class="divider"></div>

  <div class="footer">
    <div>${struk.totalItem} item · ${struk.totalJenisBarang} jenis barang</div>
    <div style="margin-top:6px;">Terima kasih sudah berbelanja!</div>
    <div>Barang yang sudah dibeli</div>
    <div>tidak dapat dikembalikan</div>
  </div>
</body>
</html>
`

  const win = window.open("", "_blank", "width=400,height=600,scrollbars=yes")
  if (!win) {
    alert("Popup diblokir browser. Izinkan popup untuk mencetak struk.")
    return
  }

  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 400)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

export function InfoCard({
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
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-white shadow-sm">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-black text-slate-800">{value}</p>
          {subValue && (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{subValue}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function FieldLabel({ icon: Icon, label }: { icon?: any; label: string }) {
  return (
    <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
      {Icon && <Icon size={11} strokeWidth={2.5} />}
      {label}
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Struk
// ─────────────────────────────────────────────────────────────────────────────

export function ModalStruk({
  struk,
  onClose,
}: {
  struk: StrukData | null
  onClose: () => void
}) {
  if (!struk) return null

  return (
    <AnimatePresence>
      {struk && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white">
                  <Receipt size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">
                    Transaksi Berhasil
                  </p>
                  <p className="text-sm font-black text-white">{struk.nomorTransaksi}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              <div className="mb-4 text-center">
                <p className="text-base font-black text-slate-800">{struk.tokoNama}</p>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Clock size={11} strokeWidth={2.5} />
                  {formatTanggalStruk(struk.createdAtMs)}
                </div>
              </div>

              <div className="mb-4 border-t-2 border-dashed border-slate-200" />

              <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500 text-white">
                    <User2 size={15} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                      Dikonfirmasi Oleh
                    </p>
                    <p className="text-sm font-black text-slate-800">{getKasirDisplayName(struk)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <Mail size={12} strokeWidth={2.5} />
                  {getKasirDisplayEmail(struk)}
                </div>
              </div>

              <div className="space-y-3">
                {struk.items.map((item, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800">{item.nama}</p>

                        <div className="space-y-0.5">                        

                          {item.jenisBarang === "digital" && (
                            <p className="text-[10px] font-semibold text-violet-600">
                              
                              {item.provider ? ` · ${item.provider}` : ""}
                            </p>
                          )}

                          {item.jenisBarang === "digital" && item.tujuan && (
                            <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                              <Target size={10} strokeWidth={2.5} />
                              {getTujuanLabel(item.subJenisDigital)}: {item.tujuan}
                            </p>
                          )}

                          {item.pakaiKodeUnik && item.kodeUnik && (
                            <p className="text-[10px] font-semibold text-cyan-600">
                              {item.jenisKodeUnik === "imei"
                                ? "IMEI"
                                : item.jenisKodeUnik === "serial"
                                ? "Serial"
                                : "Kode Unik"}
                              : {item.kodeUnik}
                            </p>
                          )}
                        </div>

                        {item.diskonNama && (
                          <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                            🏷 {item.diskonNama}
                          </span>
                        )}
                      </div>

                      <div className="flex-shrink-0 text-right">
                        {item.totalDiskon > 0 && (
                          <p className="text-[10px] font-semibold text-slate-400 line-through">
                            {formatRupiah(item.subtotalAsli)}
                          </p>
                        )}
                        <p className="text-sm font-black text-slate-800">
                          {formatRupiah(item.subtotalFinal)}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {item.qty} × {formatRupiah(item.hargaSetelahDiskon)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="my-4 border-t-2 border-dashed border-slate-200" />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatRupiah(struk.subtotal)}</span>
                </div>

                {struk.totalDiskon > 0 && (
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-600">
                    <span>Total Diskon</span>
                    <span>- {formatRupiah(struk.totalDiskon)}</span>
                  </div>
                )}

                {struk.totalDiskon > 0 && (
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                    <span>Setelah Diskon</span>
                    <span>{formatRupiah(struk.totalSetelahDiskon)}</span>
                  </div>
                )}

                {struk.biayaAdminNominal > 0 && (
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                    <span>Biaya Admin ({struk.biayaAdminPersen}%)</span>
                    <span>{formatRupiah(struk.biayaAdminNominal)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-base font-black text-slate-800">
                  <span>Grand Total</span>
                  <span>{formatRupiah(struk.grandTotal)}</span>
                </div>

                <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                  <span>Metode</span>
                  <span>
                    {struk.metodePembayaranNama}
                    {struk.metodePembayaranProvider && ` · ${struk.metodePembayaranProvider}`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                  <span>Uang Bayar</span>
                  <span>{formatRupiah(struk.uangBayar)}</span>
                </div>

                <div className="flex items-center justify-between text-sm font-black text-emerald-600">
                  <span>Kembalian</span>
                  <span>{formatRupiah(struk.kembalian)}</span>
                </div>
              </div>

              {struk.catatan && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                  Catatan: {struk.catatan}
                </div>
              )}

              <div className="mt-4 text-center text-xs font-semibold text-slate-400">
                {struk.totalItem} item · {struk.totalJenisBarang} jenis barang
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border-2 border-slate-200 bg-white py-3 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => cetakStruk(struk)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 py-3 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-95"
              >
                <Printer size={16} strokeWidth={2.5} />
                Print Struk
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Riwayat Transaksi Panel
// ─────────────────────────────────────────────────────────────────────────────

export function RiwayatTransaksiPanel() {
  const [riwayat, setRiwayat] = useState<StrukData[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedStruk, setSelectedStruk] = useState<StrukData | null>(null)

  const fetchRiwayat = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(
        query(collection(db, "transaksi"), orderBy("createdAtMs", "desc"))
      )

      const list: StrukData[] = snap.docs.slice(0, 20).map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nomorTransaksi: x?.nomorTransaksi || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          jenisTransaksi: x?.jenisTransaksi || "fisik",
          metodePembayaranNama: x?.metodePembayaranNama || "",
          metodePembayaranTipe: x?.metodePembayaranTipe || "",
          metodePembayaranProvider: x?.metodePembayaranProvider || "",
          biayaAdminPersen: Number(x?.biayaAdminPersen || 0),
          biayaAdminNominal: Number(x?.biayaAdminNominal || 0),
          subtotal: Number(x?.subtotal || 0),
          totalDiskon: Number(x?.totalDiskon || 0),
          totalSetelahDiskon: Number(x?.totalSetelahDiskon || 0),
          grandTotal: Number(x?.grandTotal || 0),
          totalModal: Number(x?.totalModal || 0),
          estimasiLabaKotor: Number(x?.estimasiLabaKotor || 0),
          uangBayar: Number(x?.uangBayar || 0),
          kembalian: Number(x?.kembalian || 0),
          totalItem: Number(x?.totalItem || 0),
          totalJenisBarang: Number(x?.totalJenisBarang || 0),
          status: x?.status || "",
          catatan: x?.catatan || "",
          kasirUid: x?.kasirUid || x?.createdByUid || x?.uid || "",
          kasirNama: x?.kasirNama || x?.userNama || x?.nama || "",
          kasirEmail: x?.kasirEmail || x?.userEmail || x?.email || "",
          items: Array.isArray(x?.items)
            ? x.items.map((item: any) => ({
                barangId: item?.barangId || "",
                kodeBarang: item?.kodeBarang || "",
                nama: item?.nama || "",
                kategoriId: item?.kategoriId || "",
                kategoriNama: item?.kategoriNama || "",
                merk: item?.merk || "",
                satuan: item?.satuan || "",
                satuanId: item?.satuanId || "",
                satuanNama: item?.satuanNama || item?.satuan || "",
                qty: Number(item?.qty || 0),
                hargaModal: Number(item?.hargaModal || 0),
                hargaAsli: Number(item?.hargaAsli || 0),
                hargaSetelahDiskon: Number(item?.hargaSetelahDiskon || 0),
                subtotalAsli: Number(item?.subtotalAsli || 0),
                subtotalFinal: Number(item?.subtotalFinal || 0),
                totalDiskon: Number(item?.totalDiskon || 0),
                pakaiKodeUnik: Boolean(item?.pakaiKodeUnik),
                jenisKodeUnik: item?.jenisKodeUnik || "",
                kodeUnik: item?.kodeUnik || "",
                jenisBarang: item?.jenisBarang === "digital" ? "digital" : "fisik",
                subJenisDigital: item?.subJenisDigital || "",
                providerId: item?.providerId || "",
                provider: item?.provider || "",
                saldoSourceId: item?.saldoSourceId || "",
                saldoSourceNama: item?.saldoSourceNama || "",
                nominalProduk: Number(item?.nominalProduk || 0),
                tujuan: item?.tujuan || "",
                diskonId: item?.diskonId || "",
                diskonNama: item?.diskonNama || "",
                diskonTipe: item?.diskonTipe || "",
                diskonNilai: Number(item?.diskonNilai || 0),
              }))
            : [],
          createdAtMs: Number(x?.createdAtMs || 0),
        }
      })

      setRiwayat(list)
    } catch (e) {
      console.error("Gagal memuat riwayat:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void fetchRiwayat()
  }, [open])

  return (
    <>
      {selectedStruk && (
        <ModalStruk struk={selectedStruk} onClose={() => setSelectedStruk(null)} />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-sm">
              <History size={16} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-800">Riwayat Transaksi</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                20 transaksi terakhir · klik untuk print ulang
              </p>
            </div>
          </div>
          <div className="text-xs font-black text-slate-400">
            {open ? "Tutup ▲" : "Buka ▼"}
          </div>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="border-t border-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">
                    Klik transaksi untuk lihat struk & print ulang
                  </p>
                  <button
                    type="button"
                    onClick={fetchRiwayat}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50"
                  >
                    <RefreshCw
                      size={12}
                      strokeWidth={2.5}
                      className={loading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                </div>

                {loading ? (
                  <div className="py-6 text-center text-sm font-semibold text-slate-400">
                    Memuat riwayat...
                  </div>
                ) : riwayat.length === 0 ? (
                  <div className="py-6 text-center text-sm font-semibold text-slate-400">
                    Belum ada riwayat transaksi
                  </div>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {riwayat.map((trx) => (
                      <button
                        key={trx.id}
                        type="button"
                        onClick={() => setSelectedStruk(trx)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-all hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-800">
                            {trx.nomorTransaksi}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-400">
                            {trx.tokoNama} · {formatTanggalStruk(trx.createdAtMs)}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-500">
                            {trx.totalItem} item · {trx.metodePembayaranNama}
                          </p>
                          {(trx.kasirNama || trx.kasirEmail) && (
                            <p className="mt-1 text-[10px] font-semibold text-cyan-600">
                              {getKasirDisplayName(trx)}
                              {trx.kasirEmail ? ` · ${trx.kasirEmail}` : ""}
                            </p>
                          )}
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(trx.grandTotal)}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-1 text-cyan-600">
                            <Printer size={11} strokeWidth={2.5} />
                            <span className="text-[10px] font-black">Print</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}