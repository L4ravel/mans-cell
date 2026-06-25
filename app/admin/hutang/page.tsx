/* app/admin/hutang/page.tsx */

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Cpu,
  Eye,
  ListFilter,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  User2,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type UserProfile = {
  uid: string
  nama: string
  email: string
  role: string
  roles: string[]
  tokoId: string
  tokoNama: string
}

type PembayaranItem = {
  metodePembayaranId: string
  metodePembayaranNama: string
  metodePembayaranTipe: string
  metodePembayaranProvider: string
  biayaAdminPersen: number
  nominal: number
  biayaAdminNominal: number
  totalDenganAdmin: number
}

type HutangBarangItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriId: string
  kategoriNama: string
  satuanId: string
  satuanNama: string
  qty: number
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  subtotal: number
  totalSetelahDiskon: number
  totalModal: number
  kodeUnik: string
  provider: string
  jenisBarang: string
}

type HutangTransaksi = {
  id: string
  nomorTransaksi: string
  tokoId: string
  tokoNama: string
  namaPenghutang: string
  pelangganId: string
  pelangganNama: string
  pelangganKode: string
  pelangganTipeMember: string
  kasirUid: string
  kasirNama: string
  kasirEmail: string
  metodePembayaranNama: string
  metodePembayaranTipe: string
  metodePembayaranProvider: string
  pembayaranItems: PembayaranItem[]
  jumlahMetodePembayaran: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  biayaAdminNominal: number
  grandTotal: number
  totalModal: number
  estimasiLabaKotor: number
  uangBayar: number
  kembalian: number
  kurangBayar: number
  totalHutang: number
  sisaHutang: number
  totalDibayar: number
  hutangStatus: string
  status: string
  catatan: string
  returStatus: "belum" | "sebagian" | "penuh" | string
  totalReturQty: number
  totalReturNominal: number
  totalReturModal: number
  items: HutangBarangItem[]
  totalItem: number
  totalJenisBarang: number
  jenisTransaksi: string
  createdAtMs: number
  updatedAtMs: number
}

type HutangStatusFilter = "belum_lunas" | "lunas" | "semua"

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

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

function formatDateTime(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatTanggal(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(value))
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  const d = `${date.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getStartOfMonthDateInput() {
  const now = new Date()
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
}

function startOfDayMs(value: string) {
  if (!value) return 0
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return 0
  const date = new Date(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function endOfDayMs(value: string) {
  if (!value) return 0
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return 0
  const date = new Date(year, month - 1, day)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
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

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const clean = String(value || "").trim()
    if (clean) return clean
  }
  return ""
}

function getFirestoreMillis(value: any) {
  if (!value) return 0
  if (typeof value?.toMillis === "function") return normalizeNumber(value.toMillis())
  if (typeof value?.seconds === "number") return normalizeNumber(value.seconds * 1000)
  return normalizeNumber(value)
}

function getReturStatusRaw(raw: any) {
  return String(raw?.returStatus || "belum").trim().toLowerCase()
}

function isRawReturPenuh(raw: any) {
  const returStatus = getReturStatusRaw(raw)
  const totalItemBersih = getFirstFilledNumber(raw?.totalItemBersih, raw?.totalItemSetelahRetur)
  const grandTotalBersih = getFirstFilledNumber(raw?.grandTotalBersih, raw?.totalBersihSetelahRetur)

  return (
    returStatus === "penuh" ||
    raw?.isReturPenuh === true ||
    (returStatus !== "belum" && totalItemBersih <= 0 && grandTotalBersih <= 0)
  )
}

function hasReturAdjustment(raw: any) {
  if (getReturStatusRaw(raw) !== "belum") return true
  return (
    raw?.subtotalBersih !== undefined ||
    raw?.totalSetelahDiskonBersih !== undefined ||
    raw?.grandTotalBersih !== undefined ||
    raw?.totalModalBersih !== undefined ||
    raw?.totalItemBersih !== undefined
  )
}

function clampMoney(value: number, min = 0, max = Number.POSITIVE_INFINITY) {
  const safeValue = Number.isFinite(value) ? value : 0
  return Math.min(max, Math.max(min, safeValue))
}

function isAdminProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (["admin", "owner", "superadmin"].includes(role)) return true
  return profile.roles.some((item) => ["admin", "owner", "superadmin"].includes(item))
}

function getPembayaranItemsTotal(value: unknown) {
  if (!Array.isArray(value)) return 0
  return value.reduce((acc, item: any) => {
    const nominal = getFirstFilledNumber(item?.nominal, item?.totalDenganAdmin, item?.jumlah, item?.amount)
    return acc + Math.max(0, nominal)
  }, 0)
}

function mapPembayaranItems(value: unknown): PembayaranItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item: any) => ({
    metodePembayaranId: String(item?.metodePembayaranId || item?.metodeId || ""),
    metodePembayaranNama: pickFirstString(item?.metodePembayaranNama, item?.nama, "Tanpa Metode"),
    metodePembayaranTipe: String(item?.metodePembayaranTipe || item?.tipe || ""),
    metodePembayaranProvider: String(item?.metodePembayaranProvider || item?.provider || ""),
    biayaAdminPersen: normalizeNumber(item?.biayaAdminPersen),
    nominal: Math.max(0, getFirstFilledNumber(item?.nominal, item?.jumlah, item?.amount)),
    biayaAdminNominal: Math.max(0, normalizeNumber(item?.biayaAdminNominal ?? item?.admin)),
    totalDenganAdmin: Math.max(0, getFirstFilledNumber(item?.totalDenganAdmin, item?.nominal, item?.jumlah, item?.amount)),
  }))
}

function getItemQty(item: any) {
  const qty = getFirstFilledNumber(item?.qty, item?.jumlah, item?.quantity, 1)
  return qty > 0 ? qty : 1
}

function getItemHargaModal(item: any) {
  return Math.max(0, getFirstFilledNumber(item?.hargaModal, item?.modal, item?.hargaBeli))
}

function getItemHargaAsli(item: any) {
  return Math.max(0, getFirstFilledNumber(item?.hargaAsli, item?.hargaJual, item?.hargaSetelahDiskon, item?.price))
}

function getItemHargaJual(item: any) {
  return Math.max(0, getFirstFilledNumber(item?.hargaSetelahDiskon, item?.hargaJual, item?.hargaAsli, item?.price))
}

function mapItems(value: unknown): HutangBarangItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => {
      const qty = getItemQty(item)
      const hargaModal = getItemHargaModal(item)
      const hargaAsli = getItemHargaAsli(item)
      const hargaSetelahDiskon = getItemHargaJual(item)

      return {
        barangId: String(item?.barangId || item?.id || ""),
        kodeBarang: String(item?.kodeBarang || item?.kodeBarcode || item?.barcodeValue || ""),
        nama: pickFirstString(item?.nama, item?.namaBarang, item?.produkNama, "Tanpa Nama"),
        kategoriId: String(item?.kategoriId || ""),
        kategoriNama: pickFirstString(item?.kategoriNama, item?.kategori, "Tanpa Kategori"),
        satuanId: String(item?.satuanId || ""),
        satuanNama: pickFirstString(item?.satuanNama, item?.satuan, "-"),
        qty,
        hargaModal,
        hargaAsli,
        hargaSetelahDiskon,
        subtotal: hargaAsli * qty,
        totalSetelahDiskon: hargaSetelahDiskon * qty,
        totalModal: hargaModal * qty,
        kodeUnik: String(item?.kodeUnik || ""),
        provider: String(item?.provider || ""),
        jenisBarang: String(item?.jenisBarang || "fisik"),
      }
    })
    .filter((item) => item.qty > 0)
}

function getTransaksiGrandTotal(raw: any) {
  if (isRawReturPenuh(raw)) return 0

  const direct = getFirstFilledNumber(raw?.grandTotalBersih, raw?.grandTotal, raw?.totalBayar, raw?.total)
  if (direct > 0) return direct

  const totalSetelahDiskon = getFirstFilledNumber(raw?.totalSetelahDiskonBersih, raw?.totalSetelahDiskon, raw?.subtotal)
  const admin = getFirstFilledNumber(raw?.biayaAdminBersih, raw?.biayaAdminNominal, raw?.totalBiayaAdmin)
  return Math.max(0, totalSetelahDiskon + admin)
}

function getTransaksiTotalDibayar(raw: any, grandTotal: number) {
  if (grandTotal <= 0 || isRawReturPenuh(raw)) return 0

  const isHutang =
    Boolean(raw?.isHutang) ||
    normalizeNumber(raw?.sisaHutang) > 0 ||
    normalizeNumber(raw?.totalHutang) > 0 ||
    normalizeNumber(raw?.kurangBayar) > 0 ||
    String(raw?.namaPenghutang || "").trim() !== ""

  if (!isHutang) return grandTotal

  const explicitPaid = getFirstFilledNumber(raw?.totalDibayar, raw?.totalTerbayar, raw?.dibayar)
  if (explicitPaid > 0) return clampMoney(explicitPaid, 0, grandTotal)

  const splitTotal = getPembayaranItemsTotal(raw?.pembayaranItems)
  if (splitTotal > 0) return clampMoney(splitTotal, 0, grandTotal)

  const uangBayar = normalizeNumber(raw?.uangBayar)
  const kembalian = normalizeNumber(raw?.kembalian)
  if (uangBayar > 0) return clampMoney(uangBayar - Math.max(0, kembalian), 0, grandTotal)

  const hutang = getFirstFilledNumber(raw?.sisaHutang, raw?.totalHutang, raw?.kurangBayar)
  if (hutang > 0) return clampMoney(grandTotal - hutang, 0, grandTotal)

  return 0
}

function normalizeHutangTransaksi(id: string, raw: any): HutangTransaksi {
  const returStatus = getReturStatusRaw(raw)
  const returPenuh = isRawReturPenuh(raw)
  const hasReturnData = hasReturAdjustment(raw)
  const grandTotal = returPenuh ? 0 : getTransaksiGrandTotal(raw)
  const totalDibayar = returPenuh ? 0 : getTransaksiTotalDibayar(raw, grandTotal)
  const directSisaHutang = getFirstFilledNumber(raw?.sisaHutang, raw?.kurangBayar)
  const sisaHutangHitung = Math.max(0, grandTotal - totalDibayar)
  const sisaHutang = returPenuh
    ? 0
    : hasReturnData
      ? sisaHutangHitung
      : directSisaHutang > 0
        ? clampMoney(directSisaHutang, 0, grandTotal)
        : sisaHutangHitung
  const totalHutang = returPenuh
    ? 0
    : clampMoney(getFirstFilledNumber(raw?.totalHutang, raw?.kurangBayar, sisaHutang), 0, grandTotal)
  const createdAtMs = getFirstFilledNumber(raw?.createdAtMs, getFirestoreMillis(raw?.createdAt), getFirestoreMillis(raw?.tanggal))
  const itemsSource = Array.isArray(raw?.itemsBersih)
    ? raw.itemsBersih
    : Array.isArray(raw?.itemsSetelahRetur)
      ? raw.itemsSetelahRetur
      : raw?.items
  const items = returPenuh ? [] : mapItems(itemsSource)

  return {
    id,
    nomorTransaksi: pickFirstString(raw?.nomorTransaksi, id),
    tokoId: String(raw?.tokoId || ""),
    tokoNama: pickFirstString(raw?.tokoNama, "Tanpa Toko"),
    namaPenghutang: pickFirstString(raw?.namaPenghutang, raw?.pelangganNama, "Tanpa Nama"),
    pelangganId: String(raw?.pelangganId || ""),
    pelangganNama: String(raw?.pelangganNama || ""),
    pelangganKode: String(raw?.pelangganKode || ""),
    pelangganTipeMember: String(raw?.pelangganTipeMember || ""),
    kasirUid: pickFirstString(raw?.kasirUid, raw?.kasirId, raw?.userId, raw?.uid, raw?.createdBy, raw?.createdByUid),
    kasirNama: pickFirstString(raw?.kasirNama, raw?.userNama, raw?.createdByNama, raw?.adminNama, "Tanpa Nama"),
    kasirEmail: pickFirstString(raw?.kasirEmail, raw?.userEmail, raw?.createdByEmail, raw?.adminEmail, "-"),
    metodePembayaranNama: pickFirstString(raw?.metodePembayaranNama, "Tanpa Metode"),
    metodePembayaranTipe: String(raw?.metodePembayaranTipe || ""),
    metodePembayaranProvider: String(raw?.metodePembayaranProvider || ""),
    pembayaranItems: mapPembayaranItems(raw?.pembayaranItems),
    jumlahMetodePembayaran: normalizeNumber(raw?.jumlahMetodePembayaran || (Array.isArray(raw?.pembayaranItems) ? raw.pembayaranItems.length : 1)),
    subtotal: Math.max(0, getFirstFilledNumber(raw?.subtotalBersih, raw?.subtotal, items.reduce((acc, item) => acc + item.subtotal, 0))),
    totalDiskon: Math.max(0, getFirstFilledNumber(raw?.totalDiskonBersih, raw?.totalDiskon)),
    totalSetelahDiskon: Math.max(0, getFirstFilledNumber(raw?.totalSetelahDiskonBersih, raw?.totalSetelahDiskon, items.reduce((acc, item) => acc + item.totalSetelahDiskon, 0))),
    biayaAdminNominal: Math.max(0, getFirstFilledNumber(raw?.biayaAdminBersih, raw?.biayaAdminNominal, raw?.totalBiayaAdmin)),
    grandTotal,
    totalModal: Math.max(0, getFirstFilledNumber(raw?.totalModalBersih, raw?.totalModal, items.reduce((acc, item) => acc + item.totalModal, 0))),
    estimasiLabaKotor: normalizeNumber(raw?.estimasiLabaKotorBersih ?? raw?.estimasiLabaKotor),
    uangBayar: normalizeNumber(raw?.uangBayar),
    kembalian: normalizeNumber(raw?.kembalian),
    kurangBayar: normalizeNumber(raw?.kurangBayar),
    totalHutang,
    sisaHutang,
    totalDibayar,
    hutangStatus: returPenuh ? "retur_penuh" : String(raw?.hutangStatus || (sisaHutang > 0 ? "belum_lunas" : "lunas")),
    status: String(raw?.status || ""),
    catatan: String(raw?.catatan || ""),
    returStatus,
    totalReturQty: Math.max(0, normalizeNumber(raw?.totalReturQty)),
    totalReturNominal: Math.max(0, normalizeNumber(raw?.totalReturNominal ?? raw?.totalReturSetelahDiskon)),
    totalReturModal: Math.max(0, normalizeNumber(raw?.totalReturModal)),
    items,
    totalItem: returPenuh ? 0 : getFirstFilledNumber(raw?.totalItemBersih, raw?.totalItem, items.reduce((acc, item) => acc + item.qty, 0)),
    totalJenisBarang: getFirstFilledNumber(raw?.totalJenisBarang, items.length),
    jenisTransaksi: String(raw?.jenisTransaksi || "fisik"),
    createdAtMs,
    updatedAtMs: getFirstFilledNumber(raw?.updatedAtMs, getFirestoreMillis(raw?.updatedAt), createdAtMs),
  }
}

function isHutangReturPenuh(item: HutangTransaksi) {
  return item.returStatus === "penuh" || item.hutangStatus === "retur_penuh" || item.grandTotal <= 0 || item.totalItem <= 0
}

function getHutangStatus(item: HutangTransaksi) {
  if (isHutangReturPenuh(item)) return "lunas"
  if (item.sisaHutang <= 0) return "lunas"
  return "belum_lunas"
}

function shouldShowHutangRow(item: HutangTransaksi) {
  if (item.status.toLowerCase() !== "selesai") return false
  if (isHutangReturPenuh(item)) return false

  const hasDebtIdentity =
    String(item.namaPenghutang || "").trim() !== "" ||
    String(item.pelangganNama || "").trim() !== ""

  return (
    item.sisaHutang > 0 ||
    item.totalHutang > 0 ||
    (hasDebtIdentity && item.hutangStatus !== "tidak")
  )
}

export default function HutangPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [hutangList, setHutangList] = useState<HutangTransaksi[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState<HutangStatusFilter>("belum_lunas")
  const [tanggalMulai, setTanggalMulai] = useState("")
  const [tanggalSelesai, setTanggalSelesai] = useState("")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [detailItem, setDetailItem] = useState<HutangTransaksi | null>(null)

  const isAdminUser = useMemo(() => isAdminProfile(currentUserProfile), [currentUserProfile])
  const effectiveTokoId = useMemo(
    () => (isAdminUser ? filterToko : String(currentUserProfile?.tokoId || "").trim()),
    [isAdminUser, filterToko, currentUserProfile?.tokoId],
  )

  const showError = (message: string) => {
    setError(message)
    setTimeout(() => setError(null), 3500)
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
    } catch (err) {
      console.error("Gagal mengambil profil user:", err)
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

  const fetchAll = async (profileOverride?: UserProfile | null) => {
    const activeProfile = profileOverride || currentUserProfile
    const admin = isAdminProfile(activeProfile)
    const tokoIdUser = String(activeProfile?.tokoId || "").trim()

    if (!admin && !activeProfile?.uid && !tokoIdUser) {
      setTokoList([])
      setHutangList([])
      showError("Akun ini belum terhubung")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const transaksiPromise = getDocs(query(collection(db, "transaksi"), orderBy("createdAtMs", "desc")))

      if (admin) {
        const [tokoSnap, transaksiSnap] = await Promise.all([
          getDocs(query(collection(db, "toko"), orderBy("nama"))),
          transaksiPromise,
        ])

        const tokoData: Toko[] = tokoSnap.docs
          .map((item) => {
            const x = item.data() as any
            return { id: item.id, nama: String(x?.nama || ""), aktif: x?.aktif !== false }
          })
          .filter((item) => item.nama)

        const rows = transaksiSnap.docs
          .map((item) => normalizeHutangTransaksi(item.id, item.data()))
          .filter((item) => shouldShowHutangRow(item))

        setTokoList(tokoData)
        setHutangList(rows)
      } else {
        const transaksiSnap = await transaksiPromise
        const rows = transaksiSnap.docs
          .map((item) => normalizeHutangTransaksi(item.id, item.data()))
          .filter((item) => shouldShowHutangRow(item))
          .filter((item) => !tokoIdUser || item.tokoId === tokoIdUser)

        setTokoList([{ id: tokoIdUser, nama: String(activeProfile?.tokoNama || "").trim() || "Toko Karyawan", aktif: true }])
        setFilterToko(tokoIdUser)
        setHutangList(rows)
      }
    } catch (err) {
      console.error(err)
      setTokoList([])
      setHutangList([])
      showError("Gagal memuat daftar hutang")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUserProfile(null)
        setTokoList([])
        setHutangList([])
        setLoading(false)
        return
      }

      const profile = await fetchCurrentUserProfile(user.uid, user.email)
      if (!isAdminProfile(profile)) setFilterToko(String(profile.tokoId || "").trim())
      await fetchAll(profile)
    })

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredHutang = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMs = startOfDayMs(tanggalMulai)
    const endMs = endOfDayMs(tanggalSelesai)

    return hutangList.filter((item) => {
      const status = getHutangStatus(item)
      const matchSearch =
        !q ||
        item.nomorTransaksi.toLowerCase().includes(q) ||
        item.namaPenghutang.toLowerCase().includes(q) ||
        item.pelangganNama.toLowerCase().includes(q) ||
        item.pelangganKode.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.kasirNama.toLowerCase().includes(q) ||
        item.items.some((barang) => barang.nama.toLowerCase().includes(q) || barang.kodeBarang.toLowerCase().includes(q))

      const matchToko = !effectiveTokoId || item.tokoId === effectiveTokoId
      const matchStatus = filterStatus === "semua" || status === filterStatus
      const matchStart = !startMs || item.createdAtMs >= startMs
      const matchEnd = !endMs || item.createdAtMs <= endMs

      return matchSearch && matchToko && matchStatus && matchStart && matchEnd
    })
  }, [hutangList, search, effectiveTokoId, filterStatus, tanggalMulai, tanggalSelesai])

  const totalHutangAwal = filteredHutang.reduce((acc, item) => acc + item.totalHutang, 0)
  const totalSisaHutang = filteredHutang.reduce((acc, item) => acc + item.sisaHutang, 0)
  const totalDibayar = filteredHutang.reduce((acc, item) => acc + item.totalDibayar, 0)
  const totalTransaksiHutang = filteredHutang.length
  const totalBelumLunas = filteredHutang.filter((item) => getHutangStatus(item) === "belum_lunas").length
  const totalLunas = filteredHutang.filter((item) => getHutangStatus(item) === "lunas").length
  const totalBarang = filteredHutang.reduce((acc, item) => acc + item.totalItem, 0)

  const debtorBreakdown = useMemo(() => {
    const map = new Map<string, { nama: string; tokoNama: string; transaksi: number; totalHutang: number; sisaHutang: number; terakhirMs: number }>()

    for (const item of filteredHutang) {
      const key = `${item.tokoId}__${item.namaPenghutang.toLowerCase()}`
      const current = map.get(key) || {
        nama: item.namaPenghutang || "Tanpa Nama",
        tokoNama: item.tokoNama || "Tanpa Toko",
        transaksi: 0,
        totalHutang: 0,
        sisaHutang: 0,
        terakhirMs: 0,
      }

      current.transaksi += 1
      current.totalHutang += item.totalHutang
      current.sisaHutang += item.sisaHutang
      current.terakhirMs = Math.max(current.terakhirMs, item.createdAtMs)
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.sisaHutang - a.sisaHutang || b.terakhirMs - a.terakhirMs)
  }, [filteredHutang])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredHutang.length / itemsPerPage))
  const pagedHutang = itemsPerPage === 0 ? filteredHutang : filteredHutang.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => setPage(1), [search, filterToko, filterStatus, tanggalMulai, tanggalSelesai, itemsPerPage])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

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
                <Wallet size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Daftar Hutang</h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  {isAdminUser ? "Admin melihat semua transaksi hutang dari seluruh toko." : "Anda hanya melihat daftar hutang dari toko akun Anda."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => fetchAll()}
              disabled={loading}
              className="hidden h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60 sm:inline-flex"
              title="Refresh"
            >
              <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
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

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isAdminUser ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
            <div className="lg:col-span-2">
              <FieldBox label="Cari Hutang">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nama penghutang, transaksi, toko, kasir, atau barang..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </FieldBox>
            </div>

            <div className="hidden sm:contents">
              {isAdminUser ? (
                <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                  <option value="">Semua Toko</option>
                  {tokoList.map((item) => (
                    <option key={item.id} value={item.id}>{item.nama}</option>
                  ))}
                </FilterSelect>
              ) : (
                <FieldBox label="Toko Anda">
                  <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                    {currentUserProfile?.tokoNama || "Toko Karyawan"}
                  </div>
                </FieldBox>
              )}

              <FilterSelect label="Status" value={filterStatus} onChange={(value) => setFilterStatus(value as HutangStatusFilter)} icon={Wallet}>
                <option value="belum_lunas">Belum Lunas</option>
                <option value="lunas">Lunas</option>
                <option value="semua">Semua</option>
              </FilterSelect>
              <FieldDate label="Mulai" value={tanggalMulai} onChange={setTanggalMulai} />
              <FieldDate label="Selesai" value={tanggalSelesai} onChange={setTanggalSelesai} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">           

            <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
              <User2 size={14} strokeWidth={2.5} />
              {debtorBreakdown.length} Nama
            </div>

            <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
              <ShoppingCart size={14} strokeWidth={2.5} />
              {totalTransaksiHutang} Trx
            </div>

            <button
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </button>
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
                  {isAdminUser ? (
                    <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                      <option value="">Semua Toko</option>
                      {tokoList.map((item) => (
                        <option key={item.id} value={item.id}>{item.nama}</option>
                      ))}
                    </FilterSelect>
                  ) : (
                    <FieldBox label="Toko Anda">
                      <div className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
                        {currentUserProfile?.tokoNama || "Toko Karyawan"}
                      </div>
                    </FieldBox>
                  )}

                  <FilterSelect label="Status" value={filterStatus} onChange={(value) => setFilterStatus(value as HutangStatusFilter)} icon={Wallet}>
                    <option value="belum_lunas">Belum Lunas</option>
                    <option value="lunas">Lunas</option>
                    <option value="semua">Semua</option>
                  </FilterSelect>
                  <FieldDate label="Mulai" value={tanggalMulai} onChange={setTanggalMulai} />
                  <FieldDate label="Selesai" value={tanggalSelesai} onChange={setTanggalSelesai} />
                  <FilterSelect label="Tampilkan" value={String(itemsPerPage)} onChange={(value) => setItemsPerPage(Number(value))}>
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard icon={Wallet} label="Sisa Hutang" value={formatRupiah(totalSisaHutang)} subValue={`${totalBelumLunas} belum lunas`} tone="rose" />
          <StatCard icon={BadgeDollarSign} label="Total Hutang" value={formatRupiah(totalHutangAwal)} subValue={`${totalTransaksiHutang} transaksi`} tone="sky" />
          <StatCard icon={CircleDollarSign} label="Sudah Dibayar" value={formatRupiah(totalDibayar)} subValue={`${totalLunas} lunas`} tone="blue" />
          <StatCard icon={ShoppingCart} label="Barang Dibeli" value={formatNumber(totalBarang)} subValue={`${debtorBreakdown.length} nama penghutang`} tone="slate" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <HeaderTitle title="Daftar Transaksi Hutang" subtitle="Detail transaksi, barang, waktu, dan toko" />
                <div className="hidden w-full sm:block sm:max-w-[120px]">
                  <FilterSelect label="Tampilkan" value={String(itemsPerPage)} onChange={(value) => setItemsPerPage(Number(value))}>
                    {ITEMS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </FilterSelect>
                </div>
              </div>

              {loading ? (
                <LoadingBox />
              ) : filteredHutang.length === 0 ? (
                <EmptyBox label="Belum ada daftar hutang" icon={Wallet} />
              ) : (
                <>
                  <div className="space-y-2 sm:hidden">
                    {pagedHutang.map((item, idx) => (
                      <HutangMobileCard key={item.id} item={item} idx={idx} onDetail={() => setDetailItem(item)} />
                    ))}
                  </div>

                  <HutangTable data={pagedHutang} page={page} itemsPerPage={itemsPerPage} onDetail={setDetailItem} />

                  {itemsPerPage !== 0 && totalPages > 1 && <Pagination page={page} totalPages={totalPages} goPage={goPage} />}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Penghutang Teratas" subtitle="Ranking berdasarkan sisa hutang" />
              {debtorBreakdown.length === 0 ? (
                <EmptyBox label="Belum ada data penghutang" icon={User2} />
              ) : (
                <div className="space-y-3">
                  {debtorBreakdown.slice(0, 8).map((item, idx) => (
                    <RankingBox
                      key={`${item.tokoNama}-${item.nama}-${idx}`}
                      index={idx}
                      title={item.nama}
                      subtitle={`${item.tokoNama} · ${item.transaksi} transaksi`}
                      amount={item.sisaHutang}
                      rightLabel={formatDateTime(item.terakhirMs)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      </main>
    </div>
  )
}

function HeaderTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-600">{title}</p>
      <p className="mt-1 text-sm font-black text-slate-800">{subtitle}</p>
    </div>
  )
}

function FieldBox({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function FieldDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </FieldBox>
  )
}

function FilterSelect({ value, onChange, children, label, icon: Icon }: { value: string; onChange: (value: string) => void; children: ReactNode; label: string; icon?: any }) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        {Icon && <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${Icon ? "pl-9" : "pl-3"} py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
      </div>
    </FieldBox>
  )
}

function StatCard({ icon: Icon, label, value, subValue, tone }: { icon: any; label: string; value: string; subValue?: string; tone: "slate" | "sky" | "blue" | "rose" }) {
  const cls = tone === "sky" ? "bg-sky-50 text-sky-600" : tone === "blue" ? "bg-blue-50 text-blue-600" : tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">{label}</p>
          <p className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-800 sm:text-xl">{value}</p>
          {subValue && <p className="mt-0.5 truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[9px]">{subValue}</p>}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isLunas = status === "lunas"
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${isLunas ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {isLunas ? "Lunas" : "Belum Lunas"}
    </span>
  )
}

function LoadingBox() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat daftar hutang...</p>
      </div>
    </div>
  )
}

function HutangMobileCard({ item, idx, onDetail }: { item: HutangTransaksi; idx: number; onDetail: () => void }) {
  const status = getHutangStatus(item)

  return (
    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx * 0.03 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100"><User2 size={20} strokeWidth={2.5} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">{item.namaPenghutang}</p>
              <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.tokoNama}</p>
            </div>
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 truncate text-[10px] font-bold text-slate-500">{item.nomorTransaksi} · {formatDateTime(item.createdAtMs)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <MiniInfo label="Sisa Hutang" value={formatRupiah(item.sisaHutang)} />
            <MiniInfo label="Total Hutang" value={formatRupiah(item.totalHutang)} />
            <MiniInfo label="Dibayar" value={formatRupiah(item.totalDibayar)} />
            <MiniInfo label="Barang" value={`${formatNumber(item.totalItem)} item`} />
          </div>
          <button type="button" onClick={onDetail} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15">
            <Eye size={13} strokeWidth={2.7} />
            Detail
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function HutangTable({ data, page, itemsPerPage, onDetail }: { data: HutangTransaksi[]; page: number; itemsPerPage: number; onDetail: (item: HutangTransaksi) => void }) {
  const heads = ["No", "Waktu", "Toko", "Penghutang", "Transaksi", "Barang", "Dibayar", "Sisa Hutang", "Status", "Detail"]

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-100 bg-slate-50/70">
            <tr>
              {heads.map((head) => <th key={head} className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${head === "No" || head === "Detail" ? "text-center" : "text-left"}`}>{head}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                <td className="px-3 py-3 text-center font-bold text-slate-400">{itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatDateTime(item.createdAtMs)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.namaPenghutang}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.nomorTransaksi}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatNumber(item.totalItem)} item</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatRupiah(item.totalDibayar)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-amber-700">{formatRupiah(item.sisaHutang)}</td>
                <td className="whitespace-nowrap px-3 py-3"><StatusBadge status={getHutangStatus(item)} /></td>
                <td className="px-3 py-3 text-center">
                  <button type="button" onClick={() => onDetail(item)} className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 hover:bg-sky-100">
                    <Eye size={13} strokeWidth={2.6} />
                    Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

function RankingBox({ index, title, subtitle, amount, rightLabel }: { index: number; title: string; subtitle: string; amount: number; rightLabel: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-800">{title}</p>
              <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{subtitle || "-"}</p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-amber-700">{formatRupiah(amount)}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{rightLabel}</p>
        </div>
      </div>
    </div>
  )
}

function DetailModal({ item, onClose }: { item: HutangTransaksi | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.22, ease: "easeOut" }} className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Detail Hutang</p>
                <h2 className="truncate text-base font-black text-slate-800">{item.namaPenghutang}</h2>
                <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">{item.nomorTransaksi} · {item.tokoNama}</p>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={17} strokeWidth={2.5} /></button>
            </div>

            <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniInfo label="Total Hutang" value={formatRupiah(item.totalHutang)} />
                <MiniInfo label="Sisa Hutang" value={formatRupiah(item.sisaHutang)} />
                <MiniInfo label="Sudah Dibayar" value={formatRupiah(item.totalDibayar)} />
                <MiniInfo label="Grand Total" value={formatRupiah(item.grandTotal)} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Informasi Transaksi</p>
                  <InfoLine icon={Clock} label="Waktu" value={formatTanggal(item.createdAtMs)} />
                  <InfoLine icon={Store} label="Toko" value={item.tokoNama || "-"} />
                  <InfoLine icon={User2} label="Kasir" value={item.kasirNama || item.kasirEmail || "-"} />
                  <InfoLine icon={Wallet} label="Status" value={getHutangStatus(item) === "lunas" ? "Lunas" : "Belum Lunas"} />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Pembayaran</p>
                  {item.pembayaranItems.length === 0 ? (
                    <InfoLine icon={Wallet} label="Metode" value={item.metodePembayaranNama || "Tanpa Metode"} />
                  ) : (
                    <div className="space-y-2">
                      {item.pembayaranItems.map((pay, idx) => (
                        <div key={`${pay.metodePembayaranNama}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-800">{pay.metodePembayaranNama}</p>
                            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">Admin {formatRupiah(pay.biayaAdminNominal)}</p>
                          </div>
                          <p className="shrink-0 text-xs font-black text-slate-800">{formatRupiah(pay.nominal)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.catatan && <p className="mt-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{item.catatan}</p>}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Barang yang Dibeli</p>
                {item.items.length === 0 ? (
                  <EmptyBox label="Tidak ada detail barang" icon={ReceiptText} />
                ) : (
                  <div className="space-y-2">
                    {item.items.map((barang, idx) => (
                      <div key={`${barang.barangId}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800">{barang.nama}</p>
                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{barang.kodeBarang || "Tanpa Kode"} · {barang.kategoriNama} · {barang.satuanNama}</p>
                            {barang.kodeUnik && <p className="mt-1 text-[10px] font-bold text-slate-500">Kode unik: {barang.kodeUnik}</p>}
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-black text-slate-800">{formatRupiah(barang.totalSetelahDiskon)}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatNumber(barang.qty)} x {formatRupiah(barang.hargaSetelahDiskon)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function InfoLine({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-slate-100">
        <Icon size={15} strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="truncate text-xs font-black text-slate-800">{value}</p>
      </div>
    </div>
  )
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
      <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-800">{value}</p>
    </div>
  )
}

function EmptyBox({ label, icon: Icon }: { label: string; icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm"><Icon size={28} strokeWidth={2} /></div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  )
}

function Pagination({ page, totalPages, goPage }: { page: number; totalPages: number; goPage: (page: number) => void }) {
  return (
    <div className="flex justify-center gap-1.5 pt-3">
      <button type="button" onClick={() => goPage(page - 1)} disabled={page === 1} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={14} strokeWidth={2.5} /></button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2).reduce<(number | "...")[]>((acc, p, idx, arr) => { if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("..."); acc.push(p); return acc }, []).map((p, idx) => p === "..." ? <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">···</span> : <button key={p} type="button" onClick={() => goPage(p)} className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${page === p ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{p}</button>)}
      <button type="button" onClick={() => goPage(page + 1)} disabled={page === totalPages} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight size={14} strokeWidth={2.5} /></button>
    </div>
  )
}
