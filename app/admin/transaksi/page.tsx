/* 
  Halaman admin transaksi kasir.
  Menangani transaksi fisik dan digital, scanner barcode/kamera,
  sinkron saldo digital, simpan kasir dari koleksi users, pelanggan opsional, preview struk, dan retur transaksi.

  Revisi:
  - Tambah fitur retur transaksi dari riwayat pembelian.
  - Retur membalik stok fisik, saldo digital, mutasi stok, dan laporan harian/bulanan.
  - Retur tidak menghapus transaksi lama, tetapi membuat dokumen retur_transaksi.
  - Qty retur dilacak di transaksi asal agar tidak bisa retur dobel.
  - Layout riwayat dan modal retur dibuat konsisten hijau emerald.
  - Tambah pelanggan opsional agar diskon member masuk transaksi tanpa terlalu menonjol.
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
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Clock,
  Smartphone,
  Wifi,
  Zap,
  Ticket,
  Gamepad2,
  User2,
  Mail,
  Target,
  Cpu,
  X,
  ChevronDown,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import {
  type Toko,
  type Barang,
  type Diskon,
  type MetodePembayaran,
  type CartItem,
  type StrukData,
  type LaporanKategoriBreakdown,
  type MasterSaldoDigital,
  type DigitalSaldoUsage,
  type AddToCartMode,
  formatRupiah,
  formatRibuanInput,
  formatPercent,
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
} from "@/lib/transaksi/route"

type UserProfile = {
  uid: string
  nama: string
  email: string
  role: string
  roles: string[]
  tokoId: string
  tokoNama: string
}

type PelangganTransaksi = {
  id: string
  uid?: string
  nama: string
  telepon: string
  email: string
  nomorKartu: string
  kodePelanggan: string
  aktif: boolean
  tipeMember: string
  poin: number
  totalTransaksi: number
  diskon: number
}

type RiwayatTransaksiItem = {
  id: string
  nomorTransaksi: string
  tokoId: string
  tokoNama: string
  metodePembayaranNama: string
  metodePembayaranTipe: string
  metodePembayaranProvider?: string
  biayaAdminPersen?: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  biayaAdminNominal: number
  grandTotal: number
  totalModal: number
  estimasiLabaKotor: number
  uangBayar?: number
  kembalian?: number
  pelangganId?: string
  pelangganNama?: string
  pelangganKode?: string
  pelangganTipeMember?: string
  diskonPelangganPersen?: number
  diskonPelangganNominal?: number
  totalItem: number
  totalJenisBarang: number
  status: string
  jenisTransaksi: "fisik" | "digital"
  kasirNama: string
  kasirEmail: string
  catatan: string
  returStatus?: "belum" | "sebagian" | "penuh"
  returQtyByBarangId?: Record<string, number>
  totalReturQty?: number
  totalReturNominal?: number
  items: Array<any>
  createdAtMs: number
  createdAt?: any
}

type ReturSelectionMap = Record<string, number>

type ReturSelectedRow = {
  item: any
  index: number
  key: string
  qtyRetur: number
  qtyTerjual: number
  qtySudahRetur: number
  qtySisa: number
}

const getReturKey = (item: any, index: number) =>
  String(item?.barangId || item?.kodeBarang || item?.nama || `item-${index}`)

const getReturQty = (trx: RiwayatTransaksiItem | null, item: any, index: number) => {
  if (!trx) return 0
  const map = trx.returQtyByBarangId || {}
  const key = getReturKey(item, index)
  return Number(map[key] || map[item?.barangId] || 0)
}

const getReturSisaQty = (trx: RiwayatTransaksiItem | null, item: any, index: number) => {
  const qty = Number(item?.qty || 0)
  const returQty = getReturQty(trx, item, index)
  return Math.max(0, qty - returQty)
}

const normalizeTransaksiHistory = (id: string, data: any): RiwayatTransaksiItem => ({
  id,
  nomorTransaksi: String(data?.nomorTransaksi || "-"),
  tokoId: String(data?.tokoId || ""),
  tokoNama: String(data?.tokoNama || "-"),
  metodePembayaranNama: String(data?.metodePembayaranNama || "-"),
  metodePembayaranTipe: String(data?.metodePembayaranTipe || ""),
  metodePembayaranProvider: String(data?.metodePembayaranProvider || ""),
  biayaAdminPersen: Number(data?.biayaAdminPersen || 0),
  subtotal: Number(data?.subtotal || 0),
  totalDiskon: Number(data?.totalDiskon || 0),
  totalSetelahDiskon: Number(data?.totalSetelahDiskon || 0),
  biayaAdminNominal: Number(data?.biayaAdminNominal || 0),
  grandTotal: Number(data?.grandTotal || 0),
  totalModal: Number(data?.totalModal || 0),
  estimasiLabaKotor: Number(data?.estimasiLabaKotor || 0),
  uangBayar: Number(data?.uangBayar || 0),
  kembalian: Number(data?.kembalian || 0),
  pelangganId: String(data?.pelangganId || ""),
  pelangganNama: String(data?.pelangganNama || ""),
  pelangganKode: String(data?.pelangganKode || ""),
  pelangganTipeMember: String(data?.pelangganTipeMember || ""),
  diskonPelangganPersen: Number(data?.diskonPelangganPersen || 0),
  diskonPelangganNominal: Number(data?.diskonPelangganNominal || 0),
  totalItem: Number(data?.totalItem || 0),
  totalJenisBarang: Number(data?.totalJenisBarang || 0),
  status: String(data?.status || ""),
  jenisTransaksi: (data?.jenisTransaksi || "fisik") as "fisik" | "digital",
  kasirNama: String(data?.kasirNama || "-"),
  kasirEmail: String(data?.kasirEmail || "-"),
  catatan: String(data?.catatan || ""),
  returStatus: data?.returStatus || "belum",
  returQtyByBarangId:
    data?.returQtyByBarangId && typeof data.returQtyByBarangId === "object"
      ? data.returQtyByBarangId
      : {},
  totalReturQty: Number(data?.totalReturQty || 0),
  totalReturNominal: Number(data?.totalReturNominal || 0),
  items: Array.isArray(data?.items) ? data.items : [],
  createdAtMs: Number(data?.createdAtMs || 0),
  createdAt: data?.createdAt,
})

const formatTanggalJam = (value: number) => {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}


const normalizeRoles = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
}

const isAdminProfile = (profile: UserProfile | null) => {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (role === "admin" || role === "superadmin") return true
  return profile.roles.includes("admin") || profile.roles.includes("superadmin")
}

export default function TransaksiPage() {
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [barangList, setBarangList] = useState<Barang[]>([])
  const [diskonList, setDiskonList] = useState<Diskon[]>([])
  const [metodeList, setMetodeList] = useState<MetodePembayaran[]>([])
  const [saldoList, setSaldoList] = useState<MasterSaldoDigital[]>([])
  const [pelangganList, setPelangganList] = useState<PelangganTransaksi[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [selectedTokoId, setSelectedTokoId] = useState("")
  const [selectedMetodeId, setSelectedMetodeId] = useState("")
  const [searchBarang, setSearchBarang] = useState("")
  const [uangBayar, setUangBayar] = useState("")
  const [catatan, setCatatan] = useState("")
  const [activeTab, setActiveTab] = useState<"fisik" | "digital">("fisik")
  const [selectedPelangganId, setSelectedPelangganId] = useState("")
  const [cartFisik, setCartFisik] = useState<CartItem[]>([])
  const [cartDigital, setCartDigital] = useState<CartItem[]>([])

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  type StrukDataWithPelanggan = StrukData & {
  pelangganId?: string
  pelangganNama?: string
  pelangganKode?: string
  pelangganTipeMember?: string
  diskonPelangganPersen?: number
  diskonPelangganNominal?: number
}

const [strukModal, setStrukModal] = useState<StrukDataWithPelanggan | null>(null)
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)

  const [riwayatTransaksi, setRiwayatTransaksi] = useState<RiwayatTransaksiItem[]>([])
  const [riwayatLoading, setRiwayatLoading] = useState(false)
  const [returModal, setReturModal] = useState<RiwayatTransaksiItem | null>(null)
  const [returSelections, setReturSelections] = useState<ReturSelectionMap>({})
  const [returCatatan, setReturCatatan] = useState("")
  const [returLoading, setReturLoading] = useState(false)

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

  const fetchCurrentUserProfile = async (uid: string, emailFallback?: string | null) => {
  try {
    const snap = await getDoc(doc(db, "users", uid))
    if (snap.exists()) {
      const data = snap.data() as any
      const profile: UserProfile = {
        uid,
        nama: String(data?.nama || "").trim() || "Tanpa Nama",
        email: String(data?.email || "").trim() || String(emailFallback || "").trim() || "-",
        role: String(data?.role || "").trim().toLowerCase(),
        roles: normalizeRoles(data?.roles),
        tokoId: String(data?.tokoId || "").trim(),
        tokoNama: String(data?.tokoNama || "").trim(),
      }
      setCurrentUserProfile(profile)
      return profile
    }
  } catch (e) {
    console.error("Gagal mengambil profil users:", e)
  }

  const fallback: UserProfile = {
    uid,
    nama: "Tanpa Nama",
    email: String(emailFallback || "").trim() || "-",
    role: "",
    roles: [],
    tokoId: "",
    tokoNama: "",
  }
  setCurrentUserProfile(fallback)
  return fallback
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
          satuan: x?.satuan || x?.satuanNama || "",
          satuanId: x?.satuanId || "",
          satuanNama: x?.satuanNama || x?.satuan || "",
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

  const fetchRiwayatTransaksi = async () => {
    setRiwayatLoading(true)

    try {
      const snap = await getDocs(query(collection(db, "transaksi"), orderBy("createdAtMs", "desc")))
      const rows = snap.docs
        .map((d) => normalizeTransaksiHistory(d.id, d.data()))
        .filter((item) => item.status === "selesai")
        .filter((item) => {
          if (isAdminProfile(currentUserProfile)) return true
          const tokoIdUser = String(currentUserProfile?.tokoId || "").trim()
          return !tokoIdUser || item.tokoId === tokoIdUser
        })
        .slice(0, 30)

      setRiwayatTransaksi(rows)
    } catch (e) {
      console.error("Gagal memuat riwayat transaksi:", e)
      setRiwayatTransaksi([])
    } finally {
      setRiwayatLoading(false)
    }
  }

  const fetchPelanggan = async () => {
    try {
      const snap = await getDocs(query(collection(db, "pelanggan"), orderBy("nama")))
      const list: PelangganTransaksi[] = snap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            uid: String(x?.uid || ""),
            nama: String(x?.nama || ""),
            telepon: String(x?.telepon || ""),
            email: String(x?.email || ""),
            nomorKartu: String(x?.nomorKartu || ""),
            kodePelanggan: String(x?.kodePelanggan || ""),
            aktif: x?.aktif !== false,
            tipeMember: String(x?.tipeMember || "Reguler"),
            poin: Number(x?.poin || 0),
            totalTransaksi: Number(x?.totalTransaksi || 0),
            diskon: Number(x?.diskon || 0),
          }
        })
        .filter((item) => item.nama && item.aktif !== false)

      setPelangganList(list)
    } catch (e) {
      console.error("Gagal memuat pelanggan:", e)
      setPelangganList([])
    }
  }

  const fetchAll = async () => {
  setLoading(true)
  setError(null)
  try {
    await Promise.all([
      fetchToko(),
      fetchBarang(),
      fetchDiskon(),
      fetchMetode(),
      fetchSaldo(),
      fetchPelanggan(),
    ])

    if (!isAdminProfile(currentUserProfile)) {
      const tokoIdUser = String(currentUserProfile?.tokoId || "").trim()
      if (tokoIdUser) setSelectedTokoId(tokoIdUser)
    }
  } catch (e) {
    console.error(e)
    setError("Gagal memuat data transaksi")
  } finally {
    setLoading(false)
  }
}

  useEffect(() => {
  const unsub = auth.onAuthStateChanged(async (u) => {
    if (u) {
      const [profile] = await Promise.all([
        fetchCurrentUserProfile(u.uid, u.email),
        fetchAll(),
      ])

      const admin = isAdminProfile(profile)
      if (!admin) {
        const tokoIdUser = String(profile?.tokoId || "").trim()
        setSelectedTokoId(tokoIdUser)
      }
    } else {
      setCurrentUserProfile(null)
      setSelectedTokoId("")
    }
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

 const isAdminUser = useMemo(
  () => isAdminProfile(currentUserProfile),
  [currentUserProfile]
)

useEffect(() => {
  if (!currentUserProfile) return
  void fetchRiwayatTransaksi()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentUserProfile?.uid, currentUserProfile?.tokoId])

useEffect(() => {
  if (!isAdminUser) {
    const tokoIdUser = String(currentUserProfile?.tokoId || "").trim()
    if (selectedTokoId !== tokoIdUser) {
      setSelectedTokoId(tokoIdUser)
    }
  }
}, [isAdminUser, currentUserProfile, selectedTokoId])

const selectedToko = useMemo(() => {
  const fromList = tokoList.find((t) => t.id === selectedTokoId) || null
  if (fromList) return fromList

  if (!isAdminUser && currentUserProfile?.tokoId) {
    return {
      id: currentUserProfile.tokoId,
      nama: currentUserProfile.tokoNama || "Toko Karyawan",
      kode: "",
      pemilik: "",
      aktif: true,
    } as Toko
  }

  return null
}, [tokoList, selectedTokoId, isAdminUser, currentUserProfile])

const selectedMetode = useMemo(
  () => metodeList.find((m) => m.id === selectedMetodeId) || null,
  [metodeList, selectedMetodeId]
)

const metodeTunaiDefault = useMemo(
  () => metodeList.find((m) => m.tipe === "Tunai") || null,
  [metodeList]
)

const filteredPelanggan = useMemo(() => {
  return pelangganList
    .filter((item) => item.aktif !== false)
    .sort((a, b) =>
      a.nama.localeCompare(b.nama, "id-ID", {
        numeric: true,
        sensitivity: "base",
      })
    )
}, [pelangganList])

const selectedPelanggan = useMemo(
  () => pelangganList.find((item) => item.id === selectedPelangganId) || null,
  [pelangganList, selectedPelangganId]
)

const pelangganDiskonPersen = useMemo(() => {
  const diskon = Number(selectedPelanggan?.diskon || 0)
  if (Number.isNaN(diskon) || diskon <= 0) return 0
  return Math.min(100, Math.max(0, diskon))
}, [selectedPelanggan])

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
          satuanId: barang.satuanId || "",
          satuanNama: barang.satuanNama || barang.satuan || "",
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
    if (cameraOpen && activeTab === "fisik") void startCameraScanner()
    else stopCameraScanner()
    return () => {
      stopCameraScanner()
    }
  }, [cameraOpen, activeTab])

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

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaAsli * item.qty, 0),
    [cart]
  )
  const totalSetelahDiskonBarang = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaSetelahDiskon * item.qty, 0),
    [cart]
  )
  const totalDiskonBarang = useMemo(
    () => subtotal - totalSetelahDiskonBarang,
    [subtotal, totalSetelahDiskonBarang]
  )
  const pelangganDiskonNominal = useMemo(() => {
    if (!selectedPelanggan || pelangganDiskonPersen <= 0 || totalSetelahDiskonBarang <= 0) return 0
    return Math.min(
      totalSetelahDiskonBarang,
      Math.round(totalSetelahDiskonBarang * (pelangganDiskonPersen / 100))
    )
  }, [selectedPelanggan, pelangganDiskonPersen, totalSetelahDiskonBarang])
  const totalSetelahDiskon = useMemo(
    () => Math.max(0, totalSetelahDiskonBarang - pelangganDiskonNominal),
    [totalSetelahDiskonBarang, pelangganDiskonNominal]
  )
  const totalDiskon = useMemo(
    () => totalDiskonBarang + pelangganDiskonNominal,
    [totalDiskonBarang, pelangganDiskonNominal]
  )

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

  const digitalTargetList = useMemo(() => {
    return cart
      .filter((item) => item.jenisBarang === "digital")
      .map((item) => ({
        barangId: item.barangId,
        nama: item.nama,
        tujuan: String(item.tujuan || "").trim(),
        label: getTujuanLabel(item.subJenisDigital),
        subJenisLabel: formatSubJenisDigitalLabel(item.subJenisDigital),
      }))
  }, [cart])

  const openCheckoutConfirm = () => {
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
          !String(item.tujuan || "").trim()
      )

      if (invalidTarget) return void setError("Isi nomor tujuan untuk semua barang digital")

      const digitalSaldoError = validateDigitalSaldoUsage(cart)
      if (digitalSaldoError) return void setError(digitalSaldoError)
    }

    setError(null)
    setShowCheckoutConfirm(true)
  }

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
      !String(item.tujuan || "").trim()
  )
  if (invalidTarget)
    return void setError("Isi nomor tujuan untuk semua barang digital")

  const digitalSaldoError = validateDigitalSaldoUsage(cart)
  if (digitalSaldoError) return void setError(digitalSaldoError)
}

    setSubmitLoading(true)
    setShowCheckoutConfirm(false)
    setError(null)
    setSuccessMsg(null)

    try {
      const kasirProfile =
        currentUserProfile || (await fetchCurrentUserProfile(user.uid, user.email))

      const nowMs = Date.now()
      const nomorTransaksi = `TRX-${nowMs}`
      const { tahun, bulan, hari, tanggalKey, bulanKey } = getTanggalParts(nowMs)

      const cartSnapshot = [...cart]
      const grandTotalSnapshot = grandTotal
      const subtotalSnapshot = subtotal
      const totalDiskonSnapshot = totalDiskon
      const totalSetelahDiskonBarangSnapshot = totalSetelahDiskonBarang
      const pelangganSnapshot = selectedPelanggan
      const pelangganDiskonPersenSnapshot = pelangganDiskonPersen
      const pelangganDiskonNominalSnapshot = pelangganDiskonNominal
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
      const kategoriAccumulator = new Map<
        string,
        LaporanKategoriBreakdown & {
          kategoriId: string
          satuanIds?: string[]
          satuanNamaList?: string[]
        }
      >()

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(collection(db, "transaksi"))
        savedTransaksiId = transaksiRef.id

        const laporanHarianRef = doc(db, "laporan_harian", `${tanggalKey}__${selectedToko.id}`)
        const laporanBulananRef = doc(db, "laporan_bulanan", `${bulanKey}__${selectedToko.id}`)

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
                `Saldo ${usage.saldoSourceNama} tidak mencukupi. Butuh ${formatRupiah(
                  usage.totalPotong
                )}, tersedia ${formatRupiah(jumlahSaldo)}`
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

        const pelangganRef = pelangganSnapshot?.id
          ? doc(db, "pelanggan", pelangganSnapshot.id)
          : null
        const pelangganSnap = pelangganRef ? await transaction.get(pelangganRef) : null

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

        if (pelangganRef && pelangganSnap?.exists()) {
          const pelangganData = pelangganSnap.data() as any
          const poinTambah = Math.floor(grandTotalSnapshot / 1000)

          transaction.update(pelangganRef, {
            totalTransaksi: Number(pelangganData?.totalTransaksi || 0) + grandTotalSnapshot,
            poin: Number(pelangganData?.poin || 0) + poinTambah,
            lastTransaksiId: transaksiRef.id,
            lastNomorTransaksi: nomorTransaksi,
            lastTransaksiAt: serverTimestamp(),
            lastTransaksiAtMs: nowMs,
            updatedAt: nowMs,
            updatedBy: user.uid,
          })
        }

        for (const item of cartSnapshot) {
          const subtotalAsliItem = item.hargaAsli * item.qty
          const subtotalFinalSebelumPelanggan = item.hargaSetelahDiskon * item.qty
          const proporsiDiskonPelanggan =
            totalSetelahDiskonBarangSnapshot > 0
              ? subtotalFinalSebelumPelanggan / totalSetelahDiskonBarangSnapshot
              : 0
          const diskonPelangganItem = Math.round(
            pelangganDiskonNominalSnapshot * proporsiDiskonPelanggan
          )
          const subtotalFinalItem = Math.max(0, subtotalFinalSebelumPelanggan - diskonPelangganItem)
          const totalDiskonItem = subtotalAsliItem - subtotalFinalItem

          const itemRow = {
            barangId: item.barangId,
            kodeBarang: item.kodeBarang,
            nama: item.nama,
            kategoriId: item.kategoriId || "",
            kategoriNama: item.kategoriNama,
            merk: item.merk,
            satuan: item.satuan,
            satuanId: item.satuanId || "",
            satuanNama: item.satuanNama || item.satuan || "",
            qty: item.qty,
            hargaModal: item.hargaModal,
            hargaAsli: item.hargaAsli,
            hargaSetelahDiskon: item.hargaSetelahDiskon,
            subtotalAsli: subtotalAsliItem,
            subtotalFinal: subtotalFinalItem,
            subtotalFinalSebelumPelanggan,
            diskonPelanggan: diskonPelangganItem,
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
          const proporsiOmzet = grandTotalSnapshot > 0 ? subtotalFinalItem / grandTotalSnapshot : 0
          const adminKategori = Math.round(biayaAdminNominalSnapshot * proporsiOmzet)
          const labaBersihKategori = subtotalFinalItem - totalModalItem - adminKategori

          const prevKategori = kategoriAccumulator.get(kategoriId)

          const nextSatuanIds = Array.from(
            new Set([...(prevKategori?.satuanIds || []), ...(item.satuanId ? [item.satuanId] : [])])
          )

          const nextSatuanNamaList = Array.from(
            new Set([
              ...(prevKategori?.satuanNamaList || []),
              ...(item.satuanNama || item.satuan ? [item.satuanNama || item.satuan] : []),
            ])
          )

          kategoriAccumulator.set(kategoriId, {
            kategoriId,
            nama: kategoriNama,
            jumlahTransaksi: 1,
            qtyTerjual: Number(prevKategori?.qtyTerjual || 0) + Number(item.qty || 0),
            omzet: Number(prevKategori?.omzet || 0) + subtotalFinalItem + adminKategori,
            subtotal: Number(prevKategori?.subtotal || 0) + subtotalAsliItem,
            totalDiskon: Number(prevKategori?.totalDiskon || 0) + totalDiskonItem,
            totalSetelahDiskon:
              Number(prevKategori?.totalSetelahDiskon || 0) + subtotalFinalItem,
            totalModal: Number(prevKategori?.totalModal || 0) + totalModalItem,
            totalBiayaAdmin: Number(prevKategori?.totalBiayaAdmin || 0) + adminKategori,
            labaBersih: Number(prevKategori?.labaBersih || 0) + labaBersihKategori,
            satuanIds: nextSatuanIds,
            satuanNamaList: nextSatuanNamaList,
          })
        }

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

        transaction.set(transaksiRef, {
          id: transaksiRef.id,
          nomorTransaksi,
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
          pelangganId: pelangganSnapshot?.id || "",
          pelangganUid: pelangganSnapshot?.uid || "",
          pelangganNama: pelangganSnapshot?.nama || "",
          pelangganTelepon: pelangganSnapshot?.telepon || "",
          pelangganEmail: pelangganSnapshot?.email || "",
          pelangganKode: pelangganSnapshot?.kodePelanggan || "",
          pelangganTipeMember: pelangganSnapshot?.tipeMember || "",
          diskonPelangganPersen: pelangganDiskonPersenSnapshot,
          diskonPelangganNominal: pelangganDiskonNominalSnapshot,
          totalSetelahDiskonBarang: totalSetelahDiskonBarangSnapshot,
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
          kasirUid: kasirProfile.uid,
          kasirNama: kasirProfile.nama,
          kasirEmail: kasirProfile.email,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedAtMs: nowMs,
        })

        const kategoriBreakdownTambah = Array.from(kategoriAccumulator.values()).map((item) => ({
          ...item,
          jumlahTransaksi: 1,
          satuanIds: item.satuanIds || [],
          satuanNamaList: item.satuanNamaList || [],
        }))

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

      const savedSnap = await getDoc(doc(db, "transaksi", savedTransaksiId))
      if (savedSnap.exists()) {
        const x = savedSnap.data() as any
        const strukFromFirestore: StrukDataWithPelanggan = {
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
          diskonPelangganPersen: Number(x?.diskonPelangganPersen || 0),
          diskonPelangganNominal: Number(x?.diskonPelangganNominal || 0),
          totalSetelahDiskon: Number(x?.totalSetelahDiskon || 0),
          grandTotal: Number(x?.grandTotal || 0),
          totalModal: Number(x?.totalModal || 0),
          estimasiLabaKotor: Number(x?.estimasiLabaKotor || 0),
          uangBayar: Number(x?.uangBayar || 0),
          kembalian: Number(x?.kembalian || 0),
          totalItem: Number(x?.totalItem || 0),
          totalJenisBarang: Number(x?.totalJenisBarang || 0),
          status: x?.status || "",
          catatan:
            x?.catatan ||
            (Number(x?.diskonPelangganPersen || 0) > 0
              ? `Diskon pelanggan ${Number(x?.diskonPelangganPersen || 0)}%`
              : ""),
          jenisTransaksi: (x?.jenisTransaksi || activeTab) as "fisik" | "digital",
          kasirUid: x?.kasirUid || user.uid,
          kasirNama: x?.kasirNama || kasirProfile.nama,
          kasirEmail: x?.kasirEmail || kasirProfile.email,
          pelangganId: x?.pelangganId || "",
          pelangganNama: x?.pelangganNama || "",
          pelangganKode: x?.pelangganKode || "",
          pelangganTipeMember: x?.pelangganTipeMember || "",
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
      await fetchRiwayatTransaksi()
      if (selectedPelanggan) {
        const poinTambah = Math.floor(grandTotalSnapshot / 1000)
        setPelangganList((prev) =>
          prev.map((item) =>
            item.id === selectedPelanggan.id
              ? {
                  ...item,
                  totalTransaksi: Number(item.totalTransaksi || 0) + grandTotalSnapshot,
                  poin: Number(item.poin || 0) + poinTambah,
                }
              : item
          )
        )
      }
      if (activeTab === "fisik") setCartFisik([])
      else setCartDigital([])
      setUangBayar("")
      setCatatan("")
      setSelectedPelangganId("")
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


  const openReturTransaksi = (trx: RiwayatTransaksiItem) => {
    const initialSelections: ReturSelectionMap = {}

    trx.items.forEach((item, index) => {
      const sisa = getReturSisaQty(trx, item, index)
      if (sisa > 0) initialSelections[getReturKey(item, index)] = 0
    })

    setReturSelections(initialSelections)
    setReturCatatan("")
    setReturModal(trx)
  }

  const updateReturQty = (trx: RiwayatTransaksiItem, item: any, index: number, qty: number) => {
    const key = getReturKey(item, index)
    const sisa = getReturSisaQty(trx, item, index)
    const safeQty = Math.max(0, Math.min(sisa, Number.isNaN(qty) ? 0 : qty))

    setReturSelections((prev) => ({
      ...prev,
      [key]: safeQty,
    }))
  }

  const totalReturQtyDipilih = useMemo(
    () => Object.values(returSelections).reduce((sum, qty) => sum + Number(qty || 0), 0),
    [returSelections]
  )

  const totalReturNominalDipilih = useMemo(() => {
    if (!returModal) return 0

    const subtotalFinalRetur = returModal.items.reduce((sum, item, index) => {
      const key = getReturKey(item, index)
      const qtyRetur = Number(returSelections[key] || 0)
      return sum + Number(item?.hargaSetelahDiskon || 0) * qtyRetur
    }, 0)

    const biayaAdminRetur =
      returModal.grandTotal > 0
        ? Math.round(Number(returModal.biayaAdminNominal || 0) * (subtotalFinalRetur / returModal.grandTotal))
        : 0

    return subtotalFinalRetur + biayaAdminRetur
  }, [returModal, returSelections])

  const handleReturTransaksi = async () => {
    const user = auth.currentUser
    if (!user) return void setError("Sesi login tidak ditemukan")
    if (!returModal) return
    if (totalReturQtyDipilih <= 0) return void setError("Pilih minimal 1 barang untuk retur")

    setReturLoading(true)
    setError(null)

    try {
      const nowMs = Date.now()
      const nomorRetur = `RTR-${nowMs}`
      const trxId = returModal.id
      const originalCreatedAtMs = Number(returModal.createdAtMs || nowMs)
      const { tahun, bulan, hari, tanggalKey, bulanKey } = getTanggalParts(originalCreatedAtMs)

      let savedReturId = ""

      await runTransaction(db, async (transaction) => {
        const transaksiRef = doc(db, "transaksi", trxId)
        const transaksiSnap = await transaction.get(transaksiRef)

        if (!transaksiSnap.exists()) throw new Error("Transaksi asal tidak ditemukan")

        const transaksiData = transaksiSnap.data() as any
        if (String(transaksiData?.status || "") !== "selesai") {
          throw new Error("Transaksi ini tidak bisa diretur")
        }

        const originalItems = Array.isArray(transaksiData?.items) ? transaksiData.items : []
        const returQtyByBarangId =
          transaksiData?.returQtyByBarangId && typeof transaksiData.returQtyByBarangId === "object"
            ? { ...transaksiData.returQtyByBarangId }
            : {}

        const selectedItems: ReturSelectedRow[] = []

        originalItems.forEach((item: any, index: number) => {
          const key = getReturKey(item, index)
          const qtyRetur = Number(returSelections[key] || 0)
          const qtyTerjual = Number(item?.qty || 0)
          const qtySudahRetur = Number(
            returQtyByBarangId[key] || returQtyByBarangId[item?.barangId] || 0
          )
          const qtySisa = Math.max(0, qtyTerjual - qtySudahRetur)

          if (qtyRetur > 0) {
            selectedItems.push({
              item,
              index,
              key,
              qtyRetur,
              qtyTerjual,
              qtySudahRetur,
              qtySisa,
            })
          }
        })

        if (selectedItems.length === 0) {
          throw new Error("Tidak ada item retur yang dipilih")
        }

        selectedItems.forEach((row: ReturSelectedRow) => {
          if (row.qtyRetur > row.qtySisa) {
            throw new Error(`Qty retur ${row.item?.nama || "barang"} melebihi sisa retur`)
          }
        })

        const laporanHarianRef = doc(db, "laporan_harian", `${tanggalKey}__${transaksiData.tokoId}`)
        const laporanBulananRef = doc(db, "laporan_bulanan", `${bulanKey}__${transaksiData.tokoId}`)
        const laporanHarianSnap = await transaction.get(laporanHarianRef)
        const laporanBulananSnap = await transaction.get(laporanBulananRef)
        const laporanHarianData = laporanHarianSnap.exists() ? laporanHarianSnap.data() : null
        const laporanBulananData = laporanBulananSnap.exists() ? laporanBulananSnap.data() : null

        const returRef = doc(collection(db, "retur_transaksi"))
        savedReturId = returRef.id

        let subtotalRetur = 0
        let totalSetelahDiskonRetur = 0
        let totalDiskonRetur = 0
        let totalModalRetur = 0
        let totalItemRetur = 0

        const kategoriAccumulator = new Map<
          string,
          LaporanKategoriBreakdown & {
            kategoriId: string
            satuanIds?: string[]
            satuanNamaList?: string[]
          }
        >()

        const returItems: any[] = []

        for (const row of selectedItems) {
          const item = row.item
          const qtyRetur = row.qtyRetur

          const subtotalAsliItem = Number(item?.hargaAsli || 0) * qtyRetur
          const subtotalFinalItem = Number(item?.hargaSetelahDiskon || 0) * qtyRetur
          const totalDiskonItem = subtotalAsliItem - subtotalFinalItem
          const totalModalItem = Number(item?.hargaModal || 0) * qtyRetur

          subtotalRetur += subtotalAsliItem
          totalSetelahDiskonRetur += subtotalFinalItem
          totalDiskonRetur += totalDiskonItem
          totalModalRetur += totalModalItem
          totalItemRetur += qtyRetur

          const kategoriId = String(item?.kategoriId || "").trim() || "tanpa-kategori"
          const kategoriNama = String(item?.kategoriNama || "").trim() || "Tanpa Kategori"
          const proporsiOmzet =
            Number(transaksiData?.grandTotal || 0) > 0
              ? subtotalFinalItem / Number(transaksiData.grandTotal || 0)
              : 0
          const adminKategori = Math.round(Number(transaksiData?.biayaAdminNominal || 0) * proporsiOmzet)
          const labaBersihKategori = subtotalFinalItem - totalModalItem - adminKategori

          const prevKategori = kategoriAccumulator.get(kategoriId)
          const nextSatuanIds = Array.from(
            new Set([...(prevKategori?.satuanIds || []), ...(item?.satuanId ? [item.satuanId] : [])])
          )
          const nextSatuanNamaList = Array.from(
            new Set([
              ...(prevKategori?.satuanNamaList || []),
              ...(item?.satuanNama || item?.satuan ? [item.satuanNama || item.satuan] : []),
            ])
          )

          kategoriAccumulator.set(kategoriId, {
            kategoriId,
            nama: kategoriNama,
            jumlahTransaksi: -1,
            qtyTerjual: Number(prevKategori?.qtyTerjual || 0) - qtyRetur,
            omzet: Number(prevKategori?.omzet || 0) - (subtotalFinalItem + adminKategori),
            subtotal: Number(prevKategori?.subtotal || 0) - subtotalAsliItem,
            totalDiskon: Number(prevKategori?.totalDiskon || 0) - totalDiskonItem,
            totalSetelahDiskon:
              Number(prevKategori?.totalSetelahDiskon || 0) - subtotalFinalItem,
            totalModal: Number(prevKategori?.totalModal || 0) - totalModalItem,
            totalBiayaAdmin: Number(prevKategori?.totalBiayaAdmin || 0) - adminKategori,
            labaBersih: Number(prevKategori?.labaBersih || 0) - labaBersihKategori,
            satuanIds: nextSatuanIds,
            satuanNamaList: nextSatuanNamaList,
          })

          returItems.push({
            ...item,
            qtyTerjual: Number(item?.qty || 0),
            qtySudahRetur: row.qtySudahRetur,
            qtyRetur,
            subtotalAsliRetur: subtotalAsliItem,
            subtotalFinalRetur: subtotalFinalItem,
            totalDiskonRetur: totalDiskonItem,
            totalModalRetur: totalModalItem,
          })

          if ((item?.jenisBarang || "fisik") === "fisik") {
            const barangRef = doc(db, "barang", item.barangId)
            const barangSnap = await transaction.get(barangRef)
            if (!barangSnap.exists()) throw new Error(`Barang ${item?.nama || ""} tidak ditemukan`)

            const barangDb = barangSnap.data() as any
            const stokSebelum = Number(barangDb?.stok || 0)
            const stokSesudah = stokSebelum + qtyRetur

            transaction.update(barangRef, {
              stok: stokSesudah,
              updatedAt: nowMs,
              updatedBy: user.uid,
              lastReturId: returRef.id,
              lastReturNomor: nomorRetur,
            })

            const mutasiRef = doc(collection(db, "mutasi_stok"))
            transaction.set(mutasiRef, {
              id: mutasiRef.id,
              transaksiId: trxId,
              returId: returRef.id,
              nomorTransaksi: transaksiData.nomorTransaksi || "",
              nomorRetur,
              tipe: "masuk",
              sumber: "retur_transaksi",
              tokoId: transaksiData.tokoId || "",
              tokoNama: transaksiData.tokoNama || "",
              barangId: item.barangId || "",
              kodeBarang: item.kodeBarang || "",
              namaBarang: item.nama || "",
              qty: qtyRetur,
              stokSebelum,
              stokSesudah,
              keterangan: `Retur transaksi ${transaksiData.nomorTransaksi || ""}`,
              createdAt: serverTimestamp(),
              createdAtMs: nowMs,
              createdBy: user.uid,
            })
          }

          if ((item?.jenisBarang || "fisik") === "digital") {
            const saldoSourceId = String(item?.saldoSourceId || "").trim()
            if (saldoSourceId) {
              const saldoRef = doc(db, "master_saldo_digital", saldoSourceId)
              const saldoSnap = await transaction.get(saldoRef)
              if (!saldoSnap.exists()) throw new Error(`Sumber saldo ${item?.saldoSourceNama || ""} tidak ditemukan`)

              const saldoDb = saldoSnap.data() as any
              const saldoSebelum = Number(saldoDb?.jumlahSaldo || 0)
              const nominalKembali = Number(item?.nominalProduk || 0) * qtyRetur
              const saldoSesudah = saldoSebelum + nominalKembali

              transaction.update(saldoRef, {
                jumlahSaldo: saldoSesudah,
                updatedAt: serverTimestamp(),
                updatedAtMs: nowMs,
                updatedBy: user.uid,
                lastReturId: returRef.id,
                lastReturNomor: nomorRetur,
                lastReturNominal: nominalKembali,
                lastReturQty: qtyRetur,
              })
            }
          }

          returQtyByBarangId[row.key] = Number(returQtyByBarangId[row.key] || 0) + qtyRetur
        }

        const biayaAdminRetur =
          Number(transaksiData?.grandTotal || 0) > 0
            ? Math.round(Number(transaksiData?.biayaAdminNominal || 0) * (totalSetelahDiskonRetur / Number(transaksiData.grandTotal || 0)))
            : 0

        const grandTotalRetur = totalSetelahDiskonRetur + biayaAdminRetur
        const labaKotorRetur = totalSetelahDiskonRetur - totalModalRetur - biayaAdminRetur

        const totalQtyTerjual = originalItems.reduce((sum: number, item: any) => sum + Number(item?.qty || 0), 0)
        const totalQtySudahReturBaru = Object.values(returQtyByBarangId).reduce(
          (sum: number, qty: any) => sum + Number(qty || 0),
          0
        )

        const returStatus =
          totalQtySudahReturBaru >= totalQtyTerjual && totalQtyTerjual > 0
            ? "penuh"
            : totalQtySudahReturBaru > 0
              ? "sebagian"
              : "belum"

        const kategoriBreakdownRetur = Array.from(kategoriAccumulator.values()).map((item) => ({
          ...item,
          jumlahTransaksi: -1,
          satuanIds: item.satuanIds || [],
          satuanNamaList: item.satuanNamaList || [],
        }))

        const sharedLaporanArgs = {
          tokoId: transaksiData.tokoId || "",
          tokoNama: transaksiData.tokoNama || "",
          metodeNama: transaksiData.metodePembayaranNama || "",
          omzetTambah: -grandTotalRetur,
          subtotalTambah: -subtotalRetur,
          totalDiskonTambah: -totalDiskonRetur,
          totalSetelahDiskonTambah: -totalSetelahDiskonRetur,
          totalBiayaAdminTambah: -biayaAdminRetur,
          totalModalTambah: -totalModalRetur,
          totalLabaKotorTambah: -labaKotorRetur,
          totalItemTambah: -totalItemRetur,
          totalJenisBarangTambah: -selectedItems.length,
          kategoriBreakdownTambah: kategoriBreakdownRetur,
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

        transaction.set(returRef, {
          id: returRef.id,
          nomorRetur,
          transaksiId: trxId,
          nomorTransaksiAsal: transaksiData.nomorTransaksi || "",
          tokoId: transaksiData.tokoId || "",
          tokoNama: transaksiData.tokoNama || "",
          metodePembayaranId: transaksiData.metodePembayaranId || "",
          metodePembayaranNama: transaksiData.metodePembayaranNama || "",
          metodePembayaranTipe: transaksiData.metodePembayaranTipe || "",
          jenisTransaksi: transaksiData.jenisTransaksi || "",
          status: "selesai",
          catatan: returCatatan.trim(),
          items: returItems,
          subtotalRetur,
          totalDiskonRetur,
          totalSetelahDiskonRetur,
          biayaAdminRetur,
          grandTotalRetur,
          totalModalRetur,
          labaKotorRetur,
          totalItemRetur,
          totalJenisBarangRetur: selectedItems.length,
          periodeAsalTanggal: tanggalKey,
          periodeAsalBulan: bulanKey,
          kasirUid: transaksiData.kasirUid || "",
          kasirNama: transaksiData.kasirNama || "",
          kasirEmail: transaksiData.kasirEmail || "",
          returBy: user.uid,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
        })

        transaction.update(transaksiRef, {
          returStatus,
          returQtyByBarangId,
          totalReturQty: totalQtySudahReturBaru,
          totalReturNominal: Number(transaksiData?.totalReturNominal || 0) + grandTotalRetur,
          lastReturId: returRef.id,
          lastReturNomor: nomorRetur,
          lastReturAt: serverTimestamp(),
          lastReturAtMs: nowMs,
          updatedAt: serverTimestamp(),
          updatedAtMs: nowMs,
        })
      })

      await Promise.all([fetchBarang(), fetchSaldo(), fetchRiwayatTransaksi()])

      setReturModal(null)
      setReturSelections({})
      setReturCatatan("")
      setSuccessMsg(`Retur berhasil diproses: ${savedReturId ? nomorRetur : "selesai"}`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal memproses retur")
    } finally {
      setReturLoading(false)
    }
  }

  const openPrintStrukFromRiwayat = (trx: RiwayatTransaksiItem) => {
    const strukFromRiwayat: StrukDataWithPelanggan = {
      id: trx.id,
      nomorTransaksi: trx.nomorTransaksi,
      tokoId: trx.tokoId,
      tokoNama: trx.tokoNama,
      metodePembayaranNama: trx.metodePembayaranNama,
      metodePembayaranTipe: trx.metodePembayaranTipe,
      metodePembayaranProvider: trx.metodePembayaranProvider || "",
      biayaAdminPersen: Number(trx.biayaAdminPersen || 0),
      biayaAdminNominal: Number(trx.biayaAdminNominal || 0),
      subtotal: Number(trx.subtotal || 0),
      totalDiskon: Number(trx.totalDiskon || 0),
      diskonPelangganPersen: Number(trx.diskonPelangganPersen || 0),
      diskonPelangganNominal: Number(trx.diskonPelangganNominal || 0),
      totalSetelahDiskon: Number(trx.totalSetelahDiskon || 0),
      grandTotal: Number(trx.grandTotal || 0),
      totalModal: Number(trx.totalModal || 0),
      estimasiLabaKotor: Number(trx.estimasiLabaKotor || 0),
      uangBayar: Number(trx.uangBayar || 0),
      kembalian: Number(trx.kembalian || 0),
      totalItem: Number(trx.totalItem || 0),
      totalJenisBarang: Number(trx.totalJenisBarang || 0),
      status: trx.status || "selesai",
      catatan:
        trx.catatan ||
        (Number(trx.diskonPelangganPersen || 0) > 0
          ? `Diskon pelanggan ${Number(trx.diskonPelangganPersen || 0)}%`
          : ""),
      jenisTransaksi: trx.jenisTransaksi,
      kasirUid: "",
      kasirNama: trx.kasirNama || "-",
      kasirEmail: trx.kasirEmail || "-",
      pelangganId: trx.pelangganId || "",
      pelangganNama: trx.pelangganNama || "",
      pelangganKode: trx.pelangganKode || "",
      pelangganTipeMember: trx.pelangganTipeMember || "",
      items: Array.isArray(trx.items)
        ? trx.items.map((item: any) => ({
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
        : [],
      createdAtMs: Number(trx.createdAtMs || Date.now()),
    }

    setStrukModal(strukFromRiwayat)
  }


  return (
    <>
      <ModalStruk struk={strukModal as StrukData} onClose={() => setStrukModal(null)} />

      <AnimatePresence>
        {showCheckoutConfirm && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !submitLoading) {
                setShowCheckoutConfirm(false)
              }
            }}
          >
            <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl"
            >
              <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-5 py-4 text-white">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                      <Receipt size={23} className="text-white" strokeWidth={2.6} />
                    </div>

                    <div className="min-w-0">
                      <h2 className="text-lg font-black tracking-tight text-white">
                        Konfirmasi Transaksi
                      </h2>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-50/85">
                        Periksa lagi nominal pembayaran sebelum transaksi disimpan.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCheckoutConfirm(false)}
                    disabled={submitLoading}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-50"
                    aria-label="Tutup konfirmasi"
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Toko
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-800">
                      {selectedToko?.nama || "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Metode
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-800">
                      {selectedMetode?.nama || "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Pelanggan
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-800">
                      {selectedPelanggan?.nama || "Umum"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Total Item
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-800">
                      {totalItem}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Jenis Transaksi
                    </p>
                    <p className="mt-1 text-lg font-black capitalize text-slate-800">
                      {activeTab}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">Subtotal</span>
                      <span className="text-sm font-black text-slate-800">
                        {formatRupiah(subtotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">Diskon Barang</span>
                      <span className="text-sm font-black text-emerald-700">
                        - {formatRupiah(totalDiskonBarang)}
                      </span>
                    </div>

                    {selectedPelanggan && pelangganDiskonNominal > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-500">
                          Diskon Member ({pelangganDiskonPersen}%)
                        </span>
                        <span className="text-sm font-black text-emerald-700">
                          - {formatRupiah(pelangganDiskonNominal)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">Total Diskon</span>
                      <span className="text-sm font-black text-emerald-700">
                        - {formatRupiah(totalDiskon)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-500">Biaya Admin</span>
                      <span className="text-sm font-black text-slate-800">
                        {formatRupiah(biayaAdminNominal)}
                      </span>
                    </div>

                    <div className="my-2 border-t border-emerald-200" />

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-700">Grand Total</span>
                      <span className="text-xl font-black text-emerald-700">
                        {formatRupiah(grandTotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-700">Uang Bayar</span>
                      <span className="text-xl font-black text-slate-900">
                        {formatRupiah(uangBayarNumber)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                      <span className="text-sm font-black text-slate-700">
                        {kurangBayar > 0 ? "Kurang Bayar" : "Kembalian"}
                      </span>
                      <span
                        className={`text-xl font-black ${
                          kurangBayar > 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {formatRupiah(kurangBayar > 0 ? kurangBayar : kembalian)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Ringkasan Keranjang
                    </p>
                  </div>

                  <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.barangId}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {item.nama}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.jenisBarang === "digital"
                              ? `${item.provider || "-"} · ${item.tujuan || "-"}`
                              : `${item.kodeBarang || "-"} · ${item.kategoriNama || "-"}`}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-slate-800">
                            {item.qty} × {formatRupiah(item.hargaSetelahDiskon)}
                          </p>
                          <p className="mt-0.5 text-xs font-bold text-emerald-700">
                            {formatRupiah(item.qty * item.hargaSetelahDiskon)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {catatan.trim() ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Catatan
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {catatan.trim()}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowCheckoutConfirm(false)}
                  disabled={submitLoading}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cek Lagi
                </button>

                <button
                  type="button"
                  onClick={handleProsesTransaksi}
                  disabled={submitLoading || kurangBayar > 0}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 px-5 text-xs font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-200/50 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" strokeWidth={2.8} />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} strokeWidth={2.8} />
                      Yakin Proses
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ReturTransaksiModal
        trx={returModal}
        selections={returSelections}
        catatan={returCatatan}
        loading={returLoading}
        totalQty={totalReturQtyDipilih}
        totalNominal={totalReturNominalDipilih}
        onClose={() => {
          if (returLoading) return
          setReturModal(null)
          setReturSelections({})
          setReturCatatan("")
        }}
        onChangeCatatan={setReturCatatan}
        onChangeQty={updateReturQty}
        onSubmit={handleReturTransaksi}
      />

      <div className="space-y-4 text-slate-900 sm:space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4 lg:items-start">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <ShoppingCart size={22} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="min-w-0 self-center lg:self-auto">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Transaksi Kasir
                </h1>
                <p className="mt-1 hidden text-xs font-semibold leading-relaxed text-emerald-50/85 sm:block sm:text-sm">
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
                onClick={() => {
                  setActiveTab("digital")
                  setCameraOpen(false)
                }}
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/15 sm:h-10 sm:w-auto sm:px-4"
                title="Refresh"
              >
                <RefreshCw size={14} strokeWidth={2.5} />
                <span className="hidden text-xs font-black uppercase tracking-wide sm:ml-2 sm:inline">
                  Refresh
                </span>
              </button>
              <button
                type="button"
                onClick={() => activeTab === "fisik" && setCameraOpen((prev) => !prev)}
                disabled={activeTab !== "fisik"}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-auto sm:px-4"
                title={cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
              >
                <Camera size={14} strokeWidth={2.5} />
                <span className="hidden text-xs font-black uppercase tracking-wide sm:ml-2 sm:inline">
                  {cameraOpen ? "Tutup Kamera" : "Buka Kamera"}
                </span>
              </button>
            </div>
          </div>
        </motion.div>

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
            subValue={selectedPelanggan ? `${selectedPelanggan.nama} · ${pelangganDiskonPersen}%` : "Promo aktif + member opsional"}
          />
          <InfoCard
            icon={CircleDollarSign}
            label="Grand Total"
            value={formatRupiah(grandTotal)}
            subValue={selectedMetode ? selectedMetode.nama : "Pilih metode pembayaran"}
          />
        </div>

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

        <div className="grid gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
  <FieldLabel icon={Store} label={isAdminUser ? "Pilih Toko" : "Toko Karyawan"} />

  {isAdminUser ? (
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
  ) : (
    <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
      {selectedToko?.nama || currentUserProfile?.tokoNama || "Toko belum terhubung"}
    </div>
  )}
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
                        {metode.nama}
                        {metode.biayaAdmin ? ` (${formatPercent(metode.biayaAdmin)})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel icon={User2} label="Pelanggan (Opsional)" />

                  <div className="relative">
                    <select
                      value={selectedPelangganId}
                      onChange={(e) => setSelectedPelangganId(e.target.value)}
                      className={`w-full appearance-none rounded-2xl border-2 px-3 py-2.5 pr-9 text-sm font-black outline-none transition-all ${
                        selectedPelanggan
                          ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                          : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
                      }`}
                    >
                      <option value="">Tanpa Pelanggan</option>
                      {filteredPelanggan.map((pelanggan) => (
                        <option key={pelanggan.id} value={pelanggan.id}>
                          {pelanggan.nama}
                          {pelanggan.diskon ? ` · Diskon ${pelanggan.diskon}%` : ""}
                        </option>
                      ))}
                    </select>

                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.6}
                    />
                  </div>

                  {selectedPelanggan ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-white px-3 py-2 shadow-sm">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-800">
                          {selectedPelanggan.nama}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {selectedPelanggan.tipeMember} · {selectedPelanggan.kodePelanggan || selectedPelanggan.telepon || "-"}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                        Diskon {pelangganDiskonPersen}%
                      </div>
                    </div>
                  ) : null}
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
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-transparent px-4 text-xs font-black uppercase tracking-wide opacity-0 select-none">
                    <PlayCircle size={15} strokeWidth={2.5} />
                    Aktifkan Kamera
                  </div>
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
    {isAdminUser ? "Pilih toko terlebih dahulu" : "Akun ini belum memiliki toko"}
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

          <div className="space-y-4 xl:col-span-5">
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
                            {item.jenisBarang === "digital" && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                               
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
{item.jenisBarang === "digital" && (
  <div className="mt-3">
    <FieldLabel label="Nomor Tujuan" />
    <input
      value={item.tujuan || ""}
      onChange={(e) => updateTujuan(item.barangId, e.target.value)}
      placeholder="Isi nomor tujuan"
      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
    />
  </div>
)}

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateQty(item.barangId, "minus")}
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            >
                              <Minus size={14} strokeWidth={3} />
                            </button>
                            <span className="min-w-[2rem] text-center text-sm font-black text-slate-800">
                              {item.qty}
                            </span>
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                  Konfirmasi Pembayaran
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Pastikan data transaksi sudah benar sebelum diproses
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500 text-white">
                      <User2 size={15} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                        Akun Konfirmasi
                      </p>
                      <p className="text-sm font-black text-slate-800">
                        {currentUserProfile?.nama || "Tanpa Nama"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <Mail size={12} strokeWidth={2.5} />
                    {currentUserProfile?.email || "-"}
                  </div>
                </div>

                {selectedPelanggan && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Pelanggan Member
                    </p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-800">
                          {selectedPelanggan.nama}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">
                          {selectedPelanggan.tipeMember} · {selectedPelanggan.kodePelanggan || selectedPelanggan.telepon || "-"}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-right ring-1 ring-emerald-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Diskon</p>
                        <p className="text-sm font-black text-emerald-700">{pelangganDiskonPersen}%</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "digital" && digitalTargetList.length > 0 && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Nomor Tujuan Digital
                    </p>
                    <div className="space-y-2">
                      {digitalTargetList.map((item) => (
                        <div
                          key={item.barangId}
                          className="rounded-xl border border-emerald-200 bg-white/70 px-3 py-2"
                        >
                          <p className="text-xs font-black text-slate-800">{item.nama}</p>                         
                          <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <Target size={11} strokeWidth={2.5} />
                            {item.label}: {item.tujuan || "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "digital" && digitalSaldoUsage.length > 0 && (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                      Potongan Saldo Digital
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {digitalSaldoRingkasan || "-"}
                    </p>
                  </div>
                )}

                <div>
                  <FieldLabel icon={Wallet} label="Uang Bayar" />
                  <input
                    value={uangBayar}
                    onChange={(e) => setUangBayar(formatRibuanInput(e.target.value))}
                    placeholder="Masukkan uang bayar"
                    inputMode="numeric"
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <FieldLabel icon={BadgeDollarSign} label="Catatan" />
                  <textarea
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    rows={3}
                    placeholder="Catatan transaksi (opsional)"
                    className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all hover:border-cyan-300 focus:border-cyan-500"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-black text-slate-800">{formatRupiah(subtotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Diskon Barang</span>
                    <span className="font-black text-emerald-600">{formatRupiah(totalDiskonBarang)}</span>
                  </div>
                  {selectedPelanggan && pelangganDiskonNominal > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                      <span>Diskon Member ({pelangganDiskonPersen}%)</span>
                      <span className="font-black text-emerald-600">
                        {formatRupiah(pelangganDiskonNominal)}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Total Diskon</span>
                    <span className="font-black text-emerald-600">{formatRupiah(totalDiskon)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Biaya Admin</span>
                    <span className="font-black text-slate-800">
                      {formatRupiah(biayaAdminNominal)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-base font-black text-slate-800">
                    <span>Grand Total</span>
                    <span>{formatRupiah(grandTotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Uang Bayar</span>
                    <span className="font-black text-slate-800">
                      {formatRupiah(uangBayarNumber)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Kembalian</span>
                    <span className="font-black text-emerald-600">{formatRupiah(kembalian)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Kurang Bayar</span>
                    <span className="font-black text-red-600">{formatRupiah(kurangBayar)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                    <span>Estimasi Laba Kotor</span>
                    <span className="font-black text-slate-800">
                      {formatRupiah(estimasiLabaKotor)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!isBisaCheckout}
                  onClick={openCheckoutConfirm}
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

            <RiwayatTransaksiReturPanel
              rows={riwayatTransaksi}
              loading={riwayatLoading}
              onRefresh={fetchRiwayatTransaksi}
              onPrint={openPrintStrukFromRiwayat}
              onRetur={openReturTransaksi}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function RiwayatTransaksiReturPanel({
  rows,
  loading,
  onRefresh,
  onPrint,
  onRetur,
}: {
  rows: RiwayatTransaksiItem[]
  loading: boolean
  onRefresh: () => void
  onPrint: (trx: RiwayatTransaksiItem) => void
  onRetur: (trx: RiwayatTransaksiItem) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
            Riwayat & Retur Transaksi
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Retur akan mengembalikan stok/saldo dan membalik laporan.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase tracking-wide text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <motion.span
            animate={loading ? { rotate: 360 } : {}}
            transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
          >
            <RefreshCw size={14} strokeWidth={2.5} />
          </motion.span>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          Memuat riwayat transaksi...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          Belum ada transaksi selesai
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((trx) => {
            const canRetur = trx.items.some(
              (item, index) => getReturSisaQty(trx, item, index) > 0
            )

            return (
              <motion.div
                key={trx.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:border-emerald-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-800">
                        {trx.nomorTransaksi}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          trx.jenisTransaksi === "digital"
                            ? "bg-cyan-600 text-white"
                            : "bg-slate-900 text-white"
                        }`}
                      >
                        {trx.jenisTransaksi === "digital" ? "Digital" : "Fisik"}
                      </span>
                      {trx.returStatus && trx.returStatus !== "belum" ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                            trx.returStatus === "penuh"
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          Retur {trx.returStatus}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                      <span>{trx.tokoNama}</span>
                      <span>{formatTanggalJam(trx.createdAtMs)}</span>
                      <span>{trx.kasirNama}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Total
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {formatRupiah(trx.grandTotal)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Item
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {trx.totalItem} barang
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Retur
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {Number(trx.totalReturQty || 0)} barang
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Nominal Retur
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-800">
                          {formatRupiah(Number(trx.totalReturNominal || 0))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onPrint(trx)}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black uppercase tracking-wide text-emerald-700 shadow-sm transition-all hover:bg-emerald-100"
                    >
                      <Receipt size={14} strokeWidth={2.5} />
                      Print
                    </button>

                    <button
                      type="button"
                      onClick={() => onRetur(trx)}
                      disabled={!canRetur}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 px-4 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 disabled:text-slate-400"
                    >
                      <RotateCcw size={14} strokeWidth={2.5} />
                      {canRetur ? "Retur" : "Sudah Retur"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ReturTransaksiModal({
  trx,
  selections,
  catatan,
  loading,
  totalQty,
  totalNominal,
  onClose,
  onChangeCatatan,
  onChangeQty,
  onSubmit,
}: {
  trx: RiwayatTransaksiItem | null
  selections: ReturSelectionMap
  catatan: string
  loading: boolean
  totalQty: number
  totalNominal: number
  onClose: () => void
  onChangeCatatan: (value: string) => void
  onChangeQty: (trx: RiwayatTransaksiItem, item: any, index: number, qty: number) => void
  onSubmit: () => void
}) {
  if (!trx) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-5 py-4 text-white">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <RotateCcw size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-black leading-none">
                      Retur Transaksi
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-emerald-50/85">
                      {trx.nomorTransaksi} · {trx.tokoNama}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Total Transaksi
                </p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {formatRupiah(trx.grandTotal)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Item Terjual
                </p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {trx.totalItem}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                  Qty Retur
                </p>
                <p className="mt-1 text-sm font-black text-emerald-700">
                  {totalQty}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                  Nominal Retur
                </p>
                <p className="mt-1 text-sm font-black text-emerald-700">
                  {formatRupiah(totalNominal)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {trx.items.map((item, index) => {
                const key = getReturKey(item, index)
                const sisa = getReturSisaQty(trx, item, index)
                const qtyValue = Number(selections[key] || 0)
                const disabled = sisa <= 0

                return (
                  <div
                    key={key}
                    className={`rounded-2xl border p-3 ${
                      disabled
                        ? "border-slate-200 bg-slate-50 opacity-70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-800">
                            {item?.nama || "-"}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                              (item?.jenisBarang || "fisik") === "digital"
                                ? "bg-cyan-600 text-white"
                                : "bg-slate-900 text-white"
                            }`}
                          >
                            {(item?.jenisBarang || "fisik") === "digital" ? "Digital" : "Fisik"}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Terjual {Number(item?.qty || 0)} · Sudah retur {getReturQty(trx, item, index)} · Sisa {sisa}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {formatRupiah(Number(item?.hargaSetelahDiskon || 0))} / item
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={disabled || loading}
                          onClick={() => onChangeQty(trx, item, index, 0)}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          0
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={sisa}
                          value={qtyValue}
                          disabled={disabled || loading}
                          onChange={(e) => onChangeQty(trx, item, index, Number(e.target.value))}
                          className="h-9 w-20 rounded-xl border-2 border-slate-200 bg-white px-2 text-center text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                        <button
                          type="button"
                          disabled={disabled || loading}
                          onClick={() => onChangeQty(trx, item, index, sisa)}
                          className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Semua
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                Catatan Retur
              </label>
              <textarea
                value={catatan}
                onChange={(e) => onChangeCatatan(e.target.value)}
                disabled={loading}
                rows={3}
                placeholder="Contoh: barang rusak, pelanggan batal, salah input..."
                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-emerald-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || totalQty <= 0}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 px-5 text-sm font-black uppercase tracking-wide text-white transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                  Memproses Retur...
                </>
              ) : (
                <>
                  <RotateCcw size={16} strokeWidth={2.5} />
                  Proses Retur
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
