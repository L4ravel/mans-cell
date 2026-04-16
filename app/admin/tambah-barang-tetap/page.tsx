"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp,
  Transaction,
  DocumentReference,
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
  Building2,
  FolderTree,
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

type BarangTetap = {
  id: string
  nama: string
  kategoriId: string
  kategoriNama: string
  tokoId: string
  tokoNama: string
  merk: string
  harga: number
  createdAt: number
  updatedAt?: number
}

type LaporanBarangTetapKategori = {
  kategoriId: string
  kategoriNama: string
  jumlahAset: number
  totalNilai: number
}

type ApplyLaporanBarangTetapDeltaParams = {
  transaction: Transaction
  laporanRef: DocumentReference
  existingData: any
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  jumlahDelta: number
  nilaiDelta: number
  now: number
}

const COLLECTION_NAME = "barang_tetap"
const LAPORAN_COLLECTION_NAME = "laporan_barang_tetap"

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
  harga: "",
}

function normalizeKategoriKey(value?: string) {
  return String(value || "").trim().toLowerCase()
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function buildKategoriBreakdown(
  existing: any,
  kategoriId: string,
  kategoriNama: string,
  jumlahDelta: number,
  nilaiDelta: number
): LaporanBarangTetapKategori[] {
  const list: LaporanBarangTetapKategori[] = Array.isArray(existing)
    ? existing.map((item: any) => ({
        kategoriId: String(item?.kategoriId || "").trim(),
        kategoriNama: String(item?.kategoriNama || "Tanpa Kategori").trim(),
        jumlahAset: Number(item?.jumlahAset || 0),
        totalNilai: Number(item?.totalNilai || 0),
      }))
    : []

  const safeKategoriId = String(kategoriId || "").trim()
  const safeKategoriNama =
    String(kategoriNama || "Tanpa Kategori").trim() || "Tanpa Kategori"

  const index = list.findIndex((item) => item.kategoriId === safeKategoriId)

  if (index >= 0) {
    list[index] = {
      ...list[index],
      kategoriNama: safeKategoriNama,
      jumlahAset: Number(list[index].jumlahAset || 0) + Number(jumlahDelta || 0),
      totalNilai: Number(list[index].totalNilai || 0) + Number(nilaiDelta || 0),
    }
  } else {
    list.push({
      kategoriId: safeKategoriId,
      kategoriNama: safeKategoriNama,
      jumlahAset: Number(jumlahDelta || 0),
      totalNilai: Number(nilaiDelta || 0),
    })
  }

  return list
    .filter(
      (item) =>
        Number(item.jumlahAset || 0) > 0 || Number(item.totalNilai || 0) > 0
    )
    .sort((a, b) => {
      if (b.totalNilai !== a.totalNilai) return b.totalNilai - a.totalNilai
      return a.kategoriNama.localeCompare(b.kategoriNama)
    })
}

function applyLaporanBarangTetapDelta({
  transaction,
  laporanRef,
  existingData,
  tokoId,
  tokoNama,
  kategoriId,
  kategoriNama,
  jumlahDelta,
  nilaiDelta,
  now,
}: ApplyLaporanBarangTetapDeltaParams) {
  if (!jumlahDelta && !nilaiDelta) return

  const jumlahAsetBaru = Math.max(
    0,
    Number(existingData?.jumlahAset || 0) + Number(jumlahDelta || 0)
  )
  const totalNilaiBaru = Math.max(
    0,
    Number(existingData?.totalNilai || 0) + Number(nilaiDelta || 0)
  )

  const kategoriBreakdownBaru = buildKategoriBreakdown(
    existingData?.kategoriBreakdown,
    kategoriId,
    kategoriNama,
    jumlahDelta,
    nilaiDelta
  )

  transaction.set(
    laporanRef,
    {
      id: laporanRef.id,
      tokoId,
      tokoNama,
      jumlahAset: jumlahAsetBaru,
      totalNilai: totalNilaiBaru,
      kategoriBreakdown: kategoriBreakdownBaru,
      createdAt: existingData?.createdAt || serverTimestamp(),
      createdAtMs: Number(existingData?.createdAtMs || now),
      updatedAt: serverTimestamp(),
      updatedAtMs: now,
    },
    { merge: true }
  )
}

function applyLaporanBarangTetapEditSameToko({
  transaction,
  laporanRef,
  existingData,
  tokoId,
  tokoNama,
  oldKategoriId,
  oldKategoriNama,
  oldHarga,
  newKategoriId,
  newKategoriNama,
  newHarga,
  now,
}: {
  transaction: Transaction
  laporanRef: DocumentReference
  existingData: any
  tokoId: string
  tokoNama: string
  oldKategoriId: string
  oldKategoriNama: string
  oldHarga: number
  newKategoriId: string
  newKategoriNama: string
  newHarga: number
  now: number
}) {
  let kategoriBreakdownBaru = buildKategoriBreakdown(
    existingData?.kategoriBreakdown,
    oldKategoriId,
    oldKategoriNama,
    -1,
    -Number(oldHarga || 0)
  )

  kategoriBreakdownBaru = buildKategoriBreakdown(
    kategoriBreakdownBaru,
    newKategoriId,
    newKategoriNama,
    1,
    Number(newHarga || 0)
  )

  const jumlahAsetBaru = Math.max(0, Number(existingData?.jumlahAset || 0))
  const totalNilaiBaru = Math.max(
    0,
    Number(existingData?.totalNilai || 0) -
      Number(oldHarga || 0) +
      Number(newHarga || 0)
  )

  transaction.set(
    laporanRef,
    {
      id: laporanRef.id,
      tokoId,
      tokoNama,
      jumlahAset: jumlahAsetBaru,
      totalNilai: totalNilaiBaru,
      kategoriBreakdown: kategoriBreakdownBaru,
      createdAt: existingData?.createdAt || serverTimestamp(),
      createdAtMs: Number(existingData?.createdAtMs || now),
      updatedAt: serverTimestamp(),
      updatedAtMs: now,
    },
    { merge: true }
  )
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

export default function TambahBarangTetapPage() {
  const router = useRouter()

  const [data, setData] = useState<BarangTetap[]>([])
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
      const qRef = query(collection(db, "kategori_tetap"), orderBy("nama"))
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
      const qRef = query(collection(db, COLLECTION_NAME), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: BarangTetap[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          harga: Number(x?.harga || 0),
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

  const openEdit = (d: BarangTetap) => {
    setForm({
      nama: d.nama,
      kategoriId: d.kategoriId,
      tokoId: d.tokoId || "",
      merk: d.merk,
      harga: String(d.harga || ""),
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
    if (!form.nama.trim()) return "Nama barang tetap wajib diisi"
    if (!form.kategoriId) return "Kategori wajib dipilih"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (!form.merk.trim()) return "Merk wajib diisi"
    if (!form.harga.trim()) return "Harga barang wajib diisi"

    const harga = Number(form.harga)
    if (Number.isNaN(harga) || harga < 0) return "Harga barang tidak valid"

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
      const harga = Number(form.harga)
      const now = Date.now()

      if (isEdit && editId) {
        const existingItem = data.find((item) => item.id === editId)
        if (!existingItem) {
          setError("Data barang tetap lama tidak ditemukan")
          return
        }

        await runTransaction(db, async (transaction) => {
          const barangRef = doc(db, COLLECTION_NAME, editId)
          const laporanLamaRef = doc(db, LAPORAN_COLLECTION_NAME, existingItem.tokoId)
          const laporanBaruRef = doc(db, LAPORAN_COLLECTION_NAME, toko.id)

          const sameToko = existingItem.tokoId === toko.id

          if (sameToko) {
            const laporanSnap = await transaction.get(laporanLamaRef)
            const laporanData = laporanSnap.exists() ? laporanSnap.data() : null

            transaction.update(barangRef, {
              nama,
              kategoriId: kategori.id,
              kategoriNama: kategori.nama,
              tokoId: toko.id,
              tokoNama: toko.nama,
              merk,
              harga,
              updatedAt: now,
              updatedBy: user.uid,
            })

            applyLaporanBarangTetapEditSameToko({
              transaction,
              laporanRef: laporanLamaRef,
              existingData: laporanData,
              tokoId: toko.id,
              tokoNama: toko.nama,
              oldKategoriId:
                existingItem.kategoriId ||
                normalizeKategoriKey(existingItem.kategoriNama),
              oldKategoriNama: existingItem.kategoriNama || "Tanpa Kategori",
              oldHarga: Number(existingItem.harga || 0),
              newKategoriId: kategori.id || normalizeKategoriKey(kategori.nama),
              newKategoriNama: kategori.nama || "Tanpa Kategori",
              newHarga: Number(harga || 0),
              now,
            })

            return
          }

          const [laporanLamaSnap, laporanBaruSnap] = await Promise.all([
            transaction.get(laporanLamaRef),
            transaction.get(laporanBaruRef),
          ])

          const laporanLamaData = laporanLamaSnap.exists()
            ? laporanLamaSnap.data()
            : null
          const laporanBaruData = laporanBaruSnap.exists()
            ? laporanBaruSnap.data()
            : null

          transaction.update(barangRef, {
            nama,
            kategoriId: kategori.id,
            kategoriNama: kategori.nama,
            tokoId: toko.id,
            tokoNama: toko.nama,
            merk,
            harga,
            updatedAt: now,
            updatedBy: user.uid,
          })

          applyLaporanBarangTetapDelta({
            transaction,
            laporanRef: laporanLamaRef,
            existingData: laporanLamaData,
            tokoId: existingItem.tokoId,
            tokoNama: existingItem.tokoNama,
            kategoriId:
              existingItem.kategoriId ||
              normalizeKategoriKey(existingItem.kategoriNama),
            kategoriNama: existingItem.kategoriNama || "Tanpa Kategori",
            jumlahDelta: -1,
            nilaiDelta: -Number(existingItem.harga || 0),
            now,
          })

          applyLaporanBarangTetapDelta({
            transaction,
            laporanRef: laporanBaruRef,
            existingData: laporanBaruData,
            tokoId: toko.id,
            tokoNama: toko.nama,
            kategoriId: kategori.id || normalizeKategoriKey(kategori.nama),
            kategoriNama: kategori.nama || "Tanpa Kategori",
            jumlahDelta: 1,
            nilaiDelta: Number(harga || 0),
            now,
          })
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
                    harga,
                    updatedAt: now,
                  }
                : item
            )
            .sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Data barang tetap berhasil diperbarui")
      } else {
        const newRef = doc(collection(db, COLLECTION_NAME))
        const newItem: BarangTetap = {
          id: newRef.id,
          nama,
          kategoriId: kategori.id,
          kategoriNama: kategori.nama,
          tokoId: toko.id,
          tokoNama: toko.nama,
          merk,
          harga,
          createdAt: now,
        }

        await runTransaction(db, async (transaction) => {
          const laporanRef = doc(db, LAPORAN_COLLECTION_NAME, toko.id)
          const laporanSnap = await transaction.get(laporanRef)
          const laporanData = laporanSnap.exists() ? laporanSnap.data() : null

          transaction.set(newRef, {
            ...newItem,
            createdBy: user.uid,
          })

          applyLaporanBarangTetapDelta({
            transaction,
            laporanRef,
            existingData: laporanData,
            tokoId: toko.id,
            tokoNama: toko.nama,
            kategoriId: kategori.id || normalizeKategoriKey(kategori.nama),
            kategoriNama: kategori.nama || "Tanpa Kategori",
            jumlahDelta: 1,
            nilaiDelta: Number(harga || 0),
            now,
          })
        })

        setData((prev) =>
          [...prev, newItem].sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Barang tetap berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan data barang tetap")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      const existingItem = data.find((item) => item.id === deleteId)
      if (!existingItem) {
        setDeleteId(null)
        setDeleteLoading(false)
        return
      }

      const now = Date.now()

      await runTransaction(db, async (transaction) => {
        const barangRef = doc(db, COLLECTION_NAME, deleteId)
        const laporanRef = doc(db, LAPORAN_COLLECTION_NAME, existingItem.tokoId)

        const laporanSnap = await transaction.get(laporanRef)
        const laporanData = laporanSnap.exists() ? laporanSnap.data() : null

        transaction.delete(barangRef)

        applyLaporanBarangTetapDelta({
          transaction,
          laporanRef,
          existingData: laporanData,
          tokoId: existingItem.tokoId,
          tokoNama: existingItem.tokoNama,
          kategoriId:
            existingItem.kategoriId ||
            normalizeKategoriKey(existingItem.kategoriNama),
          kategoriNama: existingItem.kategoriNama || "Tanpa Kategori",
          jumlahDelta: -1,
          nilaiDelta: -Number(existingItem.harga || 0),
          now,
        })
      })

      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Data barang tetap berhasil dihapus")

      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menghapus data barang tetap")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-emerald-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <Building2
                size={22}
                className="text-white sm:h-7 sm:w-7"
                strokeWidth={2.5}
              />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Data Barang Tetap
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Aset toko · kategori · toko · harga
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

            <div className="flex flex-wrap items-center justify-end gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/admin/kategori-tetap")}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
                title="Kategori Tetap"
              >
                <FolderTree size={13} strokeWidth={3} />
                <span className="hidden text-[10px] font-black uppercase tracking-wide sm:ml-1.5 sm:inline">
                  Kategori Tetap
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={openAdd}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md sm:w-auto sm:px-3"
                title="Tambah Barang Tetap"
              >
                <Plus size={13} strokeWidth={3} />
                <span className="hidden text-[10px] font-black uppercase tracking-wide sm:ml-1.5 sm:inline">
                  Tambah Barang Tetap
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
                  transition={
                    loading
                      ? { duration: 0.8, repeat: Infinity, ease: "linear" }
                      : {}
                  }
                >
                  <RefreshCw
                    size={14}
                    className="text-slate-500"
                    strokeWidth={2.5}
                  />
                </motion.span>
              </motion.button>
            </div>
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
        className="rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari Barang Tetap
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

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5"
        >
          <AlertCircle size={14} className="text-red-500" strokeWidth={2.5} />
          <p className="text-[11px] font-bold text-red-600">{error}</p>
        </motion.div>
      )}

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
            Belum ada data barang tetap
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
          >
            <Plus size={13} strokeWidth={3} />
            Tambah Barang Tetap Pertama
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
                <div>
                  <p className="text-sm font-black text-slate-800">{d.nama}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {d.kategoriNama}
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
                  {d.tokoNama || "-"}
                </span>
                <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                  {d.merk || "-"}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Toko
                  </p>
                  <p className="text-xs font-bold text-slate-700">
                    {d.tokoNama || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Merk
                  </p>
                  <p className="text-xs font-bold text-slate-700">
                    {d.merk || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Harga Barang
                  </p>
                  <p className="text-xs font-bold text-slate-700">
                    {formatRupiah(d.harga)}
                  </p>
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
                  {["No", "Nama", "Toko", "Kategori", "Merk", "Harga Barang", "Aksi"].map(
                    (h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                          h === "No" || h === "Aksi" ? "text-center" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
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
                      {d.tokoNama || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                      {d.kategoriNama || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                      {d.merk || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                      {formatRupiah(d.harga)}
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
            {itemsPerPage === 0
              ? `${filtered.length} data`
              : `Hal ${page}/${totalPages} · ${filtered.length} data`}
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
              className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
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
                      {isEdit ? "Edit Data Barang Tetap" : "Tambah Barang Tetap Baru"}
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      {isEdit ? "Perbarui informasi barang tetap" : "Isi field wajib (*)"}
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
                        <AlertCircle
                          size={14}
                          className="flex-shrink-0 text-red-500"
                          strokeWidth={2.5}
                        />
                        <p className="text-[11px] font-bold text-red-600">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormInput
                      label="Nama Barang Tetap"
                      required
                      icon={Package}
                      value={form.nama}
                      onChange={(e: any) => setField("nama")(e.target.value)}
                      placeholder="Contoh: Laptop Kasir"
                    />
                    <FormInput
                      label="Merk"
                      required
                      icon={Archive}
                      value={form.merk}
                      onChange={(e: any) => setField("merk")(e.target.value)}
                      placeholder="Contoh: Asus"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormInput
                      label="Harga Barang"
                      required
                      icon={BadgeDollarSign}
                      type="number"
                      min="0"
                      value={form.harga}
                      onChange={(e: any) => setField("harga")(e.target.value)}
                      placeholder="3500000"
                    />

                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-violet-500">
                        Preview Toko
                      </p>
                      <p className="mt-1 text-sm font-bold text-violet-700">
                        {tokoList.find((t) => t.id === form.tokoId)?.nama ||
                          "Belum dipilih"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-cyan-500">
                        Preview Harga Barang
                      </p>
                      <p className="mt-1 text-sm font-bold text-cyan-700">
                        {formatRupiah(Number(form.harga || 0))}
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                        Tipe Data
                      </p>
                      <p className="mt-1 text-sm font-bold text-emerald-700">
                        Barang Tetap / Aset
                      </p>
                    </div>
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
                        {isEdit ? "Perbarui" : "Simpan Barang Tetap"}
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
                  <h2 className="text-base font-black text-white">
                    Hapus Barang Tetap
                  </h2>
                </div>
              </div>

              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-slate-600">
                  Yakin ingin menghapus data barang tetap ini? Tindakan ini{" "}
                  <span className="font-black text-red-600">
                    tidak dapat dibatalkan
                  </span>
                  .
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