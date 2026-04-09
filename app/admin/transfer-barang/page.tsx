// Halaman admin transfer barang antar toko dengan draft, kirim, terima, batal, dan filter waktu riwayat.
"use client"

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
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
  barangId: string
  tokoTujuanId: string
  qty: string
  catatan: string
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
  barangId: "",
  tokoTujuanId: "",
  qty: "",
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
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
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
      const snap = await getDocs(query(collection(db, "transfer_barang"), orderBy("createdAt", "desc")))
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
    return barangList.filter((item) => item.tokoId === form.tokoAsalId)
  }, [barangList, form.tokoAsalId])

  const barangDipilih = useMemo(() => {
    return barangList.find((item) => item.id === form.barangId) || null
  }, [barangList, form.barangId])

  const filteredTransfer = useMemo(() => {
    const q = search.toLowerCase().trim()
    const startMillis = filterStartDate ? new Date(`${filterStartDate}T00:00:00`).getTime() : 0
    const endMillis = filterEndDate ? new Date(`${filterEndDate}T23:59:59.999`).getTime() : 0

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
  }, [transferList, search, filterStatus, filterAsal, filterTujuan, filterStartDate, filterEndDate])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filteredTransfer.length / itemsPerPage))

  const pagedTransfer =
    itemsPerPage === 0
      ? filteredTransfer
      : filteredTransfer.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (value: number) => setPage(Math.max(1, Math.min(totalPages, value)))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setError(null)
  }

  const resetDateFilter = () => {
    const range = getDefaultDateRange()
    setFilterStartDate(range.startDate)
    setFilterEndDate(range.endDate)
    setPage(1)
  }

  const validateForm = () => {
    if (!form.tokoAsalId) return "Toko asal wajib dipilih"
    if (!form.barangId) return "Barang wajib dipilih"
    if (!form.tokoTujuanId) return "Toko tujuan wajib dipilih"
    if (form.tokoAsalId === form.tokoTujuanId) return "Toko asal dan toko tujuan tidak boleh sama"
    if (!form.qty.trim()) return "Qty wajib diisi"

    const qty = Number(form.qty)
    if (Number.isNaN(qty) || qty <= 0) return "Qty tidak valid"

    const barang = barangList.find((item) => item.id === form.barangId)
    if (!barang) return "Barang asal tidak ditemukan"
    if (barang.tokoId !== form.tokoAsalId) return "Barang tidak cocok dengan toko asal"
    if (qty > barang.stok) return "Stok toko asal tidak mencukupi"

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

    const barang = barangList.find((item) => item.id === form.barangId)
    const tokoAsal = tokoList.find((item) => item.id === form.tokoAsalId)
    const tokoTujuan = tokoList.find((item) => item.id === form.tokoTujuanId)

    if (!barang || !tokoAsal || !tokoTujuan) {
      setError("Data barang atau toko tidak ditemukan")
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const qty = Number(form.qty)
      const existingTarget = barangList.find(
        (item) =>
          item.tokoId === tokoTujuan.id &&
          item.kodeBarang.trim().toLowerCase() === barang.kodeBarang.trim().toLowerCase()
      )

      const newTransferRef = doc(collection(db, "transfer_barang"))
      const targetBarangRef = existingTarget
        ? doc(db, "barang", existingTarget.id)
        : doc(collection(db, "barang"))

      await setDoc(newTransferRef, {
        kodeTransfer: buildKodeTransfer(),
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

      await fetchAll()
      resetForm()
      setSuccessMsg("Transfer draft berhasil dibuat")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal membuat draft transfer")
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

        if (latestStatus !== "DRAFT") throw new Error("Transfer hanya bisa dikirim dari status draft")
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
      const reason = window.prompt("Alasan pembatalan transfer:", cancelTarget.alasanBatal || "")
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
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">Transfer Barang</h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Draft · terkirim · diterima · batal · filter waktu
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
            <h2 className="text-sm font-black text-slate-800 sm:text-base">Buat Draft Transfer</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Stok asal berkurang saat dikirim, stok tujuan bertambah saat diterima
            </p>
          </div>
          <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 sm:flex">
            <Truck size={18} strokeWidth={2.5} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <FormSelect
            label="Toko Asal"
            required
            value={form.tokoAsalId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              setForm((prev) => ({
                ...prev,
                tokoAsalId: e.target.value,
                barangId: "",
                tokoTujuanId: prev.tokoTujuanId === e.target.value ? "" : prev.tokoTujuanId,
              }))
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
            label="Barang"
            required
            value={form.barangId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setField("barangId")(e.target.value)}
            disabled={!form.tokoAsalId}
          >
            <option value="">Pilih barang asal</option>
            {barangTokoAsal.map((item) => (
              <option key={item.id} value={item.id}>
                {item.kodeBarang || "-"} · {item.nama} · stok {item.stok}
              </option>
            ))}
          </FormSelect>

          <FormSelect
            label="Toko Tujuan"
            required
            value={form.tokoTujuanId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setField("tokoTujuanId")(e.target.value)}
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

          <FormInput
            label="Qty Transfer"
            required
            type="number"
            min={1}
            value={form.qty}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("qty")(e.target.value)}
            placeholder="Masukkan qty"
          />

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 lg:col-span-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ringkasan Barang</p>
            {barangDipilih ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Nama</p>
                  <p className="text-sm font-bold text-slate-700">{barangDipilih.nama}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kode</p>
                  <p className="text-sm font-bold text-slate-700">{barangDipilih.kodeBarang || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Stok Asal</p>
                  <p className="text-sm font-bold text-slate-700">{barangDipilih.stok}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Satuan</p>
                  <p className="text-sm font-bold text-slate-700">{barangDipilih.satuan}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-slate-400">Pilih barang untuk melihat ringkasan</p>
            )}
          </div>

          <div className="lg:col-span-3">
            <FormTextArea
              label="Catatan"
              value={form.catatan}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setField("catatan")(e.target.value)}
              placeholder="Catatan tambahan transfer..."
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={resetForm}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Reset
          </motion.button>
          <motion.button
            type="submit"
            whileHover={{ scale: submitLoading ? 1 : 1.03 }}
            whileTap={{ scale: submitLoading ? 1 : 0.97 }}
            disabled={submitLoading}
            className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-200/50 disabled:opacity-60"
          >
            {submitLoading ? "Menyimpan..." : "Simpan Draft"}
          </motion.button>
        </div>
      </motion.form>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 sm:text-base">Riwayat Transfer</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Filter status, toko, pencarian, dan rentang tanggal
            </p>
          </div>
          <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 sm:flex">
            <CalendarRange size={18} strokeWidth={2.5} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">Cari Transfer</label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Kode, barang, toko, supplier..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={(v) => {
              setFilterStatus(v)
              setPage(1)
            }}
          >
            <option value="">Semua Status</option>
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
            <option value="">Semua Toko Asal</option>
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
            <option value="">Semua Toko Tujuan</option>
            {tokoList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <FormInput
            label="Tanggal Awal"
            type="date"
            value={filterStartDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFilterStartDate(e.target.value)
              setPage(1)
            }}
          />

          <FormInput
            label="Tanggal Akhir"
            type="date"
            value={filterEndDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFilterEndDate(e.target.value)
              setPage(1)
            }}
          />

          <FilterSelect
            label="Tampilkan"
            value={itemsPerPage}
            onChange={(v) => {
              setItemsPerPage(Number(v))
              setPage(1)
            }}
          >
            {ITEMS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} data
              </option>
            ))}
          </FilterSelect>

          <div className="flex items-end">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={resetDateFilter}
              className="flex h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-slate-600 shadow-sm hover:bg-slate-50"
            >
              Reset Filter Tanggal
            </motion.button>
          </div>
        </div>
      </motion.div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-cyan-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat data...</p>
          </div>
        </div>
      )}

      {!loading && filteredTransfer.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Boxes size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Belum ada riwayat transfer</p>
        </motion.div>
      )}

      {!loading && pagedTransfer.length > 0 && (
        <div className="space-y-2 sm:hidden">
          {pagedTransfer.map((item, idx) => {
            const meta = getStatusMeta(item.status)
            const StatusIcon = meta.icon
            const canSend = item.status === "DRAFT"
            const canReceive = item.status === "DIKIRIM"
            const canCancel = item.status === "DRAFT" || item.status === "DIKIRIM"

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{item.namaBarang}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {item.kodeTransfer} · {item.kodeBarang || "-"}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ${meta.className}`}>
                    <StatusIcon size={11} strokeWidth={2.5} />
                    {meta.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{item.tokoAsalNama}</span>
                  <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{item.tokoTujuanNama}</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">Qty: {item.qty}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Dibuat</p>
                    <p className="text-xs font-bold text-slate-700">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Harga Jual</p>
                    <p className="text-xs font-bold text-slate-700">{formatCurrency(item.hargaJual)}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSelectedDetail(item)}
                    className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm"
                  >
                    <Eye size={12} strokeWidth={2.5} /> Detail
                  </button>
                  <button
                    onClick={() => handleSendTransfer(item)}
                    disabled={!canSend || actionLoading === item.id}
                    className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Truck size={12} strokeWidth={2.5} /> Kirim
                  </button>
                  <button
                    onClick={() => {
                      setReceiveTarget(item)
                      setReceiveForm(EMPTY_RECEIVE_FORM)
                    }}
                    disabled={!canReceive || actionLoading === item.id}
                    className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={12} strokeWidth={2.5} /> Sudah Diterima
                  </button>
                  <button
                    onClick={() => setCancelTarget(item)}
                    disabled={!canCancel || actionLoading === item.id}
                    className="flex items-center justify-center gap-1 rounded-xl bg-red-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Undo2 size={12} strokeWidth={2.5} /> Batalkan
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {!loading && pagedTransfer.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white/60 shadow-sm backdrop-blur-xl sm:block"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-white/80">
                <tr>
                  {["No", "Kode", "Barang", "Asal", "Tujuan", "Qty", "Dibuat", "Status", "Aksi"].map((h) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                        h === "No" || h === "Aksi" ? "text-center" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedTransfer.map((item, i) => {
                  const meta = getStatusMeta(item.status)
                  const StatusIcon = meta.icon
                  const canSend = item.status === "DRAFT"
                  const canReceive = item.status === "DIKIRIM"
                  const canCancel = item.status === "DRAFT" || item.status === "DIKIRIM"

                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.015 }}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-3 text-center font-bold text-slate-400">
                        {itemsPerPage === 0 ? i + 1 : (page - 1) * itemsPerPage + i + 1}
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-700">{item.kodeTransfer}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{item.namaBarang}</span>
                          <span className="text-[10px] font-semibold text-slate-400">{item.kodeBarang || "-"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{item.tokoAsalNama}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{item.tokoTujuanNama}</td>
                      <td className="px-3 py-3 font-bold text-slate-700">{item.qty}</td>
                      <td className="px-3 py-3 font-semibold text-slate-600">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ${meta.className}`}>
                          <StatusIcon size={11} strokeWidth={2.5} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedDetail(item)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                            title="Detail"
                          >
                            <Eye size={13} strokeWidth={2.4} />
                          </button>
                          <button
                            onClick={() => handleSendTransfer(item)}
                            disabled={!canSend || actionLoading === item.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Kirim"
                          >
                            <Truck size={13} strokeWidth={2.4} />
                          </button>
                          <button
                            onClick={() => {
                              setReceiveTarget(item)
                              setReceiveForm(EMPTY_RECEIVE_FORM)
                            }}
                            disabled={!canReceive || actionLoading === item.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Sudah Diterima"
                          >
                            <Check size={13} strokeWidth={2.4} />
                          </button>
                          <button
                            onClick={() => setCancelTarget(item)}
                            disabled={!canCancel || actionLoading === item.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Batalkan"
                          >
                            <Undo2 size={13} strokeWidth={2.4} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!loading && filteredTransfer.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {detailData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-800">Detail Transfer</h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{detailData.kodeTransfer}</p>
                </div>
                <button onClick={() => setSelectedDetail(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} strokeWidth={2.8} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Status", getStatusMeta(detailData.status).label],
                  ["Barang", detailData.namaBarang],
                  ["Kode Barang", detailData.kodeBarang || "-"],
                  ["Kategori", detailData.kategoriNama || "-"],
                  ["Merk", detailData.merk || "-"],
                  ["Supplier", detailData.supplier || "-"],
                  ["Satuan", detailData.satuan || "-"],
                  ["Qty", String(detailData.qty)],
                  ["Toko Asal", detailData.tokoAsalNama || "-"],
                  ["Toko Tujuan", detailData.tokoTujuanNama || "-"],
                  ["Harga Modal", formatCurrency(detailData.hargaModal)],
                  ["Harga Jual", formatCurrency(detailData.hargaJual)],
                  ["Stok Asal Sebelum", String(detailData.stokAsalSebelum)],
                  ["Stok Asal Sesudah", String(detailData.stokAsalSesudah)],
                  ["Stok Tujuan Sebelum", String(detailData.stokTujuanSebelum)],
                  ["Stok Tujuan Sesudah", String(detailData.stokTujuanSesudah)],
                  ["Dibuat", formatDateTime(detailData.createdAt)],
                  ["Terkirim", formatDateTime(detailData.sentAt)],
                  ["Diterima", formatDateTime(detailData.receivedAt)],
                  ["Dibatalkan", formatDateTime(detailData.cancelledAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Catatan Transfer</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{detailData.catatan || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Catatan Penerimaan</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{detailData.catatanPenerimaan || "-"}</p>
                </div>
              </div>

              {detailData.alasanBatal && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400">Alasan Batal</p>
                  <p className="mt-1 text-sm font-bold text-red-700">{detailData.alasanBatal}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receiveTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-800">Sudah Diterima</h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{receiveTarget.kodeTransfer}</p>
                </div>
                <button
                  onClick={() => {
                    setReceiveTarget(null)
                    setReceiveForm(EMPTY_RECEIVE_FORM)
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} strokeWidth={2.8} />
                </button>
              </div>

              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-sm font-bold text-emerald-700">
                  Konfirmasi penerimaan untuk {receiveTarget.namaBarang} sebanyak {receiveTarget.qty} {receiveTarget.satuan}
                </p>
              </div>

              <FormTextArea
                label="Catatan Penerimaan"
                value={receiveForm.catatanPenerimaan}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReceiveField("catatanPenerimaan")(e.target.value)}
                placeholder="Catatan setelah barang diterima..."
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setReceiveTarget(null)
                    setReceiveForm(EMPTY_RECEIVE_FORM)
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  Tutup
                </button>
                <button
                  onClick={handleReceiveTransfer}
                  disabled={actionLoading === receiveTarget.id}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-60"
                >
                  {actionLoading === receiveTarget.id ? "Memproses..." : "Sudah Diterima"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-800">Batalkan Transfer</h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{cancelTarget.kodeTransfer}</p>
                </div>
                <button onClick={() => setCancelTarget(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} strokeWidth={2.8} />
                </button>
              </div>

              <p className="text-sm font-semibold text-slate-600">
                Transfer dengan status <span className="font-black text-slate-800">{getStatusMeta(cancelTarget.status).label}</span> akan dibatalkan.
                {cancelTarget.status === "DIKIRIM" && " Stok toko asal akan dikembalikan otomatis."}
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setCancelTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  Tutup
                </button>
                <button
                  onClick={handleCancelTransfer}
                  disabled={actionLoading === cancelTarget.id}
                  className="rounded-xl bg-red-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-60"
                >
                  {actionLoading === cancelTarget.id ? "Memproses..." : "Ya, Batalkan"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
