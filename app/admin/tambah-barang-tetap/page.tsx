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
  CheckCircle2,
  ListFilter,
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
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
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
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
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
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)

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

  const stats = useMemo(() => {
    const totalAset = filtered.length
    const totalNilai = filtered.reduce((sum, item) => sum + Number(item.harga || 0), 0)
    const totalKategori = new Set(filtered.map((item) => item.kategoriId).filter(Boolean)).size
    const totalToko = new Set(filtered.map((item) => item.tokoId).filter(Boolean)).size

    return { totalAset, totalNilai, totalKategori, totalToko }
  }, [filtered])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

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
                <Building2 size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Data Barang Tetap
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Kelola aset toko, kategori tetap, lokasi toko, dan nilai barang tetap.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton icon={FolderTree} label="Kategori" onClick={() => router.push("/admin/kategori-tetap")} />
              <HeaderButton icon={Plus} label="Tambah" onClick={openAdd} />
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
          {(successMsg || (error && !showModal)) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg ${
                successMsg ? "border-sky-200 bg-sky-50" : "border-red-200 bg-red-50"
              }`}
            >
              {successMsg ? (
                <CheckCircle2 size={16} className="text-sky-600" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              )}
              <p className={`max-w-xs text-xs font-black ${successMsg ? "text-sky-700" : "text-red-700"}`}>
                {successMsg || error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard label="Total Aset" value={String(stats.totalAset)} icon={Boxes} tone="sky" />
          <StatCard label="Total Nilai" value={formatRupiah(stats.totalNilai)} icon={BadgeDollarSign} tone="blue" />
          <StatCard label="Kategori" value={String(stats.totalKategori)} icon={Layers3} tone="slate" />
          <StatCard label="Toko" value={String(stats.totalToko)} icon={Store} tone="rose" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <FieldBox label="Cari Barang Tetap">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.5}
                  />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Nama, merk, kategori, toko..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </FieldBox>
            </div>

            <div className="hidden sm:contents">
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
                    {o.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
              type="button"
            >
              <Plus size={14} strokeWidth={2.5} />
              Tambah
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => router.push("/admin/kategori-tetap")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
              type="button"
            >
              <FolderTree size={14} strokeWidth={2.5} />
              Kategori
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-600"
              }`}
              type="button"
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </motion.button>
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
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
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
                        {o.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <BarangTetapSection
          loading={loading}
          filtered={filtered}
          paged={paged}
          page={page}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          goPage={goPage}
          openAdd={openAdd}
          openEdit={openEdit}
          setDeleteId={setDeleteId}
        />

        <BarangTetapFormModal
          show={showModal}
          isEdit={isEdit}
          form={form}
          error={error}
          submitLoading={submitLoading}
          kategoriList={kategoriList}
          tokoList={tokoList}
          setField={setField}
          closeModal={closeModal}
          handleSubmit={handleSubmit}
        />

        <DeleteModal
          target={deleteId ? data.find((item) => item.id === deleteId) || null : null}
          loading={deleteLoading}
          onClose={() => setDeleteId(null)}
          onDelete={handleDelete}
        />
      </main>
    </div>
  )
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: any
  label: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
      title={label}
      type="button"
    >
      <Icon size={12} strokeWidth={2.8} />
      <span>{label}</span>
    </motion.button>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: any
  tone: "slate" | "sky" | "blue" | "rose"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
          : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-800 sm:text-xl">
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      {children}
    </div>
  )
}

function BarangTetapSection({
  loading,
  filtered,
  paged,
  page,
  totalPages,
  itemsPerPage,
  goPage,
  openAdd,
  openEdit,
  setDeleteId,
}: {
  loading: boolean
  filtered: BarangTetap[]
  paged: BarangTetap[]
  page: number
  totalPages: number
  itemsPerPage: number
  goPage: (page: number) => void
  openAdd: () => void
  openEdit: (item: BarangTetap) => void
  setDeleteId: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Memuat data barang tetap...
          </p>
        </div>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Boxes size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Data barang tetap belum tersedia
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          onClick={openAdd}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-500/15"
          type="button"
        >
          <Plus size={13} strokeWidth={2.5} />
          Tambah Barang Tetap Pertama
        </motion.button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 sm:hidden">
        {paged.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                <Building2 size={20} strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-800">
                      {item.nama}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      {item.kategoriNama || "Tanpa Kategori"}
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                    Aset
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <Store size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.tokoNama || "-"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <Archive size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.merk || "-"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-800">
                    <BadgeDollarSign size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{formatRupiah(item.harga)}</span>
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => openEdit(item)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100"
                    type="button"
                  >
                    <Pencil size={13} strokeWidth={2.6} />
                    Edit
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => setDeleteId(item.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                    type="button"
                  >
                    <Trash2 size={13} strokeWidth={2.6} />
                    Hapus
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                {["No", "Nama", "Toko", "Kategori", "Merk", "Harga", "Aksi"].map((head) => (
                  <th
                    key={head}
                    className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                      head === "No" || head === "Aksi" ? "text-center" : "text-left"
                    }`}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((item, index) => (
                <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                  <td className="px-3 py-3 text-center font-bold text-slate-400">
                    {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.nama}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.kategoriNama || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.merk || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatRupiah(item.harga)}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                        title="Edit barang tetap"
                      >
                        <Pencil size={13} strokeWidth={2.6} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteId(item.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                        title="Hapus barang tetap"
                      >
                        <Trash2 size={13} strokeWidth={2.6} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {itemsPerPage !== 0 && totalPages > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => goPage(page - 1)}
            disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | "...")[]>((acc, p, idx, arr) => {
              if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("...")
              acc.push(p)
              return acc
            }, [])
            .map((p, idx) =>
              p === "..." ? (
                <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">···</span>
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
            disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </>
  )
}

function BarangTetapFormModal({
  show,
  isEdit,
  form,
  error,
  submitLoading,
  kategoriList,
  tokoList,
  setField,
  closeModal,
  handleSubmit,
}: {
  show: boolean
  isEdit: boolean
  form: typeof EMPTY_FORM
  error: string | null
  submitLoading: boolean
  kategoriList: KategoriBarang[]
  tokoList: Toko[]
  setField: (key: keyof typeof EMPTY_FORM) => (val: any) => void
  closeModal: () => void
  handleSubmit: (e: React.FormEvent) => void
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitLoading) closeModal()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {isEdit ? "Edit Barang Tetap" : "Tambah Barang Tetap"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.nama || "Aset Baru"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="max-h-[calc(88vh-65px)] overflow-y-auto p-4 sm:p-5">
              <div className="space-y-3">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5"
                    >
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" strokeWidth={2.5} />
                      <p className="text-[11px] font-bold text-red-700">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  <FieldInput
                    label="Nama Barang Tetap"
                    value={form.nama}
                    onChange={(value) => setField("nama")(value)}
                    icon={Package}
                    placeholder="Contoh: Laptop Kasir"
                  />

                  <FieldInput
                    label="Merk"
                    value={form.merk}
                    onChange={(value) => setField("merk")(value)}
                    icon={Archive}
                    placeholder="Contoh: Asus"
                  />

                  <FieldSelect
                    label="Kategori"
                    value={form.kategoriId}
                    onChange={(value) => setField("kategoriId")(value)}
                    icon={Tag}
                  >
                    <option value="">Pilih Kategori</option>
                    {kategoriList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                  </FieldSelect>

                  <FieldSelect
                    label="Toko"
                    value={form.tokoId}
                    onChange={(value) => setField("tokoId")(value)}
                    icon={Store}
                  >
                    <option value="">Pilih Toko</option>
                    {tokoList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nama}{t.kode ? ` (${t.kode})` : ""}
                      </option>
                    ))}
                  </FieldSelect>

                  <FieldInput
                    label="Harga Barang"
                    value={form.harga}
                    onChange={(value) => setField("harga")(value.replace(/[^\d]/g, ""))}
                    icon={BadgeDollarSign}
                    inputMode="numeric"
                    placeholder="3500000"
                  />

                  <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Preview Harga</p>
                    <p className="mt-1 text-xs font-black text-sky-700">
                      {formatRupiah(Number(form.harga || 0))}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X size={16} strokeWidth={2.5} />
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitLoading ? (
                      <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                    ) : isEdit ? (
                      <Pencil size={16} strokeWidth={2.5} />
                    ) : (
                      <Plus size={16} strokeWidth={2.5} />
                    )}
                    {submitLoading ? "Proses" : isEdit ? "Update" : "Simpan"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  icon: Icon,
  className = "",
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: any
  className?: string
  [key: string]: any
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  children,
  icon: Icon,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  icon?: any
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  )
}

function DeleteModal({
  target,
  loading,
  onClose,
  onDelete,
}: {
  target: BarangTetap | null
  loading: boolean
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-red-600 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                  <Trash2 size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base font-black leading-none tracking-tight text-white">Hapus Barang Tetap</h2>
                  <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                    {target.nama}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                <Cpu size={100} strokeWidth={1} className="text-white" />
              </div>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-[11px] font-semibold text-slate-600">
                Kamu yakin mau menghapus barang tetap ini?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">{target.nama}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {target.tokoNama || "-"} · {formatRupiah(target.harga)}
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                Batal
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={onDelete}
                disabled={loading}
                className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-rose-200/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
                    Menghapus...
                  </span>
                ) : (
                  "Hapus"
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
