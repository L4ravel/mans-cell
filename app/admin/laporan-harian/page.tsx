/* app/admin/laporan-harian/page.tsx */

"use client"

import { useEffect, useMemo, useState } from "react"
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
  Cpu,
  FolderKanban,
  ListFilter,
  Percent,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = { id: string; nama: string; aktif?: boolean }

type BreakdownMetode = {
  nama: string
  jumlahTransaksi: number
  omzet: number
  admin: number
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
  totalItem: number
  totalQty: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  omzet: number
  totalModal: number
  totalLabaKotor: number
}

type LaporanHarian = {
  id: string
  tanggalKey: string
  tahun: number
  bulan: number
  hari: number
  tokoId: string
  tokoNama: string
  ownerUid: string
  kasirUid: string
  kasirNama: string
  kasirEmail: string
  jumlahTransaksi: number
  omzet: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  totalBiayaAdmin: number
  totalModal: number
  totalLabaKotor: number
  totalItemTerjual: number
  totalJenisBarangTerjual: number
  rataRataBelanja: number
  metodePembayaranBreakdown: BreakdownMetode[]
  kelompokKategoriBreakdown: KelompokKategoriBreakdown[]
  updatedAtMs: number
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

function formatTanggalKey(value?: string) {
  if (!value) return "-"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(date)
}

function formatDateTime(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
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

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim()).filter(Boolean)
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

function getKelompokLabaKotor(item: any) {
  const directValue = getFirstFilledNumber(
    item?.totalLabaKotor,
    item?.labaBersih,
    item?.estimasiLabaKotor,
    item?.keuntungan,
    item?.untung,
    item?.laba,
  )

  if (directValue !== 0) return directValue

  const totalSetelahDiskon = normalizeNumber(item?.totalSetelahDiskon ?? item?.omzet)
  const totalModal = normalizeNumber(item?.totalModal ?? item?.modal)

  if (totalSetelahDiskon !== 0 && totalModal !== 0) {
    return totalSetelahDiskon - totalModal
  }

  return 0
}

function isAdminProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (["admin", "owner", "superadmin"].includes(role)) return true
  return profile.roles.some((r) => ["admin", "owner", "superadmin"].includes(r))
}

function canViewProfitProfile(profile: UserProfile | null) {
  return isAdminProfile(profile)
}

function formatProfit(value: number, canViewProfit: boolean) {
  return canViewProfit ? formatRupiah(value) : "-"
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const clean = String(value || "").trim()
    if (clean) return clean
  }
  return ""
}

function getLaporanOwnerUid(raw: any) {
  return pickFirstString(
    raw?.ownerUid,
    raw?.kasirUid,
    raw?.kasirId,
    raw?.userId,
    raw?.uid,
    raw?.createdBy,
    raw?.createdByUid,
    raw?.adminUid,
    raw?.karyawanUid,
  )
}

function mapKelompokBreakdown(value: unknown): KelompokKategoriBreakdown[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => ({
      kelompokId: pickFirstString(item?.kelompokId, item?.id, item?.groupId),
      namaKelompok: pickFirstString(item?.namaKelompok, item?.kelompokNama, item?.nama, "Tanpa Kelompok"),
      urutan: Number(item?.urutan || 999),
      tokoId: pickFirstString(item?.tokoId),
      tokoNama: pickFirstString(item?.tokoNama),
      kategoriIds: normalizeStringArray(item?.kategoriIds),
      kategoriNama: normalizeStringArray(item?.kategoriNama),
      jumlahTransaksi: Number(item?.jumlahTransaksi || item?.transaksi || 0),
      totalItem: Number(item?.totalItem || item?.totalJenisBarang || 0),
      totalQty: normalizeNumber(item?.totalQty ?? item?.qtyTerjual ?? item?.qty ?? item?.totalItemTerjual),
      subtotal: normalizeNumber(item?.subtotal),
      totalDiskon: normalizeNumber(item?.totalDiskon),
      totalSetelahDiskon: normalizeNumber(item?.totalSetelahDiskon ?? item?.omzet),
      omzet: normalizeNumber(item?.omzet ?? item?.totalSetelahDiskon),
      totalModal: normalizeNumber(item?.totalModal ?? item?.modal),
      totalLabaKotor: getKelompokLabaKotor(item),
    }))
    .filter((item) => item.namaKelompok)
}

export default function LaporanHarianPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [laporanList, setLaporanList] = useState<LaporanHarian[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [tanggalMulai, setTanggalMulai] = useState(getStartOfMonthDateInput())
  const [tanggalSelesai, setTanggalSelesai] = useState(toDateInputValue(new Date()))
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [showKelompokModal, setShowKelompokModal] = useState(false)

  const isAdminUser = useMemo(() => isAdminProfile(currentUserProfile), [currentUserProfile])
  const canViewProfit = useMemo(() => canViewProfitProfile(currentUserProfile), [currentUserProfile])

  const effectiveTokoId = useMemo(
    () => (isAdminUser ? filterToko : String(currentUserProfile?.tokoId || "").trim()),
    [isAdminUser, filterToko, currentUserProfile]
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

  const mapLaporanDoc = (id: string, raw: any): LaporanHarian => {
    const metodeBreakdown: BreakdownMetode[] = Array.isArray(raw?.metodePembayaranBreakdown)
      ? raw.metodePembayaranBreakdown.map((item: any) => ({
          nama: item?.nama || "Tanpa Nama",
          jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
          omzet: Number(item?.omzet || 0),
          admin: Number(item?.admin || 0),
        }))
      : []

    return {
      id,
      tanggalKey: raw?.tanggalKey || "",
      tahun: Number(raw?.tahun || 0),
      bulan: Number(raw?.bulan || 0),
      hari: Number(raw?.hari || 0),
      tokoId: raw?.tokoId || "",
      tokoNama: raw?.tokoNama || "",
      ownerUid: getLaporanOwnerUid(raw),
      kasirUid: pickFirstString(raw?.kasirUid, raw?.kasirId, raw?.userId, raw?.uid),
      kasirNama: pickFirstString(raw?.kasirNama, raw?.userNama, raw?.createdByNama, raw?.adminNama, raw?.namaKasir),
      kasirEmail: pickFirstString(raw?.kasirEmail, raw?.userEmail, raw?.createdByEmail, raw?.adminEmail, raw?.emailKasir),
      jumlahTransaksi: Number(raw?.jumlahTransaksi || 0),
      omzet: Number(raw?.omzet || 0),
      subtotal: Number(raw?.subtotal || 0),
      totalDiskon: Number(raw?.totalDiskon || 0),
      totalSetelahDiskon: Number(raw?.totalSetelahDiskon || 0),
      totalBiayaAdmin: Number(raw?.totalBiayaAdmin || 0),
      totalModal: normalizeNumber(raw?.totalModal ?? raw?.modal),
      totalLabaKotor: getFirstFilledNumber(raw?.totalLabaKotor, raw?.estimasiLabaKotor, raw?.labaBersih, raw?.laba),
      totalItemTerjual: Number(raw?.totalItemTerjual || 0),
      totalJenisBarangTerjual: Number(raw?.totalJenisBarangTerjual || 0),
      rataRataBelanja: Number(raw?.rataRataBelanja || 0),
      metodePembayaranBreakdown: metodeBreakdown,
      kelompokKategoriBreakdown: mapKelompokBreakdown(raw?.kelompokKategoriBreakdown),
      updatedAtMs: Number(raw?.updatedAtMs || 0),
    }
  }

  const isOwnLaporan = (laporan: LaporanHarian, profile: UserProfile | null) => {
    if (!profile) return false

    const uid = String(profile.uid || "").trim()
    const email = String(profile.email || "").trim().toLowerCase()
    const tokoIdUser = String(profile.tokoId || "").trim()

    if (laporan.ownerUid) return laporan.ownerUid === uid
    if (laporan.kasirUid) return laporan.kasirUid === uid
    if (laporan.kasirEmail) return laporan.kasirEmail.toLowerCase() === email

    // Fallback untuk data laporan lama yang belum menyimpan kasirUid/userId.
    return !!tokoIdUser && laporan.tokoId === tokoIdUser
  }

  const fetchAll = async (profileOverride?: UserProfile | null) => {
    const activeProfile = profileOverride || currentUserProfile
    const admin = isAdminProfile(activeProfile)
    const tokoIdUser = String(activeProfile?.tokoId || "").trim()

    if (!admin && !activeProfile?.uid && !tokoIdUser) {
      setTokoList([])
      setLaporanList([])
      showError("Akun ini belum terhubung")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const laporanPromise = getDocs(query(collection(db, "laporan_harian"), orderBy("tanggalKey", "desc")))

      if (admin) {
        const [tokoSnap, laporanSnap] = await Promise.all([
          getDocs(query(collection(db, "toko"), orderBy("nama"))),
          laporanPromise,
        ])

        const tokoData: Toko[] = tokoSnap.docs
          .map((item) => {
            const x = item.data() as any
            return { id: item.id, nama: x?.nama || "", aktif: x?.aktif !== false }
          })
          .filter((item) => item.nama)

        const laporanData = laporanSnap.docs
          .map((item) => mapLaporanDoc(item.id, item.data()))
          .filter((item) => item.tanggalKey)

        setTokoList(tokoData)
        setLaporanList(laporanData)
      } else {
        const laporanSnap = await laporanPromise
        const laporanData = laporanSnap.docs
          .map((item) => mapLaporanDoc(item.id, item.data()))
          .filter((item) => item.tanggalKey && isOwnLaporan(item, activeProfile || null))

        setTokoList([{ id: tokoIdUser, nama: String(activeProfile?.tokoNama || "").trim() || "Toko Karyawan", aktif: true }])
        setLaporanList(laporanData)
        setFilterToko(tokoIdUser)
      }
    } catch (err) {
      console.error(err)
      setTokoList([])
      setLaporanList([])
      showError("Gagal memuat laporan harian")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUserProfile(null)
        setTokoList([])
        setLaporanList([])
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

  const filteredLaporan = useMemo(() => {
    const q = search.toLowerCase().trim()

    return laporanList.filter((item) => {
      const matchSearch =
        !q ||
        item.tanggalKey.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.kasirNama.toLowerCase().includes(q) ||
        item.kasirEmail.toLowerCase().includes(q) ||
        item.metodePembayaranBreakdown.some((metode) => metode.nama.toLowerCase().includes(q)) ||
        item.kelompokKategoriBreakdown.some((kelompok) => kelompok.namaKelompok.toLowerCase().includes(q))

      const matchToko = !effectiveTokoId || item.tokoId === effectiveTokoId
      const matchStart = !tanggalMulai || item.tanggalKey >= tanggalMulai
      const matchEnd = !tanggalSelesai || item.tanggalKey <= tanggalSelesai

      return matchSearch && matchToko && matchStart && matchEnd
    })
  }, [laporanList, search, effectiveTokoId, tanggalMulai, tanggalSelesai])

  const totalOmzet = filteredLaporan.reduce((acc, item) => acc + item.omzet, 0)
  const totalTransaksi = filteredLaporan.reduce((acc, item) => acc + item.jumlahTransaksi, 0)
  const totalDiskon = filteredLaporan.reduce((acc, item) => acc + item.totalDiskon, 0)
  const totalAdmin = filteredLaporan.reduce((acc, item) => acc + item.totalBiayaAdmin, 0)
  const totalLabaKotor = filteredLaporan.reduce((acc, item) => acc + item.totalLabaKotor, 0)
  const totalItemTerjual = filteredLaporan.reduce((acc, item) => acc + item.totalItemTerjual, 0)
  const rataRataBelanja = totalTransaksi > 0 ? totalOmzet / totalTransaksi : 0

  const omzetHariIni = filteredLaporan
    .filter((item) => item.tanggalKey === toDateInputValue(new Date()))
    .reduce((acc, item) => acc + item.omzet, 0)

  const metodeBreakdown = useMemo(() => {
    const map = new Map<string, { nama: string; jumlahTransaksi: number; omzet: number; admin: number }>()

    for (const laporan of filteredLaporan) {
      for (const metode of laporan.metodePembayaranBreakdown || []) {
        const key = metode.nama || "Tanpa Nama"
        const current = map.get(key) || { nama: key, jumlahTransaksi: 0, omzet: 0, admin: 0 }

        current.jumlahTransaksi += Number(metode.jumlahTransaksi || 0)
        current.omzet += Number(metode.omzet || 0)
        current.admin += Number(metode.admin || 0)
        map.set(key, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

  const kelompokBreakdown = useMemo(() => {
    const map = new Map<string, KelompokKategoriBreakdown>()

    for (const laporan of filteredLaporan) {
      for (const kelompok of laporan.kelompokKategoriBreakdown || []) {
        const key = kelompok.kelompokId || `${laporan.tokoId}-${kelompok.namaKelompok}`
        const current = map.get(key) || {
          kelompokId: kelompok.kelompokId || key,
          namaKelompok: kelompok.namaKelompok || "Tanpa Kelompok",
          urutan: Number(kelompok.urutan || 999),
          tokoId: kelompok.tokoId || laporan.tokoId,
          tokoNama: kelompok.tokoNama || laporan.tokoNama,
          kategoriIds: [],
          kategoriNama: [],
          jumlahTransaksi: 0,
          totalItem: 0,
          totalQty: 0,
          subtotal: 0,
          totalDiskon: 0,
          totalSetelahDiskon: 0,
          omzet: 0,
          totalModal: 0,
          totalLabaKotor: 0,
        }

        current.kategoriIds = Array.from(new Set([...(current.kategoriIds || []), ...(kelompok.kategoriIds || [])]))
        current.kategoriNama = Array.from(new Set([...(current.kategoriNama || []), ...(kelompok.kategoriNama || [])]))
        current.jumlahTransaksi += Number(kelompok.jumlahTransaksi || 0)
        current.totalItem += Number(kelompok.totalItem || 0)
        current.totalQty += Number(kelompok.totalQty || 0)
        current.subtotal += Number(kelompok.subtotal || 0)
        current.totalDiskon += Number(kelompok.totalDiskon || 0)
        current.totalSetelahDiskon += Number(kelompok.totalSetelahDiskon || 0)
        current.omzet += Number(kelompok.omzet || kelompok.totalSetelahDiskon || 0)
        current.totalModal += normalizeNumber(kelompok.totalModal)
        current.totalLabaKotor += normalizeNumber(kelompok.totalLabaKotor)

        map.set(key, current)
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const tokoCompare = String(a.tokoNama || "").localeCompare(String(b.tokoNama || ""), "id")
      if (tokoCompare !== 0) return tokoCompare
      return Number(a.urutan || 999) - Number(b.urutan || 999)
    })
  }, [filteredLaporan])

  const tokoBreakdown = useMemo(() => {
    const map = new Map<string, { tokoId: string; tokoNama: string; hariAktif: number; transaksi: number; omzet: number }>()

    for (const laporan of filteredLaporan) {
      const key = laporan.tokoId || laporan.tokoNama || laporan.id
      const current = map.get(key) || { tokoId: laporan.tokoId, tokoNama: laporan.tokoNama || "Tanpa Toko", hariAktif: 0, transaksi: 0, omzet: 0 }

      current.hariAktif += 1
      current.transaksi += Number(laporan.jumlahTransaksi || 0)
      current.omzet += Number(laporan.omzet || 0)
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

  const kasirBreakdown = useMemo(() => {
    const map = new Map<string, { uid: string; nama: string; email: string; transaksi: number; omzet: number }>()

    for (const laporan of filteredLaporan) {
      const key = laporan.ownerUid || laporan.kasirUid || laporan.kasirEmail || "tanpa-kasir"
      const current = map.get(key) || { uid: laporan.ownerUid || laporan.kasirUid || "", nama: laporan.kasirNama || "Tanpa Nama", email: laporan.kasirEmail || "-", transaksi: 0, omzet: 0 }

      current.transaksi += Number(laporan.jumlahTransaksi || 0)
      current.omzet += Number(laporan.omzet || 0)
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.omzet - a.omzet)
  }, [filteredLaporan])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredLaporan.length / itemsPerPage))
  const pagedLaporan = itemsPerPage === 0 ? filteredLaporan : filteredLaporan.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => setPage(1), [search, filterToko, tanggalMulai, tanggalSelesai, itemsPerPage])
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
                <BarChart3 size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Laporan Harian</h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  {isAdminUser ? "Admin melihat semua laporan harian toko dan user." : "Anda hanya melihat laporan harian milik akun Anda sendiri."}
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton icon={FolderKanban} label="Kelompok" onClick={() => setShowKelompokModal(true)} />
              <button
                type="button"
                onClick={() => fetchAll()}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                title="Refresh"
              >
                <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
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
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isAdminUser ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <div className="lg:col-span-2">
              <FieldBox label="Cari Laporan">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tanggal, toko, metode, kasir, atau kelompok..."
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
                <FieldBox label="Akses User">
                  <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                    {currentUserProfile?.nama || "Akun Anda"}
                  </div>
                </FieldBox>
              )}

              <FieldDate label="Mulai" value={tanggalMulai} onChange={setTanggalMulai} />
              <FieldDate label="Selesai" value={tanggalSelesai} onChange={setTanggalSelesai} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => fetchAll()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15 disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setShowKelompokModal(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
            >
              <FolderKanban size={14} strokeWidth={2.5} />
              Kelompok
            </button>

            <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
              <ShoppingCart size={14} strokeWidth={2.5} />
              {totalTransaksi} Trx
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
                    <FieldBox label="Akses User">
                      <div className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
                        {currentUserProfile?.nama || "Akun Anda"}
                      </div>
                    </FieldBox>
                  )}

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

        <div className="space-y-2 sm:space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={CircleDollarSign} label="Omzet" value={formatRupiah(totalOmzet)} subValue={`${totalTransaksi} transaksi`} tone="sky" />
            <StatCard icon={Receipt} label="Rata-rata" value={formatRupiah(rataRataBelanja)} subValue={`${totalItemTerjual} item`} tone="blue" />
            <StatCard icon={Percent} label="Diskon" value={formatRupiah(totalDiskon)} subValue={`Admin ${formatRupiah(totalAdmin)}`} tone="slate" />
            <StatCard icon={BadgeDollarSign} label="Keuntungan Bersih" value={formatProfit(totalLabaKotor, canViewProfit)} subValue={canViewProfit ? "Akumulasi" : "Disembunyikan"} tone="rose" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard icon={TrendingUp} label="Hari Ini" value={formatRupiah(omzetHariIni)} tone="sky" />
            <StatCard icon={ShoppingCart} label="Hari Direkap" value={String(filteredLaporan.length)} tone="blue" />
            <StatCard icon={Store} label={isAdminUser ? "Toko Aktif" : "Toko Anda"} value={String(tokoBreakdown.length)} tone="slate" />
            <StatCard icon={FolderKanban} label="Kelompok" value={String(kelompokBreakdown.length)} tone="rose" />
          </div>
        </div>

        <LaporanContent
          loading={loading}
          filteredLaporan={filteredLaporan}
          pagedLaporan={pagedLaporan}
          metodeBreakdown={metodeBreakdown}
          kelompokBreakdown={kelompokBreakdown}
          tokoBreakdown={tokoBreakdown}
          kasirBreakdown={kasirBreakdown}
          totalOmzet={totalOmzet}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={setItemsPerPage}
          page={page}
          totalPages={totalPages}
          goPage={goPage}
          canViewProfit={canViewProfit}
          isAdminUser={isAdminUser}
        />

        <KelompokModal
          show={showKelompokModal}
          onClose={() => setShowKelompokModal(false)}
          data={kelompokBreakdown}
          totalOmzet={totalOmzet}
          canViewProfit={canViewProfit}
        />
      </main>
    </div>
  )
}

function HeaderButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
      title={label}
      type="button"
    >
      <Icon size={12} strokeWidth={2.8} />
      <span>{label}</span>
    </motion.button>
  )
}

function HeaderTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-600">{title}</p>
      <p className="mt-1 text-sm font-black text-slate-800">{subtitle}</p>
    </div>
  )
}

function FieldBox({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
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

function FilterSelect({ value, onChange, children, label, icon: Icon }: { value: string; onChange: (value: string) => void; children: React.ReactNode; label: string; icon?: any }) {
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

function LaporanContent({
  loading,
  filteredLaporan,
  pagedLaporan,
  metodeBreakdown,
  kelompokBreakdown,
  tokoBreakdown,
  kasirBreakdown,
  totalOmzet,
  itemsPerPage,
  setItemsPerPage,
  page,
  totalPages,
  goPage,
  canViewProfit,
  isAdminUser,
}: {
  loading: boolean
  filteredLaporan: LaporanHarian[]
  pagedLaporan: LaporanHarian[]
  metodeBreakdown: { nama: string; jumlahTransaksi: number; omzet: number; admin: number }[]
  kelompokBreakdown: KelompokKategoriBreakdown[]
  tokoBreakdown: { tokoId: string; tokoNama: string; hariAktif: number; transaksi: number; omzet: number }[]
  kasirBreakdown: { uid: string; nama: string; email: string; transaksi: number; omzet: number }[]
  totalOmzet: number
  itemsPerPage: number
  setItemsPerPage: (value: number) => void
  page: number
  totalPages: number
  goPage: (page: number) => void
  canViewProfit: boolean
  isAdminUser: boolean
}) {
  if (loading) return <LoadingBox />

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-7">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <HeaderTitle title="Kelompok Laporan" subtitle="Breakdown penghasilan berdasarkan kelompok kategori" />
          <KelompokList data={kelompokBreakdown.slice(0, 8)} totalOmzet={totalOmzet} canViewProfit={canViewProfit} />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <HeaderTitle title="Metode Pembayaran" subtitle="Breakdown omzet berdasarkan metode bayar" />
          {metodeBreakdown.length === 0 ? (
            <EmptyBox label="Belum ada data metode" icon={Wallet} />
          ) : (
            <div className="space-y-3">
              {metodeBreakdown.map((item) => {
                const persenOmzet = totalOmzet > 0 ? (item.omzet / totalOmzet) * 100 : 0
                return <ProgressBox key={item.nama} title={item.nama} subtitle={`${item.jumlahTransaksi} transaksi`} amount={item.omzet} note={`Admin ${formatRupiah(item.admin)}`} percent={persenOmzet} />
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <HeaderTitle title="Rekap Harian" subtitle="Daftar dokumen laporan_harian" />
            <div className="hidden w-full sm:block sm:max-w-[120px]">
              <FilterSelect label="Tampilkan" value={String(itemsPerPage)} onChange={(value) => setItemsPerPage(Number(value))}>
                {ITEMS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </FilterSelect>
            </div>
          </div>

          {filteredLaporan.length === 0 ? (
            <EmptyBox label="Belum ada laporan harian" icon={BarChart3} />
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {pagedLaporan.map((item, idx) => <LaporanMobileCard key={item.id} item={item} idx={idx} canViewProfit={canViewProfit} />)}
              </div>

              <LaporanTable data={pagedLaporan} page={page} itemsPerPage={itemsPerPage} canViewProfit={canViewProfit} isAdminUser={isAdminUser} />

              {itemsPerPage !== 0 && totalPages > 1 && <Pagination page={page} totalPages={totalPages} goPage={goPage} />}
            </>
          )}
        </div>
      </div>

      <div className="space-y-4 xl:col-span-5">
        {isAdminUser && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <HeaderTitle title="Kasir / User Teratas" subtitle="Ranking user berdasarkan omzet" />
            {kasirBreakdown.length === 0 ? <EmptyBox label="Belum ada data user" icon={ShoppingCart} /> : <RankingList data={kasirBreakdown.slice(0, 8).map((x) => ({ title: x.nama || x.email || "Tanpa Nama", subtitle: x.email, amount: x.omzet, rightLabel: `${x.transaksi} transaksi` }))} />}
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <HeaderTitle title="Toko Teratas" subtitle="Ranking toko berdasarkan omzet" />
          {tokoBreakdown.length === 0 ? <EmptyBox label="Belum ada data toko" icon={Store} /> : <RankingList data={tokoBreakdown.slice(0, 8).map((x) => ({ title: x.tokoNama, subtitle: `${x.hariAktif} hari aktif`, amount: x.omzet, rightLabel: `${x.transaksi} transaksi` }))} />}
        </div>
      </div>
    </div>
  )
}

function LoadingBox() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat laporan harian...</p>
      </div>
    </div>
  )
}

function KelompokList({ data, totalOmzet, canViewProfit }: { data: KelompokKategoriBreakdown[]; totalOmzet: number; canViewProfit: boolean }) {
  if (data.length === 0) return <EmptyBox label="Belum ada data kelompok laporan" icon={FolderKanban} />
  return (
    <div className="space-y-3">
      {data.map((item) => {
        const persenOmzet = totalOmzet > 0 ? (item.omzet / totalOmzet) * 100 : 0
        return (
          <div key={`${item.tokoId}-${item.kelompokId}-${item.namaKelompok}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-800">{item.namaKelompok}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.tokoNama || "-"} · {item.totalQty} item</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-black text-slate-800">{formatRupiah(item.omzet)}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Untung {formatProfit(item.totalLabaKotor, canViewProfit)}</p>
              </div>
            </div>
           
          </div>
        )
      })}
    </div>
  )
}

function ProgressBox({ title, subtitle, amount, note, percent }: { title: string; subtitle: string; amount: number; note: string; percent: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-800">{title}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{subtitle}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-black text-slate-800">{formatRupiah(amount)}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{note}</p>
        </div>
      </div>
      <ProgressBar percent={percent} />
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-3">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-1 text-[10px] font-bold text-slate-500">{percent.toFixed(1)}% dari omzet</p>
    </div>
  )
}

function LaporanMobileCard({ item, idx, canViewProfit }: { item: LaporanHarian; idx: number; canViewProfit: boolean }) {
  return (
    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx * 0.03 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100"><BarChart3 size={20} strokeWidth={2.5} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">{formatTanggalKey(item.tanggalKey)}</p>
              <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.tokoNama || "Tanpa Toko"}</p>
            </div>
            <span className="inline-flex shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">{item.jumlahTransaksi} Trx</span>
          </div>
          {(item.kasirNama || item.kasirEmail) && <p className="mt-2 truncate text-[10px] font-bold text-slate-500">Kasir: {item.kasirNama || item.kasirEmail}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <MiniInfo label="Omzet" value={formatRupiah(item.omzet)} />
            <MiniInfo label="Untung" value={formatProfit(item.totalLabaKotor, canViewProfit)} />
            <MiniInfo label="Diskon" value={formatRupiah(item.totalDiskon)} />
            <MiniInfo label="Item" value={String(item.totalItemTerjual)} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function LaporanTable({ data, page, itemsPerPage, canViewProfit, isAdminUser }: { data: LaporanHarian[]; page: number; itemsPerPage: number; canViewProfit: boolean; isAdminUser: boolean }) {
  const heads = isAdminUser ? ["No", "Tanggal", "Toko", "Kasir", "Transaksi", "Omzet", "Diskon", "Admin", "Untung", "Update"] : ["No", "Tanggal", "Toko", "Transaksi", "Omzet", "Diskon", "Admin", "Untung", "Update"]

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-100 bg-slate-50/70">
            <tr>
              {heads.map((head) => <th key={head} className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${head === "No" ? "text-center" : "text-left"}`}>{head}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                <td className="px-3 py-3 text-center font-bold text-slate-400">{itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatTanggalKey(item.tanggalKey)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                {isAdminUser && <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.kasirNama || item.kasirEmail || "-"}</td>}
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.jumlahTransaksi}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatRupiah(item.omzet)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatRupiah(item.totalDiskon)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatRupiah(item.totalBiayaAdmin)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-sky-700">{formatProfit(item.totalLabaKotor, canViewProfit)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatDateTime(item.updatedAtMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

function RankingList({ data }: { data: { title: string; subtitle: string; amount: number; rightLabel: string }[] }) {
  return (
    <div className="space-y-3">
      {data.map((item, idx) => <RankingBox key={`${item.title}-${idx}`} index={idx} {...item} />)}
    </div>
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
          <p className="text-sm font-black text-slate-800">{formatRupiah(amount)}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{rightLabel}</p>
        </div>
      </div>
    </div>
  )
}

function KelompokModal({ show, onClose, data, totalOmzet, canViewProfit }: { show: boolean; onClose: () => void; data: KelompokKategoriBreakdown[]; totalOmzet: number; canViewProfit: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.22, ease: "easeOut" }} className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Penghasilan Kelompok</p>
                <h2 className="truncate text-base font-black text-slate-800">Rekap Berdasarkan Kelompok Kategori</h2>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={17} strokeWidth={2.5} /></button>
            </div>
            <div className="max-h-[calc(88vh-65px)] overflow-y-auto p-4 sm:p-5">
              {data.length === 0 ? <EmptyBox label="Belum ada data kelompok laporan" icon={FolderKanban} /> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{data.map((item) => <KelompokModalCard key={`${item.tokoId}-${item.kelompokId}-${item.namaKelompok}`} item={item} totalOmzet={totalOmzet} canViewProfit={canViewProfit} />)}</div>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function KelompokModalCard({ item, totalOmzet, canViewProfit }: { item: KelompokKategoriBreakdown; totalOmzet: number; canViewProfit: boolean }) {
  const persenOmzet = totalOmzet > 0 ? (item.omzet / totalOmzet) * 100 : 0
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-800">{item.namaKelompok}</p>
          <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.tokoNama || "-"} · Urutan {item.urutan}</p>
        </div>
        <span className="rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">{item.totalQty} Item</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniInfo label="Omzet" value={formatRupiah(item.omzet)} />
        <MiniInfo label="Untung" value={formatProfit(item.totalLabaKotor, canViewProfit)} />
        <MiniInfo label="Diskon" value={formatRupiah(item.totalDiskon)} />
        <MiniInfo label="Modal" value={formatProfit(item.totalModal, canViewProfit)} />
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
