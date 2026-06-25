/* app/admin/servis/page.tsx */

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import {
  AlertCircle,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Cpu,
  Edit3,
  ListFilter,
  Loader2,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Smartphone,
  Store,
  User2,
  Wrench,
  X,
  History,
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

type FormSparepartItem = {
  id: string
  nama: string
  harga: string
  modal: string
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
  createdAtMs: number
  updatedAtMs: number
  createdByUid: string
  createdByNama: string
  createdByEmail: string
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

type FormState = {
  id: string
  tokoId: string
  pelangganNama: string
  pelangganTelepon: string
  perangkatJenis: string
  perangkatMerk: string
  perangkatTipe: string
  imeiSerial: string
  keluhan: string
  tindakan: string
  sparepartNama: string
  sparepartItems: FormSparepartItem[]
  teknisiNama: string
  statusServis: StatusServis
  statusPembayaran: StatusPembayaran
  biayaJasa: string
  hargaSparepart: string
  modalSparepart: string
  diskon: string
  totalDibayar: string
  catatan: string
  tanggalMasuk: string
  alasanEdit: string
}

type StatusFilter = "semua" | StatusServis

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

function makeEmptySparepartItem(): FormSparepartItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nama: "",
    harga: "",
    modal: "",
  }
}

const defaultFormState = (): FormState => ({
  id: "",
  tokoId: "",
  pelangganNama: "",
  pelangganTelepon: "",
  perangkatJenis: "HP",
  perangkatMerk: "",
  perangkatTipe: "",
  imeiSerial: "",
  keluhan: "",
  tindakan: "",
  sparepartNama: "",
  sparepartItems: [makeEmptySparepartItem()],
  teknisiNama: "",
  statusServis: "masuk",
  statusPembayaran: "belum_bayar",
  biayaJasa: "",
  hargaSparepart: "",
  modalSparepart: "",
  diskon: "",
  totalDibayar: "",
  catatan: "",
  tanggalMasuk: toDateInputValue(new Date()),
  alasanEdit: "",
})

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

function parseRupiahInput(value: string) {
  return normalizeNumber(String(value || "").replace(/[^0-9]/g, ""))
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

function formatRibuanInput(value: string) {
  const clean = String(value || "").replace(/[^0-9]/g, "")
  if (!clean) return ""
  return new Intl.NumberFormat("id-ID").format(Number(clean))
}

function padDate(value: number) {
  return String(value).padStart(2, "0")
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`
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

function formatTanggal(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(value))
}

function makeNomorServis() {
  const now = new Date()
  const datePart = `${now.getFullYear()}${padDate(now.getMonth() + 1)}${padDate(now.getDate())}`
  const timePart = `${padDate(now.getHours())}${padDate(now.getMinutes())}${padDate(now.getSeconds())}`
  return `SRV-${datePart}-${timePart}`
}

function normalizeFormSparepartItems(value: unknown): FormSparepartItem[] {
  if (!Array.isArray(value) || value.length === 0) return [makeEmptySparepartItem()]

  return value.map((item: any) => ({
    id: String(item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    nama: String(item?.nama || ""),
    harga: formatRibuanInput(String(item?.harga || "")),
    modal: formatRibuanInput(String(item?.modal || "")),
  }))
}

function normalizeSavedSparepartItems(raw: any): ServisSparepartItem[] {
  const source = Array.isArray(raw?.sparepartItems) ? raw.sparepartItems : []
  const mapped: ServisSparepartItem[] = source
    .map((item: any, index: number): ServisSparepartItem => ({
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

function getSparepartSummary(items: Array<FormSparepartItem | ServisSparepartItem>) {
  const names: string[] = []
  let hargaSparepart = 0
  let modalSparepart = 0

  for (const item of items || []) {
    const nama = String(item?.nama || "").trim()
    const harga = typeof item?.harga === "string" ? parseRupiahInput(item.harga) : normalizeNumber(item?.harga)
    const modal = typeof item?.modal === "string" ? parseRupiahInput(item.modal) : normalizeNumber(item?.modal)

    if (nama) names.push(nama)
    hargaSparepart += Math.max(0, harga)
    modalSparepart += Math.max(0, modal)
  }

  return {
    sparepartNama: names.join(", "),
    hargaSparepart,
    modalSparepart,
  }
}

function calculateForm(form: FormState) {
  const biayaJasa = parseRupiahInput(form.biayaJasa)
  const sparepartSummary = getSparepartSummary(Array.isArray(form.sparepartItems) ? form.sparepartItems : [])
  const hargaSparepart = sparepartSummary.hargaSparepart
  const modalSparepart = sparepartSummary.modalSparepart
  const diskon = parseRupiahInput(form.diskon)
  const totalTagihan = Math.max(0, biayaJasa + hargaSparepart - diskon)
  const totalDibayar = Math.max(0, Math.min(totalTagihan, parseRupiahInput(form.totalDibayar)))
  const sisaHutang = Math.max(0, totalTagihan - totalDibayar)
  const statusPembayaran: StatusPembayaran =
    totalTagihan <= 0
      ? "belum_bayar"
      : sisaHutang <= 0
        ? "lunas"
        : totalDibayar > 0
          ? "dp"
          : form.statusPembayaran === "hutang"
            ? "hutang"
            : "belum_bayar"
  const labaKotor = totalDibayar - modalSparepart

  return {
    biayaJasa,
    hargaSparepart,
    modalSparepart,
    diskon,
    totalTagihan,
    totalDibayar,
    sisaHutang,
    statusPembayaran,
    labaKotor,
  }
}

function normalizeServisDoc(id: string, raw: any): ServisItem {
  const tanggalMasukMs = normalizeNumber(raw?.tanggalMasukMs || raw?.createdAtMs || getFirestoreMillis(raw?.createdAt))
  const sparepartItems = normalizeSavedSparepartItems(raw)
  const sparepartSummary = getSparepartSummary(sparepartItems)
  const totalTagihan = Math.max(0, normalizeNumber(raw?.totalTagihan))
  const totalDibayar = Math.max(0, normalizeNumber(raw?.totalDibayar))
  const sisaHutang = Math.max(0, normalizeNumber(raw?.sisaHutang ?? totalTagihan - totalDibayar))

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
    imeiSerial: String(raw?.imeiSerial || ""),
    keluhan: String(raw?.keluhan || ""),
    tindakan: String(raw?.tindakan || ""),
    sparepartNama: String(raw?.sparepartNama || sparepartSummary.sparepartNama || ""),
    sparepartItems,
    teknisiNama: String(raw?.teknisiNama || ""),
    statusServis: String(raw?.statusServis || "masuk") as StatusServis,
    statusPembayaran: String(raw?.statusPembayaran || (sisaHutang > 0 ? "hutang" : "lunas")) as StatusPembayaran,
    biayaJasa: normalizeNumber(raw?.biayaJasa),
    hargaSparepart: Math.max(0, normalizeNumber(raw?.hargaSparepart || sparepartSummary.hargaSparepart)),
    modalSparepart: Math.max(0, normalizeNumber(raw?.modalSparepart || sparepartSummary.modalSparepart)),
    diskon: normalizeNumber(raw?.diskon),
    totalTagihan,
    totalDibayar,
    sisaHutang,
    labaKotor: normalizeNumber(raw?.labaKotor ?? totalDibayar - Math.max(0, normalizeNumber(raw?.modalSparepart || sparepartSummary.modalSparepart))),
    catatan: String(raw?.catatan || ""),
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

function getStatusServisLabel(value: string) {
  return STATUS_SERVIS_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

function getStatusPembayaranLabel(value: string) {
  return STATUS_PEMBAYARAN_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

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

function makeServisSnapshot(item: ServisItem): ServisHistoriSnapshot {
  return {
    tokoId: item.tokoId,
    tokoNama: item.tokoNama,
    pelangganNama: item.pelangganNama,
    pelangganTelepon: item.pelangganTelepon,
    perangkatJenis: item.perangkatJenis,
    perangkatMerk: item.perangkatMerk,
    perangkatTipe: item.perangkatTipe,
    imeiSerial: item.imeiSerial,
    keluhan: item.keluhan,
    tindakan: item.tindakan,
    sparepartNama: item.sparepartNama,
    sparepartItems: Array.isArray(item.sparepartItems) ? item.sparepartItems : [],
    teknisiNama: item.teknisiNama,
    statusServis: item.statusServis,
    statusPembayaran: item.statusPembayaran,
    biayaJasa: item.biayaJasa,
    hargaSparepart: item.hargaSparepart,
    modalSparepart: item.modalSparepart,
    diskon: item.diskon,
    totalTagihan: item.totalTagihan,
    totalDibayar: item.totalDibayar,
    sisaHutang: item.sisaHutang,
    labaKotor: item.labaKotor,
    catatan: item.catatan,
    tanggalMasukMs: item.tanggalMasukMs,
    tanggalSelesaiMs: item.tanggalSelesaiMs,
    tanggalDiambilMs: item.tanggalDiambilMs,
    tanggalKey: item.tanggalKey,
    bulanKey: item.bulanKey,
  }
}

function isSameHistoriValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function getChangedFields(sebelum: ServisHistoriSnapshot, sesudah: ServisHistoriSnapshot) {
  return (Object.keys(HISTORI_FIELD_LABELS) as Array<keyof ServisHistoriSnapshot>).filter((key) => !isSameHistoriValue(sebelum[key], sesudah[key]))
}

function getHistoriFieldLabel(key: string) {
  return HISTORI_FIELD_LABELS[key as keyof ServisHistoriSnapshot] || key
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
    sebelum: raw?.sebelum && typeof raw.sebelum === "object" ? raw.sebelum : {},
    sesudah: raw?.sesudah && typeof raw.sesudah === "object" ? raw.sesudah : {},
    createdAtMs: normalizeNumber(raw?.createdAtMs || getFirestoreMillis(raw?.createdAt)),
    createdByUid: String(raw?.createdByUid || ""),
    createdByNama: String(raw?.createdByNama || ""),
    createdByEmail: String(raw?.createdByEmail || ""),
  }
}

export default function ServisPage() {
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [servisList, setServisList] = useState<ServisItem[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [showFormModal, setShowFormModal] = useState(false)
  const [detailItem, setDetailItem] = useState<ServisItem | null>(null)
  const [historiList, setHistoriList] = useState<ServisHistoriItem[]>([])
  const [historiLoading, setHistoriLoading] = useState(false)
  const [form, setForm] = useState<FormState>(() => defaultFormState())

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("semua")
  const [tanggalMulai, setTanggalMulai] = useState("")
  const [tanggalSelesai, setTanggalSelesai] = useState("")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isAdminUser = useMemo(() => isAdminProfile(currentUserProfile), [currentUserProfile])
  const effectiveTokoId = useMemo(
    () => (isAdminUser ? filterToko : String(currentUserProfile?.tokoId || "").trim()),
    [isAdminUser, filterToko, currentUserProfile?.tokoId],
  )

  const selectedTokoForForm = useMemo(() => {
    return tokoList.find((item) => item.id === form.tokoId) || null
  }, [tokoList, form.tokoId])

  const calculated = useMemo(() => calculateForm(form), [form])

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
      showError("Gagal memuat data servis")
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

  const openCreateForm = () => {
    const base = defaultFormState()
    const tokoIdDefault = isAdminUser ? filterToko || tokoList[0]?.id || "" : String(currentUserProfile?.tokoId || "").trim()
    setForm({
      ...base,
      tokoId: tokoIdDefault,
      teknisiNama: currentUserProfile?.nama || "",
    })
    setShowFormModal(true)
  }

  const openEditForm = (item: ServisItem) => {
    setDetailItem(null)
    setForm({
      id: item.id,
      tokoId: item.tokoId,
      pelangganNama: item.pelangganNama,
      pelangganTelepon: item.pelangganTelepon,
      perangkatJenis: item.perangkatJenis,
      perangkatMerk: item.perangkatMerk,
      perangkatTipe: item.perangkatTipe,
      imeiSerial: item.imeiSerial,
      keluhan: item.keluhan,
      tindakan: item.tindakan,
      sparepartNama: item.sparepartNama,
      sparepartItems: normalizeFormSparepartItems(item.sparepartItems.length > 0 ? item.sparepartItems : [{ id: "sp-1", nama: item.sparepartNama, harga: item.hargaSparepart, modal: item.modalSparepart }]),
      teknisiNama: item.teknisiNama,
      statusServis: item.statusServis,
      statusPembayaran: item.statusPembayaran,
      biayaJasa: formatRibuanInput(String(item.biayaJasa || "")),
      hargaSparepart: formatRibuanInput(String(item.hargaSparepart || "")),
      modalSparepart: formatRibuanInput(String(item.modalSparepart || "")),
      diskon: formatRibuanInput(String(item.diskon || "")),
      totalDibayar: formatRibuanInput(String(item.totalDibayar || "")),
      catatan: item.catatan,
      tanggalMasuk: item.tanggalMasukMs ? toDateInputValue(new Date(item.tanggalMasukMs)) : toDateInputValue(new Date()),
      alasanEdit: "",
    })
    setShowFormModal(true)
  }

  const updateForm = (field: keyof FormState, value: string) => {
    const moneyFields: Array<keyof FormState> = ["biayaJasa", "hargaSparepart", "modalSparepart", "diskon", "totalDibayar"]
    setForm((prev) => ({
      ...prev,
      [field]: moneyFields.includes(field) ? formatRibuanInput(value) : value,
    }))
  }

  const updateSparepartItem = (id: string, field: keyof FormSparepartItem, value: string) => {
    setForm((prev) => ({
      ...prev,
      sparepartItems: (Array.isArray(prev.sparepartItems) ? prev.sparepartItems : [makeEmptySparepartItem()]).map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "harga" || field === "modal" ? formatRibuanInput(value) : value,
            }
          : item,
      ),
    }))
  }

  const addSparepartItem = () => {
    setForm((prev) => ({
      ...prev,
      sparepartItems: [...(Array.isArray(prev.sparepartItems) ? prev.sparepartItems : []), makeEmptySparepartItem()],
    }))
  }

  const removeSparepartItem = (id: string) => {
    setForm((prev) => ({
      ...prev,
      sparepartItems: (Array.isArray(prev.sparepartItems) ? prev.sparepartItems : []).length <= 1 ? [makeEmptySparepartItem()] : (Array.isArray(prev.sparepartItems) ? prev.sparepartItems : []).filter((item) => item.id !== id),
    }))
  }

  const saveServisHistori = async ({
    servisId,
    oldItem,
    newItem,
    aksi,
    alasan,
    changedFields,
  }: {
    servisId: string
    oldItem: ServisItem
    newItem: ServisItem
    aksi: string
    alasan: string
    changedFields: string[]
  }) => {
    const nowMs = Date.now()
    const beforeSnapshot = makeServisSnapshot(oldItem)
    const afterSnapshot = makeServisSnapshot(newItem)
    const historiPayload = {
      servisId,
      nomorServis: oldItem.nomorServis || newItem.nomorServis || servisId,
      tokoId: newItem.tokoId || oldItem.tokoId || "",
      tokoNama: newItem.tokoNama || oldItem.tokoNama || "Tanpa Toko",
      pelangganNama: newItem.pelangganNama || oldItem.pelangganNama || "",
      aksi,
      alasan,
      changedFields,
      sebelum: beforeSnapshot,
      sesudah: afterSnapshot,
      createdAt: serverTimestamp(),
      createdAtMs: nowMs,
      createdByUid: currentUserProfile?.uid || "",
      createdByNama: currentUserProfile?.nama || "",
      createdByEmail: currentUserProfile?.email || "",
    }

    await Promise.all([
      addDoc(collection(db, "servis", servisId, "histori"), historiPayload),
      addDoc(collection(db, "servis_histori"), historiPayload),
    ])
  }

  const handleSubmit = async () => {
    const safeTokoId = String(form.tokoId || "").trim()
    const pelangganNama = String(form.pelangganNama || "").trim()
    const keluhan = String(form.keluhan || "").trim()

    if (!safeTokoId) return showError("Pilih toko terlebih dahulu")
    if (!pelangganNama) return showError("Nama pelanggan wajib diisi")
    if (!keluhan) return showError("Keluhan wajib diisi")
    if (calculated.totalTagihan <= 0 && form.statusServis !== "batal") {
      return showError("Isi biaya jasa atau harga sparepart terlebih dahulu")
    }

    const tanggalMasukMs = startOfDayMs(form.tanggalMasuk) || Date.now()
    const nowMs = Date.now()
    const tokoNama = selectedTokoForForm?.nama || currentUserProfile?.tokoNama || "Tanpa Toko"
    const statusPembayaran = calculated.sisaHutang > 0 ? calculated.statusPembayaran : "lunas"
    const statusServis = form.statusServis
    const alasanEdit = String(form.alasanEdit || "").trim()

    setSubmitLoading(true)
    setError(null)

    try {
      const sparepartItems: ServisSparepartItem[] = (Array.isArray(form.sparepartItems) ? form.sparepartItems : [])
        .map((item: FormSparepartItem): ServisSparepartItem => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          nama: String(item.nama || "").trim(),
          harga: Math.max(0, parseRupiahInput(item.harga)),
          modal: Math.max(0, parseRupiahInput(item.modal)),
        }))
        .filter((item: ServisSparepartItem) => Boolean(item.nama) || item.harga > 0 || item.modal > 0)
      const sparepartSummary = getSparepartSummary(sparepartItems)

      const payload = {
        jenisTransaksi: "servis",
        nomorServis: form.id ? undefined : makeNomorServis(),
        tokoId: safeTokoId,
        tokoNama,
        pelangganNama,
        pelangganTelepon: String(form.pelangganTelepon || "").trim(),
        perangkatJenis: String(form.perangkatJenis || "").trim() || "HP",
        perangkatMerk: String(form.perangkatMerk || "").trim(),
        perangkatTipe: String(form.perangkatTipe || "").trim(),
        imeiSerial: String(form.imeiSerial || "").trim(),
        keluhan,
        tindakan: String(form.tindakan || "").trim(),
        sparepartNama: sparepartSummary.sparepartNama || String(form.sparepartNama || "").trim(),
        sparepartItems,
        teknisiNama: String(form.teknisiNama || "").trim(),
        statusServis,
        statusPembayaran,
        biayaJasa: calculated.biayaJasa,
        hargaSparepart: calculated.hargaSparepart,
        modalSparepart: calculated.modalSparepart,
        diskon: calculated.diskon,
        totalTagihan: calculated.totalTagihan,
        totalDibayar: calculated.totalDibayar,
        sisaHutang: calculated.sisaHutang,
        isHutang: calculated.sisaHutang > 0,
        hutangStatus: calculated.sisaHutang > 0 ? "belum_lunas" : "lunas",
        labaKotor: calculated.labaKotor,
        catatan: String(form.catatan || "").trim(),
        tanggalMasukMs,
        tanggalSelesaiMs: statusServis === "selesai" || statusServis === "diambil" ? nowMs : 0,
        tanggalDiambilMs: statusServis === "diambil" ? nowMs : 0,
        tanggalKey: getDateKeyFromMs(tanggalMasukMs),
        bulanKey: getMonthKeyFromMs(tanggalMasukMs),
        updatedAt: serverTimestamp(),
        updatedAtMs: nowMs,
        updatedByUid: currentUserProfile?.uid || "",
        updatedByNama: currentUserProfile?.nama || "",
        updatedByEmail: currentUserProfile?.email || "",
      }

      if (form.id) {
        const servisRef = doc(db, "servis", form.id)
        const oldSnap = await getDoc(servisRef)

        if (!oldSnap.exists()) {
          showError("Data servis tidak ditemukan")
          return
        }

        const oldItem = normalizeServisDoc(oldSnap.id, oldSnap.data())
        if (oldItem.statusServis === "diambil" && !alasanEdit) {
          showError("Alasan perubahan wajib diisi karena barang sudah diambil")
          return
        }

        const { nomorServis, ...updatePayload } = payload
        await updateDoc(servisRef, updatePayload)

        const newItem = normalizeServisDoc(form.id, {
          ...oldSnap.data(),
          ...updatePayload,
          nomorServis: oldItem.nomorServis,
          createdAtMs: oldItem.createdAtMs,
          createdByUid: oldItem.createdByUid,
          createdByNama: oldItem.createdByNama,
          createdByEmail: oldItem.createdByEmail,
        })
        const changedFields = getChangedFields(makeServisSnapshot(oldItem), makeServisSnapshot(newItem))

        await saveServisHistori({
          servisId: form.id,
          oldItem,
          newItem,
          aksi: oldItem.statusServis === "diambil" ? "edit_setelah_diambil" : "edit_servis",
          alasan: alasanEdit || "Perubahan data servis",
          changedFields,
        })

        showSuccess("Data servis berhasil diperbarui")
      } else {
        await addDoc(collection(db, "servis"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdByUid: currentUserProfile?.uid || "",
          createdByNama: currentUserProfile?.nama || "",
          createdByEmail: currentUserProfile?.email || "",
        })
        showSuccess("Data servis berhasil disimpan")
      }

      setShowFormModal(false)
      setForm(defaultFormState())
      await fetchAll()
    } catch (err) {
      console.error(err)
      showError("Gagal menyimpan data servis")
    } finally {
      setSubmitLoading(false)
    }
  }


  const handleQuickStatus = async (item: ServisItem, statusServis: StatusServis) => {
    const nowMs = Date.now()
    const updatePayload = {
      statusServis,
      tanggalSelesaiMs: statusServis === "selesai" || statusServis === "diambil" ? nowMs : item.tanggalSelesaiMs || 0,
      tanggalDiambilMs: statusServis === "diambil" ? nowMs : item.tanggalDiambilMs || 0,
      updatedAt: serverTimestamp(),
      updatedAtMs: nowMs,
      updatedByUid: currentUserProfile?.uid || "",
      updatedByNama: currentUserProfile?.nama || "",
      updatedByEmail: currentUserProfile?.email || "",
    }

    try {
      await updateDoc(doc(db, "servis", item.id), updatePayload)

      const newItem = normalizeServisDoc(item.id, {
        ...item,
        ...updatePayload,
      })
      const changedFields = getChangedFields(makeServisSnapshot(item), makeServisSnapshot(newItem))

      await saveServisHistori({
        servisId: item.id,
        oldItem: item,
        newItem,
        aksi: "ubah_status_cepat",
        alasan: `Status servis diubah menjadi ${getStatusServisLabel(statusServis)}`,
        changedFields,
      })

      showSuccess(`Status servis diubah menjadi ${getStatusServisLabel(statusServis)}`)
      await fetchAll()
      if (detailItem?.id === item.id) {
        setDetailItem(newItem)
      }
    } catch (err) {
      console.error(err)
      showError("Gagal mengubah status servis")
    }
  }

  const filteredServis = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMs = startOfDayMs(tanggalMulai)
    const endMs = endOfDayMs(tanggalSelesai)

    return servisList.filter((item) => {
      const matchSearch =
        !q ||
        item.nomorServis.toLowerCase().includes(q) ||
        item.pelangganNama.toLowerCase().includes(q) ||
        item.pelangganTelepon.toLowerCase().includes(q) ||
        item.perangkatJenis.toLowerCase().includes(q) ||
        item.perangkatMerk.toLowerCase().includes(q) ||
        item.perangkatTipe.toLowerCase().includes(q) ||
        item.imeiSerial.toLowerCase().includes(q) ||
        item.keluhan.toLowerCase().includes(q) ||
        item.tindakan.toLowerCase().includes(q) ||
        item.sparepartNama.toLowerCase().includes(q) ||
        (Array.isArray(item.sparepartItems) ? item.sparepartItems : []).some((sparepart: ServisSparepartItem) => sparepart.nama.toLowerCase().includes(q)) ||
        item.teknisiNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)

      const matchToko = !effectiveTokoId || item.tokoId === effectiveTokoId
      const matchStatus = filterStatus === "semua" || item.statusServis === filterStatus
      const matchStart = !startMs || item.tanggalMasukMs >= startMs
      const matchEnd = !endMs || item.tanggalMasukMs <= endMs

      return matchSearch && matchToko && matchStatus && matchStart && matchEnd
    })
  }, [servisList, search, effectiveTokoId, filterStatus, tanggalMulai, tanggalSelesai])

  const totalTagihan = filteredServis.reduce((acc, item) => acc + item.totalTagihan, 0)
  const totalDibayar = filteredServis.reduce((acc, item) => acc + item.totalDibayar, 0)
  const totalHutang = filteredServis.reduce((acc, item) => acc + item.sisaHutang, 0)
  const totalLaba = filteredServis.reduce((acc, item) => acc + item.labaKotor, 0)
  const totalMasuk = filteredServis.filter((item) => item.statusServis === "masuk").length
  const totalProses = filteredServis.filter((item) => item.statusServis === "proses").length
  const totalSelesai = filteredServis.filter((item) => item.statusServis === "selesai").length
  const totalDiambil = filteredServis.filter((item) => item.statusServis === "diambil").length

  const statusBreakdown = useMemo(() => {
    return STATUS_SERVIS_OPTIONS.map((status) => ({
      ...status,
      count: filteredServis.filter((item) => item.statusServis === status.value).length,
    }))
  }, [filteredServis])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredServis.length / itemsPerPage))
  const pagedServis = itemsPerPage === 0 ? filteredServis : filteredServis.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => setPage(1), [search, filterToko, filterStatus, tanggalMulai, tanggalSelesai, itemsPerPage])
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    const fetchHistori = async () => {
      if (!detailItem?.id) {
        setHistoriList([])
        setHistoriLoading(false)
        return
      }

      setHistoriLoading(true)
      try {
        const snap = await getDocs(query(collection(db, "servis", detailItem.id, "histori"), orderBy("createdAtMs", "desc"), limit(10)))
        setHistoriList(snap.docs.map((item) => normalizeHistoriDoc(item.id, item.data())))
      } catch (err) {
        console.error("Gagal memuat histori servis:", err)
        setHistoriList([])
      } finally {
        setHistoriLoading(false)
      }
    }

    fetchHistori()
  }, [detailItem?.id])

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
                <Wrench size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Jasa Servis</h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Catat perbaikan HP dan perangkat lain, lengkap dengan status servis, pembayaran, hutang, dan laba jasa.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/15 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/20"
              >
                <Plus size={12} strokeWidth={2.8} />
                Tambah Servis
              </button>
              <button
  type="button"
  onClick={() => {
    window.location.href = "/admin/servis/histori"
  }}
  className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
>
  <History size={12} strokeWidth={2.8} />
  History
</button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <ToastBox type="error" message={error} onClose={() => setError(null)} />
          )}
          {successMsg && (
            <ToastBox type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />
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
              <FieldBox label="Cari Servis">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nama, no servis, HP, keluhan, teknisi..."
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

              <FilterSelect label="Status" value={filterStatus} onChange={(value) => setFilterStatus(value as StatusFilter)} icon={Wrench}>
                <option value="semua">Semua Status</option>
                {STATUS_SERVIS_OPTIONS.map((item) => (
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
              onClick={openCreateForm}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
            >
              <Plus size={14} strokeWidth={2.5} />
              Baru
            </button>
            <button
  type="button"
  onClick={() => {
    window.location.href = "/admin/servis/histori"
  }}
  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
>
  <History size={14} strokeWidth={2.5} />
  History
</button>
            <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
              <Wrench size={14} strokeWidth={2.5} />
              {filteredServis.length}
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

                  <FilterSelect label="Status" value={filterStatus} onChange={(value) => setFilterStatus(value as StatusFilter)} icon={Wrench}>
                    <option value="semua">Semua Status</option>
                    {STATUS_SERVIS_OPTIONS.map((item) => (
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
          <StatCard icon={ReceiptText} label="Total Tagihan" value={formatRupiah(totalTagihan)} subValue={`Hutang ${formatRupiah(totalHutang)}`} tone="blue" />
          <StatCard icon={BadgeDollarSign} label="Laba Cash" value={formatRupiah(totalLaba)} subValue="Dibayar - modal" tone="rose" />
          <StatCard icon={Wrench} label="Status" value={`${totalProses} Proses`} subValue={`${totalMasuk} masuk · ${totalSelesai + totalDiambil} selesai`} tone="slate" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <HeaderTitle title="Daftar Servis" subtitle="Data perbaikan perangkat dan status pembayaran" />
                <div className="hidden w-full sm:block sm:max-w-[120px]">
                  <FilterSelect label="Tampilkan" value={String(itemsPerPage)} onChange={(value) => setItemsPerPage(Number(value))}>
                    {ITEMS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </FilterSelect>
                </div>
              </div>

              {loading ? (
                <LoadingBox />
              ) : filteredServis.length === 0 ? (
                <EmptyBox label="Belum ada data servis" icon={Wrench} />
              ) : (
                <>
                  <div className="space-y-2 sm:hidden">
                    {pagedServis.map((item, idx) => (
                      <ServisMobileCard key={item.id} item={item} idx={idx} onDetail={() => setDetailItem(item)} />
                    ))}
                  </div>

                  <ServisTable
                    data={pagedServis}
                    page={page}
                    itemsPerPage={itemsPerPage}
                    onDetail={setDetailItem}
                    onEdit={openEditForm}
                    onQuickStatus={handleQuickStatus}
                  />

                  {itemsPerPage !== 0 && totalPages > 1 && <Pagination page={page} totalPages={totalPages} goPage={goPage} />}
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <HeaderTitle title="Ringkasan Status" subtitle="Jumlah servis berdasarkan status" />
              <div className="space-y-3">
                {statusBreakdown.map((item) => (
                  <ProgressBox key={item.value} title={item.label} count={item.count} total={filteredServis.length} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <FormModal
          show={showFormModal}
          form={form}
          updateForm={updateForm}
          updateSparepartItem={updateSparepartItem}
          addSparepartItem={addSparepartItem}
          removeSparepartItem={removeSparepartItem}
          tokoList={tokoList}
          isAdminUser={isAdminUser}
          calculated={calculated}
          loading={submitLoading}
          onClose={() => setShowFormModal(false)}
          onSubmit={handleSubmit}
        />

        <DetailModal item={detailItem} historiList={historiList} historiLoading={historiLoading} onClose={() => setDetailItem(null)} onEdit={openEditForm} onQuickStatus={handleQuickStatus} />
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

function MoneyInput({ value, onChange, placeholder = "0" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
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
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat data servis...</p>
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
      <p className="mt-1 text-[10px] font-bold text-slate-500">{percent.toFixed(1)}% dari data servis</p>
    </div>
  )
}

function ServisMobileCard({ item, idx, onDetail }: { item: ServisItem; idx: number; onDetail: () => void }) {
  return (
    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx * 0.03 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100"><Smartphone size={20} strokeWidth={2.5} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800">{item.pelangganNama}</p>
              <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.perangkatMerk || item.perangkatJenis} {item.perangkatTipe}</p>
            </div>
            <StatusServisBadge status={item.statusServis} />
          </div>
          <p className="mt-2 truncate text-[10px] font-bold text-slate-500">{item.nomorServis} · {formatDateTime(item.tanggalMasukMs)}</p>
          <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-600">{item.keluhan}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
            <MiniInfo label="Tagihan" value={formatRupiah(item.totalTagihan)} />
            <MiniInfo label="Dibayar" value={formatRupiah(item.totalDibayar)} />
            <MiniInfo label="Hutang" value={item.sisaHutang > 0 ? formatRupiah(item.sisaHutang) : "-"} />
            <MiniInfo label="Laba" value={formatRupiah(item.labaKotor)} />
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

function ServisTable({
  data,
  page,
  itemsPerPage,
  onDetail,
  onEdit,
  onQuickStatus,
}: {
  data: ServisItem[]
  page: number
  itemsPerPage: number
  onDetail: (item: ServisItem) => void
  onEdit: (item: ServisItem) => void
  onQuickStatus: (item: ServisItem, status: StatusServis) => void
}) {
  const heads = ["No", "Waktu", "Toko", "Pelanggan", "Perangkat", "Status", "Bayar", "Hutang", "Aksi"]

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
                  <p className="whitespace-nowrap font-black text-slate-800">{item.pelangganNama}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-slate-400">{item.nomorServis}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="whitespace-nowrap font-semibold text-slate-700">{item.perangkatMerk || item.perangkatJenis} {item.perangkatTipe}</p>
                  <p className="mt-0.5 max-w-[210px] truncate text-[10px] font-semibold text-slate-400">{item.keluhan}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3"><StatusServisBadge status={item.statusServis} /></td>
                <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatRupiah(item.totalDibayar)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-amber-700">{item.sisaHutang > 0 ? formatRupiah(item.sisaHutang) : "-"}</td>
                <td className="px-3 py-3 text-center">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => onDetail(item)} className="inline-flex h-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 hover:bg-sky-100">Detail</button>
                    <button type="button" onClick={() => onEdit(item)} className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-slate-600 hover:bg-slate-50"><Edit3 size={13} strokeWidth={2.6} /></button>
                    {item.statusServis === "masuk" && <button type="button" onClick={() => onQuickStatus(item, "proses")} className="inline-flex h-8 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-black text-amber-700">Proses</button>}
                    {item.statusServis === "proses" && <button type="button" onClick={() => onQuickStatus(item, "selesai")} className="inline-flex h-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-black text-emerald-700">Selesai</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
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

function FormModal({
  show,
  form,
  updateForm,
  updateSparepartItem,
  addSparepartItem,
  removeSparepartItem,
  tokoList,
  isAdminUser,
  calculated,
  loading,
  onClose,
  onSubmit,
}: {
  show: boolean
  form: FormState
  updateForm: (field: keyof FormState, value: string) => void
  updateSparepartItem: (id: string, field: keyof FormSparepartItem, value: string) => void
  addSparepartItem: () => void
  removeSparepartItem: (id: string) => void
  tokoList: Toko[]
  isAdminUser: boolean
  calculated: ReturnType<typeof calculateForm>
  loading: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  const safeSparepartItems = normalizeFormSparepartItems(form?.sparepartItems)

  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.22, ease: "easeOut" }} className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">{form.id ? "Edit Servis" : "Tambah Servis"}</p>
                <h2 className="truncate text-base font-black text-slate-800">{form.id ? "Perbarui data servis" : "Input jasa perbaikan baru"}</h2>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={17} strokeWidth={2.5} /></button>
            </div>

            <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <HeaderTitle title="Data Pelanggan" subtitle="Identitas pelanggan dan perangkat" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {isAdminUser ? (
                        <FilterSelect label="Toko" value={form.tokoId} onChange={(value) => updateForm("tokoId", value)} icon={Store}>
                          <option value="">Pilih Toko</option>
                          {tokoList.map((item) => <option key={item.id} value={item.id}>{item.nama}</option>)}
                        </FilterSelect>
                      ) : null}
                      <FieldBox label="Tanggal Masuk">
                        <input type="date" value={form.tanggalMasuk} onChange={(e) => updateForm("tanggalMasuk", e.target.value)} className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="Nama Pelanggan">
                        <input value={form.pelangganNama} onChange={(e) => updateForm("pelangganNama", e.target.value)} placeholder="Udin" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="No HP Pelanggan">
                        <input value={form.pelangganTelepon} onChange={(e) => updateForm("pelangganTelepon", e.target.value)} placeholder="08xxx" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="Jenis Perangkat">
                        <input value={form.perangkatJenis} onChange={(e) => updateForm("perangkatJenis", e.target.value)} placeholder="HP / Tablet / Laptop" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="Merek">
                        <input value={form.perangkatMerk} onChange={(e) => updateForm("perangkatMerk", e.target.value)} placeholder="Samsung / Oppo / iPhone" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="Tipe">
                        <input value={form.perangkatTipe} onChange={(e) => updateForm("perangkatTipe", e.target.value)} placeholder="A12 / Reno 8 / 11 Pro" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="IMEI / Serial">
                        <input value={form.imeiSerial} onChange={(e) => updateForm("imeiSerial", e.target.value)} placeholder="Opsional" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <HeaderTitle title="Detail Perbaikan" subtitle="Keluhan, tindakan, dan status servis" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FieldBox label="Keluhan" className="sm:col-span-2">
                        <textarea value={form.keluhan} onChange={(e) => updateForm("keluhan", e.target.value)} rows={3} placeholder="LCD pecah, mati total, tidak bisa cas..." className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FieldBox label="Tindakan / Jasa">
                        <input value={form.tindakan} onChange={(e) => updateForm("tindakan", e.target.value)} placeholder="Ganti LCD / service konektor" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>                    
                      <FieldBox label="Teknisi">
                        <input value={form.teknisiNama} onChange={(e) => updateForm("teknisiNama", e.target.value)} placeholder="Nama teknisi" className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      <FilterSelect label="Status Servis" value={form.statusServis} onChange={(value) => updateForm("statusServis", value as StatusServis)} icon={Wrench}>
                        {STATUS_SERVIS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </FilterSelect>
                      <FieldBox label="Catatan" className="sm:col-span-2">
                        <textarea value={form.catatan} onChange={(e) => updateForm("catatan", e.target.value)} rows={2} placeholder="Catatan tambahan..." className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20" />
                      </FieldBox>
                      {form.id && (
                        <FieldBox label={form.statusServis === "diambil" ? "Alasan Perubahan (Wajib)" : "Alasan Perubahan"} className="sm:col-span-2">
                          <textarea
                            value={form.alasanEdit}
                            onChange={(e) => updateForm("alasanEdit", e.target.value)}
                            rows={2}
                            placeholder={form.statusServis === "diambil" ? "Contoh: tambah biaya LCD / koreksi pembayaran..." : "Opsional, untuk jejak histori perubahan..."}
                            className={`w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 ${form.statusServis === "diambil" ? "border-amber-200 focus:border-amber-400 focus:ring-amber-400/20" : "border-slate-200 focus:border-sky-400 focus:ring-sky-400/20"}`}
                          />
                          {form.statusServis === "diambil" && (
                            <p className="mt-1 text-[10px] font-bold text-amber-600">Data sudah diambil, jadi setiap edit wajib punya alasan agar laporan tetap bisa diaudit.</p>
                          )}
                        </FieldBox>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 lg:col-span-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <HeaderTitle title="Biaya & Pembayaran" subtitle="Nilai ini nanti dipakai laporan" />
                    <div className="space-y-3">
                      <FieldBox label="Biaya Jasa">
                        <MoneyInput value={form.biayaJasa} onChange={(value) => updateForm("biayaJasa", value)} />
                      </FieldBox>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sparepart</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Bisa lebih dari satu item</p>
                          </div>
                          <button
                            type="button"
                            onClick={addSparepartItem}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 hover:bg-sky-100"
                          >
                            <Plus size={13} strokeWidth={2.6} />
                            Tambah
                          </button>
                        </div>

                        <div className="space-y-2">
                          {safeSparepartItems.map((sparepart, index) => (
                            <div key={sparepart.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sparepart {index + 1}</p>
                                <button
                                  type="button"
                                  onClick={() => removeSparepartItem(sparepart.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100"
                                  title="Hapus sparepart"
                                >
                                  <X size={13} strokeWidth={2.7} />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  value={sparepart.nama}
                                  onChange={(e) => updateSparepartItem(sparepart.id, "nama", e.target.value)}
                                  placeholder="Nama sparepart"
                                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                                />
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                                  <MoneyInput value={sparepart.harga} onChange={(value) => updateSparepartItem(sparepart.id, "harga", value)} placeholder="Harga jual" />
                                  <MoneyInput value={sparepart.modal} onChange={(value) => updateSparepartItem(sparepart.id, "modal", value)} placeholder="Modal" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <MiniInfo label="Harga Sparepart" value={formatRupiah(calculated.hargaSparepart)} />
                          <MiniInfo label="Modal Sparepart" value={formatRupiah(calculated.modalSparepart)} />
                        </div>
                      </div>
                      <FieldBox label="Diskon">
                        <MoneyInput value={form.diskon} onChange={(value) => updateForm("diskon", value)} />
                      </FieldBox>
                      <FieldBox label="Dibayar / DP">
                        <MoneyInput value={form.totalDibayar} onChange={(value) => updateForm("totalDibayar", value)} />
                      </FieldBox>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Ringkasan</p>
                    <div className="mt-3 space-y-2">
                      <SummaryLine label="Total Tagihan" value={formatRupiah(calculated.totalTagihan)} />
                      <SummaryLine label="Total Dibayar" value={formatRupiah(calculated.totalDibayar)} />
                      <SummaryLine label="Sisa Hutang" value={formatRupiah(calculated.sisaHutang)} danger={calculated.sisaHutang > 0} />
                      <SummaryLine label="Laba Cash" value={formatRupiah(calculated.labaKotor)} strong />
                    </div>                 
                  </div>

                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white shadow-sm shadow-sky-500/15 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" strokeWidth={2.8} /> : <CheckCircle2 size={16} strokeWidth={2.8} />}
                    {form.id ? "Simpan Perubahan" : "Simpan Servis"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SummaryLine({ label, value, danger, strong }: { label: string; value: string; danger?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-black ${danger ? "text-amber-700" : strong ? "text-sky-700" : "text-slate-800"}`}>{value}</p>
    </div>
  )
}

function DetailModal({
  item,
  historiList,
  historiLoading,
  onClose,
  onEdit,
  onQuickStatus,
}: {
  item: ServisItem | null
  historiList: ServisHistoriItem[]
  historiLoading: boolean
  onClose: () => void
  onEdit: (item: ServisItem) => void
  onQuickStatus: (item: ServisItem, status: StatusServis) => void
}) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.22, ease: "easeOut" }} className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Detail Servis</p>
                <h2 className="truncate text-base font-black text-slate-800">{item.pelangganNama}</h2>
                <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">{item.nomorServis} · {item.tokoNama}</p>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"><X size={17} strokeWidth={2.5} /></button>
            </div>

            <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniInfo label="Tagihan" value={formatRupiah(item.totalTagihan)} />
                <MiniInfo label="Dibayar" value={formatRupiah(item.totalDibayar)} />
                <MiniInfo label="Hutang" value={item.sisaHutang > 0 ? formatRupiah(item.sisaHutang) : "-"} />
                <MiniInfo label="Laba" value={formatRupiah(item.labaKotor)} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Pelanggan & Perangkat</p>
                  <InfoLine icon={User2} label="Pelanggan" value={item.pelangganNama || "-"} />
                  <InfoLine icon={Phone} label="No HP" value={item.pelangganTelepon || "-"} />
                  <InfoLine icon={Smartphone} label="Perangkat" value={`${item.perangkatJenis} ${item.perangkatMerk} ${item.perangkatTipe}`.trim() || "-"} />
                  <InfoLine icon={ReceiptText} label="IMEI / Serial" value={item.imeiSerial || "-"} />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                  <InfoLine icon={CalendarDays} label="Tanggal Masuk" value={formatTanggal(item.tanggalMasukMs)} />
                  <InfoLine icon={Clock} label="Update" value={formatDateTime(item.updatedAtMs)} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusServisBadge status={item.statusServis} />
                    <StatusPembayaranBadge status={item.statusPembayaran} sisaHutang={item.sisaHutang} />
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Detail Kerusakan</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextBox title="Keluhan" value={item.keluhan || "-"} />
                  <TextBox title="Tindakan" value={item.tindakan || "-"} />
                  <TextBox title="Teknisi" value={item.teknisiNama || "-"} />
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 sm:col-span-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sparepart</p>
                    {item.sparepartItems.length === 0 ? (
                      <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">-</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {item.sparepartItems.map((sparepart, index) => (
                          <div key={`${sparepart.id}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm font-black text-slate-800">{sparepart.nama || `Sparepart ${index + 1}`}</p>
                              <p className="text-xs font-black text-sky-700">{formatRupiah(sparepart.harga)}</p>
                            </div>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Modal {formatRupiah(sparepart.modal)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {item.catatan && <TextBox title="Catatan" value={item.catatan} className="mt-3" />}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Histori Perubahan</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-500">Menampilkan maksimal 10 histori terakhir servis ini</p>
                  </div>
                  {historiLoading && <Loader2 size={16} className="animate-spin text-sky-600" strokeWidth={2.6} />}
                </div>

                {historiLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Memuat histori...</div>
                ) : historiList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Belum ada histori perubahan</div>
                ) : (
                  <div className="space-y-2">
                    {historiList.map((histori) => (
                      <div key={histori.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800">{histori.createdByNama || "Tanpa Nama"}</p>
                            <p className="mt-0.5 text-[10px] font-bold text-slate-400">{formatDateTime(histori.createdAtMs)} · {histori.aksi === "edit_setelah_diambil" ? "Edit setelah diambil" : histori.aksi === "ubah_status_cepat" ? "Ubah status cepat" : "Edit servis"}</p>
                          </div>
                          <span className="inline-flex w-fit rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">{histori.changedFields.length} perubahan</span>
                        </div>
                        {histori.alasan && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700">Alasan: {histori.alasan}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {histori.changedFields.slice(0, 8).map((field) => (
                            <span key={field} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">{getHistoriFieldLabel(field)}</span>
                          ))}
                          {histori.changedFields.length > 8 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">+{histori.changedFields.length - 8}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => onEdit(item)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50">
                  <Edit3 size={14} strokeWidth={2.6} />
                  Edit
                </button>
                {item.statusServis !== "diambil" && item.statusServis !== "batal" && (
                  <button type="button" onClick={() => onQuickStatus(item, item.statusServis === "selesai" ? "diambil" : "selesai")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white">
                    <CheckCircle2 size={14} strokeWidth={2.6} />
                    {item.statusServis === "selesai" ? "Tandai Diambil" : "Tandai Selesai"}
                  </button>
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

function TextBox({ title, value, className = "" }: { title: string; value: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 ${className}`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{value}</p>
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
