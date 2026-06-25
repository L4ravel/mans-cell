/* app/admin/servis/histori/page.tsx */

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore"
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  FileClock,
  History,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  Store,
  User2,
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

type ServisSparepartItem = {
  id: string
  nama: string
  harga: number
  modal: number
}

type ServisHistoriSnapshot = {
  tokoId: string
  tokoNama: string
  pelangganNama: string
  pelangganTelepon: string
  perangkatJenis: string
  perangkatMerk: string
  perangkatTipe: string
  imeiSerial: string
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
  catatan: string
  tanggalMasukMs: number
  tanggalSelesaiMs: number
  tanggalDiambilMs: number
  tanggalKey: string
  bulanKey: string
}

type ServisHistoriItem = {
  id: string
  servisId: string
  nomorServis: string
  tokoId: string
  tokoNama: string
  pelangganNama: string
  aksi: string
  alasan: string
  changedFields: string[]
  sebelum: Partial<ServisHistoriSnapshot>
  sesudah: Partial<ServisHistoriSnapshot>
  createdAtMs: number
  createdByUid: string
  createdByNama: string
  createdByEmail: string
}

type AksiFilter = "semua" | "edit_servis" | "edit_setelah_diambil" | "ubah_status_cepat"

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const AKSI_OPTIONS: Array<{ value: AksiFilter; label: string }> = [
  { value: "semua", label: "Semua Aksi" },
  { value: "edit_servis", label: "Edit Servis" },
  { value: "edit_setelah_diambil", label: "Edit Setelah Diambil" },
  { value: "ubah_status_cepat", label: "Ubah Status Cepat" },
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

const HISTORI_FIELD_LABELS: Record<keyof ServisHistoriSnapshot, string> = {
  tokoId: "Toko",
  tokoNama: "Nama Toko",
  pelangganNama: "Nama Pelanggan",
  pelangganTelepon: "Telepon Pelanggan",
  perangkatJenis: "Jenis Perangkat",
  perangkatMerk: "Merk Perangkat",
  perangkatTipe: "Tipe Perangkat",
  imeiSerial: "IMEI / Serial",
  keluhan: "Keluhan",
  tindakan: "Tindakan",
  sparepartNama: "Sparepart",
  sparepartItems: "List Sparepart",
  teknisiNama: "Teknisi",
  statusServis: "Status Servis",
  statusPembayaran: "Status Pembayaran",
  biayaJasa: "Biaya Jasa",
  hargaSparepart: "Harga Sparepart",
  modalSparepart: "Modal Sparepart",
  diskon: "Diskon",
  totalTagihan: "Total Tagihan",
  totalDibayar: "Total Dibayar",
  sisaHutang: "Sisa Hutang",
  labaKotor: "Laba Cash",
  catatan: "Catatan",
  tanggalMasukMs: "Tanggal Masuk",
  tanggalSelesaiMs: "Tanggal Selesai",
  tanggalDiambilMs: "Tanggal Diambil",
  tanggalKey: "Tanggal Key",
  bulanKey: "Bulan Key",
}

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

function getFirestoreMillis(value: any) {
  if (!value) return 0
  if (typeof value?.toMillis === "function") return normalizeNumber(value.toMillis())
  if (typeof value?.seconds === "number") return normalizeNumber(value.seconds * 1000)
  return normalizeNumber(value)
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

function formatDateTime(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
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

function getStatusServisLabel(value: string) {
  return STATUS_SERVIS_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

function getStatusPembayaranLabel(value: string) {
  return STATUS_PEMBAYARAN_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

function getAksiLabel(value: string) {
  if (value === "edit_setelah_diambil") return "Edit Setelah Diambil"
  if (value === "ubah_status_cepat") return "Ubah Status Cepat"
  if (value === "edit_servis") return "Edit Servis"
  return value || "-"
}

function getHistoriFieldLabel(key: string) {
  return HISTORI_FIELD_LABELS[key as keyof ServisHistoriSnapshot] || key
}

function normalizeSparepartItems(value: unknown): ServisSparepartItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item: any, index: number): ServisSparepartItem => ({
      id: String(item?.id || `sp-${index + 1}`),
      nama: String(item?.nama || "").trim(),
      harga: Math.max(0, normalizeNumber(item?.harga)),
      modal: Math.max(0, normalizeNumber(item?.modal)),
    }))
    .filter((item) => item.nama || item.harga > 0 || item.modal > 0)
}

function normalizeSnapshot(value: any): Partial<ServisHistoriSnapshot> {
  if (!value || typeof value !== "object") return {}
  return {
    ...value,
    sparepartItems: normalizeSparepartItems(value?.sparepartItems),
  }
}

function normalizeHistoriDoc(id: string, raw: any): ServisHistoriItem {
  return {
    id,
    servisId: String(raw?.servisId || ""),
    nomorServis: String(raw?.nomorServis || ""),
    tokoId: String(raw?.tokoId || ""),
    tokoNama: String(raw?.tokoNama || ""),
    pelangganNama: String(raw?.pelangganNama || ""),
    aksi: String(raw?.aksi || "edit_servis"),
    alasan: String(raw?.alasan || ""),
    changedFields: Array.isArray(raw?.changedFields) ? raw.changedFields.map((item: any) => String(item || "")).filter(Boolean) : [],
    sebelum: normalizeSnapshot(raw?.sebelum),
    sesudah: normalizeSnapshot(raw?.sesudah),
    createdAtMs: normalizeNumber(raw?.createdAtMs || getFirestoreMillis(raw?.createdAt)),
    createdByUid: String(raw?.createdByUid || ""),
    createdByNama: String(raw?.createdByNama || ""),
    createdByEmail: String(raw?.createdByEmail || ""),
  }
}

function formatHistoriValue(field: string, value: any) {
  if (value === undefined || value === null || value === "") return "-"
  if (field === "statusServis") return getStatusServisLabel(String(value))
  if (field === "statusPembayaran") return getStatusPembayaranLabel(String(value))
  if (field.toLowerCase().includes("ms")) return formatDateTime(normalizeNumber(value))
  if (["biayaJasa", "hargaSparepart", "modalSparepart", "diskon", "totalTagihan", "totalDibayar", "sisaHutang", "labaKotor"].includes(field)) {
    return formatRupiah(normalizeNumber(value))
  }
  if (field === "sparepartItems") {
    const rows = normalizeSparepartItems(value)
    if (rows.length === 0) return "-"
    return rows.map((item) => `${item.nama || "Tanpa Nama"} (${formatRupiah(item.harga)} / modal ${formatRupiah(item.modal)})`).join(" | ")
  }
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export default function HistoriServisPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [historiList, setHistoriList] = useState<ServisHistoriItem[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)
  const [detailItem, setDetailItem] = useState<ServisHistoriItem | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterAksi, setFilterAksi] = useState<AksiFilter>("semua")
  const [tanggalMulai, setTanggalMulai] = useState(getStartOfMonthDateInput())
  const [tanggalSelesai, setTanggalSelesai] = useState(toDateInputValue(new Date()))
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

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
      setHistoriList([])
      showError("Akun ini belum terhubung ke toko")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const tokoPromise = admin ? getDocs(query(collection(db, "toko"), orderBy("nama"))) : null
      const historiPromise = getDocs(query(collection(db, "servis_histori"), orderBy("createdAtMs", "desc")))
      const [tokoSnap, historiSnap] = await Promise.all([tokoPromise, historiPromise])

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

      const rows = historiSnap.docs
        .map((item) => normalizeHistoriDoc(item.id, item.data()))
        .filter((item) => (admin ? true : item.tokoId === tokoIdUser))

      setHistoriList(rows)
    } catch (err) {
      console.error(err)
      setTokoList([])
      setHistoriList([])
      showError("Gagal memuat histori servis")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUserProfile(null)
        setTokoList([])
        setHistoriList([])
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

  const filteredHistori = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMs = startOfDayMs(tanggalMulai)
    const endMs = endOfDayMs(tanggalSelesai)

    return historiList.filter((item) => {
      const changedText = item.changedFields.map(getHistoriFieldLabel).join(" ").toLowerCase()
      const matchSearch =
        !q ||
        item.nomorServis.toLowerCase().includes(q) ||
        item.servisId.toLowerCase().includes(q) ||
        item.pelangganNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.createdByNama.toLowerCase().includes(q) ||
        item.createdByEmail.toLowerCase().includes(q) ||
        item.alasan.toLowerCase().includes(q) ||
        getAksiLabel(item.aksi).toLowerCase().includes(q) ||
        changedText.includes(q)

      const matchToko = !effectiveTokoId || item.tokoId === effectiveTokoId
      const matchAksi = filterAksi === "semua" || item.aksi === filterAksi
      const matchStart = !startMs || item.createdAtMs >= startMs
      const matchEnd = !endMs || item.createdAtMs <= endMs

      return matchSearch && matchToko && matchAksi && matchStart && matchEnd
    })
  }, [historiList, search, effectiveTokoId, filterAksi, tanggalMulai, tanggalSelesai])

  const totalEditSetelahDiambil = filteredHistori.filter((item) => item.aksi === "edit_setelah_diambil").length
  const totalStatusCepat = filteredHistori.filter((item) => item.aksi === "ubah_status_cepat").length
  const totalEditor = new Set(filteredHistori.map((item) => item.createdByUid || item.createdByNama).filter(Boolean)).size
  const totalFieldBerubah = filteredHistori.reduce((acc, item) => acc + item.changedFields.length, 0)

  const aksiBreakdown = useMemo(() => {
    return AKSI_OPTIONS.filter((item) => item.value !== "semua").map((item) => {
      const count = filteredHistori.filter((histori) => histori.aksi === item.value).length
      return { ...item, count }
    })
  }, [filteredHistori])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredHistori.length / itemsPerPage))
  const pagedHistori = itemsPerPage === 0 ? filteredHistori : filteredHistori.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => setPage(1), [search, filterToko, filterAksi, tanggalMulai, tanggalSelesai, itemsPerPage])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const resetFilter = () => {
    setSearch("")
    setFilterToko(isAdminUser ? "" : String(currentUserProfile?.tokoId || ""))
    setFilterAksi("semua")
    setTanggalMulai(getStartOfMonthDateInput())
    setTanggalSelesai(toDateInputValue(new Date()))
  }

  const handleExportCsv = () => {
    if (filteredHistori.length === 0) {
      showError("Tidak ada histori servis untuk diexport")
      return
    }

    const headers = [
      "No",
      "Waktu",
      "Toko",
      "Nomor Servis",
      "Pelanggan",
      "Aksi",
      "Editor",
      "Alasan",
      "Field Berubah",
    ]

    const rows = filteredHistori.map((item, index) => [
      index + 1,
      formatDateTime(item.createdAtMs),
      item.tokoNama,
      item.nomorServis,
      item.pelangganNama,
      getAksiLabel(item.aksi),
      item.createdByNama || item.createdByEmail,
      item.alasan,
      item.changedFields.map(getHistoriFieldLabel).join(" | "),
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `histori-servis-${tanggalMulai || "awal"}-${tanggalSelesai || "akhir"}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showSuccess("Histori servis berhasil diexport")
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
                <History size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Histori Servis</h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Audit semua perubahan data servis, termasuk edit setelah barang diambil, alasan perubahan, editor, dan field yang berubah.
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
              <button
                type="button"
                onClick={() => fetchAll()}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
              >
                <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
                Refresh
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
              <FieldBox label="Cari Histori">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="No servis, pelanggan, alasan, editor..."
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

              <FilterSelect label="Aksi" value={filterAksi} onChange={(value) => setFilterAksi(value as AksiFilter)} icon={FileClock}>
                {AKSI_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </FilterSelect>
              <FieldDate label="Mulai" value={tanggalMulai} onChange={setTanggalMulai} />
              <FieldDate label="Selesai" value={tanggalSelesai} onChange={setTanggalSelesai} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 sm:hidden">
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
              onClick={() => fetchAll()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              Refresh
            </button>
            <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
              <History size={14} strokeWidth={2.5} />
              {filteredHistori.length}
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

                  <FilterSelect label="Aksi" value={filterAksi} onChange={(value) => setFilterAksi(value as AksiFilter)} icon={FileClock}>
                    {AKSI_OPTIONS.map((item) => (
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
                  <button
                    type="button"
                    onClick={resetFilter}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600"
                  >
                    Reset Filter
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard icon={History} label="Total Histori" value={formatNumber(filteredHistori.length)} subValue="Perubahan tercatat" tone="sky" />
          <StatCard icon={AlertCircle} label="Setelah Diambil" value={formatNumber(totalEditSetelahDiambil)} subValue="Butuh alasan" tone="rose" />
          <StatCard icon={Clock} label="Status Cepat" value={formatNumber(totalStatusCepat)} subValue="Proses / selesai" tone="blue" />
          <StatCard icon={User2} label="Editor" value={formatNumber(totalEditor)} subValue={`${formatNumber(totalFieldBerubah)} field berubah`} tone="slate" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <HeaderTitle title="Daftar Histori" subtitle="Semua catatan perubahan data servis" />
                <div className="hidden w-full gap-2 sm:flex sm:max-w-[260px]">
                  <button
                    type="button"
                    onClick={resetFilter}
                    className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                  <div className="flex-1">
                    <FilterSelect label="Tampilkan" value={String(itemsPerPage)} onChange={(value) => setItemsPerPage(Number(value))}>
                      {ITEMS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </FilterSelect>
                  </div>
                </div>
              </div>

              {loading ? (
                <LoadingBox />
              ) : filteredHistori.length === 0 ? (
                <EmptyBox label="Belum ada histori servis" icon={History} />
              ) : (
                <>
                  <div className="space-y-2 sm:hidden">
                    {pagedHistori.map((item, idx) => (
                      <HistoriMobileCard key={item.id} item={item} idx={idx} onDetail={() => setDetailItem(item)} />
                    ))}
                  </div>

                  <HistoriTable
                    data={pagedHistori}
                    page={page}
                    itemsPerPage={itemsPerPage}
                    onDetail={setDetailItem}
                  />

                  {itemsPerPage !== 0 && totalPages > 1 && <Pagination page={page} totalPages={totalPages} goPage={goPage} />}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Ringkasan Aksi" subtitle="Jumlah histori berdasarkan jenis perubahan" />
              <div className="space-y-3">
                {aksiBreakdown.map((item) => (
                  <ProgressBox key={item.value} title={item.label} count={item.count} total={filteredHistori.length} />
                ))}
              </div>
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

function AksiBadge({ aksi }: { aksi: string }) {
  const cls =
    aksi === "edit_setelah_diambil"
      ? "bg-rose-50 text-rose-700"
      : aksi === "ubah_status_cepat"
        ? "bg-sky-50 text-sky-700"
        : "bg-slate-100 text-slate-600"

  return <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${cls}`}>{getAksiLabel(aksi)}</span>
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
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat histori servis...</p>
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

function ProgressBox({ title, count, total }: { title: string; count: number; total: number }) {
  const percent = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-800">{title}</p>
        <p className="text-sm font-black text-sky-700">{formatNumber(count)}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-1 text-[10px] font-bold text-slate-500">{percent.toFixed(1)}% dari histori</p>
    </div>
  )
}

function HistoriMobileCard({ item, idx, onDetail }: { item: ServisHistoriItem; idx: number; onDetail: () => void }) {
  return (
    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx * 0.03 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100"><History size={20} strokeWidth={2.5} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">{item.pelangganNama || "Tanpa Nama"}</p>
              <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.nomorServis || item.servisId}</p>
            </div>
            <AksiBadge aksi={item.aksi} />
          </div>
          <p className="mt-2 truncate text-[10px] font-bold text-slate-500">{formatDateTime(item.createdAtMs)} · {item.createdByNama || item.createdByEmail || "-"}</p>
          <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-600">{item.alasan || "Tanpa alasan"}</p>
          <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
            {item.changedFields.slice(0, 4).map((field) => (
              <span key={field} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{getHistoriFieldLabel(field)}</span>
            ))}
            {item.changedFields.length > 4 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">+{item.changedFields.length - 4}</span>}
          </div>
          <button type="button" onClick={onDetail} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15">
            <FileClock size={13} strokeWidth={2.7} />
            Detail Histori
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function HistoriTable({
  data,
  page,
  itemsPerPage,
  onDetail,
}: {
  data: ServisHistoriItem[]
  page: number
  itemsPerPage: number
  onDetail: (item: ServisHistoriItem) => void
}) {
  const heads = ["No", "Waktu", "Toko", "Nomor Servis", "Pelanggan", "Jenis Aksi", "Editor", "Field", "Detail"]

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
                <td className="px-3 py-3">
                  <p className="whitespace-nowrap font-black text-slate-800">{item.nomorServis || "-"}</p>
                  <p className="mt-0.5 max-w-[170px] truncate text-[10px] font-semibold text-slate-400">{item.servisId}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">{item.pelangganNama || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3"><AksiBadge aksi={item.aksi} /></td>
                <td className="px-3 py-3">
                  <p className="whitespace-nowrap font-semibold text-slate-700">{item.createdByNama || "-"}</p>
                  <p className="mt-0.5 max-w-[170px] truncate text-[10px] font-semibold text-slate-400">{item.createdByEmail || "-"}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="flex max-w-[260px] flex-wrap gap-1">
                    {item.changedFields.slice(0, 3).map((field) => (
                      <span key={field} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{getHistoriFieldLabel(field)}</span>
                    ))}
                    {item.changedFields.length > 3 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">+{item.changedFields.length - 3}</span>}
                  </div>
                </td>
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

function DetailModal({ item, onClose }: { item: ServisHistoriItem | null; onClose: () => void }) {
  const fields = item?.changedFields || []

  return (
    <AnimatePresence>
      {item && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.22, ease: "easeOut" }} className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Detail Histori Servis</p>
                <h2 className="truncate text-base font-black text-slate-800">{item.nomorServis || item.servisId}</h2>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={17} strokeWidth={2.5} /></button>
            </div>

            <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailInfo label="Waktu" value={formatDateTime(item.createdAtMs)} />
                <DetailInfo label="Toko" value={item.tokoNama || "-"} />
                <DetailInfo label="Pelanggan" value={item.pelangganNama || "-"} />
                <DetailInfo label="Aksi" value={getAksiLabel(item.aksi)} />
                <DetailInfo label="Editor" value={item.createdByNama || item.createdByEmail || "-"} />
                <DetailInfo label="Email Editor" value={item.createdByEmail || "-"} />
                <DetailInfo label="Nomor Servis" value={item.nomorServis || "-"} />
                <DetailInfo label="ID Servis" value={item.servisId || "-"} />
              </div>

              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Alasan Perubahan</p>
                <p className="mt-1 text-sm font-bold leading-relaxed text-amber-900">{item.alasan || "Tanpa alasan"}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <HeaderTitle title="Perubahan Field" subtitle={`${fields.length} field berubah`} />

                {fields.length === 0 ? (
                  <div className="mt-4">
                    <EmptyBox label="Tidak ada detail field berubah" icon={FileClock} />
                  </div>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b border-slate-100 bg-slate-50/70">
                          <tr>
                            <th className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Field</th>
                            <th className="min-w-[240px] px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Sebelum</th>
                            <th className="min-w-[240px] px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Sesudah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((field) => (
                            <tr key={field} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-3 font-black text-slate-700">{getHistoriFieldLabel(field)}</td>
                              <td className="px-3 py-3 font-semibold leading-relaxed text-rose-700">{formatHistoriValue(field, (item.sebelum as any)?.[field])}</td>
                              <td className="px-3 py-3 font-semibold leading-relaxed text-emerald-700">{formatHistoriValue(field, (item.sesudah as any)?.[field])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

function DetailInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-800">{value}</p>
    </div>
  )
}

function Pagination({ page, totalPages, goPage }: { page: number; totalPages: number; goPage: (page: number) => void }) {
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Halaman {page} dari {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:opacity-40"
        >
          <ChevronLeft size={14} strokeWidth={2.6} />
        </button>
        <button
          type="button"
          onClick={() => goPage(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:opacity-40"
        >
          <ChevronRight size={14} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  )
}
