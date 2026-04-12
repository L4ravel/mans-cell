/* 
  Halaman admin transaksi kasir.
  Fitur:
  - transaksi kasir per toko
  - scanner barcode gun / keyboard global
  - scanner barcode kamera model panel
  - scan barcode yang sama tidak menambah qty
  - bunyi tit saat scan berhasil
  - diskon otomatis
  - stok keluar + mutasi stok
  - tulis laporan harian & bulanan
  - modal struk otomatis setelah transaksi berhasil
  - print struk dari modal
  - data struk dari Firestore (bukan keranjang aktif)
  - tombol print ulang di riwayat transaksi
*/

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  getDoc,
} from "firebase/firestore"
import {
  ShoppingCart,
  Search,
  Store,
  Percent,
  Wallet,
  Receipt,
  RefreshCw,
  Trash2,
  Plus,
  Minus,
  BadgeDollarSign,
  CircleDollarSign,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Layers3,
  Camera,
  ScanBarcode,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Printer,
  X,
  Clock,
  History,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

// ─── Types ────────────────────────────────────────────────────────────────────

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type Barang = {
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
  hargaModal: number
  hargaJual: number
  stok: number
  stokMinimum: number
  createdAt: number
  updatedAt?: number
}

type DiskonBarangRingkas = {
  id: string
  nama: string
  kodeBarang: string
  hargaJual: number
}

type Diskon = {
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

type MetodePembayaran = {
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

type CartItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriNama: string
  merk: string
  satuan: string
  stok: number
  qty: number
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  diskonId?: string
  diskonNama?: string
  diskonTipe?: "persen" | "nominal"
  diskonNilai?: number
}

type StrukItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriNama: string
  merk: string
  satuan: string
  qty: number
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  subtotalAsli: number
  subtotalFinal: number
  totalDiskon: number
  diskonId: string
  diskonNama: string
  diskonTipe: string
  diskonNilai: number
}

type StrukData = {
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
  items: StrukItem[]
  createdAtMs: number
}

type LaporanMetodeBreakdown = {
  nama: string
  jumlahTransaksi: number
  omzet: number
  admin: number
}

type AddToCartMode = "manual" | "scan"

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatRibuanInput(value: string) {
  if (!value) return ""
  const angka = Number(value.replace(/\D/g, "") || 0)
  if (!angka) return ""
  return new Intl.NumberFormat("id-ID").format(angka)
}

function formatPercent(value: number) {
  return `${Number(value || 0)}%`
}

function formatTanggalStruk(ms: number) {
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

function normalizeBarcode(value: string) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase()
}

function hitungHargaSetelahDiskon(
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

function getBestDiskonForBarang(barangId: string, diskonList: Diskon[]) {
  const cocok = diskonList.filter(
    (d) => d.isActive && Array.isArray(d.barangIds) && d.barangIds.includes(barangId)
  )

  if (!cocok.length) return null

  return cocok.sort((a, b) => Number(b.nilaiDiskon || 0) - Number(a.nilaiDiskon || 0))[0]
}

function getTanggalParts(nowMs: number) {
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

function mergeMetodeBreakdown(
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

function buildLaporanPayload({
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
  nowMs: number
}) {
  const jumlahTransaksiBaru = Number(existingData?.jumlahTransaksi || 0) + 1
  const omzetBaru = Number(existingData?.omzet || 0) + Number(omzetTambah || 0)
  const subtotalBaru = Number(existingData?.subtotal || 0) + Number(subtotalTambah || 0)
  const totalDiskonBaru =
    Number(existingData?.totalDiskon || 0) + Number(totalDiskonTambah || 0)
  const totalSetelahDiskonBaru =
    Number(existingData?.totalSetelahDiskon || 0) + Number(totalSetelahDiskonTambah || 0)
  const totalBiayaAdminBaru =
    Number(existingData?.totalBiayaAdmin || 0) + Number(totalBiayaAdminTambah || 0)
  const totalModalBaru =
    Number(existingData?.totalModal || 0) + Number(totalModalTambah || 0)
  const totalLabaKotorBaru =
    Number(existingData?.totalLabaKotor || 0) + Number(totalLabaKotorTambah || 0)
  const totalItemTerjualBaru =
    Number(existingData?.totalItemTerjual || 0) + Number(totalItemTambah || 0)
  const totalJenisBarangTerjualBaru =
    Number(existingData?.totalJenisBarangTerjual || 0) + Number(totalJenisBarangTambah || 0)

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
    totalItemTerjual: totalItemTerjualBaru,
    totalJenisBarangTerjual: totalJenisBarangTerjualBaru,
    rataRataBelanja: jumlahTransaksiBaru > 0 ? Math.round(omzetBaru / jumlahTransaksiBaru) : 0,
    metodePembayaranBreakdown: mergeMetodeBreakdown(
      existingData?.metodePembayaranBreakdown,
      metodeNama,
      omzetTambah,
      totalBiayaAdminTambah
    ),
    createdAt: existingData?.createdAt || serverTimestamp(),
    createdAtMs: Number(existingData?.createdAtMs || nowMs),
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
  }
}

// ─── Print Helper ─────────────────────────────────────────────────────────────

function cetakStruk(struk: StrukData) {
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
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid { border-top: 1px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; }
    .row .label { flex: 1; }
    .row .value { text-align: right; white-space: nowrap; margin-left: 8px; }
    .item-nama { font-weight: bold; margin-bottom: 2px; }
    .item-detail { color: #444; font-size: 11px; }
    .diskon-badge { font-size: 10px; color: #444; }
    .total-row { font-size: 13px; font-weight: bold; }
    .grand-total { font-size: 15px; font-weight: bold; }
    .footer { text-align: center; margin-top: 6px; font-size: 10px; color: #555; }
    .logo { font-size: 18px; font-weight: bold; letter-spacing: 1px; margin-bottom: 2px; }
    .nomor { font-size: 10px; color: #555; margin-top: 2px; }
    .kembalian-row { font-size: 13px; font-weight: bold; color: #000; }
  </style>
</head>
<body>
  <div class="center">
    <div class="logo">${struk.tokoNama}</div>
    <div class="nomor">${struk.nomorTransaksi}</div>
    <div class="nomor">${formatTanggalStruk(struk.createdAtMs)}</div>
  </div>

  <div class="divider-solid"></div>

  ${struk.items
    .map(
      (item) => `
    <div style="margin-bottom: 6px;">
      <div class="item-nama">${item.nama}</div>
      <div class="item-detail">${item.kodeBarang} · ${item.satuan}</div>
      ${item.diskonNama ? `<div class="diskon-badge">🏷 ${item.diskonNama}${item.diskonTipe === "persen" ? ` (${item.diskonNilai}%)` : ` (-${new Intl.NumberFormat("id-ID").format(item.diskonNilai)})`}</div>` : ""}
      <div class="row">
        <span class="label">${item.qty} × ${new Intl.NumberFormat("id-ID").format(item.hargaSetelahDiskon)}</span>
        <span class="value">${new Intl.NumberFormat("id-ID").format(item.subtotalFinal)}</span>
      </div>
      ${item.totalDiskon > 0 ? `<div class="row diskon-badge"><span class="label">Hemat</span><span class="value">-${new Intl.NumberFormat("id-ID").format(item.totalDiskon)}</span></div>` : ""}
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

  ${struk.catatan ? `<div class="divider"></div><div style="font-size:11px;">Catatan: ${struk.catatan}</div>` : ""}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-white shadow-sm">
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

function FieldLabel({ icon: Icon, label }: { icon?: any; label: string }) {
  return (
    <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
      {Icon ? <Icon size={11} strokeWidth={2.5} /> : null}
      {label}
    </label>
  )
}

// ─── Modal Struk ──────────────────────────────────────────────────────────────

function ModalStruk({
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
            {/* Header */}
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
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Body Struk */}
            <div className="max-h-[60vh] overflow-y-auto p-5">
              {/* Toko & waktu */}
              <div className="mb-4 text-center">
                <p className="text-base font-black text-slate-800">{struk.tokoNama}</p>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Clock size={11} strokeWidth={2.5} />
                  {formatTanggalStruk(struk.createdAtMs)}
                </div>
              </div>

              {/* Divider */}
              <div className="mb-4 border-t-2 border-dashed border-slate-200" />

              {/* Items */}
              <div className="space-y-3">
                {struk.items.map((item, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800">{item.nama}</p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {item.kodeBarang} · {item.satuan}
                        </p>
                        {item.diskonNama ? (
                          <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                            🏷 {item.diskonNama}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {item.totalDiskon > 0 ? (
                          <p className="text-[10px] font-semibold text-slate-400 line-through">
                            {formatRupiah(item.subtotalAsli)}
                          </p>
                        ) : null}
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

              {/* Divider */}
              <div className="my-4 border-t-2 border-dashed border-slate-200" />

              {/* Ringkasan */}
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
                    <span>
                      Biaya Admin ({struk.biayaAdminPersen}%)
                    </span>
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
                    {struk.metodePembayaranProvider
                      ? ` · ${struk.metodePembayaranProvider}`
                      : ""}
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

              {struk.catatan ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                  Catatan: {struk.catatan}
                </div>
              ) : null}

              <div className="mt-4 text-center text-xs font-semibold text-slate-400">
                {struk.totalItem} item · {struk.totalJenisBarang} jenis barang
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border-2 border-slate-200 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => cetakStruk(struk)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 py-3 text-sm font-black text-white shadow-sm hover:opacity-95 transition-opacity"
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

// ─── Riwayat Transaksi (mini panel) ──────────────────────────────────────────

function RiwayatTransaksiPanel() {
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
          items: Array.isArray(x?.items)
            ? x.items.map((item: any) => ({
                barangId: item?.barangId || "",
                kodeBarang: item?.kodeBarang || "",
                nama: item?.nama || "",
                kategoriNama: item?.kategoriNama || "",
                merk: item?.merk || "",
                satuan: item?.satuan || "",
                qty: Number(item?.qty || 0),
                hargaModal: Number(item?.hargaModal || 0),
                hargaAsli: Number(item?.hargaAsli || 0),
                hargaSetelahDiskon: Number(item?.hargaSetelahDiskon || 0),
                subtotalAsli: Number(item?.subtotalAsli || 0),
                subtotalFinal: Number(item?.subtotalFinal || 0),
                totalDiskon: Number(item?.totalDiskon || 0),
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
                    <RefreshCw size={12} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
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
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {riwayat.map((trx) => (
                      <button
                        key={trx.id}
                        type="button"
                        onClick={() => setSelectedStruk(trx)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:border-cyan-300 hover:bg-cyan-50 transition-all"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">
                            {trx.nomorTransaksi}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-400">
                            {trx.tokoNama} · {formatTanggalStruk(trx.createdAtMs)}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-500">
                            {trx.totalItem} item · {trx.metodePembayaranNama}
                          </p>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransaksiPage() {
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [barangList, setBarangList] = useState<Barang[]>([])
  const [diskonList, setDiskonList] = useState<Diskon[]>([])
  const [metodeList, setMetodeList] = useState<MetodePembayaran[]>([])

  const [selectedTokoId, setSelectedTokoId] = useState("")
  const [selectedMetodeId, setSelectedMetodeId] = useState("")
  const [searchBarang, setSearchBarang] = useState("")
  const [uangBayar, setUangBayar] = useState("")
  const [catatan, setCatatan] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ─ Modal struk
  const [strukModal, setStrukModal] = useState<StrukData | null>(null)

  const [cameraSupported, setCameraSupported] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStatus, setCameraStatus] = useState("Arahkan barcode ke area scan")
  const [lastCameraResult, setLastCameraResult] = useState("")

  const scanBufferRef = useRef("")
  const scanLastTimeRef = useRef(0)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraDetectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null)
  const cameraRafRef = useRef<number | null>(null)
  const cameraDetectingRef = useRef(false)
  const cameraLastDetectAtRef = useRef(0)
  const cameraCooldownUntilRef = useRef(0)

  const beepAudioContextRef = useRef<AudioContext | null>(null)

  const playSuccessBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      if (!beepAudioContextRef.current) {
        beepAudioContextRef.current = new AudioCtx()
      }

      const ctx = beepAudioContextRef.current
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()

      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(1046, ctx.currentTime)

      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11)

      oscillator.connect(gain)
      gain.connect(ctx.destination)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.12)
    } catch (e) {
      console.error("Gagal memainkan bunyi scan:", e)
    }
  }

  const fetchToko = async () => {
    const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
    const list: Toko[] = snap.docs
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
      .filter((item) => item.nama && item.aktif !== false)
    setTokoList(list)
  }

  const fetchBarang = async () => {
    const snap = await getDocs(query(collection(db, "barang"), orderBy("nama")))
    const list: Barang[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          kodeBarang: x?.kodeBarang || "",
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || "",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
          createdAt: Number(x?.createdAt || Date.now()),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
        }
      })
      .filter((item) => item.nama && item.tokoId)
    setBarangList(list)
  }

  const fetchDiskon = async () => {
    const snap = await getDocs(query(collection(db, "diskon"), orderBy("namaPromo")))
    const list: Diskon[] = snap.docs.map((d) => {
      const x = d.data() as any
      return {
        id: d.id,
        namaPromo: x?.namaPromo || "",
        tokoId: x?.tokoId || "",
        tokoNama: x?.tokoNama || "",
        tipeDiskon: x?.tipeDiskon === "nominal" ? "nominal" : "persen",
        nilaiDiskon: Number(x?.nilaiDiskon || 0),
        barangIds: Array.isArray(x?.barangIds) ? x.barangIds : [],
        barangRingkas: Array.isArray(x?.barangRingkas)
          ? x.barangRingkas.map((item: any) => ({
              id: item?.id || "",
              nama: item?.nama || "",
              kodeBarang: item?.kodeBarang || "",
              hargaJual: Number(item?.hargaJual || 0),
            }))
          : [],
        isActive: Boolean(x?.isActive),
        createdAt: Number(x?.createdAt || Date.now()),
        updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
      }
    })
    setDiskonList(list)
  }

  const fetchMetode = async () => {
    const snap = await getDocs(query(collection(db, "metode_pembayaran"), orderBy("nama")))
    const list: MetodePembayaran[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          tipe: (x?.tipe === "Non-Tunai" ? "Non-Tunai" : "Tunai") as "Tunai" | "Non-Tunai",
          provider: x?.provider || "",
          biayaAdmin: Number(x?.biayaAdmin || 0),
          nomorRekening: x?.nomorRekening || "",
          namaRekening: x?.namaRekening || "",
          aktif: Boolean(x?.aktif),
          createdAt: Number(x?.createdAt || Date.now()),
          createdBy: x?.createdBy || "",
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          updatedBy: x?.updatedBy || "",
        }
      })
      .filter((item) => item.nama && item.aktif)
    setMetodeList(list)

    const metodeTunai = list.find((item) => item.tipe === "Tunai")
if (metodeTunai) {
  setSelectedMetodeId(metodeTunai.id)
}
  }

  

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([fetchToko(), fetchBarang(), fetchDiskon(), fetchMetode()])
    } catch (e) {
      console.error(e)
      setError("Gagal memuat data transaksi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) await fetchAll()
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      !!window.BarcodeDetector &&
      !!navigator.mediaDevices?.getUserMedia

    setCameraSupported(supported)
  }, [])

  const selectedToko = useMemo(
    () => tokoList.find((t) => t.id === selectedTokoId) || null,
    [tokoList, selectedTokoId]
  )

  const selectedMetode = useMemo(
    () => metodeList.find((m) => m.id === selectedMetodeId) || null,
    [metodeList, selectedMetodeId]
  )

  const barangByToko = useMemo(() => {
    const q = searchBarang.toLowerCase().trim()
    return barangList.filter((item) => {
      const sameToko = !selectedTokoId || item.tokoId === selectedTokoId
      const matchSearch =
        !q ||
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q)
      return sameToko && matchSearch
    })
  }, [barangList, selectedTokoId, searchBarang])

  const barangBarcodeMap = useMemo(() => {
    const map = new Map<string, Barang>()
    for (const item of barangList) {
      if (!item?.id || !item?.kodeBarang) continue
      if (selectedTokoId && item.tokoId !== selectedTokoId) continue
      map.set(normalizeBarcode(item.kodeBarang), item)
    }
    return map
  }, [barangList, selectedTokoId])

  type AddToCartResult = {
    ok: boolean
    reason?: "no-store" | "out-of-stock"
    status?: "added" | "exists"
  }

  const addToCart = (
    barang: Barang,
    mode: AddToCartMode = "manual"
  ): AddToCartResult => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu")
      return { ok: false, reason: "no-store" }
    }

    if (barang.stok <= 0) {
      setError("Stok barang habis")
      return { ok: false, reason: "out-of-stock" }
    }

    setError(null)

    let status: "added" | "exists" = "added"

    setCart((prev) => {
      const found = prev.find((item) => item.barangId === barang.id)
      const diskon = getBestDiskonForBarang(
        barang.id,
        diskonList.filter((d) => d.tokoId === barang.tokoId && d.isActive)
      )
      const hargaSetelahDiskon = hitungHargaSetelahDiskon(
        barang.hargaJual,
        diskon?.tipeDiskon,
        diskon?.nilaiDiskon
      )

      if (found) {
        status = "exists"

        if (mode === "scan") {
          return prev.map((item) =>
            item.barangId === barang.id
              ? {
                  ...item,
                  stok: barang.stok,
                  hargaModal: barang.hargaModal,
                  hargaAsli: barang.hargaJual,
                  hargaSetelahDiskon,
                  diskonId: diskon?.id,
                  diskonNama: diskon?.namaPromo,
                  diskonTipe: diskon?.tipeDiskon,
                  diskonNilai: diskon?.nilaiDiskon,
                }
              : item
          )
        }

        const nextQty = found.qty + 1
        if (nextQty > barang.stok) return prev

        return prev.map((item) =>
          item.barangId === barang.id
            ? {
                ...item,
                qty: nextQty,
                stok: barang.stok,
                hargaModal: barang.hargaModal,
                hargaAsli: barang.hargaJual,
                hargaSetelahDiskon,
                diskonId: diskon?.id,
                diskonNama: diskon?.namaPromo,
                diskonTipe: diskon?.tipeDiskon,
                diskonNilai: diskon?.nilaiDiskon,
              }
            : item
        )
      }

      return [
        ...prev,
        {
          barangId: barang.id,
          kodeBarang: barang.kodeBarang,
          nama: barang.nama,
          kategoriNama: barang.kategoriNama,
          merk: barang.merk,
          satuan: barang.satuan,
          stok: barang.stok,
          qty: 1,
          hargaModal: barang.hargaModal,
          hargaAsli: barang.hargaJual,
          hargaSetelahDiskon,
          diskonId: diskon?.id,
          diskonNama: diskon?.namaPromo,
          diskonTipe: diskon?.tipeDiskon,
          diskonNilai: diskon?.nilaiDiskon,
        },
      ]
    })

    return { ok: true, status }
  }

  const commitBarcodeValue = (rawValue: string, source: "scanner" | "camera") => {
    const kode = normalizeBarcode(rawValue)
    if (!kode) return { ok: false }

    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu sebelum scan barcode")
      setTimeout(() => setError(null), 1800)
      return { ok: false }
    }

    const found = barangBarcodeMap.get(kode)

    if (!found) {
      setError(`Barcode ${kode} tidak ditemukan di toko ini`)
      setTimeout(() => setError(null), 1800)
      return { ok: false }
    }

    if (Number(found.stok || 0) <= 0) {
      setError(`Stok ${found.nama} habis`)
      setTimeout(() => setError(null), 1800)
      return { ok: false }
    }

    const result = addToCart(found, "scan")
    if (!result.ok) return { ok: false }

    playSuccessBeep()

    const status = result.status ?? "added"

    if (status === "exists") {
      setSuccessMsg(
        `${source === "camera" ? "Scan kamera" : "Scan"} berhasil: ${found.nama} sudah ada di keranjang`
      )
    } else {
      setSuccessMsg(
        `${source === "camera" ? "Scan kamera" : "Scan"} berhasil: ${found.nama}`
      )
    }

    setTimeout(() => setSuccessMsg(null), 1400)

    return { ok: true, status }
  }

  useEffect(() => {
    const resetScanBuffer = () => {
      scanBufferRef.current = ""
      scanLastTimeRef.current = 0
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
    }

    const commitScan = () => {
      const raw = scanBufferRef.current
      resetScanBuffer()
      commitBarcodeValue(raw, "scanner")
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return

      const now = Date.now()
      const diff = now - scanLastTimeRef.current

      if (diff > 120) {
        scanBufferRef.current = ""
      }

      scanLastTimeRef.current = now

      if (e.key === "Enter") {
        if (scanBufferRef.current.length >= 3) {
          e.preventDefault()
          commitScan()
        } else {
          resetScanBuffer()
        }
        return
      }

      if (e.key === "Shift" || e.key === "CapsLock" || e.key === "Tab") return
      if (e.key === "Backspace") {
        scanBufferRef.current = scanBufferRef.current.slice(0, -1)
        return
      }

      if (e.key.length === 1) {
        scanBufferRef.current += e.key

        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)

        scanTimeoutRef.current = setTimeout(() => {
          if (scanBufferRef.current.length >= 6) {
            commitScan()
          } else {
            resetScanBuffer()
          }
        }, 80)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      resetScanBuffer()
    }
  }, [barangBarcodeMap, selectedTokoId])

  const stopCameraScanner = () => {
    if (cameraRafRef.current) {
      cancelAnimationFrame(cameraRafRef.current)
      cameraRafRef.current = null
    }

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }

    cameraDetectorRef.current = null
    cameraDetectingRef.current = false
    setCameraActive(false)
    setCameraLoading(false)
    setCameraStatus("Arahkan barcode ke area scan")
  }

  const startCameraLoop = () => {
    const loop = async () => {
      const video = videoRef.current

      if (!video || !cameraDetectorRef.current || !cameraStreamRef.current) return

      const now = Date.now()

      if (
        !cameraDetectingRef.current &&
        now - cameraLastDetectAtRef.current >= 220 &&
        now >= cameraCooldownUntilRef.current &&
        video.readyState >= 2
      ) {
        cameraDetectingRef.current = true
        cameraLastDetectAtRef.current = now

        try {
          const results = await cameraDetectorRef.current.detect(video)

          if (Array.isArray(results) && results.length > 0) {
            const rawValue = normalizeBarcode(results[0]?.rawValue || "")

            if (rawValue) {
              setLastCameraResult(rawValue)
              setCameraStatus(`Terdeteksi: ${rawValue}`)

              const result = commitBarcodeValue(rawValue, "camera")
              if (result.ok) {
                cameraCooldownUntilRef.current = Date.now() + 1200
                if ("vibrate" in navigator) {
                  navigator.vibrate?.(100)
                }
              }
            }
          }
        } catch (error) {
          console.error("Gagal mendeteksi barcode kamera:", error)
        } finally {
          cameraDetectingRef.current = false
        }
      }

      cameraRafRef.current = requestAnimationFrame(loop)
    }

    cameraRafRef.current = requestAnimationFrame(loop)
  }

  const startCameraScanner = async () => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu sebelum membuka kamera")
      return
    }

    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false)
      setError("Browser ini belum mendukung scan barcode kamera")
      return
    }

    try {
      setCameraLoading(true)
      setError(null)
      setCameraStatus("Menyalakan kamera...")

      const supportedFormats = window.BarcodeDetector.getSupportedFormats
        ? await window.BarcodeDetector.getSupportedFormats()
        : []

      const preferredFormats = [
        "code_128",
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "code_39",
        "codabar",
        "itf",
      ]

      const finalFormats =
        supportedFormats.length > 0
          ? preferredFormats.filter((item) => supportedFormats.includes(item))
          : preferredFormats

      cameraDetectorRef.current = new window.BarcodeDetector({
        formats: finalFormats.length > 0 ? finalFormats : undefined,
      })

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      cameraStreamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraActive(true)
      setCameraStatus("Arahkan barcode ke area scan")
      startCameraLoop()
    } catch (error) {
      console.error(error)
      setError("Gagal membuka kamera. Pastikan izin kamera diberikan.")
      stopCameraScanner()
    } finally {
      setCameraLoading(false)
    }
  }

  useEffect(() => {
    if (cameraOpen) {
      void startCameraScanner()
    } else {
      stopCameraScanner()
    }

    return () => {
      stopCameraScanner()
    }
  }, [cameraOpen])

  useEffect(() => {
    return () => {
      stopCameraScanner()
      beepAudioContextRef.current?.close?.()
    }
  }, [])

  const updateQty = (barangId: string, mode: "plus" | "minus") => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.barangId !== barangId) return item
          const nextQty = mode === "plus" ? item.qty + 1 : item.qty - 1
          if (nextQty > item.stok) return item
          return { ...item, qty: nextQty }
        })
        .filter((item) => item.qty > 0)
    )
  }

  const removeItem = (barangId: string) => {
    setCart((prev) => prev.filter((item) => item.barangId !== barangId))
  }

  const clearCart = () => {
    setCart([])
    setUangBayar("")
    setCatatan("")
    setSuccessMsg("Keranjang dikosongkan")
    setTimeout(() => setSuccessMsg(null), 2000)
  }

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaAsli * item.qty, 0),
    [cart]
  )

  const totalSetelahDiskon = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaSetelahDiskon * item.qty, 0),
    [cart]
  )

  const totalDiskon = useMemo(() => subtotal - totalSetelahDiskon, [subtotal, totalSetelahDiskon])

  const biayaAdminNominal = useMemo(() => {
    const persen = Number(selectedMetode?.biayaAdmin || 0)
    if (!selectedMetode || selectedMetode.tipe === "Tunai" || persen <= 0) return 0
    return Math.round(totalSetelahDiskon * (persen / 100))
  }, [selectedMetode, totalSetelahDiskon])

  const grandTotal = useMemo(
    () => totalSetelahDiskon + biayaAdminNominal,
    [totalSetelahDiskon, biayaAdminNominal]
  )

  const totalModal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaModal * item.qty, 0),
    [cart]
  )

  const estimasiLabaKotor = useMemo(
    () => totalSetelahDiskon - totalModal - biayaAdminNominal,
    [totalSetelahDiskon, totalModal, biayaAdminNominal]
  )

  const uangBayarNumber = Number(uangBayar.replace(/\D/g, "") || 0)
  const kembalian = Math.max(0, uangBayarNumber - grandTotal)
  const kurangBayar = Math.max(0, grandTotal - uangBayarNumber)

  const totalItem = useMemo(() => cart.reduce((acc, item) => acc + item.qty, 0), [cart])
  const totalJenisBarang = cart.length

  const isBisaCheckout =
    !!selectedTokoId &&
    !!selectedMetodeId &&
    cart.length > 0 &&
    uangBayarNumber >= grandTotal &&
    !submitLoading

  const handleProsesTransaksi = async () => {
    const user = auth.currentUser

    if (!user) {
      setError("Sesi login tidak ditemukan")
      return
    }
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu")
      return
    }
    if (!selectedMetodeId) {
      setError("Pilih metode pembayaran terlebih dahulu")
      return
    }
    if (cart.length === 0) {
      setError("Keranjang masih kosong")
      return
    }
    if (uangBayarNumber < grandTotal) {
      setError("Uang bayar masih kurang")
      return
    }
    if (!selectedToko) {
      setError("Data toko tidak ditemukan")
      return
    }
    if (!selectedMetode) {
      setError("Data metode pembayaran tidak ditemukan")
      return
    }

    setSubmitLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const nowMs = Date.now()
      const nomorTransaksi = `TRX-${nowMs}`
      const { tahun, bulan, hari, tanggalKey, bulanKey } = getTanggalParts(nowMs)

      // Simpan snapshot keranjang sebelum di-clear
      const cartSnapshot = [...cart]
      const grandTotalSnapshot = grandTotal
      const subtotalSnapshot = subtotal
      const totalDiskonSnapshot = totalDiskon
      const totalSetelahDiskonSnapshot = totalSetelahDiskon
      const biayaAdminNominalSnapshot = biayaAdminNominal
      const totalModalSnapshot = totalModal
      const estimasiLabaKotorSnapshot = estimasiLabaKotor
      const uangBayarSnapshot = uangBayarNumber
      const kembalianSnapshot = kembalian
      const totalItemSnapshot = totalItem
      const totalJenisBarangSnapshot = totalJenisBarang
      const catatanSnapshot = catatan.trim()

      let savedTransaksiId = ""
      const itemPayload: any[] = []

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(collection(db, "transaksi"))
        savedTransaksiId = transaksiRef.id

        const laporanHarianRef = doc(db, "laporan_harian", `${tanggalKey}__${selectedToko.id}`)
        const laporanBulananRef = doc(db, "laporan_bulanan", `${bulanKey}__${selectedToko.id}`)

        const barangReads = await Promise.all(
          cartSnapshot.map(async (item) => {
            const barangRef = doc(db, "barang", item.barangId)
            const barangSnap = await transaction.get(barangRef)

            if (!barangSnap.exists()) throw new Error(`Barang ${item.nama} tidak ditemukan`)

            const barangDb = barangSnap.data() as any
            const stokSekarang = Number(barangDb?.stok || 0)

            if (stokSekarang < item.qty) throw new Error(`Stok ${item.nama} tidak cukup`)

            return { item, barangRef, stokSekarang, stokSesudah: stokSekarang - item.qty }
          })
        )

        const laporanHarianSnap = await transaction.get(laporanHarianRef)
        const laporanBulananSnap = await transaction.get(laporanBulananRef)

        const laporanHarianData = laporanHarianSnap.exists() ? laporanHarianSnap.data() : null
        const laporanBulananData = laporanBulananSnap.exists() ? laporanBulananSnap.data() : null

        for (const row of barangReads) {
          const { item, barangRef, stokSekarang, stokSesudah } = row

          transaction.update(barangRef, {
            stok: stokSesudah,
            updatedAt: nowMs,
            updatedBy: user.uid,
          })

          const subtotalAsliItem = item.hargaAsli * item.qty
          const subtotalFinalItem = item.hargaSetelahDiskon * item.qty
          const totalDiskonItem = subtotalAsliItem - subtotalFinalItem

          const itemRow = {
            barangId: item.barangId,
            kodeBarang: item.kodeBarang,
            nama: item.nama,
            kategoriNama: item.kategoriNama,
            merk: item.merk,
            satuan: item.satuan,
            qty: item.qty,
            hargaModal: item.hargaModal,
            hargaAsli: item.hargaAsli,
            hargaSetelahDiskon: item.hargaSetelahDiskon,
            subtotalAsli: subtotalAsliItem,
            subtotalFinal: subtotalFinalItem,
            totalDiskon: totalDiskonItem,
            diskonId: item.diskonId || "",
            diskonNama: item.diskonNama || "",
            diskonTipe: item.diskonTipe || "",
            diskonNilai: Number(item.diskonNilai || 0),
          }

          itemPayload.push(itemRow)

          const mutasiRef = doc(collection(db, "mutasi_stok"))
          transaction.set(mutasiRef, {
            id: mutasiRef.id,
            transaksiId: transaksiRef.id,
            nomorTransaksi,
            tipe: "keluar",
            sumber: "transaksi",
            tokoId: selectedToko.id,
            tokoNama: selectedToko.nama,
            barangId: item.barangId,
            kodeBarang: item.kodeBarang,
            namaBarang: item.nama,
            qty: item.qty,
            stokSebelum: stokSekarang,
            stokSesudah,
            keterangan: `Penjualan kasir ${nomorTransaksi}`,
            createdAt: serverTimestamp(),
            createdAtMs: nowMs,
            createdBy: user.uid,
          })
        }

        transaction.set(transaksiRef, {
          id: transaksiRef.id,
          nomorTransaksi,
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
          metodePembayaranId: selectedMetode.id,
          metodePembayaranNama: selectedMetode.nama,
          metodePembayaranTipe: selectedMetode.tipe,
          metodePembayaranProvider: selectedMetode.provider || "",
          biayaAdminPersen: Number(selectedMetode.biayaAdmin || 0),
          biayaAdminNominal: biayaAdminNominalSnapshot,
          subtotal: subtotalSnapshot,
          totalDiskon: totalDiskonSnapshot,
          totalSetelahDiskon: totalSetelahDiskonSnapshot,
          grandTotal: grandTotalSnapshot,
          totalModal: totalModalSnapshot,
          estimasiLabaKotor: estimasiLabaKotorSnapshot,
          uangBayar: uangBayarSnapshot,
          kembalian: kembalianSnapshot,
          kurangBayar: 0,
          totalItem: totalItemSnapshot,
          totalJenisBarang: totalJenisBarangSnapshot,
          status: "selesai",
          catatan: catatanSnapshot,
          items: itemPayload,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedAtMs: nowMs,
        })

        const sharedLaporanArgs = {
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
          metodeNama: selectedMetode.nama,
          omzetTambah: grandTotalSnapshot,
          subtotalTambah: subtotalSnapshot,
          totalDiskonTambah: totalDiskonSnapshot,
          totalSetelahDiskonTambah: totalSetelahDiskonSnapshot,
          totalBiayaAdminTambah: biayaAdminNominalSnapshot,
          totalModalTambah: totalModalSnapshot,
          totalLabaKotorTambah: estimasiLabaKotorSnapshot,
          totalItemTambah: totalItemSnapshot,
          totalJenisBarangTambah: totalJenisBarangSnapshot,
          nowMs,
        }

        const payloadHarian = buildLaporanPayload({
          existingData: laporanHarianData,
          id: laporanHarianRef.id,
          periodeKey: tanggalKey,
          tahun,
          bulan,
          hari,
          ...sharedLaporanArgs,
        })

        const payloadBulanan = buildLaporanPayload({
          existingData: laporanBulananData,
          id: laporanBulananRef.id,
          periodeKey: bulanKey,
          tahun,
          bulan,
          ...sharedLaporanArgs,
        })

        transaction.set(laporanHarianRef, payloadHarian)
        transaction.set(laporanBulananRef, payloadBulanan)
      })

      // Ambil data transaksi dari Firestore (bukan dari keranjang aktif)
      const savedSnap = await getDoc(doc(db, "transaksi", savedTransaksiId))
      if (savedSnap.exists()) {
        const x = savedSnap.data() as any
        const strukFromFirestore: StrukData = {
          id: savedSnap.id,
          nomorTransaksi: x?.nomorTransaksi || nomorTransaksi,
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || selectedToko.nama,
          metodePembayaranNama: x?.metodePembayaranNama || selectedMetode.nama,
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
          items: Array.isArray(x?.items)
            ? x.items.map((item: any) => ({
                barangId: item?.barangId || "",
                kodeBarang: item?.kodeBarang || "",
                nama: item?.nama || "",
                kategoriNama: item?.kategoriNama || "",
                merk: item?.merk || "",
                satuan: item?.satuan || "",
                qty: Number(item?.qty || 0),
                hargaModal: Number(item?.hargaModal || 0),
                hargaAsli: Number(item?.hargaAsli || 0),
                hargaSetelahDiskon: Number(item?.hargaSetelahDiskon || 0),
                subtotalAsli: Number(item?.subtotalAsli || 0),
                subtotalFinal: Number(item?.subtotalFinal || 0),
                totalDiskon: Number(item?.totalDiskon || 0),
                diskonId: item?.diskonId || "",
                diskonNama: item?.diskonNama || "",
                diskonTipe: item?.diskonTipe || "",
                diskonNilai: Number(item?.diskonNilai || 0),
              }))
            : itemPayload,
          createdAtMs: Number(x?.createdAtMs || nowMs),
        }

        setStrukModal(strukFromFirestore)
      }

      await fetchBarang()

      setCart([])
      setUangBayar("")
      setCatatan("")
      setSelectedMetodeId("")
      setSuccessMsg("Transaksi berhasil! Struk siap dicetak.")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal memproses transaksi")
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <>
      {/* Modal Struk otomatis */}
      <ModalStruk struk={strukModal} onClose={() => setStrukModal(null)} />

      <div className="space-y-4 text-slate-900 sm:space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50">
                <ShoppingCart size={24} className="text-white" strokeWidth={2.5} />
              </div>

              <div>
                <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                  Transaksi Kasir
                </h1>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Scan barcode · kamera panel · checkout · print struk
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={fetchAll}
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <RefreshCw size={14} strokeWidth={2.5} />
                Refresh
              </button>

              <button
                type="button"
                onClick={() => setCameraOpen((prev) => !prev)}
                className="flex h-10 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-black uppercase tracking-wide text-cyan-700 shadow-sm hover:bg-cyan-100"
              >
                <Camera size={14} strokeWidth={2.5} />
                {cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
              </button>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            icon={Boxes}
            label="Jenis Barang"
            value={String(barangByToko.length)}
            subValue={selectedToko?.nama || "Semua toko"}
          />
          <InfoCard
            icon={Layers3}
            label="Isi Keranjang"
            value={String(totalItem)}
            subValue={`${totalJenisBarang} jenis barang`}
          />
          <InfoCard
            icon={Percent}
            label="Total Diskon"
            value={formatRupiah(totalDiskon)}
            subValue="Otomatis dari promo aktif"
          />
          <InfoCard
            icon={CircleDollarSign}
            label="Grand Total"
            value={formatRupiah(grandTotal)}
            subValue={selectedMetode ? selectedMetode.nama : "Pilih metode pembayaran"}
          />
        </div>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              <div className="flex items-start gap-2">
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {successMsg ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
            >
              <div className="flex items-start gap-2">
                <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="grid gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel icon={Store} label="Pilih Toko" />
                  <select
                    value={selectedTokoId}
                    onChange={(e) => setSelectedTokoId(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  >
                    <option value="">Pilih toko</option>
                    {tokoList.map((toko) => (
                      <option key={toko.id} value={toko.id}>
                        {toko.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel icon={Wallet} label="Metode Pembayaran" />
                  <select
                    value={selectedMetodeId}
                    onChange={(e) => setSelectedMetodeId(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  >
                    <option value="">Pilih metode pembayaran</option>
                    {metodeList.map((metode) => (
                      <option key={metode.id} value={metode.id}>
                        {metode.nama}{" "}
                        {metode.biayaAdmin ? `(${formatPercent(metode.biayaAdmin)})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel icon={Search} label="Cari Barang / Barcode / Merk" />
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={searchBarang}
                    onChange={(e) => setSearchBarang(e.target.value)}
                    placeholder="Cari nama barang, barcode, merk..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {cameraOpen ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                      Panel Scanner Kamera
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Kamera tetap tampil di halaman, tidak menutupi keranjang
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraOpen(false)}
                      className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                    >
                      <PauseCircle size={15} strokeWidth={2.5} />
                      Tutup
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        stopCameraScanner()
                        void startCameraScanner()
                      }}
                      className="flex h-10 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-xs font-black uppercase tracking-wide text-cyan-700 hover:bg-cyan-100"
                    >
                      <RotateCcw size={15} strokeWidth={2.5} />
                      Restart
                    </button>
                  </div>
                </div>

                {!cameraSupported ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                    Browser ini belum mendukung scan barcode kamera.
                  </div>
                ) : (
                  <>
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="aspect-video w-full object-cover"
                      />

                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-24 w-[78%] rounded-2xl border-2 border-cyan-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
                      </div>

                      {cameraLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
                          <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-3 text-sm font-black text-white">
                            <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                            Menyalakan kamera...
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Status
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-800">{cameraStatus}</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Hasil Terakhir
                        </p>
                        <p className="mt-2 break-all text-sm font-bold text-cyan-700">
                          {lastCameraResult || "-"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Kamera
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-800">
                          {cameraActive ? "Aktif" : "Tidak aktif"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-700">
                      Scanner kamera belum dibuka
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="flex h-10 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-black uppercase tracking-wide text-cyan-700 hover:bg-cyan-100"
                  >
                    <PlayCircle size={15} strokeWidth={2.5} />
                    Aktifkan Kamera
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                    Daftar Barang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Klik tambah atau scan barcode untuk masuk ke keranjang
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  {barangByToko.length} barang
                </span>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Memuat data barang...
                </div>
              ) : !selectedTokoId ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Pilih toko terlebih dahulu
                </div>
              ) : barangByToko.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Barang tidak ditemukan
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {barangByToko.map((barang) => {
                    const diskon = getBestDiskonForBarang(
                      barang.id,
                      diskonList.filter((d) => d.tokoId === barang.tokoId && d.isActive)
                    )
                    const hargaPromo = hitungHargaSetelahDiskon(
                      barang.hargaJual,
                      diskon?.tipeDiskon,
                      diskon?.nilaiDiskon
                    )
                    const isOutStock = barang.stok <= 0

                    return (
                      <motion.div
                        key={barang.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-cyan-300 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">
                              {barang.nama}
                            </p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {barang.kodeBarang || "-"} · {barang.kategoriNama || "-"}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {barang.merk || "-"} · stok {barang.stok}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => addToCart(barang, "manual")}
                            disabled={isOutStock || submitLoading}
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus size={16} strokeWidth={3} />
                          </button>
                        </div>

                        <div className="mt-3">
                          {diskon ? (
                            <>
                              <p className="text-xs font-bold text-slate-400 line-through">
                                {formatRupiah(barang.hargaJual)}
                              </p>
                              <p className="text-base font-black text-emerald-600">
                                {formatRupiah(hargaPromo)}
                              </p>
                            </>
                          ) : (
                            <p className="text-base font-black text-slate-800">
                              {formatRupiah(barang.hargaJual)}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                    Keranjang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Scan yang sama tidak akan menambah qty otomatis
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearCart}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                >
                  Kosongkan
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  Keranjang masih kosong
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.barangId}
                      className="rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black text-slate-800">
                            {item.nama}
                          </h3>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {item.kodeBarang}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {item.merk || "-"} · {item.satuan || "-"}
                          </p>

                          {item.diskonNama ? (
                            <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                              {item.diskonNama}
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.barangId)}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <Trash2 size={15} strokeWidth={2.5} />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQty(item.barangId, "minus")}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>

                          <div className="min-w-[44px] text-center text-sm font-black text-slate-800">
                            {item.qty}
                          </div>

                          <button
                            type="button"
                            onClick={() => updateQty(item.barangId, "plus")}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>

                        <div className="text-right">
                          {item.hargaAsli !== item.hargaSetelahDiskon ? (
                            <p className="text-xs font-bold text-slate-400 line-through">
                              {formatRupiah(item.hargaAsli * item.qty)}
                            </p>
                          ) : null}
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.hargaSetelahDiskon * item.qty)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                Ringkasan Pembayaran
              </h2>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                  <span>Total Diskon</span>
                  <span className="text-emerald-600">- {formatRupiah(totalDiskon)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                  <span>Setelah Diskon</span>
                  <span>{formatRupiah(totalSetelahDiskon)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                  <span>Biaya Admin</span>
                  <span>{formatRupiah(biayaAdminNominal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-base font-black text-slate-800">
                  <span>Grand Total</span>
                  <span>{formatRupiah(grandTotal)}</span>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <FieldLabel icon={BadgeDollarSign} label="Uang Bayar" />
                  <input
                    value={uangBayar}
                    onChange={(e) => setUangBayar(formatRibuanInput(e.target.value))}
                    inputMode="numeric"
                    placeholder="Masukkan uang bayar"
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <FieldLabel icon={Receipt} label="Catatan" />
                  <textarea
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Catatan transaksi..."
                    rows={3}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  />
                </div>

                <div className="grid gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Kembalian</span>
                    <span className="font-black text-emerald-600">{formatRupiah(kembalian)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Kurang Bayar</span>
                    <span className="font-black text-red-600">{formatRupiah(kurangBayar)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Estimasi Laba Kotor</span>
                    <span className="font-black text-slate-800">
                      {formatRupiah(estimasiLabaKotor)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!isBisaCheckout}
                  onClick={handleProsesTransaksi}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Receipt size={16} strokeWidth={2.5} />
                      Proses Transaksi
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Panel Riwayat & Print Ulang */}
            <RiwayatTransaksiPanel />
          </div>
        </div>
      </div>
    </>
  )
}