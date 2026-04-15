/* 
  Halaman admin supplier untuk CRUD data supplier langsung ke Firestore dari client.
  Layout dibuat konsisten seperti page satuan barang, dengan update local state tanpa reload semua data agar hemat read Firestore.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  Building2,
  Cpu,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  Package,
  Boxes,
  Phone,
  MapPin,
  NotebookText,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Supplier = {
  id: string
  nama: string
  telepon: string
  alamat: string
  keterangan?: string
  createdAt: number
  updatedAt?: number
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const EMPTY_FORM = {
  nama: "",
  telepon: "",
  alamat: "",
  keterangan: "",
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
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
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
        className="min-h-[96px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
  children: React.ReactNode
  label: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      >
        {children}
      </select>
    </div>
  )
}

export default function SupplierPage() {
  const router = useRouter()

  const [data, setData] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId

  const fetchData = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "supplier"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Supplier[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          telepon: x?.telepon || "",
          alamat: x?.alamat || "",
          keterangan: x?.keterangan || "",
          createdAt: Number(x?.createdAt || Date.now()),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
        }
      })

      setData(list)
    } catch (e) {
      console.error(e)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        await fetchData()
      }
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((d) => {
      if (!q) return true
      return (
        d.nama.toLowerCase().includes(q) ||
        d.telepon.toLowerCase().includes(q) ||
        d.alamat.toLowerCase().includes(q) ||
        (d.keterangan || "").toLowerCase().includes(q)
      )
    })
  }, [data, search])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (d: Supplier) => {
    setForm({
      nama: d.nama,
      telepon: d.telepon,
      alamat: d.alamat,
      keterangan: d.keterangan || "",
    })
    setEditId(d.id)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    const nama = form.nama.trim()
    const telepon = form.telepon.trim()
    const alamat = form.alamat.trim()

    if (!nama) return "Nama supplier wajib diisi"
    if (!telepon) return "Nomor telepon wajib diisi"
    if (!alamat) return "Alamat wajib diisi"

    const duplicateNama = data.find((item) => {
      const sameName = item.nama.trim().toLowerCase() === nama.toLowerCase()
      const notSelf = !editId || item.id !== editId
      return sameName && notSelf
    })

    if (duplicateNama) return "Nama supplier sudah ada"

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
      const nama = form.nama.trim()
      const telepon = form.telepon.trim()
      const alamat = form.alamat.trim()
      const keterangan = form.keterangan.trim()

      if (isEdit && editId) {
        const updatedAt = Date.now()

        await updateDoc(doc(db, "supplier", editId), {
          nama,
          telepon,
          alamat,
          keterangan,
          updatedAt,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    nama,
                    telepon,
                    alamat,
                    keterangan,
                    updatedAt,
                  }
                : item
            )
            .sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Supplier berhasil diperbarui")
      } else {
        const newRef = doc(collection(db, "supplier"))
        const now = Date.now()

        const newItem: Supplier = {
          id: newRef.id,
          nama,
          telepon,
          alamat,
          keterangan,
          createdAt: now,
        }

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        })

        setData((prev) =>
          [...prev, newItem].sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Supplier berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan supplier")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "supplier", deleteId))
      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Supplier berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
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
      <Building2 size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
    </div>

    <div className="min-w-0 self-center sm:self-auto">
      <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
        Supplier
      </h1>
      <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
        Data supplier · master data
      </p>
    </div>
  </div>

  <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:flex-wrap sm:justify-end">
    <div className="flex items-center gap-2">
      {filtered.length > 0 && (
        <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-emerald-500 px-2.5 shadow-sm shadow-emerald-200/50">
          <span className="text-xs font-black text-white">
            {itemsPerPage === 0 ? filtered.length : paged.length}
          </span>
        </div>
      )}
    </div>

    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={fetchData}
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
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari Supplier
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
                placeholder="Nama, telepon, alamat..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-16"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Boxes size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Belum ada supplier
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
          >
            <Plus size={13} strokeWidth={3} />
            Tambah Supplier Pertama
          </motion.button>
        </motion.div>
      )}

      {!loading && paged.length > 0 && (
        <div className="space-y-2 sm:hidden">
          {paged.map((d, idx) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800">{d.nama}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{d.telepon}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{d.alamat}</p>
                </div>

                <div className="flex flex-shrink-0 gap-1.5">
                  <button
                    onClick={() => openEdit(d)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
                  >
                    <Pencil size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => setDeleteId(d.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && paged.length > 0 && (
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
                  {["No", "Nama Supplier", "Telepon", "Alamat", "Aksi"].map((h) => (
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
                {paged.map((d, i) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                      {itemsPerPage === 0 ? i + 1 : (page - 1) * itemsPerPage + i + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">
                      {d.nama}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                      {d.telepon}
                    </td>
                    <td className="max-w-[320px] px-3 py-2.5 font-semibold text-slate-600">
                      <p className="line-clamp-2">{d.alamat}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex justify-center gap-1.5">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => openEdit(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
                        >
                          <Pencil size={12} strokeWidth={2.5} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setDeleteId(d.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                        >
                          <Trash2 size={12} strokeWidth={2.5} />
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!loading && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {itemsPerPage === 0 ? `${filtered.length} data` : `Hal ${page}/${totalPages} · ${filtered.length} data`}
          </p>

          {itemsPerPage !== 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goPage(page - 1)}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) {
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
                    <motion.button
                      key={p}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => goPage(p as number)}
                      className={`h-8 min-w-[2rem] rounded-xl px-2 text-xs font-black transition-all ${
                        page === p
                          ? "bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </motion.button>
                  )
                )}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goPage(page + 1)}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal()
            }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
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
                      {isEdit ? "Edit Supplier" : "Tambah Supplier"}
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      {isEdit ? "Perbarui data supplier" : "Isi field wajib (*)"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>

                <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                  <Cpu size={100} strokeWidth={1} />
                </div>
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

                  <FormInput
                    label="Nama Supplier"
                    required
                    icon={Building2}
                    value={form.nama}
                    onChange={(e: any) => setForm((prev) => ({ ...prev, nama: e.target.value }))}
                    placeholder="Contoh: PT Sumber Jaya"
                  />

                  <FormInput
                    label="Nomor Telepon"
                    required
                    icon={Phone}
                    value={form.telepon}
                    onChange={(e: any) => setForm((prev) => ({ ...prev, telepon: e.target.value }))}
                    placeholder="Contoh: 081234567890"
                  />

                  <FormTextarea
                    label="Alamat"
                    required
                    icon={MapPin}
                    value={form.alamat}
                    onChange={(e: any) => setForm((prev) => ({ ...prev, alamat: e.target.value }))}
                    placeholder="Alamat supplier..."
                  />

                  <FormTextarea
                    label="Keterangan"
                    icon={NotebookText}
                    value={form.keterangan}
                    onChange={(e: any) => setForm((prev) => ({ ...prev, keterangan: e.target.value }))}
                    placeholder="Catatan tambahan supplier..."
                  />
                </div>

                <div className="flex flex-shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={closeModal}
                    className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Batal
                  </motion.button>

                  <motion.button
                    type="submit"
                    disabled={submitLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-5 py-2.5 text-sm font-black text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitLoading ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        >
                          <RefreshCw size={14} strokeWidth={2.5} />
                        </motion.span>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check size={14} strokeWidth={3} />
                        {isEdit ? "Perbarui" : "Simpan Supplier"}
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="bg-gradient-to-r from-red-500 to-rose-500 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <Trash2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <h2 className="text-base font-black text-white">Hapus Supplier</h2>
                </div>
              </div>

              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-slate-600">
                  Yakin ingin menghapus supplier ini? Tindakan ini{" "}
                  <span className="font-black text-red-600">tidak dapat dibatalkan</span>.
                </p>
              </div>

              <div className="flex justify-end gap-3 px-6 pb-5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDeleteId(null)}
                  className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {deleteLoading ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    >
                      <RefreshCw size={14} strokeWidth={2.5} />
                    </motion.span>
                  ) : (
                    <Trash2 size={14} strokeWidth={2.5} />
                  )}
                  {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}