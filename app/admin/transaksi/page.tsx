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
  Smartphone,
  Wifi,
  Zap,
  Ticket,
  Gamepad2,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  type Toko,
  type Barang,
  type Diskon,
  type MetodePembayaran,
  type CartItem,
  type StrukData,
  type StrukItem,
  type LaporanKategoriBreakdown,
  type MasterSaldoDigital,
  type DigitalSaldoUsage,
  type AddToCartMode,
  formatRupiah,
  formatRibuanInput,
  formatPercent,
  formatTanggalStruk,
  normalizeBarcode,
  hitungHargaSetelahDiskon,
  getBestDiskonForBarang,
  getTanggalParts,
  buildLaporanPayload,
  formatJenisBarangLabel,
  formatSubJenisDigitalLabel,
  getDigitalIcon,
  digitalButuhTujuan,
  getTujuanLabel,
  buildDigitalSaldoUsage,
  validateDigitalSaldoUsage,
  buildDigitalSaldoRingkasan,
  InfoCard,
  FieldLabel,
  ModalStruk,
  RiwayatTransaksiPanel,
} from "@/lib/transaksi/route"


export default function TransaksiPage() {
  // ── State ──────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [barangList, setBarangList] = useState<Barang[]>([])
  const [diskonList, setDiskonList] = useState<Diskon[]>([])
  const [metodeList, setMetodeList] = useState<MetodePembayaran[]>([])
  const [saldoList, setSaldoList] = useState<MasterSaldoDigital[]>([])

  const [selectedTokoId, setSelectedTokoId] = useState("")
  const [selectedMetodeId, setSelectedMetodeId] = useState("")
  const [searchBarang, setSearchBarang] = useState("")
  const [uangBayar, setUangBayar] = useState("")
  const [catatan, setCatatan] = useState("")
  const [activeTab, setActiveTab] = useState<"fisik" | "digital">("fisik")
  const [cartFisik, setCartFisik] = useState<CartItem[]>([])
  const [cartDigital, setCartDigital] = useState<CartItem[]>([])

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [strukModal, setStrukModal] = useState<StrukData | null>(null)

  // Camera state
  const [cameraSupported, setCameraSupported] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStatus, setCameraStatus] = useState("Arahkan barcode ke area scan")
  const [lastCameraResult, setLastCameraResult] = useState("")

  // ── Refs ───────────────────────────────────────────────────────────────────

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


  // ── Audio ──────────────────────────────────────────────────────────────────

  const playSuccessBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      if (!beepAudioContextRef.current) beepAudioContextRef.current = new AudioCtx()
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


  // ── Fetch Functions ────────────────────────────────────────────────────────

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
          pakaiKodeUnik: Boolean(x?.pakaiKodeUnik),
          jenisKodeUnik: x?.jenisKodeUnik || "",
          kodeUnik: x?.kodeUnik || "",
          jenisBarang: (x?.jenisBarang || "fisik") as "fisik" | "digital",
          subJenisDigital: x?.subJenisDigital || "",
          providerId: x?.providerId || "",
          provider: x?.provider || "",
          saldoSourceId: x?.saldoSourceId || "",
          saldoSourceNama: x?.saldoSourceNama || "",
          nominalProduk: Number(x?.nominalProduk || 0),
          aktif: x?.aktif !== false,
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
    if (metodeTunai) setSelectedMetodeId((prev) => prev || metodeTunai.id)
  }


  const fetchSaldo = async () => {
    const snap = await getDocs(query(collection(db, "master_saldo_digital"), orderBy("namaSaldo")))
    const list: MasterSaldoDigital[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          namaSaldo: x?.namaSaldo || "",
          jumlahSaldo: Number(x?.jumlahSaldo || 0),
          aktif: x?.aktif !== false,
          keterangan: x?.keterangan || "",
          createdAt:
            typeof x?.createdAt?.toMillis === "function"
              ? x.createdAt.toMillis()
              : Number(x?.createdAt || 0),
          updatedAt:
            typeof x?.updatedAt?.toMillis === "function"
              ? x.updatedAt.toMillis()
              : Number(x?.updatedAt || 0),
        }
      })
      .filter((item) => item.namaSaldo)
    setSaldoList(list)
  }

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([fetchToko(), fetchBarang(), fetchDiskon(), fetchMetode(), fetchSaldo()])
    } catch (e) {
      console.error(e)
      setError("Gagal memuat data transaksi")
    } finally {
      setLoading(false)
    }
  }


  // ── Effects ────────────────────────────────────────────────────────────────

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


  // ── Derived / Memos ────────────────────────────────────────────────────────

  const selectedToko = useMemo(
    () => tokoList.find((t) => t.id === selectedTokoId) || null,
    [tokoList, selectedTokoId]
  )
  const selectedMetode = useMemo(
    () => metodeList.find((m) => m.id === selectedMetodeId) || null,
    [metodeList, selectedMetodeId]
  )
  const metodeTunaiDefault = useMemo(
    () => metodeList.find((m) => m.tipe === "Tunai") || null,
    [metodeList]
  )

  const cart = activeTab === "fisik" ? cartFisik : cartDigital
  const setCart = activeTab === "fisik" ? setCartFisik : setCartDigital

  const barangByToko = useMemo(() => {
    const q = searchBarang.toLowerCase().trim()
    return barangList.filter((item) => {
      const sameToko = !selectedTokoId || item.tokoId === selectedTokoId
      const sameJenis = (item.jenisBarang || "fisik") === activeTab
      const matchSearch =
        !q ||
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        String(item.provider || "").toLowerCase().includes(q)
      if (!sameToko || !sameJenis || !matchSearch) return false
      if (activeTab === "digital") return item.aktif !== false
      return true
    })
  }, [barangList, selectedTokoId, searchBarang, activeTab])

  const barangBarcodeMap = useMemo(() => {
    const map = new Map<string, Barang>()
    for (const item of barangList) {
      if (!item?.id || !item?.kodeBarang) continue
      if ((item.jenisBarang || "fisik") !== "fisik") continue
      if (selectedTokoId && item.tokoId !== selectedTokoId) continue
      map.set(normalizeBarcode(item.kodeBarang), item)
    }
    return map
  }, [barangList, selectedTokoId])


  // ── Cart Actions ───────────────────────────────────────────────────────────

  type AddToCartResult = {
    ok: boolean
    reason?: "no-store" | "out-of-stock"
    status?: "added" | "exists"
  }

  const addToCart = (barang: Barang, mode: AddToCartMode = "manual"): AddToCartResult => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu")
      return { ok: false, reason: "no-store" }
    }

    const jenisBarang = (barang.jenisBarang || "fisik") as "fisik" | "digital"
    if (jenisBarang === "fisik" && barang.stok <= 0) {
      setError("Stok barang habis")
      return { ok: false, reason: "out-of-stock" }
    }

    setError(null)
    let status: "added" | "exists" = "added"
    const targetSetter = jenisBarang === "fisik" ? setCartFisik : setCartDigital

    targetSetter((prev) => {
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
                  pakaiKodeUnik: barang.pakaiKodeUnik,
                  jenisKodeUnik: barang.jenisKodeUnik || "",
                  kodeUnik: barang.kodeUnik || "",
                  providerId: barang.providerId || "",
                  provider: barang.provider || "",
                  saldoSourceId: barang.saldoSourceId || "",
                  saldoSourceNama: barang.saldoSourceNama || "",
                  nominalProduk: Number(barang.nominalProduk || 0),
                  diskonId: diskon?.id,
                  diskonNama: diskon?.namaPromo,
                  diskonTipe: diskon?.tipeDiskon,
                  diskonNilai: diskon?.nilaiDiskon,
                }
              : item
          )
        }
        const nextQty = found.qty + 1
        if (jenisBarang === "fisik" && nextQty > barang.stok) return prev
        return prev.map((item) =>
          item.barangId === barang.id
            ? {
                ...item,
                qty: nextQty,
                stok: barang.stok,
                hargaModal: barang.hargaModal,
                hargaAsli: barang.hargaJual,
                hargaSetelahDiskon,
                providerId: barang.providerId || "",
                provider: barang.provider || "",
                saldoSourceId: barang.saldoSourceId || "",
                saldoSourceNama: barang.saldoSourceNama || "",
                nominalProduk: Number(barang.nominalProduk || 0),
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
          kategoriId: barang.kategoriId || "",
          kategoriNama: barang.kategoriNama,
          merk: barang.merk,
          satuan: barang.satuan,
          stok: barang.stok,
          qty: 1,
          hargaModal: barang.hargaModal,
          hargaAsli: barang.hargaJual,
          hargaSetelahDiskon,
          pakaiKodeUnik: barang.pakaiKodeUnik,
          jenisKodeUnik: barang.jenisKodeUnik || "",
          kodeUnik: barang.kodeUnik || "",
          jenisBarang,
          subJenisDigital: barang.subJenisDigital || "",
          providerId: barang.providerId || "",
          provider: barang.provider || "",
          saldoSourceId: barang.saldoSourceId || "",
          saldoSourceNama: barang.saldoSourceNama || "",
          nominalProduk: Number(barang.nominalProduk || 0),
          tujuan: "",
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
    setActiveTab("fisik")
    setSuccessMsg(
      `${source === "camera" ? "Scan kamera" : "Scan"} berhasil: ${
        status === "exists" ? `${found.nama} sudah ada di keranjang` : found.nama
      }`
    )
    setTimeout(() => setSuccessMsg(null), 1400)
    return { ok: true, status }
  }


  // ── Barcode Scanner (keyboard/gun) ─────────────────────────────────────────

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
      if (activeTab !== "fisik") return

      const now = Date.now()
      const diff = now - scanLastTimeRef.current
      if (diff > 120) scanBufferRef.current = ""
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
          if (scanBufferRef.current.length >= 6) commitScan()
          else resetScanBuffer()
        }, 80)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      resetScanBuffer()
    }
  }, [barangBarcodeMap, selectedTokoId, activeTab])


  // ── Camera Scanner ─────────────────────────────────────────────────────────

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
      const isReady =
        !cameraDetectingRef.current &&
        now - cameraLastDetectAtRef.current >= 220 &&
        now >= cameraCooldownUntilRef.current &&
        video.readyState >= 2

      if (isReady) {
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
                if ("vibrate" in navigator) navigator.vibrate?.(100)
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
        "code_128", "ean_13", "ean_8", "upc_a", "upc_e",
        "code_39", "codabar", "itf",
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
    if (cameraOpen && activeTab === "fisik") void startCameraScanner()
    else stopCameraScanner()
    return () => { stopCameraScanner() }
  }, [cameraOpen, activeTab])

  useEffect(() => {
    return () => {
      stopCameraScanner()
      beepAudioContextRef.current?.close?.()
    }
  }, [])


  // ── Cart Mutation Helpers ──────────────────────────────────────────────────

  const updateQty = (barangId: string, mode: "plus" | "minus") => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.barangId !== barangId) return item
          const nextQty = mode === "plus" ? item.qty + 1 : item.qty - 1
          if (item.jenisBarang === "fisik" && nextQty > item.stok) return item
          return { ...item, qty: nextQty }
        })
        .filter((item) => item.qty > 0)
    )
  }

  const updateTujuan = (barangId: string, value: string) => {
    setCart((prev) =>
      prev.map((item) => (item.barangId === barangId ? { ...item, tujuan: value } : item))
    )
  }

  const removeItem = (barangId: string) =>
    setCart((prev) => prev.filter((item) => item.barangId !== barangId))

  const clearCart = () => {
    if (activeTab === "fisik") setCartFisik([])
    else setCartDigital([])
    setUangBayar("")
    setCatatan("")
    setSuccessMsg("Keranjang dikosongkan")
    setTimeout(() => setSuccessMsg(null), 2000)
  }


  // ── Kalkulasi ──────────────────────────────────────────────────────────────

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

  const fisikCount = useMemo(
    () => cartFisik.reduce((acc, item) => acc + item.qty, 0),
    [cartFisik]
  )
  const digitalCount = useMemo(
    () => cartDigital.reduce((acc, item) => acc + item.qty, 0),
    [cartDigital]
  )

  const digitalSaldoUsage = useMemo<DigitalSaldoUsage[]>(
    () => buildDigitalSaldoUsage(cartDigital),
    [cartDigital]
  )

  const digitalSaldoRingkasan = useMemo(
    () => buildDigitalSaldoRingkasan(cartDigital),
    [cartDigital]
  )


  // ── Submit Transaksi ───────────────────────────────────────────────────────

  const handleProsesTransaksi = async () => {
    const user = auth.currentUser
    if (!user) return void setError("Sesi login tidak ditemukan")
    if (!selectedTokoId) return void setError("Pilih toko terlebih dahulu")
    if (!selectedMetodeId) return void setError("Pilih metode pembayaran terlebih dahulu")
    if (cart.length === 0) return void setError("Keranjang masih kosong")
    if (uangBayarNumber < grandTotal) return void setError("Uang bayar masih kurang")
    if (!selectedToko) return void setError("Data toko tidak ditemukan")
    if (!selectedMetode) return void setError("Data metode pembayaran tidak ditemukan")

    if (activeTab === "digital") {
      const invalidTarget = cart.some(
        (item) =>
          item.jenisBarang === "digital" &&
          digitalButuhTujuan(item.subJenisDigital) &&
          !String(item.tujuan || "").trim()
      )
      if (invalidTarget)
        return void setError("Isi tujuan untuk semua barang digital yang memerlukan tujuan")

      const digitalSaldoError = validateDigitalSaldoUsage(cart)
      if (digitalSaldoError) return void setError(digitalSaldoError)
    }

    setSubmitLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const nowMs = Date.now()
      const nomorTransaksi = `TRX-${nowMs}`
      const { tahun, bulan, hari, tanggalKey, bulanKey } = getTanggalParts(nowMs)

      // Snapshot semua nilai sebelum async
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
      const digitalSaldoUsageSnapshot = buildDigitalSaldoUsage(cartSnapshot)

      let savedTransaksiId = ""
      const itemPayload: any[] = []
            const kategoriAccumulator = new Map<string, LaporanKategoriBreakdown & { kategoriId: string }>()

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(collection(db, "transaksi"))
        savedTransaksiId = transaksiRef.id

        const laporanHarianRef = doc(db, "laporan_harian", `${tanggalKey}__${selectedToko.id}`)
        const laporanBulananRef = doc(db, "laporan_bulanan", `${bulanKey}__${selectedToko.id}`)

        // Read stok barang fisik
        const barangFisik = cartSnapshot.filter((item) => item.jenisBarang === "fisik")
        const barangReads = await Promise.all(
          barangFisik.map(async (item) => {
            const barangRef = doc(db, "barang", item.barangId)
            const barangSnap = await transaction.get(barangRef)
            if (!barangSnap.exists()) throw new Error(`Barang ${item.nama} tidak ditemukan`)
            const barangDb = barangSnap.data() as any
            const stokSekarang = Number(barangDb?.stok || 0)
            if (stokSekarang < item.qty) throw new Error(`Stok ${item.nama} tidak cukup`)
            return { item, barangRef, stokSekarang, stokSesudah: stokSekarang - item.qty }
          })
        )

        const saldoReads = await Promise.all(
          digitalSaldoUsageSnapshot.map(async (usage) => {
            const saldoRef = doc(db, "master_saldo_digital", usage.saldoSourceId)
            const saldoSnap = await transaction.get(saldoRef)
            if (!saldoSnap.exists()) {
              throw new Error(`Sumber saldo ${usage.saldoSourceNama} tidak ditemukan`)
            }
            const saldoDb = saldoSnap.data() as any
            const aktif = saldoDb?.aktif !== false
            const jumlahSaldo = Number(saldoDb?.jumlahSaldo || 0)
            if (!aktif) {
              throw new Error(`Sumber saldo ${usage.saldoSourceNama} sedang nonaktif`)
            }
            if (jumlahSaldo < usage.totalPotong) {
              throw new Error(
                `Saldo ${usage.saldoSourceNama} tidak mencukupi. Butuh ${formatRupiah(usage.totalPotong)}, tersedia ${formatRupiah(jumlahSaldo)}`
              )
            }
            return {
              usage,
              saldoRef,
              jumlahSaldo,
              jumlahSesudah: jumlahSaldo - usage.totalPotong,
            }
          })
        )

        const laporanHarianSnap = await transaction.get(laporanHarianRef)
        const laporanBulananSnap = await transaction.get(laporanBulananRef)
        const laporanHarianData = laporanHarianSnap.exists() ? laporanHarianSnap.data() : null
        const laporanBulananData = laporanBulananSnap.exists() ? laporanBulananSnap.data() : null

        // Update stok
        for (const { barangRef, stokSesudah } of barangReads) {
          transaction.update(barangRef, {
            stok: stokSesudah,
            updatedAt: nowMs,
            updatedBy: user.uid,
          })
        }

        for (const { usage, saldoRef, jumlahSesudah } of saldoReads) {
          transaction.update(saldoRef, {
            jumlahSaldo: jumlahSesudah,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
            lastTransaksiId: transaksiRef.id,
            lastNomorTransaksi: nomorTransaksi,
            lastPotongNominal: usage.totalPotong,
            lastPotongQty: usage.totalQty,
            lastPotongItem: usage.totalItem,
            updatedAtMs: nowMs,
          })
        }

        // Build item payload & kategori accumulator
        for (const item of cartSnapshot) {
          const subtotalAsliItem = item.hargaAsli * item.qty
          const subtotalFinalItem = item.hargaSetelahDiskon * item.qty
          const totalDiskonItem = subtotalAsliItem - subtotalFinalItem

                   const itemRow = {
            barangId: item.barangId,
            kodeBarang: item.kodeBarang,
            nama: item.nama,
            kategoriId: item.kategoriId || "",
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
            pakaiKodeUnik: Boolean(item.pakaiKodeUnik),
            jenisKodeUnik: item.jenisKodeUnik || "",
            kodeUnik: item.kodeUnik || "",
            jenisBarang: item.jenisBarang,
            subJenisDigital: item.subJenisDigital || "",
            providerId: item.providerId || "",
            provider: item.provider || "",
            saldoSourceId: item.saldoSourceId || "",
            saldoSourceNama: item.saldoSourceNama || "",
            nominalProduk: Number(item.nominalProduk || 0),
            tujuan: item.tujuan || "",
            diskonId: item.diskonId || "",
            diskonNama: item.diskonNama || "",
            diskonTipe: item.diskonTipe || "",
            diskonNilai: Number(item.diskonNilai || 0),
          }
          itemPayload.push(itemRow)

          const kategoriId = item.kategoriId?.trim() || "tanpa-kategori"
          const kategoriNama = item.kategoriNama?.trim() || "Tanpa Kategori"
          const totalModalItem = Number(item.hargaModal || 0) * Number(item.qty || 0)
          const proporsiOmzet =
            grandTotalSnapshot > 0 ? subtotalFinalItem / grandTotalSnapshot : 0
          const adminKategori = Math.round(biayaAdminNominalSnapshot * proporsiOmzet)
          const labaBersihKategori = subtotalFinalItem - totalModalItem - adminKategori

          const prevKategori = kategoriAccumulator.get(kategoriId)
          kategoriAccumulator.set(kategoriId, {
            kategoriId,
            nama: kategoriNama,
            jumlahTransaksi: 1,
            qtyTerjual: Number(prevKategori?.qtyTerjual || 0) + Number(item.qty || 0),
            omzet: Number(prevKategori?.omzet || 0) + subtotalFinalItem + adminKategori,
            subtotal: Number(prevKategori?.subtotal || 0) + subtotalAsliItem,
            totalDiskon: Number(prevKategori?.totalDiskon || 0) + totalDiskonItem,
            totalSetelahDiskon: Number(prevKategori?.totalSetelahDiskon || 0) + subtotalFinalItem,
            totalModal: Number(prevKategori?.totalModal || 0) + totalModalItem,
            totalBiayaAdmin: Number(prevKategori?.totalBiayaAdmin || 0) + adminKategori,
            labaBersih: Number(prevKategori?.labaBersih || 0) + labaBersihKategori,
          })
        }

        // Tulis mutasi stok
        for (const { item, stokSekarang, stokSesudah } of barangReads) {
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

        // Tulis transaksi
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
          jenisTransaksi: activeTab,
          digitalSaldoUsage: digitalSaldoUsageSnapshot,
          digitalSaldoRingkasan: buildDigitalSaldoRingkasan(cartSnapshot),
          items: itemPayload,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedAtMs: nowMs,
        })

        // Tulis laporan
        const kategoriBreakdownTambah = Array.from(kategoriAccumulator.values()).map(
          (item) => ({ ...item, jumlahTransaksi: 1 })
        )
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
          kategoriBreakdownTambah,
          nowMs,
        }

        transaction.set(
          laporanHarianRef,
          buildLaporanPayload({
            existingData: laporanHarianData,
            id: laporanHarianRef.id,
            periodeKey: tanggalKey,
            tahun,
            bulan,
            hari,
            ...sharedLaporanArgs,
          })
        )
        transaction.set(
          laporanBulananRef,
          buildLaporanPayload({
            existingData: laporanBulananData,
            id: laporanBulananRef.id,
            periodeKey: bulanKey,
            tahun,
            bulan,
            ...sharedLaporanArgs,
          })
        )
      })

      // Baca struk dari Firestore untuk modal
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
          jenisTransaksi: (x?.jenisTransaksi || activeTab) as "fisik" | "digital",
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
                pakaiKodeUnik: Boolean(item?.pakaiKodeUnik),
                jenisKodeUnik: item?.jenisKodeUnik || "",
                kodeUnik: item?.kodeUnik || "",
                jenisBarang: (item?.jenisBarang || "fisik") as "fisik" | "digital",
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
            : itemPayload,
          createdAtMs: Number(x?.createdAtMs || nowMs),
        }
        setStrukModal(strukFromFirestore)
      }

      await fetchBarang()
      if (activeTab === "fisik") setCartFisik([])
      else setCartDigital([])
      setUangBayar("")
      setCatatan("")
      setSelectedMetodeId(metodeTunaiDefault?.id || "")
      setSuccessMsg(`Transaksi ${activeTab} berhasil! Struk siap dicetak.`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal memproses transaksi")
    } finally {
      setSubmitLoading(false)
    }
  }


  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ModalStruk struk={strukModal} onClose={() => setStrukModal(null)} />

      <div className="space-y-4 text-slate-900 sm:space-y-5">

        {/* ── Page Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4 lg:items-start">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50">
                <ShoppingCart size={22} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="min-w-0 self-center lg:self-auto">
                <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                  Transaksi Kasir
                </h1>
                <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                  Scan barcode · kamera panel · checkout · print struk
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("fisik")}
                className={`flex h-10 items-center rounded-xl px-4 text-xs font-black uppercase tracking-wide ${
                  activeTab === "fisik"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Fisik ({fisikCount})
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab("digital"); setCameraOpen(false) }}
                className={`flex h-10 items-center rounded-xl px-4 text-xs font-black uppercase tracking-wide ${
                  activeTab === "digital"
                    ? "bg-cyan-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Digital ({digitalCount})
              </button>
              <button
                type="button"
                onClick={fetchAll}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 sm:h-10 sm:w-auto sm:px-4"
                title="Refresh"
              >
                <RefreshCw size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline sm:ml-2 text-xs font-black uppercase tracking-wide">
                  Refresh
                </span>
              </button>
              <button
                type="button"
                onClick={() => activeTab === "fisik" && setCameraOpen((prev) => !prev)}
                disabled={activeTab !== "fisik"}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-auto sm:px-4"
                title={cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
              >
                <Camera size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline sm:ml-2 text-xs font-black uppercase tracking-wide">
                  {cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
                </span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Info Cards ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            icon={Boxes}
            label="Jenis Barang"
            value={String(barangByToko.length)}
            subValue={`${activeTab === "fisik" ? "Fisik" : "Digital"} · ${selectedToko?.nama || "Semua toko"}`}
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

        {/* ── Notifikasi ── */}
        <AnimatePresence>
          {error && (
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
          )}
        </AnimatePresence>
        <AnimatePresence>
          {successMsg && (
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
          )}
        </AnimatePresence>

        {/* ── Main Grid ── */}
        <div className="grid gap-4 xl:grid-cols-12">

          {/* ─ Kolom Kiri: Daftar Barang + Scanner ─ */}
          <div className="space-y-4 xl:col-span-7">

            {/* Filter: Toko, Metode, Search */}
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
                      <option key={toko.id} value={toko.id}>{toko.nama}</option>
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
                        {metode.nama}{metode.biayaAdmin ? ` (${formatPercent(metode.biayaAdmin)})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <FieldLabel
                  icon={Search}
                  label={
                    activeTab === "fisik"
                      ? "Cari Barang / Barcode / Merk"
                      : "Cari Digital / Provider / Merk"
                  }
                />
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={searchBarang}
                    onChange={(e) => setSearchBarang(e.target.value)}
                    placeholder={
                      activeTab === "fisik"
                        ? "Cari nama barang, barcode, merk..."
                        : "Cari nama digital, provider, kategori..."
                    }
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Camera Panel / Placeholder */}
            {activeTab === "fisik" ? (
              cameraOpen ? (
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
                        onClick={() => { stopCameraScanner(); void startCameraScanner() }}
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
                        {/* Scan area overlay */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="h-24 w-[78%] rounded-2xl border-2 border-cyan-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
                        </div>
                        {cameraLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
                            <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-3 text-sm font-black text-white">
                              <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                              Menyalakan kamera...
                            </div>
                          </div>
                        )}
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
                    <p className="text-sm font-black text-slate-700">
                      Scanner kamera belum dibuka
                    </p>
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
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-black text-slate-700">
                    Tab digital aktif. Scanner barcode dan kamera non-aktifkan.
                  </p>
                  {/* invisible spacer untuk alignment */}
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-transparent px-4 text-xs font-black uppercase tracking-wide opacity-0 select-none">
                    <PlayCircle size={15} strokeWidth={2.5} />
                    Aktifkan Kamera
                  </div>
                </div>
              </div>
            )}

            {/* Daftar Barang */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                    Daftar Barang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {activeTab === "fisik"
                      ? "Klik tambah atau scan barcode untuk masuk ke keranjang"
                      : "Klik tambah untuk masuk ke keranjang digital"}
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
                    const isOutStock =
                      (barang.jenisBarang || "fisik") === "fisik" && barang.stok <= 0
                    const DigitalIcon = getDigitalIcon(barang.subJenisDigital)

                    return (
                      <motion.div
                        key={barang.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-cyan-300 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-black text-slate-800">
                                {barang.nama}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                  activeTab === "fisik"
                                    ? "bg-slate-900 text-white"
                                    : "bg-cyan-600 text-white"
                                }`}
                              >
                                {activeTab === "fisik" ? "FISIK" : "DIGITAL"}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {barang.kodeBarang || "-"} · {barang.kategoriNama || "-"}
                            </p>
                            {activeTab === "fisik" ? (
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {barang.merk || "-"} · stok {barang.stok}
                              </p>
                            ) : (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <DigitalIcon size={12} strokeWidth={2.5} />
                                  {formatSubJenisDigitalLabel(barang.subJenisDigital)}
                                </span>
                                <span>{barang.provider || "-"}</span>
                                {barang.nominalProduk ? (
                                  <span>{formatRupiah(barang.nominalProduk)}</span>
                                ) : null}
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                  {barang.saldoSourceNama || "Tanpa Saldo"}
                                </span>
                              </div>
                            )}
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

          {/* ─ Kolom Kanan: Keranjang + Pembayaran ─ */}
          <div className="space-y-4 xl:col-span-5">

            {/* Keranjang */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                    Keranjang
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {activeTab === "fisik"
                      ? "Scan untuk menambahkan barang secara otomatis"
                      : "Barang digital dipisah dari fisik"}
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
                  {cart.map((item) => {
                    const DigitalIcon = getDigitalIcon(item.subJenisDigital)
                    return (
                      <div
                        key={item.barangId}
                        className="rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        {/* Item header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-sm font-black text-slate-800">
                                {item.nama}
                              </h3>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                  item.jenisBarang === "fisik"
                                    ? "bg-slate-900 text-white"
                                    : "bg-cyan-600 text-white"
                                }`}
                              >
                                {formatJenisBarangLabel(item.jenisBarang)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {item.kodeBarang}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {item.merk || "-"} · {item.satuan || "-"}
                            </p>
                            {item.jenisBarang === "digital" && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <DigitalIcon size={12} strokeWidth={2.5} />
                                  {formatSubJenisDigitalLabel(item.subJenisDigital)}
                                </span>
                                <span>{item.provider || "-"}</span>
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                  {item.saldoSourceNama || "Tanpa Saldo"}
                                </span>
                              </div>
                            )}
                            {item.diskonNama && (
                              <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                                {item.diskonNama}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.barangId)}
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            <Trash2 size={15} strokeWidth={2.5} />
                          </button>
                        </div>

                        {/* Input tujuan (digital) */}
                        {item.jenisBarang === "digital" &&
                          digitalButuhTujuan(item.subJenisDigital) && (
                            <div className="mt-3">
                              <FieldLabel label={getTujuanLabel(item.subJenisDigital)} />
                              <input
                                value={item.tujuan || ""}
                                onChange={(e) => updateTujuan(item.barangId, e.target.value)}
                                placeholder={`Isi ${getTujuanLabel(item.subJenisDigital).toLowerCase()}...`}
                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                              />
                            </div>
                          )}

                        {/* Qty + Subtotal */}
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
                            {item.hargaAsli !== item.hargaSetelahDiskon && (
                              <p className="text-xs font-bold text-slate-400 line-through">
                                {formatRupiah(item.hargaAsli * item.qty)}
                              </p>
                            )}
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(item.hargaSetelahDiskon * item.qty)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Ringkasan Pembayaran */}
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

                {/* Kembalian / Kurang Bayar / Laba */}
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

                {/* Tombol Proses */}
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
                      Proses Transaksi {activeTab === "digital" ? "Digital" : "Fisik"}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Riwayat Transaksi */}
            <RiwayatTransaksiPanel />
          </div>
        </div>
      </div>
    </>
  )
}