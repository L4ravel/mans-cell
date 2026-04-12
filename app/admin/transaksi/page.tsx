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
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

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

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(collection(db, "transaksi"))
        const laporanHarianRef = doc(db, "laporan_harian", `${tanggalKey}__${selectedToko.id}`)
        const laporanBulananRef = doc(db, "laporan_bulanan", `${bulanKey}__${selectedToko.id}`)

        const itemPayload: any[] = []

        const barangReads = await Promise.all(
          cart.map(async (item) => {
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

          itemPayload.push({
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
          })

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
          biayaAdminNominal,
          subtotal,
          totalDiskon,
          totalSetelahDiskon,
          grandTotal,
          totalModal,
          estimasiLabaKotor,
          uangBayar: uangBayarNumber,
          kembalian,
          kurangBayar: 0,
          totalItem,
          totalJenisBarang,
          status: "selesai",
          catatan: catatan.trim(),
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
          omzetTambah: grandTotal,
          subtotalTambah: subtotal,
          totalDiskonTambah: totalDiskon,
          totalSetelahDiskonTambah: totalSetelahDiskon,
          totalBiayaAdminTambah: biayaAdminNominal,
          totalModalTambah: totalModal,
          totalLabaKotorTambah: estimasiLabaKotor,
          totalItemTambah: totalItem,
          totalJenisBarangTambah: totalJenisBarang,
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

      await fetchBarang()

      setCart([])
      setUangBayar("")
      setCatatan("")
      setSelectedMetodeId("")
      setSuccessMsg("Transaksi berhasil disimpan, stok diperbarui, dan laporan direkap")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal memproses transaksi")
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
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
                Scan barcode · kamera panel · checkout
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
                      {metode.nama} {metode.biayaAdmin ? `(${formatPercent(metode.biayaAdmin)})` : ""}
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
                  <p className="text-sm font-black text-slate-700">Scanner kamera belum dibuka</p>
                 
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
                          <p className="truncate text-sm font-black text-slate-800">{barang.nama}</p>
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
                        <h3 className="truncate text-sm font-black text-slate-800">{item.nama}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{item.kodeBarang}</p>
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
                  <span className="font-black text-slate-800">{formatRupiah(estimasiLabaKotor)}</span>
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
        </div>
      </div>
    </div>
  )
}