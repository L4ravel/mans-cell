"use client"

/*
  Halaman admin aturan toko.
  - CRUD aturan/deskripsi toko ke Firestore collection aturan_toko
  - Aturan bisa dipilih per toko atau berlaku untuk semua toko
  - Data disiapkan agar nanti bisa dipanggil di halaman karyawan
  - Layout konsisten dengan halaman admin lain: header biru, statistik, filter, tabel desktop, card mobile, modal, dan toast fixed
*/

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  BookOpenText,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type AturanToko = {
  id: string
  judul: string
  isi: string
  tokoId: string
  tokoNama: string
  berlakuSemuaToko: boolean
  isActive: boolean
  createdAt: number
  updatedAt?: number
  createdBy?: string
  updatedBy?: string
}

type AturanForm = {
  judul: string
  isi: string
  tokoId: string
  berlakuSemuaToko: boolean
  isActive: boolean
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const EMPTY_FORM: AturanForm = {
  judul: "",
  isi: "",
  tokoId: "",
  berlakuSemuaToko: true,
  isActive: true,
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
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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
        className="min-h-[190px] w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold leading-relaxed text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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
      <select
        {...props}
        className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      >
        {children}
      </select>
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
        className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      >
        {children}
      </select>
    </div>
  )
}

function shortText(value: string, max = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  if (text.length <= max) return text || "—"
  return `${text.slice(0, max).trim()}...`
}

export default function AdminAturanPage() {
  const router = useRouter()

  const [data, setData] = useState<AturanToko[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState<AturanForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [showMobileFilter, setShowMobileFilter] = useState(false)

  const isEdit = Boolean(editId)

  const fetchToko = async () => {
    try {
      const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
      const list: Toko[] = snap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: String(x?.nama || ""),
            kode: String(x?.kode || ""),
            pemilik: String(x?.pemilik || ""),
            aktif: x?.aktif !== false,
          }
        })
        .filter((item) => item.nama && item.aktif !== false)

      setTokoList(list)
    } catch (e) {
      console.error(e)
      setTokoList([])
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, "aturan_toko"), orderBy("createdAt", "desc")))

      const list: AturanToko[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          judul: String(x?.judul || ""),
          isi: String(x?.isi || ""),
          tokoId: String(x?.tokoId || ""),
          tokoNama: String(x?.tokoNama || ""),
          berlakuSemuaToko: Boolean(x?.berlakuSemuaToko),
          isActive: x?.isActive !== false,
          createdAt: Number(x?.createdAt || Date.now()),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          createdBy: String(x?.createdBy || ""),
          updatedBy: String(x?.updatedBy || ""),
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
        await Promise.all([fetchToko(), fetchData()])
      }
    })

    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        item.judul.toLowerCase().includes(q) ||
        item.isi.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)

      const matchToko =
        !filterToko ||
        (filterToko === "semua_toko" && item.berlakuSemuaToko) ||
        item.tokoId === filterToko

      const matchStatus =
        !filterStatus ||
        (filterStatus === "aktif" && item.isActive) ||
        (filterStatus === "nonaktif" && !item.isActive)

      return matchSearch && matchToko && matchStatus
    })
  }, [data, search, filterToko, filterStatus])

  const stats = useMemo(() => {
    const total = filtered.length
    const aktif = filtered.filter((item) => item.isActive).length
    const semuaToko = filtered.filter((item) => item.berlakuSemuaToko).length
    const tokoKhusus = filtered.filter((item) => !item.berlakuSemuaToko).length

    return { total, aktif, semuaToko, tokoKhusus }
  }, [filtered])

  const totalPages =
    itemsPerPage === 0
      ? 1
      : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

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

  const openEdit = (item: AturanToko) => {
    setForm({
      judul: item.judul,
      isi: item.isi,
      tokoId: item.tokoId,
      berlakuSemuaToko: item.berlakuSemuaToko,
      isActive: item.isActive,
    })
    setEditId(item.id)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    const judul = form.judul.trim()
    const isi = form.isi.trim()

    if (!judul) return "Judul aturan wajib diisi"
    if (!isi) return "Isi aturan wajib diisi"
    if (!form.berlakuSemuaToko && !form.tokoId) return "Toko wajib dipilih"

    const duplicate = data.find((item) => {
      const sameTitle = item.judul.trim().toLowerCase() === judul.toLowerCase()
      const sameScope =
        form.berlakuSemuaToko
          ? item.berlakuSemuaToko
          : item.tokoId === form.tokoId
      const notSelf = !editId || item.id !== editId
      return sameTitle && sameScope && notSelf
    })

    if (duplicate) return "Judul aturan sudah ada pada cakupan toko ini"

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
      const now = Date.now()
      const toko = form.berlakuSemuaToko
        ? null
        : tokoList.find((item) => item.id === form.tokoId)

      if (!form.berlakuSemuaToko && !toko) {
        setError("Toko tidak ditemukan")
        return
      }

      const payload = {
        judul: form.judul.trim(),
        isi: form.isi.trim(),
        tokoId: form.berlakuSemuaToko ? "" : toko?.id || "",
        tokoNama: form.berlakuSemuaToko ? "Semua Toko" : toko?.nama || "",
        berlakuSemuaToko: Boolean(form.berlakuSemuaToko),
        isActive: Boolean(form.isActive),
      }

      if (isEdit && editId) {
        await updateDoc(doc(db, "aturan_toko", editId), {
          ...payload,
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          prev.map((item) =>
            item.id === editId
              ? {
                  ...item,
                  ...payload,
                  updatedAt: now,
                  updatedBy: user.uid,
                }
              : item,
          ),
        )

        setSuccessMsg("Aturan berhasil diperbarui")
      } else {
        const newRef = doc(collection(db, "aturan_toko"))
        const newItem: AturanToko = {
          id: newRef.id,
          ...payload,
          createdAt: now,
          createdBy: user.uid,
        }

        await setDoc(newRef, newItem)

        setData((prev) => [newItem, ...prev])
        setSuccessMsg("Aturan berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan aturan")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "aturan_toko", deleteId))

      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Aturan berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menghapus aturan")
    } finally {
      setDeleteLoading(false)
    }
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
                <BookOpenText size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Aturan Toko
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Tulis aturan operasional toko agar nanti bisa ditampilkan di halaman karyawan.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={() => router.push("/admin/tambah-toko")}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
                title="Toko"
                type="button"
              >
                <Store size={12} strokeWidth={2.8} />
                <span>Toko</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={openAdd}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
                title="Tambah Aturan"
                type="button"
              >
                <Plus size={12} strokeWidth={2.8} />
                <span>Tambah</span>
              </motion.button>

              <button
                type="button"
                onClick={fetchData}
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
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-lg"
            >
              <CheckCircle2 size={16} className="text-sky-600" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-sky-700">{successMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && !showModal && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
            >
              <AlertCircle size={16} className="text-red-500" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-red-600">{error}</p>
              <button type="button" onClick={() => setError(null)} className="text-red-500">
                <X size={14} strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2 sm:space-y-3 lg:grid lg:grid-cols-4 lg:gap-3 lg:space-y-0">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:contents">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 }}
              className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
            >
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex">
                  <BookOpenText size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                    Aturan
                  </p>
                  <p className="text-base font-black leading-tight text-slate-800 sm:text-2xl">
                    {stats.total}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
            >
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 sm:flex">
                  <Check size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                    Aktif
                  </p>
                  <p className="text-base font-black leading-tight text-slate-800 sm:text-2xl">
                    {stats.aktif}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:contents">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
            >
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex">
                  <ShieldCheck size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                    Semua Toko
                  </p>
                  <p className="text-base font-black leading-tight text-slate-800 sm:text-2xl">
                    {stats.semuaToko}
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm sm:p-4 sm:text-left"
            >
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 sm:flex">
                  <Store size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                    Toko Khusus
                  </p>
                  <p className="text-base font-black leading-tight text-slate-800 sm:text-2xl">
                    {stats.tokoKhusus}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:hidden">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2.4}
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Cari aturan..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
              >
                <Plus size={12} strokeWidth={3} />
                Tambah
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/tambah-toko")}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
              >
                <Store size={12} strokeWidth={2.8} />
                Toko
              </button>

              <button
                type="button"
                onClick={() => setShowMobileFilter((prev) => !prev)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                  showMobileFilter
                    ? "border-sky-200 bg-sky-100 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <ListFilter size={14} strokeWidth={2.5} />
                Filter
              </button>
            </div>

            <AnimatePresence initial={false}>
              {showMobileFilter && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                    <FilterSelect
                      label="Toko"
                      value={filterToko}
                      onChange={(v) => {
                        setFilterToko(v)
                        setPage(1)
                      }}
                    >
                      <option value="">Semua Cakupan</option>
                      <option value="semua_toko">Aturan Semua Toko</option>
                      {tokoList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nama}
                        </option>
                      ))}
                    </FilterSelect>

                    <FilterSelect
                      label="Status"
                      value={filterStatus}
                      onChange={(v) => {
                        setFilterStatus(v)
                        setPage(1)
                      }}
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
                    >
                      {ITEMS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} data
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                Cari Aturan
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
                  placeholder="Judul, isi, toko..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <FilterSelect
              label="Toko"
              value={filterToko}
              onChange={(v) => {
                setFilterToko(v)
                setPage(1)
              }}
            >
              <option value="">Semua Cakupan</option>
              <option value="semua_toko">Aturan Semua Toko</option>
              {tokoList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Status"
              value={filterStatus}
              onChange={(v) => {
                setFilterStatus(v)
                setPage(1)
              }}
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
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
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
              Belum ada aturan toko
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openAdd}
              className="flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-200"
            >
              <Plus size={13} strokeWidth={3} />
              Tambah Aturan Pertama
            </motion.button>
          </motion.div>
        )}

        {!loading && paged.length > 0 && (
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
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800">{item.judul}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {item.berlakuSemuaToko ? "Semua Toko" : item.tokoNama || "Toko Khusus"}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-1.5">
                    <button
                      onClick={() => openEdit(item)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                    >
                      <Pencil size={12} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    {item.berlakuSemuaToko ? "Global" : "Toko"}
                  </span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                      item.isActive
                        ? "bg-sky-100 text-sky-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {item.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Isi Aturan
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">
                    {shortText(item.isi, 180)}
                  </p>
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
                    {["No", "Judul", "Cakupan", "Isi Aturan", "Status", "Aksi"].map((h) => (
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
                  {paged.map((item, i) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.015 }}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                        {itemsPerPage === 0 ? i + 1 : (page - 1) * itemsPerPage + i + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">
                        {item.judul}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                        {item.berlakuSemuaToko ? "Semua Toko" : item.tokoNama || "Toko Khusus"}
                      </td>
                      <td className="min-w-[320px] px-3 py-2.5 font-semibold leading-relaxed text-slate-600">
                        {shortText(item.isi, 170)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${
                            item.isActive
                              ? "bg-sky-100 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {item.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex justify-center gap-1.5">
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            onClick={() => openEdit(item)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                          >
                            <Pencil size={12} strokeWidth={2.5} />
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            onClick={() => setDeleteId(item.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
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
            className="flex flex-wrap items-center justify-end gap-3"
          >
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
                  .filter(
                    (p) =>
                      totalPages <= 7 ||
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - page) <= 2,
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
                      <motion.button
                        key={p}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => goPage(p as number)}
                        className={`h-8 min-w-[2rem] rounded-xl px-2 text-xs font-black transition-all ${
                          page === p
                            ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </motion.button>
                    ),
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
                className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-4">
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
                        {isEdit ? "Edit Aturan" : "Tambah Aturan"}
                      </h2>
                      <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                        Atur teks aturan yang nanti dibaca oleh karyawan
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
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

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormInput
                        label="Judul Aturan"
                        required
                        icon={FileText}
                        value={form.judul}
                        onChange={(e: any) =>
                          setForm((prev) => ({
                            ...prev,
                            judul: e.target.value,
                          }))
                        }
                        placeholder="Contoh: Aturan Pelayanan Kasir"
                      />

                      <FormSelect
                        label="Cakupan"
                        required
                        icon={Store}
                        value={form.berlakuSemuaToko ? "semua" : "khusus"}
                        onChange={(e: any) => {
                          const semua = e.target.value === "semua"
                          setForm((prev) => ({
                            ...prev,
                            berlakuSemuaToko: semua,
                            tokoId: semua ? "" : prev.tokoId,
                          }))
                        }}
                      >
                        <option value="semua">Semua Toko</option>
                        <option value="khusus">Toko Tertentu</option>
                      </FormSelect>

                      {!form.berlakuSemuaToko && (
                        <FormSelect
                          label="Toko"
                          required
                          icon={Store}
                          value={form.tokoId}
                          onChange={(e: any) =>
                            setForm((prev) => ({
                              ...prev,
                              tokoId: e.target.value,
                            }))
                          }
                        >
                          <option value="">Pilih toko</option>
                          {tokoList.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nama}
                            </option>
                          ))}
                        </FormSelect>
                      )}
                    </div>

                    <FormTextarea
                      label="Isi Aturan"
                      required
                      icon={BookOpenText}
                      value={form.isi}
                      onChange={(e: any) =>
                        setForm((prev) => ({
                          ...prev,
                          isi: e.target.value,
                        }))
                      }
                      placeholder={`Contoh:
1. Karyawan wajib membuka toko tepat waktu.
2. Semua transaksi wajib dicatat melalui sistem.
3. Barang keluar harus sesuai stok dan laporan.`}
                    />

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              isActive: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                        />
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            Aktifkan Aturan
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            Jika aktif, aturan bisa ditampilkan di halaman karyawan
                          </p>
                        </div>
                      </label>
                    </div>
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
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-sm shadow-sky-200/50 transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitLoading ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          >
                            <RefreshCw size={14} strokeWidth={2.5} />
                          </motion.span>
                          Menyimpan...
                        </>
                      ) : (
                        <>
                          <Check size={14} strokeWidth={3} />
                          {isEdit ? "Perbarui" : "Simpan Aturan"}
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
                <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      <Trash2 size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <h2 className="text-base font-black text-white">Hapus Aturan</h2>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <p className="text-sm font-semibold text-slate-600">
                    Yakin ingin menghapus aturan ini? Tindakan ini{" "}
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
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                  >
                    {deleteLoading ? (
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: "linear",
                        }}
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
      </main>
    </div>
  )
}
