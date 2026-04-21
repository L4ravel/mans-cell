/* 
  Halaman admin terima barang.
  Fokus untuk menerima transfer barang yang sudah dikirim,
  melihat detail transfer, filter riwayat penerimaan,
  dan menyimpan nama & email user penerima dari koleksi users.
  Jika user bukan admin, data dikunci hanya untuk transfer yang terkait toko user sendiri.
*/

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
} from "firebase/firestore"
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  CircleDashed,
  CircleOff,
  Cpu,
  Eye,
  Mail,
  RefreshCw,
  Search,
  Store,
  Truck,
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

type TransferStatus = "DRAFT" | "DIKIRIM" | "DITERIMA" | "DIBATALKAN"

type UserActor = {
  uid: string
  nama: string
  email: string
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

type TransferBarang = {
  id: string
  kodeTransfer: string
  status: TransferStatus
  barangId: string
  barangTujuanId: string
  kodeBarang: string
  namaBarang: string
  kategoriId: string
  kategoriNama: string
  merk: string
  supplier: string
  satuan: string
  hargaModal: number
  hargaJual: number
  qty: number
  stokMinimum: number
  tokoAsalId: string
  tokoAsalNama: string
  tokoTujuanId: string
  tokoTujuanNama: string
  catatan: string
  catatanPenerimaan: string
  alasanBatal: string
  stokAsalSebelum: number
  stokAsalSesudah: number
  stokTujuanSebelum: number
  stokTujuanSesudah: number

  createdBy: string
  createdByNama: string
  createdByEmail: string

  sentBy: string
  sentByNama: string
  sentByEmail: string

  receivedBy: string
  receivedByNama: string
  receivedByEmail: string

  cancelledBy: string
  cancelledByNama: string
  cancelledByEmail: string

  createdAt?: any
  updatedAt?: any
  sentAt?: any
  receivedAt?: any
  cancelledAt?: any
}

type ReceiveForm = {
  catatanPenerimaan: string
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const EMPTY_RECEIVE_FORM: ReceiveForm = {
  catatanPenerimaan: "",
}

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
}

function isAdminProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (role === "admin" || role === "superadmin") return true
  return profile.roles.includes("admin") || profile.roles.includes("superadmin")
}

function FormInput({
  label,
  required,
  ...props
}: {
  label: string
  required?: boolean
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
    </div>
  )
}

function FormTextArea({
  label,
  required,
  ...props
}: {
  label: string
  required?: boolean
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <textarea
        {...props}
        className="min-h-[96px] w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
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
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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

const getStatusMeta = (status: TransferStatus) => {
  if (status === "DRAFT") {
    return {
      label: "Draft",
      className: "bg-slate-100 text-slate-700",
      icon: CircleDashed,
    }
  }

  if (status === "DIKIRIM") {
    return {
      label: "Terkirim",
      className: "bg-amber-100 text-amber-700",
      icon: Truck,
    }
  }

  if (status === "DITERIMA") {
    return {
      label: "Diterima",
      className: "bg-emerald-100 text-emerald-700",
      icon: CircleCheckBig,
    }
  }

  return {
    label: "Dibatalkan",
    className: "bg-red-100 text-red-700",
    icon: CircleOff,
  }
}

export default function TerimaBarangPage() {
  const defaultRange = getDefaultDateRange()

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [transferList, setTransferList] = useState<TransferBarang[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(EMPTY_RECEIVE_FORM)

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<TransferStatus | "">("DIKIRIM")
  const [filterAsal, setFilterAsal] = useState("")
  const [filterTujuan, setFilterTujuan] = useState("")
  const [filterStartDate, setFilterStartDate] = useState(defaultRange.startDate)
  const [filterEndDate, setFilterEndDate] = useState(defaultRange.endDate)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [selectedDetail, setSelectedDetail] = useState<TransferBarang | null>(null)
  const [receiveTarget, setReceiveTarget] = useState<TransferBarang | null>(null)

  const isAdminUser = useMemo(
    () => isAdminProfile(currentUserProfile),
    [currentUserProfile]
  )

  const userTokoId = useMemo(
    () => String(currentUserProfile?.tokoId || "").trim(),
    [currentUserProfile]
  )

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
      console.error("Gagal mengambil profil user:", e)
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

  const fetchToko = async (profile?: UserProfile | null) => {
    const activeProfile = profile || currentUserProfile
    const admin = isAdminProfile(activeProfile)

    try {
      if (!admin) {
        const tokoId = String(activeProfile?.tokoId || "").trim()
        const tokoNama = String(activeProfile?.tokoNama || "").trim()

        if (!tokoId) {
          setTokoList([])
          return
        }

        setTokoList([
          {
            id: tokoId,
            nama: tokoNama || "Toko User",
            aktif: true,
          },
        ])
        return
      }

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

  const fetchTransfer = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "transfer_barang"), orderBy("createdAt", "desc"))
      )

      const list: TransferBarang[] = snap.docs.map((item) => {
        const x = item.data() as any
        return {
          id: item.id,
          kodeTransfer: x?.kodeTransfer || item.id,
          status: (x?.status || "DRAFT") as TransferStatus,
          barangId: x?.barangId || "",
          barangTujuanId: x?.barangTujuanId || "",
          kodeBarang: x?.kodeBarang || "",
          namaBarang: x?.namaBarang || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || "Pcs",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          qty: Number(x?.qty || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
          tokoAsalId: x?.tokoAsalId || "",
          tokoAsalNama: x?.tokoAsalNama || "",
          tokoTujuanId: x?.tokoTujuanId || "",
          tokoTujuanNama: x?.tokoTujuanNama || "",
          catatan: x?.catatan || "",
          catatanPenerimaan: x?.catatanPenerimaan || "",
          alasanBatal: x?.alasanBatal || "",
          stokAsalSebelum: Number(x?.stokAsalSebelum || 0),
          stokAsalSesudah: Number(x?.stokAsalSesudah || 0),
          stokTujuanSebelum: Number(x?.stokTujuanSebelum || 0),
          stokTujuanSesudah: Number(x?.stokTujuanSesudah || 0),

          createdBy: x?.createdBy || "",
          createdByNama: x?.createdByNama || "",
          createdByEmail: x?.createdByEmail || "",

          sentBy: x?.sentBy || "",
          sentByNama: x?.sentByNama || "",
          sentByEmail: x?.sentByEmail || "",

          receivedBy: x?.receivedBy || "",
          receivedByNama: x?.receivedByNama || "",
          receivedByEmail: x?.receivedByEmail || "",

          cancelledBy: x?.cancelledBy || "",
          cancelledByNama: x?.cancelledByNama || "",
          cancelledByEmail: x?.cancelledByEmail || "",

          createdAt: x?.createdAt,
          updatedAt: x?.updatedAt,
          sentAt: x?.sentAt,
          receivedAt: x?.receivedAt,
          cancelledAt: x?.cancelledAt,
        }
      })

      setTransferList(list)
    } catch (e) {
      console.error(e)
      setTransferList([])
    }
  }

  const fetchAll = async (profile?: UserProfile | null) => {
    setLoading(true)
    try {
      await Promise.all([fetchToko(profile), fetchTransfer()])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUserProfile(null)
        setTokoList([])
        setTransferList([])
        return
      }

      const profile = await fetchCurrentUserProfile(user.uid, user.email)
      if (!isAdminProfile(profile)) {
        setFilterAsal("")
        setFilterTujuan("")
      }
      await fetchAll(profile)
    })
    return () => unsub()
  }, [])

  const scopedTransferList = useMemo(() => {
    if (isAdminUser) return transferList
    if (!userTokoId) return []
    return transferList.filter(
      (item) => item.tokoAsalId === userTokoId || item.tokoTujuanId === userTokoId
    )
  }, [transferList, isAdminUser, userTokoId])

  const filteredTransfer = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMillis = filterStartDate ? new Date(`${filterStartDate}T00:00:00`).getTime() : 0
    const endMillis = filterEndDate ? new Date(`${filterEndDate}T23:59:59.999`).getTime() : 0

    return scopedTransferList.filter((item) => {
      const matchSearch =
        !q ||
        item.kodeTransfer.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.namaBarang.toLowerCase().includes(q) ||
        item.tokoAsalNama.toLowerCase().includes(q) ||
        item.tokoTujuanNama.toLowerCase().includes(q) ||
        item.supplier.toLowerCase().includes(q) ||
        item.sentByNama.toLowerCase().includes(q) ||
        item.receivedByNama.toLowerCase().includes(q)

      const matchStatus = !filterStatus || item.status === filterStatus
      const effectiveAsal = isAdminUser ? filterAsal : ""
      const effectiveTujuan = isAdminUser ? filterTujuan : ""
      const matchAsal = !effectiveAsal || item.tokoAsalId === effectiveAsal
      const matchTujuan = !effectiveTujuan || item.tokoTujuanId === effectiveTujuan

      const compareMillis = toMillis(item.sentAt || item.createdAt)
      const matchDate =
        (!startMillis || compareMillis >= startMillis) &&
        (!endMillis || compareMillis <= endMillis)

      return matchSearch && matchStatus && matchAsal && matchTujuan && matchDate
    })
  }, [
    scopedTransferList,
    search,
    filterStatus,
    filterAsal,
    filterTujuan,
    filterStartDate,
    filterEndDate,
    isAdminUser,
  ])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredTransfer.length / itemsPerPage))

  const pagedTransfer =
    itemsPerPage === 0
      ? filteredTransfer
      : filteredTransfer.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (value: number) => setPage(Math.max(1, Math.min(totalPages, value)))

  const resetDateFilter = () => {
    const range = getDefaultDateRange()
    setFilterStartDate(range.startDate)
    setFilterEndDate(range.endDate)
    setPage(1)
  }

  const handleReceiveTransfer = async () => {
    const user = auth.currentUser
    if (!user || !receiveTarget) return

    if (!isAdminUser && (!userTokoId || receiveTarget.tokoTujuanId !== userTokoId)) {
      setError("Kamu hanya bisa menerima barang untuk toko milikmu sendiri")
      return
    }

    setActionLoading(receiveTarget.id)
    setError(null)

    try {
      const actor = await getUserProfile(user.uid, user.email)

      await runTransaction(db, async (transaction) => {
        const transferRef = doc(db, "transfer_barang", receiveTarget.id)
        const targetBarangRef = doc(db, "barang", receiveTarget.barangTujuanId)

        const [transferSnap, targetSnap] = await Promise.all([
          transaction.get(transferRef),
          transaction.get(targetBarangRef),
        ])

        if (!transferSnap.exists()) throw new Error("Transfer tidak ditemukan")

        const latestTransfer = transferSnap.data() as any
        const latestStatus = (latestTransfer?.status || "DRAFT") as TransferStatus
        const qty = Number(latestTransfer?.qty || 0)
        const latestTokoTujuanId = String(latestTransfer?.tokoTujuanId || "").trim()

        if (latestStatus !== "DIKIRIM") throw new Error("Transfer belum bisa diterima")
        if (qty <= 0) throw new Error("Qty transfer tidak valid")
        if (!isAdminUser && latestTokoTujuanId !== userTokoId) {
          throw new Error("Kamu hanya bisa menerima barang untuk toko milikmu sendiri")
        }

        if (targetSnap.exists()) {
          const targetData = targetSnap.data() as any
          const currentStock = Number(targetData?.stok || 0)

          transaction.update(targetBarangRef, {
            stok: currentStock + qty,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          })

          transaction.update(transferRef, {
            status: "DITERIMA",
            stokTujuanSebelum: currentStock,
            stokTujuanSesudah: currentStock + qty,
            catatanPenerimaan: receiveForm.catatanPenerimaan.trim(),
            receivedBy: actor.uid,
            receivedByNama: actor.nama,
            receivedByEmail: actor.email,
            receivedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        } else {
          transaction.set(targetBarangRef, {
            kodeBarang: latestTransfer?.kodeBarang || "",
            nama: latestTransfer?.namaBarang || "",
            kategoriId: latestTransfer?.kategoriId || "",
            kategoriNama: latestTransfer?.kategoriNama || "",
            tokoId: latestTransfer?.tokoTujuanId || "",
            tokoNama: latestTransfer?.tokoTujuanNama || "",
            merk: latestTransfer?.merk || "",
            supplier: latestTransfer?.supplier || "",
            satuan: latestTransfer?.satuan || "Pcs",
            hargaModal: Number(latestTransfer?.hargaModal || 0),
            hargaJual: Number(latestTransfer?.hargaJual || 0),
            stok: qty,
            stokMinimum: Number(latestTransfer?.stokMinimum || 0),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
            updatedBy: user.uid,
          })

          transaction.update(transferRef, {
            status: "DITERIMA",
            stokTujuanSebelum: 0,
            stokTujuanSesudah: qty,
            catatanPenerimaan: receiveForm.catatanPenerimaan.trim(),
            receivedBy: actor.uid,
            receivedByNama: actor.nama,
            receivedByEmail: actor.email,
            receivedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
      })

      setReceiveTarget(null)
      setReceiveForm(EMPTY_RECEIVE_FORM)
      await fetchAll(currentUserProfile)
      setSuccessMsg("Transfer berhasil diterima")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal menerima transfer")
    } finally {
      setActionLoading(null)
    }
  }

  const detailData =
    selectedDetail
      ? scopedTransferList.find((item) => item.id === selectedDetail.id) || selectedDetail
      : null

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <ArrowDownToLine size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Terima Barang
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Khusus penerimaan transfer barang antar toko
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:flex-wrap sm:justify-end">
            <div className="flex items-center gap-2">
              {filteredTransfer.length > 0 && (
                <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-emerald-500 px-2.5 shadow-sm shadow-emerald-200/50">
                  <span className="text-xs font-black text-white">
                    {itemsPerPage === 0 ? filteredTransfer.length : pagedTransfer.length}
                  </span>
                </div>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fetchAll(currentUserProfile)}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <motion.span
                animate={loading ? { rotate: 360 } : {}}
                transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
              >
                <RefreshCw size={14} className="text-slate-500" strokeWidth={2.5} />
              </motion.span>
            </motion.button>
          </div>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="text-[11px] font-bold text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500">
              <X size={14} strokeWidth={3} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
              <Check size={11} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-[11px] font-bold text-emerald-700">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Penerimaan</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Fokus untuk barang yang akan atau sudah diterima
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${isAdminUser ? "xl:grid-cols-6" : "xl:grid-cols-4"}`}>
          <FormInput
            label="Cari"
            value={search}
            onChange={(e: any) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Kode, barang, toko, supplier, user..."
          />

          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={(v) => {
              setFilterStatus(v as TransferStatus | "")
              setPage(1)
            }}
          >
            <option value="">Semua status</option>
            <option value="DIKIRIM">Terkirim</option>
            <option value="DITERIMA">Diterima</option>
          </FilterSelect>

          {isAdminUser ? (
            <>
              <FilterSelect
                label="Toko Asal"
                value={filterAsal}
                onChange={(v) => {
                  setFilterAsal(v)
                  setPage(1)
                }}
              >
                <option value="">Semua toko asal</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Toko Tujuan"
                value={filterTujuan}
                onChange={(v) => {
                  setFilterTujuan(v)
                  setPage(1)
                }}
              >
                <option value="">Semua toko tujuan</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Toko User
                </label>
                <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                  {currentUserProfile?.tokoNama || "Toko belum terhubung"}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Scope Data
                </label>
                <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                  Asal atau tujuan toko sendiri
                </div>
              </div>
            </>
          )}

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
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetDateFilter}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
          >
            Reset Tanggal
          </button>

          <button
            type="button"
            onClick={() => {
              setSearch("")
              setFilterStatus("DIKIRIM")
              setFilterAsal("")
              setFilterTujuan("")
              resetDateFilter()
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
          >
            Reset Semua Filter
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-800 sm:text-base">Daftar Penerimaan</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Total {filteredTransfer.length} transfer
            </p>
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

        {pagedTransfer.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Belum ada data penerimaan
          </div>
        ) : (
          <div className="space-y-3">
            {pagedTransfer.map((item) => {
              const meta = getStatusMeta(item.status)
              const StatusIcon = meta.icon
              const canReceive = item.status === "DIKIRIM" && (isAdminUser || item.tokoTujuanId === userTokoId)

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black ${meta.className}`}
                        >
                          <StatusIcon size={12} strokeWidth={2.5} />
                          {meta.label}
                        </span>

                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                          {item.kodeTransfer}
                        </span>
                      </div>

                      <p className="mt-3 text-sm font-black text-slate-800">
                        {item.kodeBarang} · {item.namaBarang}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        {item.tokoAsalNama} → {item.tokoTujuanNama} • Qty {item.qty} •{" "}
                        {item.satuan}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        Dikirim {formatDateTime(item.sentAt || item.createdAt)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-cyan-700">
                        Pengirim {item.sentByNama || item.createdByNama || "-"}
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

                      {canReceive && (
                        <button
                          type="button"
                          onClick={() => {
                            setReceiveTarget(item)
                            setReceiveForm(EMPTY_RECEIVE_FORM)
                          }}
                          disabled={actionLoading === item.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-white transition-all hover:bg-emerald-600 disabled:opacity-60"
                        >
                          <CircleCheckBig size={14} />
                          Konfirmasi Diterima
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {itemsPerPage !== 0 && totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-slate-500">
              Halaman {page} dari {totalPages}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      <Modal
        open={Boolean(detailData)}
        onClose={() => setSelectedDetail(null)}
        title="Detail Transfer"
        subtitle={detailData?.kodeTransfer || ""}
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
                Qty {detailData.qty} {detailData.satuan}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Toko Asal
              </p>
              <p className="mt-2 text-sm font-black text-slate-800">
                {detailData.tokoAsalNama}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-slate-500">
                Stok {detailData.stokAsalSebelum} → {detailData.stokAsalSesudah}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Toko Tujuan
              </p>
              <p className="mt-2 text-sm font-black text-slate-800">
                {detailData.tokoTujuanNama}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-slate-500">
                Stok {detailData.stokTujuanSebelum} → {detailData.stokTujuanSesudah}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Catatan Pengirim
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {detailData.catatan || "-"}
              </p>

              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Catatan Penerimaan
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {detailData.catatanPenerimaan || "-"}
              </p>
            </div>

            <ActorInfo
              title="Dibuat Oleh"
              nama={detailData.createdByNama}
              email={detailData.createdByEmail}
              waktu={detailData.createdAt}
            />
            <ActorInfo
              title="Dikirim Oleh"
              nama={detailData.sentByNama}
              email={detailData.sentByEmail}
              waktu={detailData.sentAt}
            />
            <ActorInfo
              title="Diterima Oleh"
              nama={detailData.receivedByNama}
              email={detailData.receivedByEmail}
              waktu={detailData.receivedAt}
            />
            <ActorInfo
              title="Dibatalkan Oleh"
              nama={detailData.cancelledByNama}
              email={detailData.cancelledByEmail}
              waktu={detailData.cancelledAt}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(receiveTarget)}
        onClose={() => {
          setReceiveTarget(null)
          setReceiveForm(EMPTY_RECEIVE_FORM)
        }}
        title="Konfirmasi Penerimaan"
        subtitle={receiveTarget?.kodeTransfer || ""}
      >
        {receiveTarget ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-black text-slate-800">
                {receiveTarget.namaBarang} • Qty {receiveTarget.qty}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-slate-500">
                {receiveTarget.tokoAsalNama} → {receiveTarget.tokoTujuanNama}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-cyan-700">
                Dikirim oleh {receiveTarget.sentByNama || receiveTarget.createdByNama || "-"}
              </p>
            </div>

            <FormTextArea
              label="Catatan Penerimaan"
              value={receiveForm.catatanPenerimaan}
              onChange={(e: any) =>
                setReceiveForm((prev) => ({
                  ...prev,
                  catatanPenerimaan: e.target.value,
                }))
              }
              placeholder="Opsional"
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReceiveTarget(null)
                  setReceiveForm(EMPTY_RECEIVE_FORM)
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleReceiveTransfer}
                disabled={actionLoading === receiveTarget.id}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-emerald-600 disabled:opacity-60"
              >
                {actionLoading === receiveTarget.id ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <CircleCheckBig size={16} />
                )}
                Konfirmasi Diterima
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}