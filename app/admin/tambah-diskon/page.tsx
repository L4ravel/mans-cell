/* 
  Halaman admin diskon untuk CRUD data diskon langsung ke Firestore dari client.
  Diskon dibuat sebagai master promo, memilih toko dan barang dari database,
  dengan layout konsisten seperti halaman master data lainnya.
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
  Percent,
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
  Store,
  Tag,
  BadgeDollarSign,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type Barang = {
  id: string
  kodeBarang: string
  nama: string
  tokoId: string
  tokoNama: string
  hargaJual: number
}

type DiskonBarangRingkas = {
  id: string
  nama: string
  kodeBarang: string
  hargaJual: number
}

type Diskon = {
  id: string
  namaPromo: string
  tokoId: string
  tokoNama: string
  tipeDiskon: "persen" | "nominal"
  nilaiDiskon: number
  barangIds: string[]
  barangRingkas: DiskonBarangRingkas[]
  isActive: boolean
  createdAt: number
  updatedAt?: number
}

type DiskonForm = {
  namaPromo: string
  tokoId: string
  tipeDiskon: "persen" | "nominal"
  nilaiDiskon: string
  barangIds: string[]
  isActive: boolean
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const EMPTY_FORM: DiskonForm = {
  namaPromo: "",
  tokoId: "",
  tipeDiskon: "persen",
  nilaiDiskon: "",
  barangIds: [],
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
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
        className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
        className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      >
        {children}
      </select>
    </div>
  )
}

export default function TambahDiskonPage() {
  const router = useRouter()

  const [data, setData] = useState<Diskon[]>([])
  const [barangList, setBarangList] = useState<Barang[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState<DiskonForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [searchBarangModal, setSearchBarangModal] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId

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

  const fetchBarang = async () => {
    try {
      const qRef = query(collection(db, "barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Barang[] = snap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            kodeBarang: x?.kodeBarang || "",
            nama: x?.nama || "",
            tokoId: x?.tokoId || "",
            tokoNama: x?.tokoNama || "",
            hargaJual: Number(x?.hargaJual || 0),
          }
        })
        .filter((item) => item.nama && item.tokoId)

      setBarangList(list)
    } catch (e) {
      console.error(e)
      setBarangList([])
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "diskon"), orderBy("namaPromo"))
      const snap = await getDocs(qRef)

      const list: Diskon[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          namaPromo: x?.namaPromo || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          tipeDiskon: x?.tipeDiskon === "nominal" ? "nominal" : "persen",
          nilaiDiskon: Number(x?.nilaiDiskon || 0),
          barangIds: Array.isArray(x?.barangIds) ? x.barangIds : [],
          barangRingkas: Array.isArray(x?.barangRingkas)
            ? x.barangRingkas.map((item: any) => ({
                id: item?.id || "",
                nama: item?.nama || "",
                kodeBarang: item?.kodeBarang || "",
                hargaJual: Number(item?.hargaJual || 0),
              }))
            : [],
          isActive: Boolean(x?.isActive),
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
        await Promise.all([fetchToko(), fetchBarang(), fetchData()])
      }
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((d) => {
      const matchSearch =
        !q ||
        d.namaPromo.toLowerCase().includes(q) ||
        d.tokoNama.toLowerCase().includes(q) ||
        d.tipeDiskon.toLowerCase().includes(q) ||
        d.barangRingkas.some(
          (b) =>
            b.nama.toLowerCase().includes(q) ||
            b.kodeBarang.toLowerCase().includes(q)
        )

      const matchToko = !filterToko || d.tokoId === filterToko
      const matchStatus =
        !filterStatus ||
        (filterStatus === "aktif" && d.isActive) ||
        (filterStatus === "nonaktif" && !d.isActive)

      return matchSearch && matchToko && matchStatus
    })
  }, [data, search, filterToko, filterStatus])

  const barangBySelectedToko = useMemo(() => {
    const q = searchBarangModal.toLowerCase().trim()

    return barangList.filter((item) => {
      const sameToko = !form.tokoId || item.tokoId === form.tokoId
      const matchSearch =
        !q ||
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q)

      return sameToko && matchSearch
    })
  }, [barangList, form.tokoId, searchBarangModal])

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
    setSearchBarangModal("")
    setError(null)
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setSearchBarangModal("")
    setError(null)
    setShowModal(true)
  }

  const openEdit = (d: Diskon) => {
    setForm({
      namaPromo: d.namaPromo,
      tokoId: d.tokoId,
      tipeDiskon: d.tipeDiskon,
      nilaiDiskon: String(d.nilaiDiskon),
      barangIds: d.barangIds || [],
      isActive: d.isActive,
    })
    setEditId(d.id)
    setSearchBarangModal("")
    setError(null)
    setShowModal(true)
  }

  const toggleBarang = (barangId: string) => {
    setForm((prev) => {
      const exists = prev.barangIds.includes(barangId)
      return {
        ...prev,
        barangIds: exists
          ? prev.barangIds.filter((id) => id !== barangId)
          : [...prev.barangIds, barangId],
      }
    })
  }

  const handleChangeToko = (tokoId: string) => {
    setForm((prev) => ({
      ...prev,
      tokoId,
      barangIds: [],
    }))
  }

  const formatRupiah = (nilai: number) => {
    return `Rp ${Number(nilai || 0).toLocaleString("id-ID")}`
  }

  const formatNilaiDiskon = (tipe: "persen" | "nominal", nilai: number) => {
    if (tipe === "persen") return `${nilai}%`
    return formatRupiah(nilai)
  }

  const hitungHargaSetelahDiskon = (
    harga: number,
    tipe: "persen" | "nominal",
    nilaiDiskon: number
  ) => {
    if (tipe === "persen") {
      const hasil = harga - harga * (nilaiDiskon / 100)
      return Math.max(0, Math.round(hasil))
    }

    return Math.max(0, harga - nilaiDiskon)
  }

  const getHargaSebelumText = (items: DiskonBarangRingkas[]) => {
    if (!items.length) return "—"

    const hargaList = items.map((item) => Number(item.hargaJual || 0)).sort((a, b) => a - b)
    const min = hargaList[0]
    const max = hargaList[hargaList.length - 1]

    if (min === max) return formatRupiah(min)
    return `${formatRupiah(min)} - ${formatRupiah(max)}`
  }

  const getHargaSesudahText = (
    items: DiskonBarangRingkas[],
    tipe: "persen" | "nominal",
    nilaiDiskon: number
  ) => {
    if (!items.length) return "—"

    const hargaList = items
      .map((item) => hitungHargaSetelahDiskon(Number(item.hargaJual || 0), tipe, nilaiDiskon))
      .sort((a, b) => a - b)

    const min = hargaList[0]
    const max = hargaList[hargaList.length - 1]

    if (min === max) return formatRupiah(min)
    return `${formatRupiah(min)} - ${formatRupiah(max)}`
  }

  const validateForm = () => {
    const namaPromo = form.namaPromo.trim()
    const nilaiDiskon = Number(form.nilaiDiskon)

    if (!namaPromo) return "Nama promo wajib diisi"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (!form.tipeDiskon) return "Tipe diskon wajib dipilih"
    if (!form.nilaiDiskon.trim()) return "Nilai diskon wajib diisi"
    if (Number.isNaN(nilaiDiskon) || nilaiDiskon <= 0) return "Nilai diskon tidak valid"
    if (form.tipeDiskon === "persen" && nilaiDiskon > 100) return "Diskon persen maksimal 100"
    if (form.barangIds.length === 0) return "Pilih minimal 1 barang"

    const duplicate = data.find((item) => {
      const sameName = item.namaPromo.trim().toLowerCase() === namaPromo.toLowerCase()
      const sameToko = item.tokoId === form.tokoId
      const notSelf = !editId || item.id !== editId
      return sameName && sameToko && notSelf
    })

    if (duplicate) return "Nama promo sudah ada di toko ini"

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
      const toko = tokoList.find((t) => t.id === form.tokoId)
      if (!toko) {
        setError("Toko tidak ditemukan")
        return
      }

      const barangDipilih = barangList.filter(
        (item) => item.tokoId === form.tokoId && form.barangIds.includes(item.id)
      )

      if (barangDipilih.length === 0) {
        setError("Barang diskon tidak ditemukan")
        return
      }

      const namaPromo = form.namaPromo.trim()
      const tipeDiskon = form.tipeDiskon
      const nilaiDiskon = Number(form.nilaiDiskon)
      const barangIds = barangDipilih.map((item) => item.id)
      const barangRingkas: DiskonBarangRingkas[] = barangDipilih.map((item) => ({
        id: item.id,
        nama: item.nama,
        kodeBarang: item.kodeBarang,
        hargaJual: item.hargaJual,
      }))
      const isActive = Boolean(form.isActive)
      const now = Date.now()

      if (isEdit && editId) {
        await updateDoc(doc(db, "diskon", editId), {
          namaPromo,
          tokoId: toko.id,
          tokoNama: toko.nama,
          tipeDiskon,
          nilaiDiskon,
          barangIds,
          barangRingkas,
          isActive,
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    namaPromo,
                    tokoId: toko.id,
                    tokoNama: toko.nama,
                    tipeDiskon,
                    nilaiDiskon,
                    barangIds,
                    barangRingkas,
                    isActive,
                    updatedAt: now,
                  }
                : item
            )
            .sort((a, b) => a.namaPromo.localeCompare(b.namaPromo))
        )

        setSuccessMsg("Diskon berhasil diperbarui")
      } else {
        const newRef = doc(collection(db, "diskon"))
        const newItem: Diskon = {
          id: newRef.id,
          namaPromo,
          tokoId: toko.id,
          tokoNama: toko.nama,
          tipeDiskon,
          nilaiDiskon,
          barangIds,
          barangRingkas,
          isActive,
          createdAt: now,
        }

        await setDoc(newRef, {
          ...newItem,
          createdBy: user.uid,
        })

        setData((prev) =>
          [...prev, newItem].sort((a, b) => a.namaPromo.localeCompare(b.namaPromo))
        )

        setSuccessMsg("Diskon berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan diskon")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "diskon", deleteId))

      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Diskon berhasil dihapus")

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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <Percent size={24} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Master Diskon
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Promo · toko · barang
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
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
              onClick={() => router.push("/admin/tambah-toko")}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              <Store size={13} strokeWidth={3} />
              <span>Toko</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/admin/tambah-barang")}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
              <Package size={13} strokeWidth={3} />
              <span>Barang</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openAdd}
              className="flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md"
            >
              <Plus size={13} strokeWidth={3} />
              <span>Tambah Diskon</span>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari Diskon
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
                placeholder="Nama promo, toko, barang..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
            <option value="">Semua Toko</option>
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
            Belum ada master diskon
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
          >
            <Plus size={13} strokeWidth={3} />
            Tambah Diskon Pertama
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
                  <p className="text-sm font-black text-slate-800">{d.namaPromo}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {d.tokoNama} · {formatNilaiDiskon(d.tipeDiskon, d.nilaiDiskon)}
                  </p>
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

              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                  {d.tipeDiskon === "persen" ? "Persen" : "Nominal"}
                </span>
                <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                  {d.barangIds.length} barang
                </span>
                <span
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                    d.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {d.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Harga Sebelum
                  </p>
                  <p className="text-xs font-bold text-slate-700">
                    {getHargaSebelumText(d.barangRingkas)}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Harga Sesudah
                  </p>
                  <p className="text-xs font-bold text-emerald-600">
                    {getHargaSesudahText(d.barangRingkas, d.tipeDiskon, d.nilaiDiskon)}
                  </p>
                </div>
              </div>

              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Barang Promo
                </p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-700">
                  {d.barangRingkas.map((b) => b.nama).join(", ") || "—"}
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
                  {[
                    "No",
                    "Nama Promo",
                    "Toko",
                    "Tipe",
                    "Nilai",
                    "Harga Sebelum",
                    "Harga Sesudah",
                    "Barang",
                    "Status",
                    "Aksi",
                  ].map((h) => (
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
                      {d.namaPromo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                      {d.tokoNama}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold capitalize text-slate-600">
                      {d.tipeDiskon}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-700">
                      {formatNilaiDiskon(d.tipeDiskon, d.nilaiDiskon)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                      {getHargaSebelumText(d.barangRingkas)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-black text-emerald-600">
                      {getHargaSesudahText(d.barangRingkas, d.tipeDiskon, d.nilaiDiskon)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-600">
                      {d.barangIds.length} barang
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${
                          d.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {d.isActive ? "Aktif" : "Nonaktif"}
                      </span>
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
              className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
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
                      {isEdit ? "Edit Diskon" : "Tambah Diskon"}
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      Pilih toko, barang, lalu atur promo diskon
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

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormInput
                      label="Nama Promo"
                      required
                      icon={Tag}
                      value={form.namaPromo}
                      onChange={(e: any) =>
                        setForm((prev) => ({ ...prev, namaPromo: e.target.value }))
                      }
                      placeholder="Contoh: Promo Lebaran"
                    />

                    <FormSelect
                      label="Toko"
                      required
                      icon={Store}
                      value={form.tokoId}
                      onChange={(e: any) => handleChangeToko(e.target.value)}
                    >
                      <option value="">Pilih toko</option>
                      {tokoList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nama}
                        </option>
                      ))}
                    </FormSelect>

                    <FormSelect
                      label="Tipe Diskon"
                      required
                      icon={Percent}
                      value={form.tipeDiskon}
                      onChange={(e: any) =>
                        setForm((prev) => ({
                          ...prev,
                          tipeDiskon: e.target.value as "persen" | "nominal",
                        }))
                      }
                    >
                      <option value="persen">Persen (%)</option>
                      <option value="nominal">Nominal (Rp)</option>
                    </FormSelect>

                    <FormInput
                      label={form.tipeDiskon === "persen" ? "Nilai Diskon (%)" : "Nilai Diskon (Rp)"}
                      required
                      icon={BadgeDollarSign}
                      type="number"
                      min="0"
                      value={form.nilaiDiskon}
                      onChange={(e: any) =>
                        setForm((prev) => ({ ...prev, nilaiDiskon: e.target.value }))
                      }
                      placeholder={form.tipeDiskon === "persen" ? "Contoh: 10" : "Contoh: 5000"}
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Pilih Barang Promo
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {form.tokoId
                            ? `Menampilkan barang dari toko terpilih`
                            : `Pilih toko dulu agar daftar barang muncul`}
                        </p>
                      </div>

                      <div className="w-full sm:max-w-xs">
                        <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Cari Barang
                        </label>
                        <div className="relative">
                          <Search
                            size={13}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            strokeWidth={2}
                          />
                          <input
                            value={searchBarangModal}
                            onChange={(e) => setSearchBarangModal(e.target.value)}
                            placeholder="Nama / kode barang..."
                            className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {!form.tokoId ? (
                        <div className="px-4 py-8 text-center text-sm font-semibold text-slate-400">
                          Pilih toko terlebih dahulu
                        </div>
                      ) : barangBySelectedToko.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm font-semibold text-slate-400">
                          Tidak ada barang ditemukan
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {barangBySelectedToko.map((item) => {
                            const checked = form.barangIds.includes(item.id)
                            const hargaSetelah = hitungHargaSetelahDiskon(
                              Number(item.hargaJual || 0),
                              form.tipeDiskon,
                              Number(form.nilaiDiskon || 0)
                            )

                            return (
                              <label
                                key={item.id}
                                className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleBarang(item.id)}
                                  className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                                />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-black text-slate-800">
                                    {item.nama}
                                  </p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                    {item.kodeBarang || "-"}
                                  </p>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold">
                                    <span className="text-slate-600">
                                      Sebelum: {formatRupiah(item.hargaJual)}
                                    </span>
                                    <span className="text-emerald-600">
                                      Sesudah: {formatRupiah(hargaSetelah)}
                                    </span>
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {form.barangIds.length > 0 && (
                      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-cyan-600">
                        {form.barangIds.length} barang dipilih
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                      />
                      <div>
                        <p className="text-sm font-black text-slate-800">Aktifkan Diskon</p>
                        <p className="text-[11px] font-semibold text-slate-500">
                          Jika aktif, promo siap dipanggil oleh halaman kasir
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
                        {isEdit ? "Perbarui" : "Simpan Diskon"}
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
                  <h2 className="text-base font-black text-white">Hapus Diskon</h2>
                </div>
              </div>

              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-slate-600">
                  Yakin ingin menghapus diskon ini? Tindakan ini{" "}
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