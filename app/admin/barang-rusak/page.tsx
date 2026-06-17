// app/admin/barang-rusak/page.tsx
"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore"
import {
  AlertCircle,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Cpu,
  Eye,
  ListFilter,
  Mail,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Store,
  Trash2,
  User2,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  kode?: string
  aktif?: boolean
}

type Barang = {
  id: string
  kodeBarang: string
  kodeBarcode?: string
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
  jenisBarang?: "fisik" | "digital"
  pakaiKodeUnik?: boolean
  jenisKodeUnik?: "imei" | "serial" | "custom"
  kodeUnik?: string
  aktif?: boolean
  createdAt?: any
  updatedAt?: any
}

type BarangRusakStatus = "RUSAK" | "DIPULIHKAN" | "DIMUSNAHKAN"

type UserActor = {
  uid: string
  nama: string
  email: string
}

type BarangRusak = {
  id: string
  status: BarangRusakStatus
  kodeRusak: string

  barangId: string
  kodeBarang: string
  kodeBarcode: string
  namaBarang: string
  kategoriId: string
  kategoriNama: string
  tokoId: string
  tokoNama: string
  merk: string
  supplier: string
  satuan: string
  hargaModal: number
  hargaJual: number
  qtyRusak: number
  stokSebelum: number
  stokSesudah: number

  alasanRusak: string
  catatan: string
  catatanAksi: string

  createdBy: string
  createdByNama: string
  createdByEmail: string

  restoredBy: string
  restoredByNama: string
  restoredByEmail: string

  destroyedBy: string
  destroyedByNama: string
  destroyedByEmail: string

  createdAt?: any
  updatedAt?: any
  restoredAt?: any
  destroyedAt?: any
}

type FormState = {
  tokoId: string
  barangId: string
  qtyRusak: string
  alasanRusak: string
  catatan: string
}

type ActionTarget = {
  item: BarangRusak
  action: "restore" | "destroy"
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const EMPTY_FORM: FormState = {
  tokoId: "",
  barangId: "",
  qtyRusak: "",
  alasanRusak: "",
  catatan: "",
}

function FormInput({
  label,
  required,
  icon: Icon,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      />
    </div>
  )
}

function FormTextArea({
  label,
  required,
  icon: Icon,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <textarea
        {...props}
        className="min-h-[96px] w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  )
}

function FormSelect({
  label,
  required,
  icon: Icon,
  children,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  children: ReactNode
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string | number
  onChange: (v: string) => void
  children: ReactNode
  label: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-800">{title}</h3>
                {subtitle ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[calc(90vh-78px)] overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  icon: any
  tone: "slate" | "sky" | "amber" | "red" | "emerald"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "amber"
        ? "bg-amber-50 text-amber-600"
        : tone === "red"
          ? "bg-red-50 text-red-600"
          : tone === "emerald"
            ? "bg-emerald-50 text-emerald-600"
            : "bg-slate-100 text-slate-500"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
    >
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div className={`hidden h-9 w-9 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="text-lg font-black leading-tight text-slate-800 sm:text-2xl">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

function ActorInfo({
  title,
  nama,
  email,
  waktu,
}: {
  title: string
  nama?: string
  email?: string
  waktu?: any
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm font-black text-slate-800">
        <User2 size={14} strokeWidth={2.5} />
        {nama || "-"}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
        <Mail size={13} strokeWidth={2.5} />
        {email || "-"}
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-500">
        {formatDateTime(waktu)}
      </p>
    </div>
  )
}

const toMillis = (value: any) => {
  if (!value) return 0
  if (typeof value === "number") return value
  if (typeof value?.toMillis === "function") return value.toMillis()
  if (value?.seconds) return value.seconds * 1000
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

const formatDateTime = (value: any) => {
  const millis = toMillis(value)
  if (!millis) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(millis))
}

const formatDateInput = (value: Date) => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, "0")
  const day = `${value.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getDefaultDateRange = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 30)
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
  }
}

const formatRupiah = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "")

const buildKodeRusak = () => {
  const time = Date.now().toString().slice(-8)
  return `RSK-${time}`
}

const getStatusMeta = (status: BarangRusakStatus) => {
  if (status === "RUSAK") {
    return {
      label: "Rusak",
      className: "bg-red-100 text-red-700",
      icon: ShieldAlert,
    }
  }

  if (status === "DIPULIHKAN") {
    return {
      label: "Dipulihkan",
      className: "bg-emerald-100 text-emerald-700",
      icon: RotateCcw,
    }
  }

  return {
    label: "Dimusnahkan",
    className: "bg-slate-200 text-slate-700",
    icon: Trash2,
  }
}

export default function BarangRusakPage() {
  const defaultRange = getDefaultDateRange()

  const [barangList, setBarangList] = useState<Barang[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [rusakList, setRusakList] = useState<BarangRusak[]>([])

  const [loading, setLoading] = useState(false)
  const [barangLoading, setBarangLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [showFormModal, setShowFormModal] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<BarangRusak | null>(null)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [catatanAksi, setCatatanAksi] = useState("")

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [barangSearch, setBarangSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<BarangRusakStatus | "">("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStartDate, setFilterStartDate] = useState(defaultRange.startDate)
  const [filterEndDate, setFilterEndDate] = useState(defaultRange.endDate)
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const setField =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }))

  const getUserProfile = async (uid: string, emailFallback?: string | null): Promise<UserActor> => {
    try {
      const snap = await getDoc(doc(db, "users", uid))
      if (snap.exists()) {
        const x = snap.data() as any
        return {
          uid,
          nama: String(x?.nama || "").trim() || "Tanpa Nama",
          email: String(x?.email || "").trim() || String(emailFallback || "").trim() || "-",
        }
      }
    } catch (e) {
      console.error("Gagal mengambil user profile:", e)
    }

    return {
      uid,
      nama: "Tanpa Nama",
      email: String(emailFallback || "").trim() || "-",
    }
  }

  const mapBarangDoc = (item: any): Barang => {
    const x = item.data() as any

    return {
      id: item.id,
      kodeBarang: x?.kodeBarang || "",
      kodeBarcode: x?.kodeBarcode || x?.barcodeValue || "",
      nama: x?.nama || "",
      kategoriId: x?.kategoriId || "",
      kategoriNama: x?.kategoriNama || "",
      tokoId: x?.tokoId || "",
      tokoNama: x?.tokoNama || "",
      merk: x?.merk || "",
      supplier: x?.supplier || "",
      satuan: x?.satuan || x?.satuanNama || "Pcs",
      satuanId: x?.satuanId || "",
      satuanNama: x?.satuanNama || x?.satuan || "",
      hargaModal: Number(x?.hargaModal || 0),
      hargaJual: Number(x?.hargaJual || 0),
      stok: Number(x?.stok || 0),
      stokMinimum: Number(x?.stokMinimum || 0),
      jenisBarang: x?.jenisBarang || "fisik",
      pakaiKodeUnik: Boolean(x?.pakaiKodeUnik),
      jenisKodeUnik: x?.jenisKodeUnik || "imei",
      kodeUnik: x?.kodeUnik || "",
      aktif: x?.aktif !== false,
      createdAt: x?.createdAt,
      updatedAt: x?.updatedAt,
    }
  }

  const fetchToko = async () => {
    try {
      const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
      const list: Toko[] = snap.docs
        .map((item) => {
          const x = item.data() as any
          return {
            id: item.id,
            nama: x?.nama || "",
            kode: x?.kode || "",
            aktif: x?.aktif !== false,
          }
        })
        .filter((item) => item.nama)

      setTokoList(list)
    } catch (e) {
      console.error(e)
      setTokoList([])
    }
  }

  const fetchBarangByToko = async (tokoId: string) => {
    const activeTokoId = String(tokoId || "").trim()

    if (!activeTokoId) {
      setBarangList([])
      return
    }

    setBarangLoading(true)
    try {
      const snap = await getDocs(
        query(
          collection(db, "barang"),
          where("tokoId", "==", activeTokoId),
          orderBy("nama")
        )
      )
      setBarangList(snap.docs.map(mapBarangDoc))
    } catch (e) {
      console.error(e)
      setBarangList([])
      setError("Gagal mengambil barang dari toko yang dipilih")
    } finally {
      setBarangLoading(false)
    }
  }

  const fetchBarangRusak = async () => {
    try {
      const snap = await getDocs(query(collection(db, "barang_rusak"), orderBy("createdAt", "desc")))
      const list: BarangRusak[] = snap.docs.map((item) => {
        const x = item.data() as any
        return {
          id: item.id,
          status: (x?.status || "RUSAK") as BarangRusakStatus,
          kodeRusak: x?.kodeRusak || item.id,

          barangId: x?.barangId || "",
          kodeBarang: x?.kodeBarang || "",
          kodeBarcode: x?.kodeBarcode || "",
          namaBarang: x?.namaBarang || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || "Pcs",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          qtyRusak: Number(x?.qtyRusak || 0),
          stokSebelum: Number(x?.stokSebelum || 0),
          stokSesudah: Number(x?.stokSesudah || 0),

          alasanRusak: x?.alasanRusak || "",
          catatan: x?.catatan || "",
          catatanAksi: x?.catatanAksi || "",

          createdBy: x?.createdBy || "",
          createdByNama: x?.createdByNama || "",
          createdByEmail: x?.createdByEmail || "",

          restoredBy: x?.restoredBy || "",
          restoredByNama: x?.restoredByNama || "",
          restoredByEmail: x?.restoredByEmail || "",

          destroyedBy: x?.destroyedBy || "",
          destroyedByNama: x?.destroyedByNama || "",
          destroyedByEmail: x?.destroyedByEmail || "",

          createdAt: x?.createdAt,
          updatedAt: x?.updatedAt,
          restoredAt: x?.restoredAt,
          destroyedAt: x?.destroyedAt,
        }
      })

      setRusakList(list)
    } catch (e) {
      console.error(e)
      setRusakList([])
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchToko(), fetchBarangRusak()])
      if (form.tokoId) await fetchBarangByToko(form.tokoId)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchAll()
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedBarang = useMemo(() => {
    return barangList.find((item) => item.id === form.barangId) || null
  }, [barangList, form.barangId])

  const barangFiltered = useMemo(() => {
    const q = barangSearch.toLowerCase().trim()

    return barangList.filter((item) => {
      if (!q) return true
      return (
        item.kodeBarang.toLowerCase().includes(q) ||
        String(item.kodeBarcode || "").toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.supplier.toLowerCase().includes(q)
      )
    })
  }, [barangList, barangSearch])

  const filteredRusak = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMillis = filterStartDate ? new Date(`${filterStartDate}T00:00:00`).getTime() : 0
    const endMillis = filterEndDate ? new Date(`${filterEndDate}T23:59:59.999`).getTime() : 0

    return rusakList.filter((item) => {
      const matchSearch =
        !q ||
        item.kodeRusak.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.kodeBarcode.toLowerCase().includes(q) ||
        item.namaBarang.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.supplier.toLowerCase().includes(q) ||
        item.alasanRusak.toLowerCase().includes(q) ||
        item.createdByNama.toLowerCase().includes(q)

      const matchStatus = !filterStatus || item.status === filterStatus
      const matchToko = !filterToko || item.tokoId === filterToko
      const createdMillis = toMillis(item.createdAt)
      const matchDate =
        (!startMillis || createdMillis >= startMillis) &&
        (!endMillis || createdMillis <= endMillis)

      return matchSearch && matchStatus && matchToko && matchDate
    })
  }, [rusakList, search, filterStatus, filterToko, filterStartDate, filterEndDate])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredRusak.length / itemsPerPage))

  const pagedRusak =
    itemsPerPage === 0
      ? filteredRusak
      : filteredRusak.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (value: number) => setPage(Math.max(1, Math.min(totalPages, value)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const stats = useMemo(() => {
    const masihRusak = filteredRusak.filter((item) => item.status === "RUSAK")
    const dipulihkan = filteredRusak.filter((item) => item.status === "DIPULIHKAN")
    const dimusnahkan = filteredRusak.filter((item) => item.status === "DIMUSNAHKAN")
    const totalQty = filteredRusak.reduce((sum, item) => sum + Number(item.qtyRusak || 0), 0)
    const totalKerugian = filteredRusak
      .filter((item) => item.status !== "DIPULIHKAN")
      .reduce((sum, item) => sum + Number(item.qtyRusak || 0) * Number(item.hargaModal || 0), 0)

    return {
      total: filteredRusak.length,
      masihRusak: masihRusak.length,
      dipulihkan: dipulihkan.length,
      dimusnahkan: dimusnahkan.length,
      totalQty,
      totalKerugian,
    }
  }, [filteredRusak])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setBarangList([])
    setBarangSearch("")
    setError(null)
  }

  const resetFilter = () => {
    const range = getDefaultDateRange()
    setSearch("")
    setFilterStatus("")
    setFilterToko("")
    setFilterStartDate(range.startDate)
    setFilterEndDate(range.endDate)
    setPage(1)
  }

  const validateForm = () => {
    if (!form.tokoId) return "Toko wajib dipilih"
    if (!form.barangId) return "Barang wajib dipilih"

    const barang = selectedBarang
    if (!barang) return "Barang tidak ditemukan"
    if (barang.tokoId !== form.tokoId) return "Barang tidak sesuai dengan toko yang dipilih"

    const qty = Number(onlyDigits(form.qtyRusak))
    if (!form.qtyRusak.trim()) return "Qty rusak wajib diisi"
    if (Number.isNaN(qty) || qty <= 0) return "Qty rusak tidak valid"
    if (qty > barang.stok) return `Stok ${barang.nama} hanya ${barang.stok}, tidak bisa mencatat rusak ${qty}`

    if (!form.alasanRusak.trim()) return "Alasan rusak wajib diisi"

    return null
  }

  const handleSubmit = async () => {
    const user = auth.currentUser
    if (!user) return

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const actor = await getUserProfile(user.uid, user.email)
      const qty = Number(onlyDigits(form.qtyRusak))
      const kodeRusak = buildKodeRusak()
      const newRusakRef = doc(collection(db, "barang_rusak"))

      await runTransaction(db, async (transaction) => {
        const barangRef = doc(db, "barang", form.barangId)
        const barangSnap = await transaction.get(barangRef)

        if (!barangSnap.exists()) throw new Error("Barang tidak ditemukan")

        const barangData = barangSnap.data() as any
        const currentStock = Number(barangData?.stok || 0)
        const latestTokoId = String(barangData?.tokoId || "").trim()

        if (latestTokoId !== form.tokoId) throw new Error("Barang tidak sesuai dengan toko yang dipilih")
        if (currentStock < qty) throw new Error(`Stok barang hanya ${currentStock}, tidak mencukupi`)

        transaction.update(barangRef, {
          stok: currentStock - qty,
          updatedAt: Date.now(),
          updatedBy: user.uid,
        })

        transaction.set(newRusakRef, {
          status: "RUSAK",
          kodeRusak,

          barangId: barangRef.id,
          kodeBarang: barangData?.kodeBarang || "",
          kodeBarcode: barangData?.kodeBarcode || barangData?.barcodeValue || "",
          namaBarang: barangData?.nama || "",
          kategoriId: barangData?.kategoriId || "",
          kategoriNama: barangData?.kategoriNama || "",
          tokoId: barangData?.tokoId || "",
          tokoNama: barangData?.tokoNama || "",
          merk: barangData?.merk || "",
          supplier: barangData?.supplier || "",
          satuan: barangData?.satuan || barangData?.satuanNama || "Pcs",
          hargaModal: Number(barangData?.hargaModal || 0),
          hargaJual: Number(barangData?.hargaJual || 0),
          qtyRusak: qty,
          stokSebelum: currentStock,
          stokSesudah: currentStock - qty,

          alasanRusak: form.alasanRusak.trim(),
          catatan: form.catatan.trim(),
          catatanAksi: "",

          createdBy: actor.uid,
          createdByNama: actor.nama,
          createdByEmail: actor.email,

          restoredBy: "",
          restoredByNama: "",
          restoredByEmail: "",

          destroyedBy: "",
          destroyedByNama: "",
          destroyedByEmail: "",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          restoredAt: null,
          destroyedAt: null,
        })
      })

      await Promise.all([fetchBarangRusak(), fetchBarangByToko(form.tokoId)])
      resetForm()
      setShowFormModal(false)
      setSuccessMsg("Barang rusak berhasil dicatat dan stok sudah dikurangi")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal mencatat barang rusak")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleAction = async () => {
    const user = auth.currentUser
    if (!user || !actionTarget) return

    setActionLoading(actionTarget.item.id)
    setError(null)

    try {
      const actor = await getUserProfile(user.uid, user.email)

      await runTransaction(db, async (transaction) => {
        const rusakRef = doc(db, "barang_rusak", actionTarget.item.id)
        const rusakSnap = await transaction.get(rusakRef)

        if (!rusakSnap.exists()) throw new Error("Data barang rusak tidak ditemukan")

        const rusakData = rusakSnap.data() as any
        const latestStatus = (rusakData?.status || "RUSAK") as BarangRusakStatus
        const qty = Number(rusakData?.qtyRusak || 0)

        if (latestStatus !== "RUSAK") {
          throw new Error("Status barang rusak ini sudah final")
        }

        if (actionTarget.action === "restore") {
          const barangRef = doc(db, "barang", String(rusakData?.barangId || ""))
          const barangSnap = await transaction.get(barangRef)

          if (!barangSnap.exists()) throw new Error("Barang utama tidak ditemukan")

          const barangData = barangSnap.data() as any
          const currentStock = Number(barangData?.stok || 0)

          transaction.update(barangRef, {
            stok: currentStock + qty,
            updatedAt: Date.now(),
            updatedBy: user.uid,
          })

          transaction.update(rusakRef, {
            status: "DIPULIHKAN",
            catatanAksi: catatanAksi.trim(),
            restoredBy: actor.uid,
            restoredByNama: actor.nama,
            restoredByEmail: actor.email,
            restoredAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })

          return
        }

        transaction.update(rusakRef, {
          status: "DIMUSNAHKAN",
          catatanAksi: catatanAksi.trim(),
          destroyedBy: actor.uid,
          destroyedByNama: actor.nama,
          destroyedByEmail: actor.email,
          destroyedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })

      await Promise.all([
        fetchBarangRusak(),
        actionTarget.item.tokoId ? fetchBarangByToko(actionTarget.item.tokoId) : Promise.resolve(),
      ])
      setActionTarget(null)
      setCatatanAksi("")
      setSuccessMsg(
        actionTarget.action === "restore"
          ? "Barang berhasil dipulihkan dan stok sudah ditambahkan"
          : "Barang rusak berhasil ditandai dimusnahkan"
      )
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal memproses aksi barang rusak")
    } finally {
      setActionLoading(null)
    }
  }

  const detailData =
    selectedDetail
      ? rusakList.find((item) => item.id === selectedDetail.id) || selectedDetail
      : null

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
                <ShieldAlert size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Barang Rusak
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Catat barang rusak per toko, pilih barang setelah toko dipilih, dan kurangi stok sesuai jumlah rusak.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">           

              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setShowFormModal(true)
                }}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-white/20 bg-white px-3 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 shadow-sm transition-colors hover:bg-sky-50"
              >
                <ShieldAlert size={13} strokeWidth={2.8} />
                Catat kerusakan
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {(error || successMsg) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg ${
                successMsg ? "border-sky-200 bg-sky-50" : "border-red-200 bg-red-50"
              }`}
            >
              {successMsg ? (
                <Check size={16} className="text-sky-600" strokeWidth={3} />
              ) : (
                <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              )}
              <p className={`max-w-xs text-xs font-black ${successMsg ? "text-sky-700" : "text-red-700"}`}>
                {successMsg || error}
              </p>
              {error ? (
                <button type="button" onClick={() => setError(null)} className="text-red-500">
                  <X size={14} strokeWidth={3} />
                </button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-6">
          <StatCard label="Total Data" value={stats.total} icon={Boxes} tone="slate" />
          <StatCard label="Masih Rusak" value={stats.masihRusak} icon={ShieldAlert} tone="red" />
          <StatCard label="Dipulihkan" value={stats.dipulihkan} icon={RotateCcw} tone="emerald" />
          <StatCard label="Dimusnahkan" value={stats.dimusnahkan} icon={Trash2} tone="amber" />
          <StatCard label="Total Qty" value={stats.totalQty} icon={Package} tone="sky" />
          <StatCard label="Estimasi Rugi" value={formatRupiah(stats.totalKerugian)} icon={CircleOff} tone="red" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-start justify-between gap-3 sm:mb-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Barang Rusak</h2>
            </div>

            <button
              type="button"
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.08em] transition sm:hidden ${
                filterMobileOpen
                  ? "border-sky-200 bg-sky-100 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
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
                <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <FormInput
                    label="Cari"
                    icon={Search}
                    value={search}
                    onChange={(e: any) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Kode, barang, toko, alasan..."
                  />

                  <FilterSelect
                    label="Status"
                    value={filterStatus}
                    onChange={(v) => {
                      setFilterStatus(v as BarangRusakStatus | "")
                      setPage(1)
                    }}
                  >
                    <option value="">Semua status</option>
                    <option value="RUSAK">Rusak</option>
                    <option value="DIPULIHKAN">Dipulihkan</option>
                    <option value="DIMUSNAHKAN">Dimusnahkan</option>
                  </FilterSelect>

                  <FilterSelect
                    label="Toko"
                    value={filterToko}
                    onChange={(v) => {
                      setFilterToko(v)
                      setPage(1)
                    }}
                  >
                    <option value="">Semua toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nama}
                      </option>
                    ))}
                  </FilterSelect>

                  <FormInput
                    label="Dari Tanggal"
                    type="date"
                    value={filterStartDate}
                    onChange={(e: any) => {
                      setFilterStartDate(e.target.value)
                      setPage(1)
                    }}
                  />

                  <FormInput
                    label="Sampai Tanggal"
                    type="date"
                    value={filterEndDate}
                    onChange={(e: any) => {
                      setFilterEndDate(e.target.value)
                      setPage(1)
                    }}
                  />

                  <button
                    type="button"
                    onClick={resetFilter}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
                  >
                    Reset Semua Filter
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 hidden grid-cols-1 gap-3 sm:grid md:grid-cols-2 xl:grid-cols-6">
            <FormInput
              label="Cari"
              icon={Search}
              value={search}
              onChange={(e: any) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Kode, barang, toko, alasan..."
            />

            <FilterSelect
              label="Status"
              value={filterStatus}
              onChange={(v) => {
                setFilterStatus(v as BarangRusakStatus | "")
                setPage(1)
              }}
            >
              <option value="">Semua status</option>
              <option value="RUSAK">Rusak</option>
              <option value="DIPULIHKAN">Dipulihkan</option>
              <option value="DIMUSNAHKAN">Dimusnahkan</option>
            </FilterSelect>

            <FilterSelect
              label="Toko"
              value={filterToko}
              onChange={(v) => {
                setFilterToko(v)
                setPage(1)
              }}
            >
              <option value="">Semua toko</option>
              {tokoList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nama}
                </option>
              ))}
            </FilterSelect>

            <FormInput
              label="Dari Tanggal"
              type="date"
              value={filterStartDate}
              onChange={(e: any) => {
                setFilterStartDate(e.target.value)
                setPage(1)
              }}
            />

            <FormInput
              label="Sampai Tanggal"
              type="date"
              value={filterEndDate}
              onChange={(e: any) => {
                setFilterEndDate(e.target.value)
                setPage(1)
              }}
            />

            <div className="flex items-end">
              <button
                type="button"
                onClick={resetFilter}
                className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Reset Filter
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Riwayat Barang Rusak</h2>
            </div>

            <div className="w-full sm:w-40">
              <FilterSelect
                label="Tampil"
                value={itemsPerPage}
                onChange={(v) => {
                  setItemsPerPage(Number(v))
                  setPage(1)
                }}
              >
                {ITEMS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
                />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Memuat data barang rusak...
                </p>
              </div>
            </div>
          ) : pagedRusak.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Belum ada data barang rusak
            </div>
          ) : (
            <div className="space-y-3">
              {pagedRusak.map((item, idx) => {
                const meta = getStatusMeta(item.status)
                const StatusIcon = meta.icon

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.02 }}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black ${meta.className}`}>
                            <StatusIcon size={12} strokeWidth={2.5} />
                            {meta.label}
                          </span>

                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                            {item.kodeRusak}
                          </span>
                        </div>

                        <p className="mt-3 text-sm font-black text-slate-800">
                          {item.kodeBarang} · {item.namaBarang}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {item.tokoNama} • Qty {item.qtyRusak} {item.satuan} • {item.alasanRusak}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-400">
                          Stok {item.stokSebelum} → {item.stokSesudah} • {formatDateTime(item.createdAt)}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-sky-700">
                          Dicatat oleh {item.createdByNama || "-"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDetail(item)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
                        >
                          <Eye size={14} />
                          Detail
                        </button>

                        {item.status === "RUSAK" && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionTarget({ item, action: "restore" })
                              setCatatanAksi("")
                            }}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <RotateCcw size={14} />
                            Pulihkan
                          </button>
                        )}

                        {item.status === "RUSAK" && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionTarget({ item, action: "destroy" })
                              setCatatanAksi("")
                            }}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[11px] font-black text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            Musnahkan
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {itemsPerPage !== 0 && totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-1.5">
              <button
                type="button"
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    totalPages <= 7 ||
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - page) <= 2
                )
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (
                    idx > 0 &&
                    typeof arr[idx - 1] === "number" &&
                    p - (arr[idx - 1] as number) > 1
                  ) {
                    acc.push("...")
                  }
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">
                      ···
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goPage(p)}
                      className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${
                        page === p
                          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                type="button"
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </motion.div>

        <Modal
          open={showFormModal}
          onClose={() => {
            setShowFormModal(false)
            resetForm()
          }}
          title="Catat Barang Rusak"
          subtitle="Pilih toko dulu, lalu barang dari toko itu baru dimuat"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormSelect
                label="Toko"
                icon={Store}
                required
                value={form.tokoId}
                onChange={async (e: any) => {
                  const tokoId = e.target.value
                  setForm((prev) => ({
                    ...prev,
                    tokoId,
                    barangId: "",
                    qtyRusak: "",
                  }))
                  setBarangSearch("")
                  setBarangList([])
                  if (tokoId) await fetchBarangByToko(tokoId)
                }}
              >
                <option value="">Pilih toko</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FormSelect>

              <FormInput
                label="Cari Barang"
                icon={Search}
                value={barangSearch}
                onChange={(e: any) => setBarangSearch(e.target.value)}
                disabled={!form.tokoId || barangLoading}
                placeholder={
                  !form.tokoId
                    ? "Pilih toko dulu"
                    : barangLoading
                      ? "Memuat barang..."
                      : "Cari nama, kode, barcode, merk..."
                }
              />

              <div className="md:col-span-2">
                <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <Package size={11} strokeWidth={2.5} />
                  Barang
                  <span className="ml-0.5 text-red-400">*</span>
                </label>

                <div className="max-h-[340px] overflow-y-auto rounded-2xl border-2 border-slate-200 bg-slate-50/70 p-2">
                  {!form.tokoId ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Pilih toko dulu agar barang dimuat dari database
                    </div>
                  ) : barangLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-8 text-[11px] font-black uppercase tracking-widest text-slate-400">
                      <RefreshCw size={15} className="animate-spin" />
                      Memuat barang...
                    </div>
                  ) : barangFiltered.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Barang tidak ditemukan
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {barangFiltered.map((item) => {
                        const active = form.barangId === item.id

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                barangId: item.id,
                                qtyRusak: "",
                              }))
                            }}
                            className={`w-full rounded-2xl border p-3 text-left transition-all ${
                              active
                                ? "border-sky-300 bg-sky-50 ring-2 ring-sky-400/10"
                                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40"
                            }`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-800">
                                  {item.kodeBarang} · {item.nama}
                                </p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                  {item.kategoriNama || "Tanpa kategori"} • {item.merk || "Tanpa merk"} • {item.supplier || "Tanpa supplier"}
                                </p>
                                {item.kodeBarcode ? (
                                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Barcode: {item.kodeBarcode}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                                  Stok {item.stok}
                                </span>
                                <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-black text-sky-700">
                                  {item.satuan}
                                </span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <FormInput
                label="Qty Rusak"
                icon={Boxes}
                required
                value={form.qtyRusak}
                inputMode="numeric"
                disabled={!selectedBarang}
                onChange={(e: any) => setField("qtyRusak")(onlyDigits(e.target.value))}
                placeholder={
                  selectedBarang
                    ? `Maksimal ${selectedBarang.stok}`
                    : "Pilih barang dulu"
                }
              />

              <FormInput
                label="Alasan Rusak"
                icon={ShieldAlert}
                required
                value={form.alasanRusak}
                onChange={(e: any) => setField("alasanRusak")(e.target.value)}
                placeholder="Contoh: layar pecah, sobek, mati total"
              />

              <div className="md:col-span-2">
                <FormTextArea
                  label="Catatan"
                  value={form.catatan}
                  onChange={(e: any) => setField("catatan")(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
            </div>

            {selectedBarang && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  Ringkasan Barang
                </p>
                <p className="mt-2 text-sm font-black text-slate-800">
                  {selectedBarang.kodeBarang} · {selectedBarang.nama}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-600">
                  {selectedBarang.tokoNama} • Stok saat ini {selectedBarang.stok} {selectedBarang.satuan}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                  Modal {formatRupiah(selectedBarang.hargaModal)} • Jual {formatRupiah(selectedBarang.hargaJual)}
                </p>
                {form.qtyRusak ? (
                  <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[12px] font-black text-sky-700 ring-1 ring-sky-100">
                    Stok setelah dicatat rusak: {Math.max(0, selectedBarang.stok - Number(onlyDigits(form.qtyRusak) || 0))} {selectedBarang.satuan}
                  </p>
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFormModal(false)
                  resetForm()
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-sky-700 disabled:opacity-60"
              >
                {submitLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <ShieldAlert size={16} />
                )}
                Simpan Barang Rusak
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={Boolean(detailData)}
          onClose={() => setSelectedDetail(null)}
          title="Detail Barang Rusak"
          subtitle={detailData?.kodeRusak || ""}
        >
          {detailData ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Barang
                </p>
                <p className="mt-2 text-sm font-black text-slate-800">
                  {detailData.kodeBarang} · {detailData.namaBarang}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                  {detailData.kategoriNama || "-"} • {detailData.merk || "-"} •{" "}
                  {detailData.supplier || "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Status
                </p>
                <p className="mt-2 text-sm font-black text-slate-800">
                  {getStatusMeta(detailData.status).label}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                  Qty {detailData.qtyRusak} {detailData.satuan}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Toko
                </p>
                <p className="mt-2 text-sm font-black text-slate-800">
                  {detailData.tokoNama}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                  Stok {detailData.stokSebelum} → {detailData.stokSesudah}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Estimasi Nilai
                </p>
                <p className="mt-2 text-sm font-black text-slate-800">
                  {formatRupiah(detailData.qtyRusak * detailData.hargaModal)}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                  Modal satuan {formatRupiah(detailData.hargaModal)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Alasan Rusak
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {detailData.alasanRusak || "-"}
                </p>

                <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Catatan
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {detailData.catatan || "-"}
                </p>

                <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Catatan Aksi
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {detailData.catatanAksi || "-"}
                </p>
              </div>

              <ActorInfo
                title="Dicatat Oleh"
                nama={detailData.createdByNama}
                email={detailData.createdByEmail}
                waktu={detailData.createdAt}
              />
              <ActorInfo
                title="Dipulihkan Oleh"
                nama={detailData.restoredByNama}
                email={detailData.restoredByEmail}
                waktu={detailData.restoredAt}
              />
              <ActorInfo
                title="Dimusnahkan Oleh"
                nama={detailData.destroyedByNama}
                email={detailData.destroyedByEmail}
                waktu={detailData.destroyedAt}
              />
            </div>
          ) : null}
        </Modal>

        <Modal
          open={Boolean(actionTarget)}
          onClose={() => {
            setActionTarget(null)
            setCatatanAksi("")
          }}
          title={actionTarget?.action === "restore" ? "Pulihkan Barang" : "Musnahkan Barang"}
          subtitle={actionTarget?.item.kodeRusak || ""}
        >
          {actionTarget ? (
            <div className="space-y-4">
              <div
                className={`rounded-2xl border p-4 ${
                  actionTarget.action === "restore"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <p
                  className={`text-sm font-black ${
                    actionTarget.action === "restore" ? "text-emerald-800" : "text-red-800"
                  }`}
                >
                  {actionTarget.item.namaBarang} • Qty {actionTarget.item.qtyRusak}
                </p>
                <p
                  className={`mt-1 text-[12px] font-semibold ${
                    actionTarget.action === "restore" ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {actionTarget.action === "restore"
                    ? "Stok barang utama akan ditambahkan kembali."
                    : "Stok tidak berubah karena sudah dikurangi saat barang dicatat rusak."}
                </p>
              </div>

              <FormTextArea
                label="Catatan Aksi"
                value={catatanAksi}
                onChange={(e: any) => setCatatanAksi(e.target.value)}
                placeholder="Opsional"
              />

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActionTarget(null)
                    setCatatanAksi("")
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleAction}
                  disabled={actionLoading === actionTarget.item.id}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white transition-all disabled:opacity-60 ${
                    actionTarget.action === "restore"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {actionLoading === actionTarget.item.id ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : actionTarget.action === "restore" ? (
                    <RotateCcw size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {actionTarget.action === "restore" ? "Pulihkan Sekarang" : "Musnahkan Sekarang"}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </main>
    </div>
  )
}