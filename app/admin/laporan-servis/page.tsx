/* app/admin/laporan-servis/page.tsx */

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  Download,
  ListFilter,
  Loader2,
  ReceiptText,
  Search,
  Store,
  User2,
  Wallet,
  Wrench,
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

type StatusServis = "masuk" | "proses" | "selesai" | "diambil" | "batal"
type StatusPembayaran = "belum_bayar" | "dp" | "lunas" | "hutang"
type StatusFilter = "semua" | StatusServis
type PembayaranFilter = "semua" | StatusPembayaran
type MobileReportTab = "chart" | "peringkatToko"

type ServisSparepartItem = {
  id: string
  nama: string
  harga: number
  modal: number
}

type ServisItem = {
  id: string
  nomorServis: string
  tokoId: string
  tokoNama: string
  pelangganNama: string
  pelangganTelepon: string
  perangkatJenis: string
  perangkatMerk: string
  perangkatTipe: string
  keluhan: string
  tindakan: string
  sparepartNama: string
  sparepartItems: ServisSparepartItem[]
  teknisiNama: string
  statusServis: StatusServis
  statusPembayaran: StatusPembayaran
  biayaJasa: number
  hargaSparepart: number
  modalSparepart: number
  diskon: number
  totalTagihan: number
  totalDibayar: number
  sisaHutang: number
  labaKotor: number
  tanggalMasukMs: number
  tanggalSelesaiMs: number
  tanggalDiambilMs: number
  tanggalKey: string
  bulanKey: string
  createdAtMs: number
  updatedAtMs: number
  createdByUid: string
  createdByNama: string
  createdByEmail: string
}

type TokoBreakdown = {
  tokoId: string
  tokoNama: string
  totalData: number
  totalTagihan: number
  uangMasuk: number
  modal: number
  laba: number
  hutang: number
}

type TeknisiBreakdown = {
  nama: string
  totalData: number
  uangMasuk: number
  modal: number
  laba: number
  hutang: number
}

type SparepartBreakdown = {
  nama: string
  qty: number
  harga: number
  modal: number
  laba: number
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const STATUS_SERVIS_OPTIONS: Array<{ value: StatusServis; label: string }> = [
  { value: "masuk", label: "Masuk" },
  { value: "proses", label: "Proses" },
  { value: "selesai", label: "Selesai" },
  { value: "diambil", label: "Diambil" },
  { value: "batal", label: "Batal" },
]

const STATUS_PEMBAYARAN_OPTIONS: Array<{ value: StatusPembayaran; label: string }> = [
  { value: "belum_bayar", label: "Belum Bayar" },
  { value: "dp", label: "DP" },
  { value: "lunas", label: "Lunas" },
  { value: "hutang", label: "Hutang" },
]

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
}

function isAdminProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (["admin", "owner", "superadmin"].includes(role)) return true
  return profile.roles.some((item) => ["admin", "owner", "superadmin"].includes(item))
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

function padDate(value: number) {
  return String(value).padStart(2, "0")
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`
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

function getDateKeyFromMs(ms: number) {
  if (!ms) return ""
  return toDateInputValue(new Date(ms))
}

function getMonthKeyFromMs(ms: number) {
  if (!ms) return ""
  const date = new Date(ms)
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}`
}

function getFirestoreMillis(value: any) {
  if (!value) return 0
  if (typeof value?.toMillis === "function") return normalizeNumber(value.toMillis())
  if (typeof value?.seconds === "number") return normalizeNumber(value.seconds * 1000)
  return normalizeNumber(value)
}

function formatDateTime(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatTanggalKey(value?: string) {
  if (!value) return "-"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(date)
}

function getStatusServisLabel(value: string) {
  return STATUS_SERVIS_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

function getStatusPembayaranLabel(value: string) {
  return STATUS_PEMBAYARAN_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

function normalizeSparepartItems(raw: any): ServisSparepartItem[] {
  const source = Array.isArray(raw?.sparepartItems) ? raw.sparepartItems : []
  const mapped: ServisSparepartItem[] = source
    .map((item: any, index: number) => ({
      id: String(item?.id || `sp-${index + 1}`),
      nama: String(item?.nama || "").trim(),
      harga: Math.max(0, normalizeNumber(item?.harga)),
      modal: Math.max(0, normalizeNumber(item?.modal)),
    }))
    .filter((item: ServisSparepartItem) => Boolean(item.nama) || item.harga > 0 || item.modal > 0)

  if (mapped.length > 0) return mapped

  const nama = String(raw?.sparepartNama || "").trim()
  const harga = Math.max(0, normalizeNumber(raw?.hargaSparepart))
  const modal = Math.max(0, normalizeNumber(raw?.modalSparepart))

  if (!nama && harga <= 0 && modal <= 0) return []
  return [{ id: "sp-1", nama, harga, modal }]
}

function normalizeServisDoc(id: string, raw: any): ServisItem {
  const tanggalMasukMs = getFirstFilledNumber(raw?.tanggalMasukMs, raw?.createdAtMs, getFirestoreMillis(raw?.createdAt))
  const sparepartItems = normalizeSparepartItems(raw)
  const sparepartHarga = sparepartItems.reduce((acc, item) => acc + item.harga, 0)
  const sparepartModal = sparepartItems.reduce((acc, item) => acc + item.modal, 0)
  const totalTagihan = Math.max(0, normalizeNumber(raw?.totalTagihan))
  const totalDibayar = Math.max(0, normalizeNumber(raw?.totalDibayar))
  const sisaHutang = Math.max(0, normalizeNumber(raw?.sisaHutang ?? totalTagihan - totalDibayar))
  const modalSparepart = Math.max(0, getFirstFilledNumber(raw?.modalSparepart, sparepartModal))

  return {
    id,
    nomorServis: String(raw?.nomorServis || id),
    tokoId: String(raw?.tokoId || ""),
    tokoNama: String(raw?.tokoNama || "Tanpa Toko"),
    pelangganNama: String(raw?.pelangganNama || ""),
    pelangganTelepon: String(raw?.pelangganTelepon || ""),
    perangkatJenis: String(raw?.perangkatJenis || "HP"),
    perangkatMerk: String(raw?.perangkatMerk || ""),
    perangkatTipe: String(raw?.perangkatTipe || ""),
    keluhan: String(raw?.keluhan || ""),
    tindakan: String(raw?.tindakan || ""),
    sparepartNama: String(raw?.sparepartNama || sparepartItems.map((item) => item.nama).filter(Boolean).join(", ")),
    sparepartItems,
    teknisiNama: String(raw?.teknisiNama || ""),
    statusServis: String(raw?.statusServis || "masuk") as StatusServis,
    statusPembayaran: String(raw?.statusPembayaran || (sisaHutang > 0 ? "hutang" : "lunas")) as StatusPembayaran,
    biayaJasa: normalizeNumber(raw?.biayaJasa),
    hargaSparepart: Math.max(0, getFirstFilledNumber(raw?.hargaSparepart, sparepartHarga)),
    modalSparepart,
    diskon: normalizeNumber(raw?.diskon),
    totalTagihan,
    totalDibayar,
    sisaHutang,
    labaKotor: normalizeNumber(raw?.labaKotor ?? totalDibayar - modalSparepart),
    tanggalMasukMs,
    tanggalSelesaiMs: normalizeNumber(raw?.tanggalSelesaiMs),
    tanggalDiambilMs: normalizeNumber(raw?.tanggalDiambilMs),
    tanggalKey: String(raw?.tanggalKey || getDateKeyFromMs(tanggalMasukMs)),
    bulanKey: String(raw?.bulanKey || getMonthKeyFromMs(tanggalMasukMs)),
    createdAtMs: normalizeNumber(raw?.createdAtMs || tanggalMasukMs),
    updatedAtMs: normalizeNumber(raw?.updatedAtMs || raw?.createdAtMs || tanggalMasukMs),
    createdByUid: String(raw?.createdByUid || ""),
    createdByNama: String(raw?.createdByNama || ""),
    createdByEmail: String(raw?.createdByEmail || ""),
  }
}

export default function LaporanServisPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [servisList, setServisList] = useState<ServisItem[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)
  const [detailItem, setDetailItem] = useState<ServisItem | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("semua")
  const [filterPembayaran, setFilterPembayaran] = useState<PembayaranFilter>("semua")
  const [tanggalMulai, setTanggalMulai] = useState(getStartOfMonthDateInput())
  const [tanggalSelesai, setTanggalSelesai] = useState(toDateInputValue(new Date()))
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [mobileReportTab, setMobileReportTab] = useState<MobileReportTab>("chart")

  const isAdminUser = useMemo(() => isAdminProfile(currentUserProfile), [currentUserProfile])
  const effectiveTokoId = useMemo(
    () => (isAdminUser ? filterToko : String(currentUserProfile?.tokoId || "").trim()),
    [isAdminUser, filterToko, currentUserProfile?.tokoId],
  )

  const showError = (message: string) => {
    setError(message)
    setTimeout(() => setError(null), 4000)
  }

  const showSuccess = (message: string) => {
    setSuccessMsg(message)
    setTimeout(() => setSuccessMsg(null), 3500)
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

    if (!admin && !tokoIdUser) {
      setTokoList([])
      setServisList([])
      showError("Akun ini belum terhubung ke toko")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const tokoPromise = admin ? getDocs(query(collection(db, "toko"), orderBy("nama"))) : null
      const servisPromise = getDocs(query(collection(db, "servis"), orderBy("createdAtMs", "desc")))
      const [tokoSnap, servisSnap] = await Promise.all([tokoPromise, servisPromise])

      if (admin && tokoSnap) {
        const tokoData: Toko[] = tokoSnap.docs
          .map((item) => {
            const x = item.data() as any
            return { id: item.id, nama: String(x?.nama || ""), aktif: x?.aktif !== false }
          })
          .filter((item) => item.nama)
        setTokoList(tokoData)
      } else {
        setTokoList([
          {
            id: tokoIdUser,
            nama: String(activeProfile?.tokoNama || "").trim() || "Toko Karyawan",
            aktif: true,
          },
        ])
        setFilterToko(tokoIdUser)
      }

      const rows = servisSnap.docs
        .map((item) => normalizeServisDoc(item.id, item.data()))
        .filter((item) => (admin ? true : item.tokoId === tokoIdUser))

      setServisList(rows)
    } catch (err) {
      console.error(err)
      setTokoList([])
      setServisList([])
      showError("Gagal memuat laporan servis")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUserProfile(null)
        setTokoList([])
        setServisList([])
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

  const filteredServis = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMs = startOfDayMs(tanggalMulai)
    const endMs = endOfDayMs(tanggalSelesai)

    return servisList.filter((item) => {
      const sparepartItems = Array.isArray(item.sparepartItems) ? item.sparepartItems : []
      const matchSearch =
        !q ||
        item.nomorServis.toLowerCase().includes(q) ||
        item.pelangganNama.toLowerCase().includes(q) ||
        item.pelangganTelepon.toLowerCase().includes(q) ||
        item.perangkatJenis.toLowerCase().includes(q) ||
        item.perangkatMerk.toLowerCase().includes(q) ||
        item.perangkatTipe.toLowerCase().includes(q) ||
        item.keluhan.toLowerCase().includes(q) ||
        item.tindakan.toLowerCase().includes(q) ||
        item.sparepartNama.toLowerCase().includes(q) ||
        sparepartItems.some((sparepart) => sparepart.nama.toLowerCase().includes(q)) ||
        item.teknisiNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)

      const matchToko = !effectiveTokoId || item.tokoId === effectiveTokoId
      const matchStatus = filterStatus === "semua" || item.statusServis === filterStatus
      const matchPembayaran = filterPembayaran === "semua" || item.statusPembayaran === filterPembayaran
      const matchStart = !startMs || item.tanggalMasukMs >= startMs
      const matchEnd = !endMs || item.tanggalMasukMs <= endMs

      return matchSearch && matchToko && matchStatus && matchPembayaran && matchStart && matchEnd
    })
  }, [servisList, search, effectiveTokoId, filterStatus, filterPembayaran, tanggalMulai, tanggalSelesai])

  const totalTagihan = filteredServis.reduce((acc, item) => acc + item.totalTagihan, 0)
  const totalDibayar = filteredServis.reduce((acc, item) => acc + item.totalDibayar, 0)
  const totalHutang = filteredServis.reduce((acc, item) => acc + item.sisaHutang, 0)
  const totalBiayaJasa = filteredServis.reduce((acc, item) => acc + item.biayaJasa, 0)
  const totalHargaSparepart = filteredServis.reduce((acc, item) => acc + item.hargaSparepart, 0)
  const totalModalSparepart = filteredServis.reduce((acc, item) => acc + item.modalSparepart, 0)
  const totalDiskon = filteredServis.reduce((acc, item) => acc + item.diskon, 0)
  const totalLabaCash = filteredServis.reduce((acc, item) => acc + item.labaKotor, 0)
  const totalDataHutang = filteredServis.filter((item) => item.sisaHutang > 0).length
  const totalSelesai = filteredServis.filter((item) => item.statusServis === "selesai" || item.statusServis === "diambil").length
  const rataRataMasuk = filteredServis.length > 0 ? totalDibayar / filteredServis.length : 0

  const statusBreakdown = useMemo(() => {
    return STATUS_SERVIS_OPTIONS.map((status) => {
      const rows = filteredServis.filter((item) => item.statusServis === status.value)
      return {
        ...status,
        totalData: rows.length,
        uangMasuk: rows.reduce((acc, item) => acc + item.totalDibayar, 0),
        laba: rows.reduce((acc, item) => acc + item.labaKotor, 0),
      }
    })
  }, [filteredServis])

  const tokoBreakdown = useMemo<TokoBreakdown[]>(() => {
    const map = new Map<string, TokoBreakdown>()

    for (const item of filteredServis) {
      const key = item.tokoId || item.tokoNama || "tanpa-toko"
      const current = map.get(key) || {
        tokoId: item.tokoId,
        tokoNama: item.tokoNama || "Tanpa Toko",
        totalData: 0,
        totalTagihan: 0,
        uangMasuk: 0,
        modal: 0,
        laba: 0,
        hutang: 0,
      }

      current.totalData += 1
      current.totalTagihan += item.totalTagihan
      current.uangMasuk += item.totalDibayar
      current.modal += item.modalSparepart
      current.laba += item.labaKotor
      current.hutang += item.sisaHutang
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.uangMasuk - a.uangMasuk)
  }, [filteredServis])

  const teknisiBreakdown = useMemo<TeknisiBreakdown[]>(() => {
    const map = new Map<string, TeknisiBreakdown>()

    for (const item of filteredServis) {
      const key = item.teknisiNama || item.createdByNama || "Tanpa Teknisi"
      const current = map.get(key) || {
        nama: key,
        totalData: 0,
        uangMasuk: 0,
        modal: 0,
        laba: 0,
        hutang: 0,
      }

      current.totalData += 1
      current.uangMasuk += item.totalDibayar
      current.modal += item.modalSparepart
      current.laba += item.labaKotor
      current.hutang += item.sisaHutang
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.laba - a.laba)
  }, [filteredServis])

  const sparepartBreakdown = useMemo<SparepartBreakdown[]>(() => {
    const map = new Map<string, SparepartBreakdown>()

    for (const item of filteredServis) {
      const sparepartItems = Array.isArray(item.sparepartItems) ? item.sparepartItems : []
      for (const sparepart of sparepartItems) {
        const key = sparepart.nama || "Tanpa Nama"
        const current = map.get(key) || {
          nama: key,
          qty: 0,
          harga: 0,
          modal: 0,
          laba: 0,
        }

        current.qty += 1
        current.harga += sparepart.harga
        current.modal += sparepart.modal
        current.laba += sparepart.harga - sparepart.modal
        map.set(key, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.harga - a.harga)
  }, [filteredServis])


  const chartData = useMemo(() => {
    const map = new Map<
      string,
      {
        tanggalKey: string
        uangMasuk: number
        tagihan: number
        modal: number
        laba: number
        hutang: number
        totalData: number
      }
    >()

    for (const item of filteredServis) {
      const key = item.tanggalKey || getDateKeyFromMs(item.tanggalMasukMs) || "tanpa-tanggal"
      const current = map.get(key) || {
        tanggalKey: key,
        uangMasuk: 0,
        tagihan: 0,
        modal: 0,
        laba: 0,
        hutang: 0,
        totalData: 0,
      }

      current.uangMasuk += item.totalDibayar
      current.tagihan += item.totalTagihan
      current.modal += item.modalSparepart
      current.laba += item.labaKotor
      current.hutang += item.sisaHutang
      current.totalData += 1
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.tanggalKey.localeCompare(a.tanggalKey))
  }, [filteredServis])

  const maxChartValue = Math.max(
    1,
    ...chartData.map((item) => Math.max(item.uangMasuk, item.laba, item.hutang)),
  )

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredServis.length / itemsPerPage))
  const pagedServis = itemsPerPage === 0 ? filteredServis : filteredServis.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => setPage(1), [search, filterToko, filterStatus, filterPembayaran, tanggalMulai, tanggalSelesai, itemsPerPage])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const resetFilter = () => {
    setSearch("")
    setFilterToko(isAdminUser ? "" : String(currentUserProfile?.tokoId || ""))
    setFilterStatus("semua")
    setFilterPembayaran("semua")
    setTanggalMulai(getStartOfMonthDateInput())
    setTanggalSelesai(toDateInputValue(new Date()))
  }

  const handleExportCsv = () => {
    if (filteredServis.length === 0) {
      showError("Tidak ada data servis untuk diexport")
      return
    }

    const headers = [
      "No",
      "Tanggal",
      "Toko",
      "Nomor Servis",
      "Pelanggan",
      "No HP",
      "Perangkat",
      "Keluhan",
      "Tindakan",
      "Teknisi",
      "Status Servis",
      "Status Pembayaran",
      "Biaya Jasa",
      "Harga Sparepart",
      "Modal Sparepart",
      "Diskon",
      "Total Tagihan",
      "Total Dibayar",
      "Sisa Hutang",
      "Laba Cash",
      "Sparepart",
    ]

    const rows = filteredServis.map((item, index) => [
      index + 1,
      item.tanggalKey,
      item.tokoNama,
      item.nomorServis,
      item.pelangganNama,
      item.pelangganTelepon,
      `${item.perangkatJenis} ${item.perangkatMerk} ${item.perangkatTipe}`.trim(),
      item.keluhan,
      item.tindakan,
      item.teknisiNama,
      getStatusServisLabel(item.statusServis),
      getStatusPembayaranLabel(item.statusPembayaran),
      item.biayaJasa,
      item.hargaSparepart,
      item.modalSparepart,
      item.diskon,
      item.totalTagihan,
      item.totalDibayar,
      item.sisaHutang,
      item.labaKotor,
      item.sparepartItems.map((sparepart) => `${sparepart.nama} (${formatRupiah(sparepart.harga)} / modal ${formatRupiah(sparepart.modal)})`).join(" | "),
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `laporan-servis-${tanggalMulai || "awal"}-${tanggalSelesai || "akhir"}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showSuccess("Laporan servis berhasil diexport")
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
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Laporan Keuangan Servis</h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Rekap khusus jasa servis: uang masuk, tagihan, modal sparepart, hutang, dan laba cash.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/15 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/20"
              >
                <Download size={12} strokeWidth={2.8} />
                Export CSV
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && <ToastBox type="error" message={error} onClose={() => setError(null)} />}
          {successMsg && <ToastBox type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isAdminUser ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
            <div className="lg:col-span-2">
              <FieldBox label="Cari Laporan">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nama, no servis, perangkat, keluhan, teknisi..."
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

              <FilterSelect label="Status Servis" value={filterStatus} onChange={(value) => setFilterStatus(value as StatusFilter)} icon={Wrench}>
                <option value="semua">Semua Status</option>
                {STATUS_SERVIS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </FilterSelect>

              <FilterSelect label="Pembayaran" value={filterPembayaran} onChange={(value) => setFilterPembayaran(value as PembayaranFilter)} icon={Wallet}>
                <option value="semua">Semua Pembayaran</option>
                {STATUS_PEMBAYARAN_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </FilterSelect>

              <FieldDate label="Mulai" value={tanggalMulai} onChange={setTanggalMulai} />
              <FieldDate label="Selesai" value={tanggalSelesai} onChange={setTanggalSelesai} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
            >
              <Download size={14} strokeWidth={2.5} />
              CSV
            </button>
            <button
              type="button"
              onClick={resetFilter}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-600"
            >
              <X size={14} strokeWidth={2.5} />
              Reset
            </button>
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

                  <FilterSelect label="Status Servis" value={filterStatus} onChange={(value) => setFilterStatus(value as StatusFilter)} icon={Wrench}>
                    <option value="semua">Semua Status</option>
                    {STATUS_SERVIS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Pembayaran" value={filterPembayaran} onChange={(value) => setFilterPembayaran(value as PembayaranFilter)} icon={Wallet}>
                    <option value="semua">Semua Pembayaran</option>
                    {STATUS_PEMBAYARAN_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
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
          <StatCard icon={CircleDollarSign} label="Uang Masuk" value={formatRupiah(totalDibayar)} subValue={`${filteredServis.length} data`} tone="sky" />
          <StatCard icon={ReceiptText} label="Total Tagihan" value={formatRupiah(totalTagihan)} subValue={`Rata-rata ${formatRupiah(rataRataMasuk)}`} tone="blue" />
          <StatCard icon={BadgeDollarSign} label="Laba Cash" value={formatRupiah(totalLabaCash)} subValue="Uang masuk - modal" tone="rose" />
          <StatCard icon={Wallet} label="Sisa Hutang" value={formatRupiah(totalHutang)} subValue={`${totalDataHutang} data`} tone="slate" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard icon={Wrench} label="Biaya Jasa" value={formatRupiah(totalBiayaJasa)} subValue="Total jasa" tone="sky" />
          <StatCard icon={Cpu} label="Harga Sparepart" value={formatRupiah(totalHargaSparepart)} subValue="Harga jual sparepart" tone="blue" />
          <StatCard icon={Store} label="Modal Sparepart" value={formatRupiah(totalModalSparepart)} subValue="Biaya modal" tone="rose" />
          <StatCard icon={BarChart3} label="Selesai" value={formatNumber(totalSelesai)} subValue={`Diskon ${formatRupiah(totalDiskon)}`} tone="slate" />
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:hidden">
          <button
            type="button"
            onClick={() => setMobileReportTab("chart")}
            className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
              mobileReportTab === "chart" ? "bg-sky-600 text-white shadow-sm" : "text-slate-500"
            }`}
          >
            Ringkasan
          </button>
          <button
            type="button"
            onClick={() => setMobileReportTab("peringkatToko")}
            className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
              mobileReportTab === "peringkatToko" ? "bg-sky-600 text-white shadow-sm" : "text-slate-500"
            }`}
          >
            Peringkat Toko
          </button>
        </div>

        <div className={`${mobileReportTab === "chart" ? "block" : "hidden"} sm:block`}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="rounded-2xl bg-white p-4 shadow-sm xl:col-span-12">
              <div className="mb-4 flex items-start justify-between gap-3">
                <HeaderTitle title="Grafik Servis" subtitle="Pergerakan uang masuk, laba, dan hutang per tanggal" />
                <div className="hidden rounded-full bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700 sm:block">
                  {formatNumber(chartData.length)} Hari
                </div>
              </div>

              {loading ? (
                <LoadingBox />
              ) : chartData.length === 0 ? (
                <EmptyBox label="Belum ada grafik servis" icon={BarChart3} />
              ) : (
                <div className="space-y-3">
                  {chartData.slice(0, 12).map((item) => (
                    <ChartRow key={item.tanggalKey} item={item} maxValue={maxChartValue} />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        <div className={`${mobileReportTab === "peringkatToko" ? "block" : "hidden"} sm:block`}>
          <div className="space-y-4 sm:hidden">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Peringkat Toko" subtitle="Ranking uang masuk servis sesuai filter" />
              {tokoBreakdown.length === 0 ? (
                <EmptyBox label="Belum ada data toko" icon={Store} />
              ) : (
                <RankingList
                  data={tokoBreakdown.slice(0, 12).map((item) => ({
                    title: item.tokoNama,
                    subtitle: `${item.totalData} data · hutang ${formatRupiah(item.hutang)}`,
                    amount: item.uangMasuk,
                    rightLabel: `Laba ${formatRupiah(item.laba)}`,
                  }))}
                />
              )}
            </div>
          </div>

        <div className="hidden grid-cols-1 gap-4 sm:grid xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <HeaderTitle title="Rekap Servis" subtitle="Daftar data servis sesuai filter" />
                <div className="hidden w-full sm:block sm:max-w-[120px]">
                  <FilterSelect label="Tampilkan" value={String(itemsPerPage)} onChange={(value) => setItemsPerPage(Number(value))}>
                    {ITEMS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </FilterSelect>
                </div>
              </div>

              {loading ? (
                <LoadingBox />
              ) : filteredServis.length === 0 ? (
                <EmptyBox label="Belum ada laporan servis" icon={Wrench} />
              ) : (
                <>
                  <div className="space-y-2 sm:hidden">
                    {pagedServis.map((item, idx) => (
                      <ServisMobileCard key={item.id} item={item} idx={idx} onDetail={() => setDetailItem(item)} />
                    ))}
                  </div>

                  <ServisTable data={pagedServis} page={page} itemsPerPage={itemsPerPage} onDetail={setDetailItem} />

                  {itemsPerPage !== 0 && totalPages > 1 && <Pagination page={page} totalPages={totalPages} goPage={goPage} />}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Status Servis" subtitle="Ringkasan berdasarkan status" />
              <div className="space-y-3">
                {statusBreakdown.map((item) => (
                  <ProgressBox key={item.value} title={item.label} count={item.totalData} total={filteredServis.length} amount={item.uangMasuk} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Toko" subtitle="Ranking uang masuk servis" />
              {tokoBreakdown.length === 0 ? <EmptyBox label="Belum ada data toko" icon={Store} /> : <RankingList data={tokoBreakdown.slice(0, 8).map((item) => ({ title: item.tokoNama, subtitle: `${item.totalData} data · hutang ${formatRupiah(item.hutang)}`, amount: item.uangMasuk, rightLabel: `Laba ${formatRupiah(item.laba)}` }))} />}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Teknisi" subtitle="Ranking laba servis" />
              {teknisiBreakdown.length === 0 ? <EmptyBox label="Belum ada data teknisi" icon={User2} /> : <RankingList data={teknisiBreakdown.slice(0, 8).map((item) => ({ title: item.nama, subtitle: `${item.totalData} data · masuk ${formatRupiah(item.uangMasuk)}`, amount: item.laba, rightLabel: `Hutang ${formatRupiah(item.hutang)}` }))} />}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Sparepart" subtitle="Sparepart paling banyak dipakai" />
              {sparepartBreakdown.length === 0 ? <EmptyBox label="Belum ada data sparepart" icon={Cpu} /> : <RankingList data={sparepartBreakdown.slice(0, 8).map((item) => ({ title: item.nama, subtitle: `${item.qty} pemakaian · modal ${formatRupiah(item.modal)}`, amount: item.harga, rightLabel: `Laba ${formatRupiah(item.laba)}` }))} />}
            </div>
          </div>
        </div>
        </div>

        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      </main>
    </div>
  )
}


function ChartRow({
  item,
  maxValue,
}: {
  item: {
    tanggalKey: string
    uangMasuk: number
    tagihan: number
    modal: number
    laba: number
    hutang: number
    totalData: number
  }
  maxValue: number
}) {
  const uangWidth = Math.max(4, Math.min(100, (item.uangMasuk / maxValue) * 100))
  const labaWidth = Math.max(4, Math.min(100, (Math.max(0, item.laba) / maxValue) * 100))
  const hutangWidth = Math.max(4, Math.min(100, (item.hutang / maxValue) * 100))

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-800">{formatTanggalKey(item.tanggalKey)}</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">{formatNumber(item.totalData)} data servis</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-sky-700">{formatRupiah(item.uangMasuk)}</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-400">Laba {formatRupiah(item.laba)}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <BarLine label="Masuk" value={formatRupiah(item.uangMasuk)} width={uangWidth} tone="sky" />
        <BarLine label="Laba" value={formatRupiah(item.laba)} width={labaWidth} tone="emerald" />
        <BarLine label="Hutang" value={formatRupiah(item.hutang)} width={hutangWidth} tone="amber" />
      </div>
    </div>
  )
}

function BarLine({ label, value, width, tone }: { label: string; value: string; width: number; tone: "sky" | "emerald" | "amber" }) {
  const color = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-sky-500"

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
        <p className="text-[10px] font-black text-slate-600">{value}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
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

function ToastBox({ type, message, onClose }: { type: "error" | "success"; message: string; onClose: () => void }) {
  const success = type === "success"
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg ${success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
    >
      {success ? <CheckCircle2 size={16} className="text-emerald-600" strokeWidth={2.5} /> : <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />}
      <p className={`max-w-xs text-xs font-black ${success ? "text-emerald-700" : "text-red-700"}`}>{message}</p>
      <button type="button" onClick={onClose} className={success ? "text-emerald-500" : "text-red-500"}>
        <X size={14} strokeWidth={3} />
      </button>
    </motion.div>
  )
}

function LoadingBox() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" strokeWidth={2.5} />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat laporan servis...</p>
      </div>
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

function ProgressBox({ title, count, total, amount }: { title: string; count: number; total: number; amount: number }) {
  const percent = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">{title}</p>
          <p className="mt-0.5 text-[10px] font-bold text-slate-500">{formatRupiah(amount)}</p>
        </div>
        <p className="text-sm font-black text-sky-700">{formatNumber(count)}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-1 text-[10px] font-bold text-slate-500">{percent.toFixed(1)}% dari data servis</p>
    </div>
  )
}

function RankingList({ data }: { data: { title: string; subtitle: string; amount: number; rightLabel: string }[] }) {
  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={`${item.title}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-black text-white">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-800">{item.title}</p>
                  <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{item.subtitle}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-black text-slate-800">{formatRupiah(item.amount)}</p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">{item.rightLabel}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusServisBadge({ status }: { status: StatusServis }) {
  const cls =
    status === "diambil"
      ? "bg-emerald-50 text-emerald-700"
      : status === "selesai"
        ? "bg-sky-50 text-sky-700"
        : status === "proses"
          ? "bg-amber-50 text-amber-700"
          : status === "batal"
            ? "bg-rose-50 text-rose-700"
            : "bg-slate-100 text-slate-600"

  return <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${cls}`}>{getStatusServisLabel(status)}</span>
}

function StatusPembayaranBadge({ status, sisaHutang }: { status: StatusPembayaran; sisaHutang: number }) {
  const lunas = status === "lunas" || sisaHutang <= 0
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${lunas ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {lunas ? "Lunas" : getStatusPembayaranLabel(status)}
    </span>
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

function ServisMobileCard({ item, idx, onDetail }: { item: ServisItem; idx: number; onDetail: () => void }) {
  return (
    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx * 0.03 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100"><Wrench size={20} strokeWidth={2.5} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">{item.pelangganNama}</p>
              <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.perangkatMerk || item.perangkatJenis} {item.perangkatTipe}</p>
            </div>
            <StatusServisBadge status={item.statusServis} />
          </div>
          <p className="mt-2 truncate text-[10px] font-bold text-slate-500">{item.nomorServis} · {formatDateTime(item.tanggalMasukMs)}</p>
          <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-600">{item.keluhan || item.tindakan || "Tanpa keluhan"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <MiniInfo label="Masuk" value={formatRupiah(item.totalDibayar)} />
            <MiniInfo label="Laba" value={formatRupiah(item.labaKotor)} />
            <MiniInfo label="Modal" value={formatRupiah(item.modalSparepart)} />
            <MiniInfo label="Hutang" value={item.sisaHutang > 0 ? formatRupiah(item.sisaHutang) : "-"} />
          </div>
          <button type="button" onClick={onDetail} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15">
            <ReceiptText size={13} strokeWidth={2.7} />
            Detail
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function ServisTable({ data, page, itemsPerPage, onDetail }: { data: ServisItem[]; page: number; itemsPerPage: number; onDetail: (item: ServisItem) => void }) {
  const heads = ["No", "Tanggal", "Toko", "Pelanggan", "Perangkat", "Status", "Masuk", "Modal", "Laba", "Hutang", "Aksi"]

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-100 bg-slate-50/70">
            <tr>
              {heads.map((head) => <th key={head} className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${head === "No" || head === "Aksi" ? "text-center" : "text-left"}`}>{head}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                <td className="px-3 py-3 text-center font-bold text-slate-400">{itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatDateTime(item.tanggalMasukMs)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                <td className="px-3 py-3">
                  <p className="whitespace-nowrap font-black text-slate-800">{item.pelangganNama || "Tanpa Nama"}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-slate-400">{item.nomorServis}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="whitespace-nowrap font-semibold text-slate-700">{item.perangkatMerk || item.perangkatJenis} {item.perangkatTipe}</p>
                  <p className="mt-0.5 max-w-[210px] truncate text-[10px] font-semibold text-slate-400">{item.tindakan || item.keluhan}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3"><StatusServisBadge status={item.statusServis} /></td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatRupiah(item.totalDibayar)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatRupiah(item.modalSparepart)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-sky-700">{formatRupiah(item.labaKotor)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-amber-700">{item.sisaHutang > 0 ? formatRupiah(item.sisaHutang) : "-"}</td>
                <td className="px-3 py-3 text-center">
                  <button type="button" onClick={() => onDetail(item)} className="inline-flex h-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 hover:bg-sky-100">Detail</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

function Pagination({ page, totalPages, goPage }: { page: number; totalPages: number; goPage: (page: number) => void }) {
  return (
    <div className="flex justify-center gap-1.5 pt-3">
      <button type="button" onClick={() => goPage(page - 1)} disabled={page === 1} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30">
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
            <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">···</span>
          ) : (
            <button key={p} type="button" onClick={() => goPage(p)} className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${page === p ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {p}
            </button>
          ),
        )}
      <button type="button" onClick={() => goPage(page + 1)} disabled={page === totalPages} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30">
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function DetailModal({ item, onClose }: { item: ServisItem | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.2, ease: "easeOut" }} className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Detail Laporan Servis</p>
                <h2 className="truncate text-base font-black text-slate-800">{item.nomorServis}</h2>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={17} strokeWidth={2.5} /></button>
            </div>

            <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniInfo label="Tagihan" value={formatRupiah(item.totalTagihan)} />
                <MiniInfo label="Dibayar" value={formatRupiah(item.totalDibayar)} />
                <MiniInfo label="Modal" value={formatRupiah(item.modalSparepart)} />
                <MiniInfo label="Laba" value={formatRupiah(item.labaKotor)} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <HeaderTitle title="Pelanggan" subtitle="Data perangkat dan status" />
                  <InfoLine label="Tanggal" value={formatTanggalKey(item.tanggalKey)} />
                  <InfoLine label="Toko" value={item.tokoNama || "-"} />
                  <InfoLine label="Pelanggan" value={item.pelangganNama || "-"} />
                  <InfoLine label="No HP" value={item.pelangganTelepon || "-"} />
                  <InfoLine label="Perangkat" value={`${item.perangkatJenis} ${item.perangkatMerk} ${item.perangkatTipe}`.trim() || "-"} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusServisBadge status={item.statusServis} />
                    <StatusPembayaranBadge status={item.statusPembayaran} sisaHutang={item.sisaHutang} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <HeaderTitle title="Perbaikan" subtitle="Keluhan dan tindakan" />
                  <InfoLine label="Keluhan" value={item.keluhan || "-"} />
                  <InfoLine label="Tindakan" value={item.tindakan || "-"} />
                  <InfoLine label="Teknisi" value={item.teknisiNama || "-"} />
                  <InfoLine label="Waktu Masuk" value={formatDateTime(item.tanggalMasukMs)} />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <HeaderTitle title="Sparepart" subtitle="Daftar sparepart yang dipakai" />
                {item.sparepartItems.length === 0 ? (
                  <EmptyBox label="Tidak ada sparepart" icon={Cpu} />
                ) : (
                  <div className="space-y-2">
                    {item.sparepartItems.map((sparepart, index) => (
                      <div key={`${sparepart.id}-${index}`} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-4 sm:items-center">
                        <div className="sm:col-span-2">
                          <p className="text-sm font-black text-slate-800">{sparepart.nama || `Sparepart ${index + 1}`}</p>
                          <p className="text-[10px] font-bold text-slate-400">#{index + 1}</p>
                        </div>
                        <MiniInfo label="Harga" value={formatRupiah(sparepart.harga)} />
                        <MiniInfo label="Modal" value={formatRupiah(sparepart.modal)} />
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 border-b border-slate-100 pb-2 last:border-b-0">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm font-bold text-slate-700">{value}</p>
    </div>
  )
}
