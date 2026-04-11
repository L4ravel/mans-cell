/* 
  Halaman admin barang untuk CRUD data barang per toko di Firestore.
  Revisi ini menambahkan:
  - kodeBarang sebagai barcode utama
  - print barcode massal
  - popup pilih banyak barang
  - pencarian nama / barcode
  - jumlah label per barang
  - preview print dan window.print()
*/

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  Tag,
  Boxes,
  Check,
  RefreshCw,
  BadgeDollarSign,
  Layers3,
  Store,
  Truck,
  Ruler,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  Barcode,
  Building2,
  Printer,
  Eye,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import JsBarcode from "jsbarcode"

type KategoriBarang = {
  id: string
  nama: string
}

type SatuanBarang = {
  id: string
  nama: string
}

type Supplier = {
  id: string
  nama: string
  telepon?: string
  alamat?: string
  keterangan?: string
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
  createdAt: number
  updatedAt?: number
}

type PrintSelection = {
  barangId: string
  qty: number
}

type FlattenPrintItem = {
  key: string
  barangId: string
  nama: string
  kodeBarang: string
  tokoNama: string
  merk: string
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const EMPTY_FORM = {
  kodeBarang: "",
  nama: "",
  kategoriId: "",
  tokoId: "",
  merk: "",
  supplier: "",
  satuan: "",
  hargaModal: "",
  hargaJual: "",
  stok: "",
  stokMinimum: "",
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function normalizeBarcode(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
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

function BarcodeSvg({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return

    try {
      JsBarcode(svgRef.current, value, {
  format: "CODE128",
  displayValue: true,
  margin: 0,
  width: 1.7,
  height: 42,
  fontSize: 18,
  textMargin: 0,
  fontOptions: "bold",
})
    } catch (error) {
      console.error("Gagal generate barcode:", error)
    }
  }, [value])

  return <svg ref={svgRef} className={className} />
}

export default function TambahBarangPage() {
  const router = useRouter()

  const [data, setData] = useState<Barang[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriBarang[]>([])
  const [satuanList, setSatuanList] = useState<SatuanBarang[]>([])
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
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

  const [showPrintPicker, setShowPrintPicker] = useState(false)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [printSearch, setPrintSearch] = useState("")
  const [printSelections, setPrintSelections] = useState<Record<string, number>>(
    {}
  )

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

  const fetchSatuan = async () => {
    try {
      const qRef = query(collection(db, "satuan_barang"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: SatuanBarang[] = snap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
          }
        })
        .filter((item) => item.nama)

      setSatuanList(list)
    } catch (e) {
      console.error(e)
      setSatuanList([])
    }
  }

  const fetchSupplier = async () => {
    try {
      const qRef = query(collection(db, "supplier"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Supplier[] = snap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
            telepon: x?.telepon || "",
            alamat: x?.alamat || "",
            keterangan: x?.keterangan || "",
          }
        })
        .filter((item) => item.nama)

      setSupplierList(list)
    } catch (e) {
      console.error(e)
      setSupplierList([])
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
          kodeBarang: x?.kodeBarang || "",
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || "",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
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
    if (process.env.NODE_ENV !== "development") return

    const clearDevCache = async () => {
      try {
        if (typeof window !== "undefined" && "caches" in window) {
          const cacheKeys = await window.caches.keys()
          await Promise.all(cacheKeys.map((key) => window.caches.delete(key)))
        }

        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(
            registrations.map((registration) => registration.unregister())
          )
        }
      } catch (error) {
        console.error("Gagal membersihkan cache dev:", error)
      }
    }

    clearDevCache()
  }, [])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        await Promise.all([
          fetchKategori(),
          fetchSatuan(),
          fetchSupplier(),
          fetchToko(),
          fetchData(),
        ])
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
        d.kodeBarang.toLowerCase().includes(q) ||
        d.merk.toLowerCase().includes(q) ||
        d.supplier.toLowerCase().includes(q) ||
        d.kategoriNama.toLowerCase().includes(q) ||
        d.tokoNama.toLowerCase().includes(q) ||
        d.satuan.toLowerCase().includes(q)

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

  const setField =
    (key: keyof typeof EMPTY_FORM) =>
    (val: any) =>
      setForm((f) => ({ ...f, [key]: val }))

  const generateKodeBarang = (tokoId: string) => {
    const toko = tokoList.find((item) => item.id === tokoId)
    const tokoKodeRaw = toko?.kode?.trim() || tokoId.trim()
    const tokoKode = tokoKodeRaw.replace(/\s+/g, "").toUpperCase()
    const time = Date.now().toString().slice(-6)
    return `${tokoKode}-${time}`
  }

  const fillAutoBarcode = (tokoId: string) => {
    if (!tokoId) {
      setError("Pilih toko dulu sebelum membuat barcode otomatis")
      return
    }

    const generated = generateKodeBarang(tokoId)
    setForm((prev) => ({
      ...prev,
      kodeBarang: generated,
    }))
    setError(null)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      supplier: supplierList[0]?.nama || "",
      satuan: satuanList[0]?.nama || "",
    })
    setEditId(null)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (d: Barang) => {
    setForm({
      kodeBarang: d.kodeBarang || "",
      nama: d.nama,
      kategoriId: d.kategoriId,
      tokoId: d.tokoId || "",
      merk: d.merk,
      supplier: d.supplier || "",
      satuan: d.satuan || "",
      hargaModal: String(d.hargaModal || ""),
      hargaJual: String(d.hargaJual || ""),
      stok: String(d.stok || ""),
      stokMinimum: String(d.stokMinimum || ""),
    })
    setEditId(d.id)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama barang wajib diisi"
    if (!form.kategoriId) return "Kategori wajib dipilih"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (!form.merk.trim()) return "Merk wajib diisi"
    if (!form.supplier.trim()) return "Supplier wajib dipilih"
    if (!form.satuan.trim()) return "Satuan wajib dipilih"
    if (!form.hargaModal.trim()) return "Harga modal wajib diisi"
    if (!form.hargaJual.trim()) return "Harga jual wajib diisi"
    if (!form.stok.trim()) return "Stok wajib diisi"
    if (!form.stokMinimum.trim()) return "Stok minimum wajib diisi"

    const kodeBarangFinal = normalizeBarcode(
      form.kodeBarang || generateKodeBarang(form.tokoId)
    )

    if (!kodeBarangFinal) return "Barcode / kode barang wajib diisi"

    const hargaModal = Number(form.hargaModal)
    const hargaJual = Number(form.hargaJual)
    const stok = Number(form.stok)
    const stokMinimum = Number(form.stokMinimum)

    if (Number.isNaN(hargaModal) || hargaModal < 0) {
      return "Harga modal tidak valid"
    }
    if (Number.isNaN(hargaJual) || hargaJual < 0) {
      return "Harga jual tidak valid"
    }
    if (Number.isNaN(stok) || stok < 0) {
      return "Stok tidak valid"
    }
    if (Number.isNaN(stokMinimum) || stokMinimum < 0) {
      return "Stok minimum tidak valid"
    }
    if (hargaJual < hargaModal) {
      return "Harga jual tidak boleh lebih kecil dari harga modal"
    }

    const duplicate = data.find((item) => {
      const sameCode = normalizeBarcode(item.kodeBarang) === kodeBarangFinal
      const sameStore = item.tokoId === form.tokoId
      const notSelf = !editId || item.id !== editId
      return sameCode && sameStore && notSelf
    })

    if (duplicate) {
      return "Barcode / kode barang sudah dipakai di toko ini"
    }

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

      const supplier = supplierList.find((s) => s.nama === form.supplier)
      if (!supplier) {
        setError("Supplier tidak ditemukan")
        return
      }

      const kodeBarang = normalizeBarcode(
        form.kodeBarang || generateKodeBarang(form.tokoId)
      )

      const nama = form.nama.trim()
      const merk = form.merk.trim()
      const supplierNama = supplier.nama.trim()
      const satuan = form.satuan.trim()
      const hargaModal = Number(form.hargaModal)
      const hargaJual = Number(form.hargaJual)
      const stok = Number(form.stok)
      const stokMinimum = Number(form.stokMinimum)
      const now = Date.now()

      if (isEdit && editId) {
        await updateDoc(doc(db, "barang", editId), {
          kodeBarang,
          nama,
          kategoriId: kategori.id,
          kategoriNama: kategori.nama,
          tokoId: toko.id,
          tokoNama: toko.nama,
          merk,
          supplier: supplierNama,
          satuan,
          hargaModal,
          hargaJual,
          stok,
          stokMinimum,
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    kodeBarang,
                    nama,
                    kategoriId: kategori.id,
                    kategoriNama: kategori.nama,
                    tokoId: toko.id,
                    tokoNama: toko.nama,
                    merk,
                    supplier: supplierNama,
                    satuan,
                    hargaModal,
                    hargaJual,
                    stok,
                    stokMinimum,
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
          kodeBarang,
          nama,
          kategoriId: kategori.id,
          kategoriNama: kategori.nama,
          tokoId: toko.id,
          tokoNama: toko.nama,
          merk,
          supplier: supplierNama,
          satuan,
          hargaModal,
          hargaJual,
          stok,
          stokMinimum,
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

  const printCandidates = useMemo(() => {
    const q = printSearch.toLowerCase().trim()

    return data.filter((item) => {
      if (!q) return true
      return (
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)
      )
    })
  }, [data, printSearch])

  const selectedPrintCount = useMemo(() => {
    return Object.values(printSelections).filter((qty) => qty > 0).length
  }, [printSelections])

  const selectedLabelCount = useMemo(() => {
    return Object.values(printSelections).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0)
  }, [printSelections])

  const flatPrintItems = useMemo<FlattenPrintItem[]>(() => {
    const result: FlattenPrintItem[] = []

    for (const item of data) {
      const qty = Number(printSelections[item.id] || 0)
      if (qty <= 0) continue

      for (let i = 0; i < qty; i++) {
        result.push({
          key: `${item.id}-${i + 1}`,
          barangId: item.id,
          nama: item.nama,
          kodeBarang: item.kodeBarang,
          tokoNama: item.tokoNama,
          merk: item.merk,
        })
      }
    }

    return result
  }, [data, printSelections])

  const openPrintModal = () => {
    setShowPrintPicker(true)
    setPrintSearch("")
  }

  const closePrintModal = () => {
    setShowPrintPicker(false)
  }

  const updatePrintQty = (barangId: string, qty: number) => {
    const safeQty = Math.max(0, Math.min(999, Number.isNaN(qty) ? 0 : qty))
    setPrintSelections((prev) => ({
      ...prev,
      [barangId]: safeQty,
    }))
  }

  const togglePrintItem = (item: Barang) => {
    const current = Number(printSelections[item.id] || 0)
    updatePrintQty(item.id, current > 0 ? 0 : 1)
  }

  const quickFillVisible = (qty: number) => {
    const updates: Record<string, number> = {}
    for (const item of printCandidates) {
      updates[item.id] = qty
    }
    setPrintSelections((prev) => ({
      ...prev,
      ...updates,
    }))
  }

  const clearVisible = () => {
    const next = { ...printSelections }
    for (const item of printCandidates) {
      next[item.id] = 0
    }
    setPrintSelections(next)
  }

  const clearAllPrintSelections = () => {
    setPrintSelections({})
  }

  const openPrintPreview = () => {
    if (selectedLabelCount <= 0) {
      setSuccessMsg("Pilih minimal 1 barang untuk dicetak")
      setTimeout(() => setSuccessMsg(null), 2500)
      return
    }

    setShowPrintPicker(false)
    setShowPrintPreview(true)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
    <style jsx global>{`
  @page {
    size: A4 portrait;
    margin: 4mm;
  }

  @media print {
    html,
    body {
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    body * {
      visibility: hidden !important;
    }

    #barcode-print-area,
    #barcode-print-area * {
      visibility: visible !important;
    }

    #barcode-print-area {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      overflow: visible !important;
    }

    .print-hide {
      display: none !important;
    }

    .barcode-grid {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 1.5mm !important;
      width: 100% !important;
      align-items: start !important;
    }

    .barcode-card {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  aspect-ratio: 2 / 1 !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  border: 1px solid #dbe3ea !important;
  border-radius: 1px !important;
  padding: 1mm !important;
  background: white !important;
  box-shadow: none !important;
  overflow: hidden !important;
}

.barcode-svg-wrap {
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  padding: 0.5mm !important;
  overflow: hidden !important;
}

.barcode-svg-print {
  width: 100% !important;
  height: 16mm !important;
  min-height: 16mm !important;
  display: block !important;
}

.barcode-code {
  font-size: 7px !important;
  line-height: 1 !important;
  margin-top: 0.8mm !important;
  letter-spacing: 0.08em !important;
  font-weight: 800 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  text-align: center !important;
}

    .barcode-svg-wrap {
  margin-top: -1mm !important;
  padding: 0 !important;
  border-radius: 0 !important;
  overflow: hidden !important;
}

    .barcode-svg-print {
      width: 100% !important;
      height: 11mm !important;
      display: block !important;
    }

    .barcode-svg-print svg,
    .barcode-svg-print > svg {
      width: 100% !important;
      height: 11mm !important;
    }

    .barcode-code {
      font-size: 7px !important;
      line-height: 1 !important;
      margin-top: 0.8mm !important;
      letter-spacing: 0.04em !important;
      font-weight: 800 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  }
`}</style>

      <div className="space-y-4 text-slate-900 sm:space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
                <Package
                  size={24}
                  className="text-white sm:h-7 sm:w-7"
                  strokeWidth={2.5}
                />
              </div>

              <div>
                <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                  Data Barang
                </h1>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Barang · barcode · toko · supplier · stok minimum
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
                onClick={() => router.push("/admin/tambah-kategori")}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                <Tag size={13} strokeWidth={3} />
                <span>Kategori</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/admin/tambah-satuan")}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                <Ruler size={13} strokeWidth={3} />
                <span>Satuan</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/admin/tambah-supplier")}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                <Building2 size={13} strokeWidth={3} />
                <span>Supplier</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={openPrintModal}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                <Printer size={13} strokeWidth={3} />
                <span>Print Barcode</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={openAdd}
                className="flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md"
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
              <p className="text-[11px] font-bold text-emerald-700">
                {successMsg}
              </p>
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
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                Cari Barang / Barcode
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
                  placeholder="Barcode, kode, nama, merk, supplier..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-16"
          >
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
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
            >
              <Plus size={13} strokeWidth={3} />
              Tambah Barang Pertama
            </motion.button>
          </motion.div>
        )}

        {!loading && paged.length > 0 && (
          <>
            <div className="space-y-2 sm:hidden">
              {paged.map((d, idx) => {
                const isLowStock = d.stok <= d.stokMinimum

                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-slate-800">
                          {d.nama}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {d.kategoriNama} · {d.tokoNama}
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

                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                        <Barcode size={11} strokeWidth={2.5} />
                        {d.kodeBarang || "-"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                        {d.merk || "-"}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {d.satuan || "-"}
                      </span>
                      <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        {d.supplier || "-"}
                      </span>
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                          isLowStock
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        Stok: {d.stok}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Harga Modal
                        </p>
                        <p className="text-xs font-bold text-slate-700">
                          {formatRupiah(d.hargaModal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Harga Jual
                        </p>
                        <p className="text-xs font-bold text-slate-700">
                          {formatRupiah(d.hargaJual)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Barang
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Barcode
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Toko
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Harga
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Stok
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Aksi
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {paged.map((d) => {
                      const isLowStock = d.stok <= d.stokMinimum

                      return (
                        <tr
                          key={d.id}
                          className="border-t border-slate-100 align-top"
                        >
                          <td className="px-4 py-3">
                            <p className="text-sm font-black text-slate-800">
                              {d.nama}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {d.kategoriNama} · {d.merk} · {d.supplier}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white">
                              <Barcode size={11} strokeWidth={2.5} />
                              {d.kodeBarang || "-"}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-slate-700">
                              {d.tokoNama || "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {d.satuan || "-"}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-slate-700">
                              {formatRupiah(d.hargaJual)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Modal: {formatRupiah(d.hargaModal)}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                                isLowStock
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {d.stok}
                            </span>
                            <p className="mt-1 text-xs text-slate-500">
                              Min: {d.stokMinimum}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openEdit(d)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
                              >
                                <Pencil size={13} strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => setDeleteId(d.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                              >
                                <Trash2 size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
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
                        <Pencil
                          size={18}
                          className="text-white"
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Plus
                          size={18}
                          className="text-white"
                          strokeWidth={3}
                        />
                      )}
                    </div>

                    <div>
                      <h2 className="text-base font-black leading-none text-white">
                        {isEdit ? "Edit Barang" : "Tambah Barang"}
                      </h2>
                      <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                        Barcode barang bisa diketik manual atau dibuat otomatis
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
                          <p className="text-[11px] font-bold text-red-600">
                            {error}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormInput
                        label="Barcode / Kode Barang"
                        required
                        icon={Barcode}
                        value={form.kodeBarang}
                        onChange={(e: any) =>
                          setField("kodeBarang")(normalizeBarcode(e.target.value))
                        }
                        placeholder="Contoh: BRG-0001"
                        rightSlot={
                          <button
                            type="button"
                            onClick={() => fillAutoBarcode(form.tokoId)}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-black text-white transition-colors hover:bg-slate-700"
                          >
                            Otomatis
                          </button>
                        }
                      />

                      <FormInput
                        label="Nama Barang"
                        required
                        icon={Package}
                        value={form.nama}
                        onChange={(e: any) => setField("nama")(e.target.value)}
                        placeholder="Contoh: Oppo A58"
                      />

                      <FormSelect
                        label="Kategori"
                        required
                        icon={Tag}
                        value={form.kategoriId}
                        onChange={(e: any) =>
                          setField("kategoriId")(e.target.value)
                        }
                      >
                        <option value="">Pilih kategori</option>
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
                        <option value="">Pilih toko</option>
                        {tokoList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nama}
                          </option>
                        ))}
                      </FormSelect>

                      <FormInput
                        label="Merk"
                        required
                        icon={BadgeDollarSign}
                        value={form.merk}
                        onChange={(e: any) => setField("merk")(e.target.value)}
                        placeholder="Contoh: Samsung"
                      />

                      <FormSelect
                        label="Supplier"
                        required
                        icon={Truck}
                        value={form.supplier}
                        onChange={(e: any) =>
                          setField("supplier")(e.target.value)
                        }
                      >
                        <option value="">Pilih supplier</option>
                        {supplierList.map((s) => (
                          <option key={s.id} value={s.nama}>
                            {s.nama}
                          </option>
                        ))}
                      </FormSelect>

                      <FormSelect
                        label="Satuan"
                        required
                        icon={Ruler}
                        value={form.satuan}
                        onChange={(e: any) => setField("satuan")(e.target.value)}
                      >
                        <option value="">Pilih satuan</option>
                        {satuanList.map((s) => (
                          <option key={s.id} value={s.nama}>
                            {s.nama}
                          </option>
                        ))}
                      </FormSelect>

                      <FormInput
                        label="Harga Modal"
                        required
                        inputMode="numeric"
                        value={form.hargaModal}
                        onChange={(e: any) =>
                          setField("hargaModal")(
                            e.target.value.replace(/[^\d]/g, "")
                          )
                        }
                        placeholder="0"
                      />

                      <FormInput
                        label="Harga Jual"
                        required
                        inputMode="numeric"
                        value={form.hargaJual}
                        onChange={(e: any) =>
                          setField("hargaJual")(
                            e.target.value.replace(/[^\d]/g, "")
                          )
                        }
                        placeholder="0"
                      />

                      <FormInput
                        label="Stok"
                        required
                        inputMode="numeric"
                        value={form.stok}
                        onChange={(e: any) =>
                          setField("stok")(e.target.value.replace(/[^\d]/g, ""))
                        }
                        placeholder="0"
                      />

                      <FormInput
                        label="Stok Minimum"
                        required
                        inputMode="numeric"
                        value={form.stokMinimum}
                        onChange={(e: any) =>
                          setField("stokMinimum")(
                            e.target.value.replace(/[^\d]/g, "")
                          )
                        }
                        placeholder="0"
                      />
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3">
                      <p className="text-[11px] font-bold text-cyan-700">
                        Nilai barcode yang disimpan:
                      </p>
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                        <Barcode
                          size={15}
                          className="text-slate-700"
                          strokeWidth={2.5}
                        />
                        <span className="text-sm font-black text-slate-800">
                          {normalizeBarcode(
                            form.kodeBarang ||
                              (form.tokoId ? generateKodeBarang(form.tokoId) : "")
                          ) || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Batal
                    </button>

                    <button
                      type="submit"
                      disabled={submitLoading}
                      className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                    >
                      {submitLoading
                        ? "Menyimpan..."
                        : isEdit
                        ? "Simpan Perubahan"
                        : "Tambah Barang"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {deleteId && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setDeleteId(null)
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
              >
                <h3 className="text-base font-black text-slate-800">
                  Hapus Barang?
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Data barang akan dihapus permanen.
                </p>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteId(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="rounded-xl bg-red-500 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
                  >
                    {deleteLoading ? "Menghapus..." : "Hapus"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrintPicker && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closePrintModal()
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-4 text-white">
                  <div>
                    <h2 className="text-base font-black">Print Barcode Massal</h2>
                    <p className="mt-0.5 text-[11px] font-semibold text-white/70">
                      Pilih barang dan tentukan jumlah label per barang
                    </p>
                  </div>

                  <button
                    onClick={closePrintModal}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="border-b border-slate-100 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-md">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        value={printSearch}
                        onChange={(e) => setPrintSearch(e.target.value)}
                        placeholder="Cari nama barang / barcode / merk / toko..."
                        className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => quickFillVisible(1)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Isi 1
                      </button>
                      <button
                        type="button"
                        onClick={() => quickFillVisible(5)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Isi 5
                      </button>
                      <button
                        type="button"
                        onClick={() => quickFillVisible(10)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Isi 10
                      </button>
                      <button
                        type="button"
                        onClick={clearVisible}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                      >
                        Kosongkan Hasil Cari
                      </button>
                      <button
                        type="button"
                        onClick={clearAllPrintSelections}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                      >
                        Reset Semua
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                      Barang dipilih: {selectedPrintCount}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">
                      Total label: {selectedLabelCount}
                    </span>
                    <span className="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-black text-cyan-700">
                      Hasil pencarian: {printCandidates.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-3">
                    {printCandidates.map((item) => {
                      const qty = Number(printSelections[item.id] || 0)
                      const checked = qty > 0

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 transition-all ${
                            checked
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => togglePrintItem(item)}
                                  className={`rounded-lg px-3 py-1.5 text-[11px] font-black ${
                                    checked
                                      ? "bg-emerald-500 text-white"
                                      : "bg-slate-900 text-white"
                                  }`}
                                >
                                  {checked ? "Dipilih" : "Pilih"}
                                </button>

                                <span className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-white">
                                  {item.kodeBarang}
                                </span>
                              </div>

                              <p className="mt-2 text-sm font-black text-slate-800">
                                {item.nama}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {item.kategoriNama} · {item.merk} · {item.tokoNama}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updatePrintQty(item.id, Math.max(0, qty - 1))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              >
                                -
                              </button>

                              <input
                                inputMode="numeric"
                                value={qty || ""}
                                onChange={(e) =>
                                  updatePrintQty(
                                    item.id,
                                    Number(e.target.value.replace(/[^\d]/g, ""))
                                  )
                                }
                                placeholder="0"
                                className="w-20 rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-center text-sm font-black text-slate-700 focus:border-cyan-500 focus:outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => updatePrintQty(item.id, qty + 1)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {printCandidates.length === 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                        <p className="text-sm font-black text-slate-700">
                          Barang tidak ditemukan
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4">
                  <button
                    type="button"
                    onClick={closePrintModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                  >
                    Tutup
                  </button>

                  <button
                    type="button"
                    onClick={openPrintPreview}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                  >
                    <Eye size={14} strokeWidth={2.5} />
                    Preview Print
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrintPreview && (
  <motion.div
    className="fixed inset-0 z-50 overflow-y-auto bg-slate-100 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="mx-auto max-w-7xl">
                <div className="print-hide mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <h2 className="text-lg font-black text-slate-800">
                      Preview Print Barcode
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Total {selectedLabelCount} label dari {selectedPrintCount} barang
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPrintPreview(false)
                        setShowPrintPicker(true)
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                    >
                      Kembali
                    </button>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white"
                    >
                      <Printer size={14} strokeWidth={2.5} />
                      Print Sekarang
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPrintPreview(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                    >
                      Tutup
                    </button>
                  </div>
                </div>

          <div
  id="barcode-print-area"
  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
>
  <div className="barcode-grid grid grid-cols-2 gap-2 md:grid-cols-4">
    {flatPrintItems.map((item) => (
      <div
        key={item.key}
        className="barcode-card aspect-[2/1] rounded-md border border-slate-100 bg-white p-2"
      >
        <div className="flex h-full flex-col">
          <p className="truncate text-[9px] font-black leading-tight text-slate-800">
            {item.nama}
          </p>
          <p className="truncate text-[8px] font-bold leading-tight text-slate-500">
            {item.tokoNama || "-"}
          </p>
          <div className="barcode-svg-wrap mt-1 flex-1 overflow-hidden">
            <BarcodeSvg
              value={item.kodeBarang}
              className="barcode-svg-print w-full"
            />
          </div>        
        </div>
      </div>
    ))}
  </div>
</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}