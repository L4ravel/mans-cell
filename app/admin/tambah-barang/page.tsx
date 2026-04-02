// Halaman admin barang untuk CRUD data barang ke Firestore.
// Revisi ini menambahkan relasi toko pada barang: fetch toko, pilih toko, filter toko, dan tampilkan toko di list.

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
  Package,
  Cpu,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Boxes,
  AlertCircle,
  Check,
  RefreshCw,
  BadgeDollarSign,
  Archive,
  Layers3,
  Store,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type KategoriBarang = {
  id: string
  nama: string
}

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type Barang = {
  id: string
  nama: string
  kategoriId: string
  kategoriNama: string
  tokoId: string
  tokoNama: string
  merk: string
  hargaModal: number
  hargaJual: number
  stok: number
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
  kategoriId: "",
  tokoId: "",
  merk: "",
  hargaModal: "",
  hargaJual: "",
  stok: "",
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
      <label className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
      <label className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white pl-3 pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

export default function TambahBarangPage() {
  const router = useRouter()

  const [data, setData] = useState<Barang[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriBarang[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
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
  const [filterKategori, setFilterKategori] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId

  const fetchKategori = async () => {
    try {
      const qRef = query(collection(db, "kategori_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: KategoriBarang[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
        }
      })

      setKategoriList(list)
    } catch (e) {
      console.error(e)
      setKategoriList([])
    }
  }

  const fetchToko = async () => {
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Toko[] = snap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
            kode: x?.kode || "",
            pemilik: x?.pemilik || "",
            aktif: Boolean(x?.aktif),
          }
        })
        .filter((item) => item.nama)

      setTokoList(list)
    } catch (e) {
      console.error(e)
      setTokoList([])
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Barang[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
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
        await Promise.all([fetchKategori(), fetchToko(), fetchData()])
      }
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    return data.filter((d) => {
      const q = search.toLowerCase().trim()

      const matchSearch =
        !q ||
        d.nama.toLowerCase().includes(q) ||
        d.merk.toLowerCase().includes(q) ||
        d.kategoriNama.toLowerCase().includes(q) ||
        d.tokoNama.toLowerCase().includes(q)

      const matchKategori = !filterKategori || d.kategoriId === filterKategori
      const matchToko = !filterToko || d.tokoId === filterToko

      return matchSearch && matchKategori && matchToko
    })
  }, [data, search, filterKategori, filterToko])

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

  const openEdit = (d: Barang) => {
    setForm({
      nama: d.nama,
      kategoriId: d.kategoriId,
      tokoId: d.tokoId || "",
      merk: d.merk,
      hargaModal: String(d.hargaModal || ""),
      hargaJual: String(d.hargaJual || ""),
      stok: String(d.stok || ""),
    })
    setEditId(d.id)
    setError(null)
    setShowModal(true)
  }

  const setField =
    (key: keyof typeof EMPTY_FORM) =>
    (val: any) =>
      setForm((f) => ({ ...f, [key]: val }))

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama barang wajib diisi"
    if (!form.kategoriId) return "Kategori wajib dipilih"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (!form.merk.trim()) return "Merk wajib diisi"
    if (!form.hargaModal.trim()) return "Harga modal wajib diisi"
    if (!form.hargaJual.trim()) return "Harga jual wajib diisi"
    if (!form.stok.trim()) return "Stok wajib diisi"

    const hargaModal = Number(form.hargaModal)
    const hargaJual = Number(form.hargaJual)
    const stok = Number(form.stok)

    if (Number.isNaN(hargaModal) || hargaModal < 0) return "Harga modal tidak valid"
    if (Number.isNaN(hargaJual) || hargaJual < 0) return "Harga jual tidak valid"
    if (Number.isNaN(stok) || stok < 0) return "Stok tidak valid"
    if (hargaJual < hargaModal) return "Harga jual tidak boleh lebih kecil dari harga modal"

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
      const kategori = kategoriList.find((k) => k.id === form.kategoriId)
      if (!kategori) {
        setError("Kategori tidak ditemukan")
        return
      }

      const toko = tokoList.find((t) => t.id === form.tokoId)
      if (!toko) {
        setError("Toko tidak ditemukan")
        return
      }

      const nama = form.nama.trim()
      const merk = form.merk.trim()
      const hargaModal = Number(form.hargaModal)
      const hargaJual = Number(form.hargaJual)
      const stok = Number(form.stok)
      const now = Date.now()

      if (isEdit && editId) {
        const updatedItem: Partial<Barang> = {
          nama,
          kategoriId: kategori.id,
          kategoriNama: kategori.nama,
          tokoId: toko.id,
          tokoNama: toko.nama,
          merk,
          hargaModal,
          hargaJual,
          stok,
          updatedAt: now,
        }

        await updateDoc(doc(db, "barang", editId), {
          ...updatedItem,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    nama,
                    kategoriId: kategori.id,
                    kategoriNama: kategori.nama,
                    tokoId: toko.id,
                    tokoNama: toko.nama,
                    merk,
                    hargaModal,
                    hargaJual,
                    stok,
                    updatedAt: now,
                  }
                : item
            )
            .sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Data barang berhasil diperbarui")
      } else {
        const newRef = doc(collection(db, "barang"))
        const newItem: Barang = {
          id: newRef.id,
          nama,
          kategoriId: kategori.id,
          kategoriNama: kategori.nama,
          tokoId: toko.id,
          tokoNama: toko.nama,
          merk,
          hargaModal,
          hargaJual,
          stok,
          createdAt: now,
        }

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        })

        setData((prev) =>
          [...prev, newItem].sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Barang berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan data barang")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "barang", deleteId))

      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Data barang berhasil dihapus")

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-emerald-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50">
              <Package size={24} className="text-white sm:w-7 sm:h-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
                Data Barang
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
                Barang elektronik · kategori · toko · stok
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {filtered.length > 0 && (
              <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-emerald-500 px-2.5 shadow-sm shadow-emerald-200/50">
                <span className="text-xs font-black text-white">
                  {itemsPerPage === 0 ? filtered.length : paged.length}
                </span>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/admin/tambah-kategori")}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-wide shadow-sm hover:bg-slate-50 transition-all"
            >
              <Tag size={13} strokeWidth={3} />
              <span>Kategori</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openAdd}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white text-[10px] font-black uppercase tracking-wide shadow-sm shadow-emerald-200/50 hover:shadow-md transition-all"
            >
              <Plus size={13} strokeWidth={3} />
              <span>Tambah Barang</span>
            </motion.button>

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

        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200"
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
        className="rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Cari Barang
            </label>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Nama, merk, kategori, toko..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white pl-8 pr-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Kategori"
            value={filterKategori}
            onChange={(v) => {
              setFilterKategori(v)
              setPage(1)
            }}
            icon={Layers3}
          >
            <option value="">Semua Kategori</option>
            {kategoriList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Toko"
            value={filterToko}
            onChange={(v) => {
              setFilterToko(v)
              setPage(1)
            }}
            icon={Store}
          >
            <option value="">Semua Toko</option>
            {tokoList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
              </option>
            ))}
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
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-emerald-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-16 gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Boxes size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Belum ada data barang
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 text-white text-xs font-black shadow-sm"
          >
            <Plus size={13} strokeWidth={3} />
            Tambah Barang Pertama
          </motion.button>
        </motion.div>
      )}

      {!loading && paged.length > 0 && (
        <div className="sm:hidden space-y-2">
          {paged.map((d, idx) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{d.nama}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">
                    {d.kategoriNama}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openEdit(d)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors"
                  >
                    <Pencil size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => setDeleteId(d.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                <span className="px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-bold">
                  {d.tokoNama || "-"}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-700 text-[10px] font-bold">
                  {d.merk || "-"}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                  Stok: {d.stok}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Toko
                  </p>
                  <p className="text-xs font-bold text-slate-700">{d.tokoNama || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Merk
                  </p>
                  <p className="text-xs font-bold text-slate-700">{d.merk || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Harga Modal
                  </p>
                  <p className="text-xs font-bold text-slate-700">
                    Rp {Number(d.hargaModal || 0).toLocaleString("id-ID")}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Harga Jual
                  </p>
                  <p className="text-xs font-bold text-slate-700">
                    Rp {Number(d.hargaJual || 0).toLocaleString("id-ID")}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Stok
                  </p>
                  <p className="text-xs font-bold text-slate-700">{d.stok}</p>
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
          className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/80 border-b border-slate-200">
                <tr>
                  {["No", "Nama", "Toko", "Kategori", "Merk", "Harga Modal", "Harga Jual", "Stok", "Aksi"].map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap ${
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
                    className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                      {itemsPerPage === 0 ? i + 1 : (page - 1) * itemsPerPage + i + 1}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                      {d.nama}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                      {d.tokoNama || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                      {d.kategoriNama || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                      {d.merk || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                      Rp {Number(d.hargaModal || 0).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                      Rp {Number(d.hargaJual || 0).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold whitespace-nowrap">
                        {d.stok}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => openEdit(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors"
                        >
                          <Pencil size={12} strokeWidth={2.5} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setDeleteId(d.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-3 flex-wrap">
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
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("...")
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`e-${idx}`} className="px-1 text-slate-400 text-xs font-bold">
                      ···
                    </span>
                  ) : (
                    <motion.button
                      key={p}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => goPage(p as number)}
                      className={`h-8 min-w-[2rem] px-2 rounded-xl text-xs font-black transition-all ${
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
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
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
              className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    {isEdit ? (
                      <Pencil size={18} className="text-white" strokeWidth={2.5} />
                    ) : (
                      <Plus size={18} className="text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white leading-none">
                      {isEdit ? "Edit Data Barang" : "Tambah Barang Baru"}
                    </h2>
                    <p className="text-[10px] text-white/70 font-semibold mt-0.5">
                      {isEdit ? "Perbarui informasi barang" : "Isi field wajib (*)"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>

                <div className="absolute right-0 top-0 opacity-10 pointer-events-none">
                  <Cpu size={100} strokeWidth={1} />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                <div className="p-6 space-y-5">
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200"
                      >
                        <AlertCircle size={14} className="text-red-500 flex-shrink-0" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-red-600">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormInput
                      label="Nama Barang"
                      required
                      icon={Package}
                      value={form.nama}
                      onChange={(e: any) => setField("nama")(e.target.value)}
                      placeholder="Contoh: iPhone 13"
                    />
                    <FormInput
                      label="Merk"
                      required
                      icon={Archive}
                      value={form.merk}
                      onChange={(e: any) => setField("merk")(e.target.value)}
                      placeholder="Contoh: Apple"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormSelect
                      label="Kategori"
                      required
                      icon={Tag}
                      value={form.kategoriId}
                      onChange={(e: any) => setField("kategoriId")(e.target.value)}
                    >
                      <option value="">Pilih Kategori</option>
                      {kategoriList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama}
                        </option>
                      ))}
                    </FormSelect>

                    <FormSelect
                      label="Toko"
                      required
                      icon={Store}
                      value={form.tokoId}
                      onChange={(e: any) => setField("tokoId")(e.target.value)}
                    >
                      <option value="">Pilih Toko</option>
                      {tokoList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nama}
                          {t.kode ? ` (${t.kode})` : ""}
                        </option>
                      ))}
                    </FormSelect>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormInput
                      label="Harga Modal"
                      required
                      icon={BadgeDollarSign}
                      type="number"
                      min="0"
                      value={form.hargaModal}
                      onChange={(e: any) => setField("hargaModal")(e.target.value)}
                      placeholder="1200000"
                    />

                    <FormInput
                      label="Harga Jual"
                      required
                      icon={BadgeDollarSign}
                      type="number"
                      min="0"
                      value={form.hargaJual}
                      onChange={(e: any) => setField("hargaJual")(e.target.value)}
                      placeholder="1500000"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormInput
                      label="Stok"
                      required
                      icon={Boxes}
                      type="number"
                      min="0"
                      value={form.stok}
                      onChange={(e: any) => setField("stok")(e.target.value)}
                      placeholder="10"
                    />

                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-violet-500">
                        Preview Toko
                      </p>
                      <p className="text-sm font-bold text-violet-700 mt-1">
                        {tokoList.find((t) => t.id === form.tokoId)?.nama || "Belum dipilih"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-cyan-500">
                        Preview Harga Modal
                      </p>
                      <p className="text-sm font-bold text-cyan-700 mt-1">
                        Rp {Number(form.hargaModal || 0).toLocaleString("id-ID")}
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                        Estimasi Profit
                      </p>
                      <p className="text-sm font-bold text-emerald-700 mt-1">
                        Rp {Math.max(0, Number(form.hargaJual || 0) - Number(form.hargaModal || 0)).toLocaleString("id-ID")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={closeModal}
                    className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-black hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </motion.button>

                  <motion.button
                    type="submit"
                    disabled={submitLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white text-sm font-black shadow-sm shadow-emerald-200/50 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
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
                        {isEdit ? "Perbarui" : "Simpan Barang"}
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 bg-gradient-to-r from-red-500 to-rose-500">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <Trash2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <h2 className="text-base font-black text-white">Hapus Barang</h2>
                </div>
              </div>

              <div className="px-6 py-5">
                <p className="text-sm text-slate-600 font-semibold">
                  Yakin ingin menghapus data barang ini? Tindakan ini{" "}
                  <span className="font-black text-red-600">tidak dapat dibatalkan</span>.
                </p>
              </div>

              <div className="flex gap-3 px-6 pb-5 justify-end">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDeleteId(null)}
                  className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-black hover:bg-slate-50"
                >
                  Batal
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white text-sm font-black shadow-sm disabled:opacity-60"
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