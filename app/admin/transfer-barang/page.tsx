/* 
  Halaman admin transfer barang antar toko.
  File ini mendukung draft transfer banyak barang sekaligus, pencarian barang, kirim, terima,
  batal, detail transfer, dan filter riwayat transfer.
*/

"use client"

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import {
  ArrowLeftRight,
  Boxes,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  CircleDashed,
  CircleOff,
  Cpu,
  Eye,
  Package,
  RefreshCw,
  Search,
  Store,
  Truck,
  Undo2,
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
  createdAt?: any
  updatedAt?: any
}

type TransferStatus = "DRAFT" | "DIKIRIM" | "DITERIMA" | "DIBATALKAN"

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
  sentBy: string
  receivedBy: string
  cancelledBy: string
  createdAt?: any
  updatedAt?: any
  sentAt?: any
  receivedAt?: any
  cancelledAt?: any
}

type TransferForm = {
  tokoAsalId: string
  tokoTujuanId: string
  catatan: string
}

type SelectedTransferItem = {
  barangId: string
  qty: string
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

const EMPTY_FORM: TransferForm = {
  tokoAsalId: "",
  tokoTujuanId: "",
  catatan: "",
}

const EMPTY_RECEIVE_FORM: ReceiveForm = {
  catatanPenerimaan: "",
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

function FormSelect({
  label,
  required,
  children,
  ...props
}: {
  label: string
  required?: boolean
  children: ReactNode
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
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

const formatCurrency = (value: number) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`

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

const buildKodeTransfer = () => {
  const time = Date.now().toString().slice(-8)
  return `TRF-${time}`
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

export default function TransferBarangPage() {
  const defaultRange = getDefaultDateRange()

  const [barangList, setBarangList] = useState<Barang[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [transferList, setTransferList] = useState<TransferBarang[]>([])

  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [form, setForm] = useState<TransferForm>(EMPTY_FORM)
  const [selectedItems, setSelectedItems] = useState<SelectedTransferItem[]>([])
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(EMPTY_RECEIVE_FORM)

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterAsal, setFilterAsal] = useState("")
  const [filterTujuan, setFilterTujuan] = useState("")
  const [filterStartDate, setFilterStartDate] = useState(defaultRange.startDate)
  const [filterEndDate, setFilterEndDate] = useState(defaultRange.endDate)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [selectedDetail, setSelectedDetail] = useState<TransferBarang | null>(null)
  const [receiveTarget, setReceiveTarget] = useState<TransferBarang | null>(null)
  const [cancelTarget, setCancelTarget] = useState<TransferBarang | null>(null)

  const [barangModalOpen, setBarangModalOpen] = useState(false)
  const [barangModalSearch, setBarangModalSearch] = useState("")

  const setField =
    (key: keyof TransferForm) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }))

  const setReceiveField =
    (key: keyof ReceiveForm) =>
    (value: string) =>
      setReceiveForm((prev) => ({ ...prev, [key]: value }))

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

  const fetchBarang = async () => {
    try {
      const snap = await getDocs(query(collection(db, "barang"), orderBy("nama")))
      const list: Barang[] = snap.docs.map((item) => {
        const x = item.data() as any
        return {
          id: item.id,
          kodeBarang: x?.kodeBarang || "",
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || "Pcs",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
          createdAt: x?.createdAt,
          updatedAt: x?.updatedAt,
        }
      })

      setBarangList(list)
    } catch (e) {
      console.error(e)
      setBarangList([])
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
          sentBy: x?.sentBy || "",
          receivedBy: x?.receivedBy || "",
          cancelledBy: x?.cancelledBy || "",
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

  const fetchAll = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchToko(), fetchBarang(), fetchTransfer()])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchAll()
    })

    return () => unsub()
  }, [])

  const barangTokoAsal = useMemo(() => {
    return barangList
      .filter((item) => item.tokoId === form.tokoAsalId)
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [barangList, form.tokoAsalId])

  const barangModalFiltered = useMemo(() => {
    const q = barangModalSearch.toLowerCase().trim()

    return barangTokoAsal.filter((item) => {
      if (!q) return true

      return (
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q)
      )
    })
  }, [barangTokoAsal, barangModalSearch])

  const selectedBarangDetail = useMemo(() => {
    return selectedItems
      .map((item) => {
        const barang = barangList.find((x) => x.id === item.barangId)
        if (!barang) return null
        return { ...item, barang }
      })
      .filter(Boolean) as Array<SelectedTransferItem & { barang: Barang }>
  }, [selectedItems, barangList])

  const filteredTransfer = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMillis = filterStartDate
      ? new Date(`${filterStartDate}T00:00:00`).getTime()
      : 0
    const endMillis = filterEndDate
      ? new Date(`${filterEndDate}T23:59:59.999`).getTime()
      : 0

    return transferList.filter((item) => {
      const matchSearch =
        !q ||
        item.kodeTransfer.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.namaBarang.toLowerCase().includes(q) ||
        item.tokoAsalNama.toLowerCase().includes(q) ||
        item.tokoTujuanNama.toLowerCase().includes(q) ||
        item.supplier.toLowerCase().includes(q)

      const matchStatus = !filterStatus || item.status === filterStatus
      const matchAsal = !filterAsal || item.tokoAsalId === filterAsal
      const matchTujuan = !filterTujuan || item.tokoTujuanId === filterTujuan

      const createdMillis = toMillis(item.createdAt)
      const matchDate =
        (!startMillis || createdMillis >= startMillis) &&
        (!endMillis || createdMillis <= endMillis)

      return matchSearch && matchStatus && matchAsal && matchTujuan && matchDate
    })
  }, [
    transferList,
    search,
    filterStatus,
    filterAsal,
    filterTujuan,
    filterStartDate,
    filterEndDate,
  ])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredTransfer.length / itemsPerPage))

  const pagedTransfer =
    itemsPerPage === 0
      ? filteredTransfer
      : filteredTransfer.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (value: number) => setPage(Math.max(1, Math.min(totalPages, value)))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setSelectedItems([])
    setBarangModalSearch("")
    setBarangModalOpen(false)
    setError(null)
  }

  const resetDateFilter = () => {
    const range = getDefaultDateRange()
    setFilterStartDate(range.startDate)
    setFilterEndDate(range.endDate)
    setPage(1)
  }

  const isBarangSelected = (barangId: string) => {
    return selectedItems.some((item) => item.barangId === barangId)
  }

  const toggleBarangSelection = (barangId: string) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.barangId === barangId)

      if (exists) {
        return prev.filter((item) => item.barangId !== barangId)
      }

      return [...prev, { barangId, qty: "1" }]
    })
  }

  const setQtySelectedBarang = (barangId: string, qty: string) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.barangId === barangId ? { ...item, qty } : item))
    )
  }

  const removeSelectedBarang = (barangId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.barangId !== barangId))
  }

  const validateForm = () => {
    if (!form.tokoAsalId) return "Toko asal wajib dipilih"
    if (!form.tokoTujuanId) return "Toko tujuan wajib dipilih"
    if (form.tokoAsalId === form.tokoTujuanId) {
      return "Toko asal dan toko tujuan tidak boleh sama"
    }
    if (selectedItems.length === 0) return "Pilih minimal 1 barang"

    const seenBarang = new Set<string>()

    for (const item of selectedItems) {
      if (!item.barangId) return "Ada barang yang belum valid"
      if (seenBarang.has(item.barangId)) return "Ada barang ganda di daftar transfer"
      seenBarang.add(item.barangId)

      const qty = Number(item.qty)
      if (!item.qty.trim()) return "Qty barang wajib diisi"
      if (Number.isNaN(qty) || qty <= 0) return "Qty barang tidak valid"

      const barang = barangList.find((x) => x.id === item.barangId)
      if (!barang) return "Ada barang yang tidak ditemukan"
      if (barang.tokoId !== form.tokoAsalId) return "Ada barang yang tidak cocok dengan toko asal"
      if (qty > barang.stok) return `Stok ${barang.nama} tidak mencukupi`
    }

    return null
  }

  const handleCreateTransfer = async (e: FormEvent) => {
    e.preventDefault()

    const user = auth.currentUser
    if (!user) return

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const tokoAsal = tokoList.find((item) => item.id === form.tokoAsalId)
    const tokoTujuan = tokoList.find((item) => item.id === form.tokoTujuanId)

    if (!tokoAsal || !tokoTujuan) {
      setError("Data toko tidak ditemukan")
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const kodeBatch = buildKodeTransfer()

      await Promise.all(
        selectedItems.map(async (selected, index) => {
          const barang = barangList.find((item) => item.id === selected.barangId)
          if (!barang) throw new Error("Barang tidak ditemukan")

          const qty = Number(selected.qty)
          const existingTarget = barangList.find(
            (item) =>
              item.tokoId === tokoTujuan.id &&
              item.kodeBarang.trim().toLowerCase() ===
                barang.kodeBarang.trim().toLowerCase()
          )

          const newTransferRef = doc(collection(db, "transfer_barang"))
          const targetBarangRef = existingTarget
            ? doc(db, "barang", existingTarget.id)
            : doc(collection(db, "barang"))

          await setDoc(newTransferRef, {
            kodeTransfer: `${kodeBatch}-${String(index + 1).padStart(2, "0")}`,
            status: "DRAFT",
            barangId: barang.id,
            barangTujuanId: targetBarangRef.id,
            kodeBarang: barang.kodeBarang,
            namaBarang: barang.nama,
            kategoriId: barang.kategoriId,
            kategoriNama: barang.kategoriNama,
            merk: barang.merk,
            supplier: barang.supplier,
            satuan: barang.satuan,
            hargaModal: barang.hargaModal,
            hargaJual: barang.hargaJual,
            qty,
            stokMinimum: barang.stokMinimum,
            tokoAsalId: tokoAsal.id,
            tokoAsalNama: tokoAsal.nama,
            tokoTujuanId: tokoTujuan.id,
            tokoTujuanNama: tokoTujuan.nama,
            catatan: form.catatan.trim(),
            catatanPenerimaan: "",
            alasanBatal: "",
            stokAsalSebelum: barang.stok,
            stokAsalSesudah: 0,
            stokTujuanSebelum: existingTarget?.stok || 0,
            stokTujuanSesudah: 0,
            createdBy: user.uid,
            sentBy: "",
            receivedBy: "",
            cancelledBy: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            sentAt: null,
            receivedAt: null,
            cancelledAt: null,
          })
        })
      )

      await fetchAll()
      resetForm()
      setSuccessMsg("Draft transfer barang berhasil dibuat")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal membuat draft transfer")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleSendTransfer = async (item: TransferBarang) => {
    const user = auth.currentUser
    if (!user) return

    setActionLoading(item.id)
    setError(null)

    try {
      await runTransaction(db, async (transaction) => {
        const transferRef = doc(db, "transfer_barang", item.id)
        const sourceRef = doc(db, "barang", item.barangId)

        const [transferSnap, sourceSnap] = await Promise.all([
          transaction.get(transferRef),
          transaction.get(sourceRef),
        ])

        if (!transferSnap.exists()) throw new Error("Transfer tidak ditemukan")
        if (!sourceSnap.exists()) throw new Error("Barang asal tidak ditemukan")

        const latestTransfer = transferSnap.data() as any
        const latestSource = sourceSnap.data() as any
        const latestStatus = (latestTransfer?.status || "DRAFT") as TransferStatus
        const latestStock = Number(latestSource?.stok || 0)
        const qty = Number(latestTransfer?.qty || 0)

        if (latestStatus !== "DRAFT") {
          throw new Error("Transfer hanya bisa dikirim dari status draft")
        }
        if (qty <= 0) throw new Error("Qty transfer tidak valid")
        if (latestStock < qty) throw new Error("Stok toko asal tidak mencukupi")

        transaction.update(sourceRef, {
          stok: latestStock - qty,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        transaction.update(transferRef, {
          status: "DIKIRIM",
          stokAsalSebelum: latestStock,
          stokAsalSesudah: latestStock - qty,
          sentBy: user.uid,
          sentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })

      await fetchAll()
      setSuccessMsg("Transfer berhasil dikirim")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal mengirim transfer")
    } finally {
      setActionLoading(null)
    }
  }

  const handleReceiveTransfer = async () => {
    const user = auth.currentUser
    if (!user || !receiveTarget) return

    setActionLoading(receiveTarget.id)
    setError(null)

    try {
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

        if (latestStatus !== "DIKIRIM") throw new Error("Transfer belum bisa diterima")
        if (qty <= 0) throw new Error("Qty transfer tidak valid")

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
            receivedBy: user.uid,
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
            receivedBy: user.uid,
            receivedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
      })

      setReceiveTarget(null)
      setReceiveForm(EMPTY_RECEIVE_FORM)
      await fetchAll()
      setSuccessMsg("Transfer berhasil diterima")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal menerima transfer")
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelTransfer = async () => {
    const user = auth.currentUser
    if (!user || !cancelTarget) return

    setActionLoading(cancelTarget.id)
    setError(null)

    try {
      const reason = window.prompt(
        "Alasan pembatalan transfer:",
        cancelTarget.alasanBatal || ""
      )
      if (reason === null) {
        setActionLoading(null)
        return
      }

      await runTransaction(db, async (transaction) => {
        const transferRef = doc(db, "transfer_barang", cancelTarget.id)
        const transferSnap = await transaction.get(transferRef)
        if (!transferSnap.exists()) throw new Error("Transfer tidak ditemukan")

        const latestTransfer = transferSnap.data() as any
        const latestStatus = (latestTransfer?.status || "DRAFT") as TransferStatus
        const qty = Number(latestTransfer?.qty || 0)

        if (!["DRAFT", "DIKIRIM"].includes(latestStatus)) {
          throw new Error("Transfer ini sudah final dan tidak bisa dibatalkan")
        }

        if (latestStatus === "DIKIRIM") {
          const sourceRef = doc(db, "barang", latestTransfer?.barangId || "")
          const sourceSnap = await transaction.get(sourceRef)
          if (!sourceSnap.exists()) throw new Error("Barang asal tidak ditemukan")

          const sourceData = sourceSnap.data() as any
          const currentStock = Number(sourceData?.stok || 0)

          transaction.update(sourceRef, {
            stok: currentStock + qty,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          })
        }

        transaction.update(transferRef, {
          status: "DIBATALKAN",
          alasanBatal: reason.trim(),
          cancelledBy: user.uid,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })

      setCancelTarget(null)
      await fetchAll()
      setSuccessMsg("Transfer berhasil dibatalkan")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Gagal membatalkan transfer")
    } finally {
      setActionLoading(null)
    }
  }

  const detailData = selectedDetail
    ? transferList.find((item) => item.id === selectedDetail.id) || selectedDetail
    : null

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-cyan-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-200/50 sm:h-14 sm:w-14">
              <ArrowLeftRight size={24} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Transfer Barang
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Multi barang · popup cari barang · draft · kirim · terima · batal
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {filteredTransfer.length > 0 && (
              <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-cyan-500 px-2.5 shadow-sm shadow-cyan-200/50">
                <span className="text-xs font-black text-white">
                  {itemsPerPage === 0 ? filteredTransfer.length : pagedTransfer.length}
                </span>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchAll}
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

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        onSubmit={handleCreateTransfer}
        className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 sm:text-base">
              Buat Draft Transfer
            </h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Stok asal berkurang saat dikirim, stok tujuan bertambah saat diterima
            </p>
          </div>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
          >
            Reset Form
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormSelect
            label="Toko Asal"
            required
            value={form.tokoAsalId}
            onChange={(e: any) => {
              const value = e.target.value
              setForm((prev) => ({ ...prev, tokoAsalId: value }))
              setSelectedItems([])
              setBarangModalSearch("")
            }}
          >
            <option value="">Pilih toko asal</option>
            {tokoList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FormSelect>

          <FormSelect
            label="Toko Tujuan"
            required
            value={form.tokoTujuanId}
            onChange={(e: any) => setField("tokoTujuanId")(e.target.value)}
          >
            <option value="">Pilih toko tujuan</option>
            {tokoList
              .filter((item) => item.id !== form.tokoAsalId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nama}
                </option>
              ))}
          </FormSelect>

          <div className="md:col-span-2">
            <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
              Barang
              <span className="ml-0.5 text-red-400">*</span>
            </label>

            <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/70 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-800">
                    {selectedItems.length > 0
                      ? `${selectedItems.length} barang dipilih`
                      : "Belum ada barang dipilih"}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Pilih banyak barang dari toko asal, lalu isi qty masing-masing
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!form.tokoAsalId}
                  onClick={() => setBarangModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Boxes size={16} />
                  Pilih Barang
                </button>
              </div>

              {selectedBarangDetail.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {selectedBarangDetail.map(({ barang, qty }) => (
                    <div
                      key={barang.id}
                      className="rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {barang.kodeBarang} · {barang.nama}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            Stok {barang.stok} • {barang.kategoriNama || "Tanpa Kategori"} •{" "}
                            {barang.merk || "Tanpa Merk"}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="w-full sm:w-36">
                            <FormInput
                              label="Qty"
                              value={qty}
                              inputMode="numeric"
                              onChange={(e: any) =>
                                setQtySelectedBarang(
                                  barang.id,
                                  String(e.target.value).replace(/[^\d]/g, "")
                                )
                              }
                              placeholder="Qty"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => removeSelectedBarang(barang.id)}
                            className="inline-flex h-[42px] items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-[11px] font-black text-red-600 transition-all hover:bg-red-50"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2">
            <FormTextArea
              label="Catatan"
              value={form.catatan}
              onChange={(e: any) => setField("catatan")(e.target.value)}
              placeholder="Contoh: transfer stok untuk kebutuhan cabang"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLoading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Package size={16} />
            )}
            Simpan Draft Transfer
          </button>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-bold text-cyan-700 ring-1 ring-cyan-200">
              Barang: {selectedItems.length}
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              Total Qty:{" "}
              {selectedItems.reduce((acc, item) => acc + Number(item.qty || 0), 0)}
            </span>
          </div>
        </div>
      </motion.form>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4">
          <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Riwayat</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Cari transfer berdasarkan status, toko, dan rentang waktu
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <FormInput
            label="Cari"
            value={search}
            onChange={(e: any) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Kode, barang, toko, supplier..."
          />

          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={(v) => {
              setFilterStatus(v)
              setPage(1)
            }}
          >
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="DIKIRIM">Terkirim</option>
            <option value="DITERIMA">Diterima</option>
            <option value="DIBATALKAN">Dibatalkan</option>
          </FilterSelect>

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
              setFilterStatus("")
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
            <h2 className="text-sm font-black text-slate-800 sm:text-base">Riwayat Transfer</h2>
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
            Belum ada data transfer
          </div>
        ) : (
          <div className="space-y-3">
            {pagedTransfer.map((item) => {
              const meta = getStatusMeta(item.status)
              const StatusIcon = meta.icon

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
                        Dibuat {formatDateTime(item.createdAt)}
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

                      {item.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={() => handleSendTransfer(item)}
                          disabled={actionLoading === item.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black text-white transition-all hover:bg-amber-600 disabled:opacity-60"
                        >
                          {actionLoading === item.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <Truck size={14} />
                          )}
                          Kirim
                        </button>
                      )}

                      {item.status === "DIKIRIM" && (
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
                          Sudah Diterima
                        </button>
                      )}

                      {(item.status === "DRAFT" || item.status === "DIKIRIM") && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(item)}
                          disabled={actionLoading === item.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-black text-red-600 transition-all hover:bg-red-50 disabled:opacity-60"
                        >
                          <Undo2 size={14} />
                          Batalkan
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {itemsPerPage !== 0 && totalPages > 1 ? (
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
        ) : null}
      </motion.div>

      <Modal
        open={barangModalOpen}
        onClose={() => setBarangModalOpen(false)}
        title="Pilih Barang Transfer"
        subtitle="Bisa pilih banyak barang sekaligus dan cari nama barang"
      >
        {!form.tokoAsalId ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Pilih toko asal dulu
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <FormInput
                  label="Cari Barang"
                  value={barangModalSearch}
                  onChange={(e: any) => setBarangModalSearch(e.target.value)}
                  placeholder="Nama barang, kode barang, kategori, merk..."
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Ringkasan
                </p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {selectedItems.length} barang dipilih
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  Total qty{" "}
                  {selectedItems.reduce((acc, item) => acc + Number(item.qty || 0), 0)}
                </p>
              </div>
            </div>

            {barangModalFiltered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Barang tidak ditemukan
              </div>
            ) : (
              <div className="space-y-3">
                {barangModalFiltered.map((item) => {
                  const selected = selectedItems.find((x) => x.barangId === item.id)
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        selected
                          ? "border-cyan-300 bg-cyan-50/60"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <label className="mt-0.5 flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={Boolean(selected)}
                              onChange={() => toggleBarangSelection(item.id)}
                              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                            />
                          </label>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-800">
                              {item.kodeBarang} · {item.nama}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">
                              Stok {item.stok} • {item.kategoriNama || "Tanpa Kategori"} •{" "}
                              {item.merk || "Tanpa Merk"}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-400">
                              Supplier {item.supplier || "-"}
                            </p>
                          </div>
                        </div>

                        <div className="flex w-full items-end gap-2 lg:w-auto">
                          <div className="w-full lg:w-36">
                            <FormInput
                              label="Qty"
                              value={selected?.qty || ""}
                              disabled={!selected}
                              inputMode="numeric"
                              onChange={(e: any) =>
                                setQtySelectedBarang(
                                  item.id,
                                  String(e.target.value).replace(/[^\d]/g, "")
                                )
                              }
                              placeholder="Qty"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItems(
                      barangModalFiltered.map((item) => ({
                        barangId: item.id,
                        qty:
                          selectedItems.find((x) => x.barangId === item.id)?.qty || "1",
                      }))
                    )
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
                >
                  Pilih Semua Hasil
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedItems([])}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
                >
                  Kosongkan Pilihan
                </button>
              </div>

              <button
                type="button"
                onClick={() => setBarangModalOpen(false)}
                className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-cyan-600"
              >
                Selesai Pilih Barang
              </button>
            </div>
          </div>
        )}
      </Modal>

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
                Catatan
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
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Alasan Batal
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {detailData.alasanBatal || "-"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:col-span-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Dibuat
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatDateTime(detailData.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Dikirim
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatDateTime(detailData.sentAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Diterima
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatDateTime(detailData.receivedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Dibatalkan
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatDateTime(detailData.cancelledAt)}
                  </p>
                </div>
              </div>
            </div>
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
            </div>

            <FormTextArea
              label="Catatan Penerimaan"
              value={receiveForm.catatanPenerimaan}
              onChange={(e: any) => setReceiveField("catatanPenerimaan")(e.target.value)}
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

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Batalkan Transfer"
        subtitle={cancelTarget?.kodeTransfer || ""}
      >
        {cancelTarget ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-black text-red-700">
                Transfer ini akan dibatalkan.
              </p>
              <p className="mt-1 text-[12px] font-semibold text-red-600">
                Kalau status sudah terkirim, stok asal akan dikembalikan lagi.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleCancelTransfer}
                disabled={actionLoading === cancelTarget.id}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-red-600 disabled:opacity-60"
              >
                {actionLoading === cancelTarget.id ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Undo2 size={16} />
                )}
                Ya, Batalkan
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}