/*
  Halaman admin master saldo digital.
  Bisa membuat lebih dari 1 sumber saldo untuk transaksi barang digital.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Cpu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type MasterSaldoDigital = {
  id: string
  namaSaldo: string
  jumlahSaldo: number
  aktif: boolean
  keterangan: string
  createdAt?: number
  updatedAt?: number
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const EMPTY_FORM = {
  namaSaldo: "",
  jumlahSaldo: "",
  aktif: true,
  keterangan: "",
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDateTime(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function FormInput({
  label,
  required,
  icon: Icon,
  rightSlot,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  rightSlot?: React.ReactNode
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
        <input
          {...props}
          className={`w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 ${
            rightSlot ? "pr-24" : ""
          }`}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  )
}

function FormTextarea({
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
        className="min-h-[110px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
  children: React.ReactNode
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
  icon: Icon,
}: {
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>

      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        )}

        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20`}
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

export default function TambahSaldoPage() {
  const router = useRouter()

  const [data, setData] = useState<MasterSaldoDigital[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId

  const fetchData = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "master_saldo_digital"), orderBy("namaSaldo"))
      const snap = await getDocs(qRef)

      const list: MasterSaldoDigital[] = snap.docs.map((d) => {
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

      setData(list)
    } catch (e) {
      console.error(e)
      setError("Gagal memuat master saldo")
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) return
      await fetchData()
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const q = search.toLowerCase().trim()

      const matchSearch =
        !q ||
        item.namaSaldo.toLowerCase().includes(q) ||
        item.keterangan.toLowerCase().includes(q)

      const matchStatus =
        !filterStatus ||
        (filterStatus === "aktif" && item.aktif) ||
        (filterStatus === "nonaktif" && !item.aktif)

      return matchSearch && matchStatus
    })
  }, [data, search, filterStatus])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const totalSaldoAktif = useMemo(
    () =>
      data
        .filter((item) => item.aktif)
        .reduce((sum, item) => sum + Number(item.jumlahSaldo || 0), 0),
    [data]
  )

  const totalSumberSaldo = data.length
  const totalSaldoAktifCount = data.filter((item) => item.aktif).length

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (item: MasterSaldoDigital) => {
    setEditId(item.id)
    setForm({
      namaSaldo: item.namaSaldo || "",
      jumlahSaldo: String(item.jumlahSaldo || ""),
      aktif: item.aktif !== false,
      keterangan: item.keterangan || "",
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const validateForm = () => {
    if (!form.namaSaldo.trim()) return "Nama saldo wajib diisi"
    if (!form.jumlahSaldo.trim()) return "Jumlah saldo wajib diisi"

    const jumlahSaldo = Number(form.jumlahSaldo)
    if (Number.isNaN(jumlahSaldo) || jumlahSaldo < 0) {
      return "Jumlah saldo tidak valid"
    }

    const duplicateNama = data.find((item) => {
      const sameName = item.namaSaldo.trim().toLowerCase() === form.namaSaldo.trim().toLowerCase()
      const notSelf = !editId || item.id !== editId
      return sameName && notSelf
    })

    if (duplicateNama) return "Nama saldo sudah dipakai"

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const payload = {
        namaSaldo: form.namaSaldo.trim(),
        jumlahSaldo: Number(form.jumlahSaldo),
        aktif: Boolean(form.aktif),
        keterangan: form.keterangan.trim(),
      }

      if (isEdit && editId) {
        await updateDoc(doc(db, "master_saldo_digital", editId), {
          ...payload,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    ...payload,
                    updatedAt: Date.now(),
                  }
                : item
            )
            .sort((a, b) => a.namaSaldo.localeCompare(b.namaSaldo))
        )

        setSuccessMsg("Master saldo berhasil diperbarui")
      } else {
        const newRef = await addDoc(collection(db, "master_saldo_digital"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        const newItem: MasterSaldoDigital = {
          id: newRef.id,
          ...payload,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        setData((prev) => [...prev, newItem].sort((a, b) => a.namaSaldo.localeCompare(b.namaSaldo)))
        setSuccessMsg("Master saldo berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan master saldo")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "master_saldo_digital", deleteId))
      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setShowDeleteConfirm(false)
      setSuccessMsg("Master saldo berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menghapus master saldo")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <Wallet size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Master Saldo
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Multi sumber saldo digital · aktif · nonaktif
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  onClick={() => router.push("/admin/tambah-provider")}
  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
  title="Provider"
>
  <Store size={13} strokeWidth={3} />
  <span className="hidden sm:inline sm:ml-1.5 text-[10px] font-black uppercase tracking-wide">
    Provider
  </span>
</motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openAdd}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md sm:w-auto sm:px-3"
              title="Tambah Saldo"
            >
              <Plus size={13} strokeWidth={3} />
              <span className="hidden sm:inline sm:ml-1.5 text-[10px] font-black uppercase tracking-wide">
                Tambah Saldo
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50"
              title="Refresh"
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

      <AnimatePresence>
        {error && !showModal && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5"
          >
            <AlertCircle size={14} className="flex-shrink-0 text-red-500" strokeWidth={2.5} />
            <p className="text-[11px] font-bold text-red-600">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100">
              <Coins size={20} className="text-emerald-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Total Saldo Aktif
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">
                {formatRupiah(totalSaldoAktif)}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-cyan-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100">
              <Wallet size={20} className="text-cyan-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Jumlah Sumber Saldo
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">{totalSumberSaldo}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100">
              <ShieldCheck size={20} className="text-violet-600" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Saldo Aktif
              </p>
              <p className="mt-1 text-xl font-black text-slate-800">{totalSaldoAktifCount}</p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari Saldo
            </label>
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
                placeholder="Nama saldo atau keterangan..."
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
            icon={ShieldCheck}
          >
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </FilterSelect>

          <FilterSelect
            label="Tampilkan"
            value={itemsPerPage}
            onChange={(v) => {
              setItemsPerPage(Number(v))
              setPage(1)
            }}
            icon={Wallet}
          >
            {ITEMS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} data
              </option>
            ))}
          </FilterSelect>
        </div>
      </motion.div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-emerald-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Wallet size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Belum ada master saldo
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
          >
            <Plus size={13} strokeWidth={3} />
            Tambah Saldo Pertama
          </motion.button>
        </motion.div>
      )}

      {!loading && paged.length > 0 && (
        <>
          <div className="space-y-2 sm:hidden">
            {paged.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{item.namaSaldo}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {formatRupiah(item.jumlahSaldo)}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 gap-1.5">
                    <button
                      onClick={() => openEdit(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
                    >
                      <Pencil size={12} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteId(item.id)
                        setShowDeleteConfirm(true)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black ${
                      item.aktif ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {item.aktif ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {item.keterangan || "-"}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Nama Saldo
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Jumlah
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Keterangan
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Update
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-slate-800">{item.namaSaldo}</p>
                       
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-slate-800">
                          {formatRupiah(item.jumlahSaldo)}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                            item.aktif ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.aktif ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-700">
                          {item.keterangan || "-"}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-700">
                          {formatDateTime(item.updatedAt || item.createdAt)}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEdit(item)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
                          >
                            <Pencil size={13} strokeWidth={2.5} />
                          </button>

                          <button
                            onClick={() => {
                              setDeleteId(item.id)
                              setShowDeleteConfirm(true)
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                          >
                            <Trash2 size={13} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-xs font-bold text-slate-500">
              Halaman {page} dari {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal()
            }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    {isEdit ? (
                      <Pencil size={18} className="text-white" strokeWidth={2.5} />
                    ) : (
                      <Plus size={18} className="text-white" strokeWidth={3} />
                    )}
                  </div>

                  <div>
                    <h2 className="text-base font-black leading-none text-white">
                      {isEdit ? "Edit Master Saldo" : "Tambah Master Saldo"}
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      Bisa membuat lebih dari satu sumber saldo
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="space-y-5 p-6">
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
                      >
                        <AlertCircle size={14} className="flex-shrink-0 text-red-500" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-red-600">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormInput
                      label="Nama Saldo"
                      required
                      icon={Wallet}
                      value={form.namaSaldo}
                      onChange={(e: any) =>
                        setForm((prev) => ({ ...prev, namaSaldo: e.target.value }))
                      }
                      placeholder="Contoh: Saldo Aplikasi 1"
                    />

                    <FormSelect
                      label="Status"
                      required
                      icon={ShieldCheck}
                      value={String(form.aktif)}
                      onChange={(e: any) =>
                        setForm((prev) => ({ ...prev, aktif: e.target.value === "true" }))
                      }
                    >
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </FormSelect>

                    <FormInput
                      label="Jumlah Saldo"
                      required
                      icon={Coins}
                      inputMode="numeric"
                      value={form.jumlahSaldo}
                      onChange={(e: any) =>
                        setForm((prev) => ({
                          ...prev,
                          jumlahSaldo: e.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      placeholder="Contoh: 10000000"
                      rightSlot={
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                          {formatRupiah(Number(form.jumlahSaldo || 0))}
                        </span>
                      }
                    />

                    <div className="rounded-xl border-2 border-cyan-100 bg-cyan-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">
                        Info Saldo
                      </p>
                      <p className="mt-1 text-xs font-semibold text-cyan-700">
                        Sumber saldo ini nanti bisa dipakai untuk transaksi barang digital.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <FormTextarea
                        label="Keterangan"
                        icon={AlertCircle}
                        value={form.keterangan}
                        onChange={(e: any) =>
                          setForm((prev) => ({ ...prev, keterangan: e.target.value }))
                        }
                        placeholder="Opsional. Contoh: Saldo dari HP utama atau aplikasi cadangan."
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                  >
                    {submitLoading
                      ? "Menyimpan..."
                      : isEdit
                      ? "Simpan Perubahan"
                      : "Tambah Saldo"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowDeleteConfirm(false)
            }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-red-100">
                  <Trash2 size={20} className="text-red-600" strokeWidth={2.5} />
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-800">Hapus Master Saldo?</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Sumber saldo ini akan dihapus dari sistem.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleteId(null)
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteLoading ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}